import React from 'react';
import {kit} from './kit';
import {stage} from './stage';
import {diagram} from './diagram';
import {sketch} from './sketch';
import {rail} from './rail';
import {DynamicStudioIcon} from './dynamicIcon';
import {isSignalPalette, paletteNow} from './palette';
import {Logo} from './logo';
import {GiphyClip} from './giphyClip';
import {Photo} from './photo';
import {KineticCenterBuild} from './type';
import {dev} from './dev';

type DivProps = React.HTMLAttributes<HTMLDivElement>;

type StackProps = DivProps & {
  direction?: 'row' | 'column';
  gap?: number | string;
  align?: React.CSSProperties['alignItems'];
  justify?: React.CSSProperties['justifyContent'];
  wrap?: boolean;
};

const Stack: React.FC<StackProps> = ({
  direction = 'column',
  gap = 0,
  align,
  justify,
  wrap = false,
  style,
  ...props
}) => (
  <div
    {...props}
    style={{
      display: 'flex',
      flexDirection: direction,
      gap,
      alignItems: align,
      justifyContent: justify,
      flexWrap: wrap ? 'wrap' : 'nowrap',
      ...style,
    }}
  />
);

type GridProps = DivProps & {
  columns?: number | string;
  rows?: number | string;
  gap?: number | string;
};

const Grid: React.FC<GridProps> = ({columns = 2, rows, gap = 0, style, ...props}) => (
  <div
    {...props}
    style={{
      display: 'grid',
      gridTemplateColumns:
        typeof columns === 'number' ? `repeat(${columns}, minmax(0, 1fr))` : columns,
      gridTemplateRows:
        typeof rows === 'number' ? `repeat(${rows}, minmax(0, 1fr))` : rows,
      gap,
      ...style,
    }}
  />
);

type SurfaceProps = DivProps & {
  background?: string;
  color?: string;
  radius?: number | string;
  padding?: number | string;
  overflow?: React.CSSProperties['overflow'];
};

const Surface: React.FC<SurfaceProps> = ({
  background = paletteNow().ground,
  color = paletteNow().ink,
  radius = isSignalPalette() ? 28 : 24,
  padding = 32,
  // A surface is a layout primitive, not a reveal mask. Keeping children
  // visible by default prevents long labels and code points being cut at a
  // fixed card edge; callers that genuinely need a mask can opt in.
  overflow = 'visible',
  style,
  ...props
}) => (
  <div
    {...props}
    style={{background, color, borderRadius: radius, padding, overflow, ...style}}
  />
);

type TextProps = DivProps & {
  as?: 'div' | 'p' | 'span';
  family?: string;
  size?: number | string;
  weight?: React.CSSProperties['fontWeight'];
  lineHeight?: number | string;
  tracking?: number | string;
  color?: string;
  align?: React.CSSProperties['textAlign'];
};

const Text: React.FC<TextProps> = ({
  as: Tag = 'div',
  family,
  size,
  weight,
  lineHeight = 1,
  tracking,
  color,
  align,
  style,
  ...props
}) => (
  <Tag
    {...props}
    style={{
      fontFamily: family,
      fontSize: size,
      fontWeight: weight,
      lineHeight,
      letterSpacing: tracking,
      color,
      textAlign: align,
      ...style,
    }}
  />
);

type IconProps = {
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
  filled?: boolean;
  style?: React.CSSProperties;
};

const Icon: React.FC<IconProps> = ({
  name,
  size = 48,
  color = 'currentColor',
  strokeWidth = 2,
  filled = false,
  style,
}) => {
  return (
    <DynamicStudioIcon
      name={name}
      width={size}
      height={size}
      color={color}
      strokeWidth={strokeWidth}
      fill={filled ? color : 'none'}
      aria-hidden
      style={style}
    />
  );
};

type RuleProps = {
  orientation?: 'horizontal' | 'vertical';
  length?: number | string;
  thickness?: number;
  color?: string;
  style?: React.CSSProperties;
};

const Rule: React.FC<RuleProps> = ({
  orientation = 'horizontal',
  length = '100%',
  thickness = 2,
  color = 'currentColor',
  style,
}) => (
  <div
    aria-hidden
    style={{
      width: orientation === 'horizontal' ? length : thickness,
      height: orientation === 'horizontal' ? thickness : length,
      flex: '0 0 auto',
      background: color,
      ...style,
    }}
  />
);

const Mask: React.FC<DivProps> = ({style, ...props}) => (
  <div {...props} style={{overflow: 'hidden', ...style}} />
);

const Box: React.FC<DivProps> = (props) => <div {...props} />;

/**
 * A transform-free full-canvas centering field. The bounded child remains free
 * to animate its own transform without accidentally replacing translate(-50%).
 */
const Center: React.FC<DivProps> = ({style, ...props}) => (
  <div
    {...props}
    style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      ...style,
    }}
  />
);

/**
 * Shadcn-like composable building blocks for generated scenes. They own no
 * layout decisions beyond the primitive named by the component, and contain
 * no timing. Motion stays explicit in scene code through anim().
 */
export const ui = {
  Box,
  Center,
  Stack,
  Row: (props: Omit<StackProps, 'direction'>) => <Stack direction="row" {...props} />,
  Grid,
  Surface,
  Text,
  Icon,
  Rule,
  Mask,
  // The motion-aware half of the kit. Same rule as the layout primitives:
  // no hidden timing beyond the one shared anim() curve, every style
  // overridable from scene code.
  Slot: kit.Slot,
  Rise: kit.Rise,
  Wipe: kit.Wipe,
  Push: kit.Push,
  Pop: kit.Pop,
  Popup: kit.Popup,
  Stamp: kit.Stamp,
  Pulse: kit.Pulse,
  Float: kit.Float,
  Flip: kit.Flip,
  Grow: kit.Grow,
  Draw: kit.Draw,
  FollowPath: kit.FollowPath,
  Count: kit.Count,
  // The explainer diagram vocabulary: the marks a flat editorial explainer
  // keeps needing, with the geometry already correct.
  Tile: diagram.Tile,
  Wire: diagram.Wire,
  Arrow: diagram.Arrow,
  TreeWire: diagram.TreeWire,
  FlowNode: diagram.FlowNode,
  EdgeLabel: diagram.EdgeLabel,
  Callout: diagram.Callout,
  Cursor: diagram.Cursor,
  Rings: diagram.Rings,
  Chip: diagram.Chip,
  // The screen-explainer vocabulary: mock UI on a stage, redacted tables,
  // captions that carry state, verdict marks, shouted words.
  Window: stage.Window,
  Panel: stage.Panel,
  DataTable: stage.DataTable,
  Caption: stage.Caption,
  Verdict: stage.Verdict,
  Shout: stage.Shout,
  Disclaimer: stage.Disclaimer,
  Countdown: stage.Countdown,
  // The hand-drawn explainer vocabulary: braces, circled numerals, a segmented
  // header strip whose columns other content aligns to, self-drawing marks.
  Brace: sketch.Brace,
  BraceGroup: sketch.BraceGroup,
  NumberBadge: sketch.NumberBadge,
  NumberList: sketch.NumberList,
  SegmentBar: sketch.SegmentBar,
  segmentCenters: sketch.segmentCenters,
  LabelValue: sketch.LabelValue,
  Underline: sketch.Underline,
  MonoLine: sketch.MonoLine,
  // The rail vocabulary: a strip of cards the frame travels along, the
  // counting-number shot with its faint backdrop graph, and a single centred
  // line of narration.
  Rail: rail.Rail,
  Sparkline: rail.Sparkline,
  BigNumber: rail.BigNumber,
  OneLine: rail.OneLine,
  StatCard: rail.StatCard,
  railPalette: rail.railPalette,
  // A real company logo from the theSVG collection (thesvg.org).
  Logo,
  // A real photograph supplied with the shot, cropped into a framed exhibit.
  Photo,
  // A verified current GIPHY asset, rendered as deterministic muted MP4.
  Giphy: GiphyClip,
  // Fast, occasional typography-only scene: words slide up word by word,
  // keeping the line centered according to the words currently visible.
  KineticCenterBuild,
  // The dev register: a real artifact, dense and grey, with one lit point.
  DevRecords: dev.Records,
  DevTransform: dev.Transform,
  DevLedger: dev.Ledger,
  DevChecks: dev.Checks,
  DevSplit: dev.Split,
  DevFlow: dev.Flow,
  DevStat: dev.Stat,
  // Kept so scenes written against earlier dev layouts still render.
  DevSubject: dev.Subject,
  DevSet: dev.Set,
  DevFocus: dev.Subject,
  // Restrained monochrome dev-theme motion vocabulary.
  DevTyping: dev.Typing,
  DevWordRise: dev.WordRise,
  DevScale: dev.Scale,
  DevIcon: dev.Icon,
  DevGroupMorph: dev.GroupMorph,
  // Smooth zoom in and out with fast-start real-slow-settle easing to emphasize important segments.
  Zoom: dev.Zoom,
  DevZoom: dev.Zoom,
};
