/**
 * The scene a shot falls back to when generation could not produce one.
 *
 * A cut is a video: one shot that failed must not put an error card in the
 * middle of it. So when every attempt is exhausted the shot still gets a real
 * scene — the single centred line the style already calls for when there is
 * little to show — and the failure is recorded on the shot for the inspector
 * rather than rendered onto the canvas.
 *
 * This source is a fixed template with only string literals interpolated, and
 * it is compile-checked in the test suite, so it cannot itself be the thing
 * that breaks.
 */
import {CUT_PALETTE, CUT_PALETTE_DEV, CUT_PALETTE_SIGNAL} from './editorStyle';

/** Longest line that still reads at display size on one or two rows. */
const MAX_LINE_CHARS = 92;

/**
 * The line to show. The brief describes a graphic, so it makes a poor caption;
 * the narration is what the viewer is hearing and is the honest thing to put
 * on screen when nothing better exists.
 */
const chooseLine = (narration: string, brief: string) => {
  const source = narration.trim() || brief.trim();
  if (!source) return '—';
  if (source.length <= MAX_LINE_CHARS) return source;
  // Cut at a sentence end if there is one early enough, else at a word.
  const sentence = source.slice(0, MAX_LINE_CHARS).match(/^.*[.!?]/);
  if (sentence && sentence[0].length > 30) return sentence[0].trim();
  const clipped = source.slice(0, MAX_LINE_CHARS);
  return `${clipped.slice(0, clipped.lastIndexOf(' '))}…`.trim();
};

export const fallbackScene = ({
  narration,
  brief,
  palette = CUT_PALETTE,
}: {
  narration: string;
  brief: string;
  palette?: typeof CUT_PALETTE;
}) => {
  const signal = palette.ground === CUT_PALETTE_SIGNAL.ground;
  const dev = palette.ground.toLowerCase() === CUT_PALETTE_DEV.ground.toLowerCase();
  // JSON.stringify is what makes this safe: the narration is arbitrary text
  // and will contain quotes, apostrophes and backslashes.
  const line = JSON.stringify(chooseLine(narration, brief));

  if (dev) {
    return `const Scene = () => {
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
      <div data-layout-main style={{width: 1440, maxWidth: '100%', boxSizing: 'border-box'}}>
        <ui.DevTyping
          text={${line}}
          delay={4}
          width="100%"
          style={{fontFamily: font('DM Sans'), color: palette.ink}}
        />
      </div>
    </AbsoluteFill>
  );
};
`;
  }

  return `const Scene = () => {
  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: 260,
          top: 300,
          width: 1400,
          height: 480,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 72,
          backgroundColor: '${palette.card}',
          border: '${signal ? 'none' : `3px solid ${palette.border}`}',
          borderRadius: 20,
          boxShadow: '${signal ? 'none' : `0 5px 0 ${palette.border}`}',
        }}
      >
        <div data-layout-main style={{width: '100%', textAlign: 'center'}}>
          <Words
            text={${line}}
            maxWidth={1250}
            delay={4}
            step={3}
            lineHeight={1.18}
            align="center"
            style={{
              fontFamily: font('Fredoka'),
              fontWeight: 500,
              fontSize: 68,
              color: '${palette.ink}',
              textAlign: 'center',
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
`;
};
