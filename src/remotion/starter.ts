/**
 * What a new project starts on. Also the reference for the shape of a scene:
 * plain JSX, no imports, every value from `anim(frame, ...)` on the shared
 * speed graph, type revealed word by word, nothing fading.
 */
export const STARTER_DURATION = 240;

export const STARTER_SCENE = `const ACCENT = '#e0a336';
const INK = '#f7f4ee';

const Scene = () => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();

  // The bar extends, then each word rises out of its own mask.
  const bar = anim(frame, 0, 0, 92);

  const zoom = cameraZoom(frame, durationInFrames);

  return (
    <AbsoluteFill style={{overflow: 'hidden'}}>
      <AbsoluteFill style={{transform: 'scale(' + zoom + ')', transformOrigin: '50% 50%'}}>
      <ui.Stack gap={14} style={{position: 'absolute', left: 112, bottom: 132}}>
        <ui.Rule length={bar} thickness={6} color={ACCENT} style={{marginBottom: 12}} />

        <Words
          text="Start here"
          maxWidth={900}
          delay={stagger(1)}
          step={3}
          lineHeight={1}
          style={{
            fontFamily: font('Inter'),
            fontSize: 76,
            fontWeight: 600,
            color: INK,
            letterSpacing: '-0.035em',
            filter: 'drop-shadow(0 2px 6px rgba(20,18,15,.55))',
          }}
        />

        <Words
          text="Tell the assistant what to build"
          maxWidth={900}
          delay={stagger(4)}
          step={2}
          lineHeight={1.1}
          style={{
            marginTop: 14,
            fontFamily: font('IBM Plex Mono', 'monospace'),
            fontSize: 24,
            fontWeight: 500,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: ACCENT,
            filter: 'drop-shadow(0 2px 6px rgba(20,18,15,.55))',
          }}
        />
      </ui.Stack>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
`;
