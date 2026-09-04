import React from 'react';
import {EmptyCut, makeCutComponent} from '../remotion/CutHost';
import type {CutShot} from './cut';
import {compileScene} from './compile';
import type {CutStyle} from './editorStyle';
import {paletteFor} from './editorStyle';

/** Progress shared by the scene and cut export buttons. */
export type RenderProgress = {
  status: 'running' | 'done' | 'error';
  progress: number;
  stage: string;
  logs: string[];
  url?: string;
  size?: number;
  renderedInMs?: number;
  error?: string;
};

type RenderPayload = {
  kind?: 'scene' | 'cut';
  code?: string;
  shots?: CutShot[];
  style?: CutStyle;
  voiceover?: {file: string; durationSeconds: number; partDurations: number[]};
  durationInFrames?: number;
};

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 60;
const MAX_DURATION_IN_FRAMES = 7200;

const timeLabel = () => new Date().toLocaleTimeString();

/**
 * Export entirely in the browser with WebCodecs. Vercel only serves the app
 * and its API proxies; no render request, headless browser, or temporary MP4
 * ever reaches the deployment.
 */
export const runRenderWithLogs = async (
  rawPayload: Record<string, unknown>,
  onProgress: (progress: RenderProgress) => void,
): Promise<RenderProgress> => {
  const payload = rawPayload as RenderPayload;
  const durationInFrames = Math.min(
    MAX_DURATION_IN_FRAMES,
    Math.max(30, Number(payload.durationInFrames) || 240),
  );
  const started = performance.now();
  const logs: string[] = [];
  const pushLog = (line: string) => {
    logs.push(`[${timeLabel()}] ${line}`);
    if (logs.length > 80) logs.splice(0, logs.length - 80);
  };
  const publish = (progress: Omit<RenderProgress, 'logs'>) => {
    const next = {...progress, logs: [...logs]};
    onProgress(next);
    return next;
  };

  try {
    const {canRenderMediaOnWeb, renderMediaOnWeb} = await import('@remotion/web-renderer');
    const hasAudio =
      payload.kind === 'cut'
        ? Boolean(payload.voiceover || payload.shots?.some((shot) => shot.audio))
        : /<Audio\b/.test(payload.code ?? '');
    pushLog('Checking this browser\'s video encoder');
    publish({status: 'running', progress: 0, stage: 'Checking browser support'});
    const support = await canRenderMediaOnWeb({
      container: 'mp4',
      videoCodec: 'h264',
      width: WIDTH,
      height: HEIGHT,
      videoBitrate: 'high',
      muted: !hasAudio,
    });
    if (!support.canRender) {
      const detail = support.issues
        .filter((issue) => issue.severity === 'error')
        .map((issue) => issue.message)
        .join(' ');
      throw new Error(detail || 'This browser cannot export an H.264 MP4. Use a browser with WebCodecs support.');
    }
    for (const warning of support.issues.filter((issue) => issue.severity === 'warning')) {
      pushLog(warning.message);
    }

    const style = payload.style ?? 'paper';
    let Component: React.ComponentType<Record<string, unknown>>;
    if (payload.kind === 'cut') {
      Component = (payload.shots?.length
        ? makeCutComponent(payload.shots, {style, voiceover: payload.voiceover})
        : EmptyCut) as React.ComponentType<Record<string, unknown>>;
    } else {
      Component = compileScene(payload.code ?? '', paletteFor(style)).Component;
    }

    // Generated scenes can request web fonts during compilation. Wait for
    // them before frame zero so preview and export use the same metrics.
    await document.fonts?.ready;
    pushLog(`Rendering ${WIDTH}×${HEIGHT} · ${FPS}fps in this browser`);
    publish({status: 'running', progress: 1, stage: 'Starting browser render'});

    let lastLoggedFrame = 0;
    const rendered = await renderMediaOnWeb({
      composition: {
        id: `browser-render-${Date.now().toString(36)}`,
        component: Component,
        durationInFrames,
        fps: FPS,
        width: WIDTH,
        height: HEIGHT,
      },
      container: 'mp4',
      videoCodec: support.resolvedVideoCodec ?? 'h264',
      audioCodec: support.resolvedAudioCodec,
      videoBitrate: 'high',
      audioBitrate: 'high',
      muted: !hasAudio,
      hardwareAcceleration: 'prefer-hardware',
      delayRenderTimeoutInMilliseconds: 60_000,
      logLevel: 'warn',
      onProgress: ({progress, renderedFrames}) => {
        if (renderedFrames - lastLoggedFrame >= FPS) {
          lastLoggedFrame = renderedFrames;
          pushLog(`Rendered ${renderedFrames}/${durationInFrames} frames`);
        }
        publish({
          status: 'running',
          progress: Math.max(1, Math.round(progress * 100)),
          stage: `Rendering frames ${renderedFrames}/${durationInFrames}`,
        });
      },
    });

    pushLog('Finalizing MP4');
    publish({status: 'running', progress: 99, stage: 'Finalizing MP4'});
    const blob = await rendered.getBlob();
    const url = URL.createObjectURL(blob);
    const renderedInMs = Math.round(performance.now() - started);
    pushLog(
      `Done · ${(blob.size / 1024 / 1024).toFixed(1)}MB · 1080p60 · ${(renderedInMs / 1000).toFixed(1)}s`,
    );
    return publish({
      status: 'done',
      progress: 100,
      stage: 'Render complete',
      url,
      size: blob.size,
      renderedInMs,
    });
  } catch (caught) {
    const error = caught instanceof Error ? caught.message : 'Rendering failed.';
    pushLog(`Error: ${error}`);
    return publish({
      status: 'error',
      progress: 0,
      stage: 'Render failed',
      error,
    });
  }
};
