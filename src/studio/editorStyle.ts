/**
 * The house look for transcript-driven cuts.
 *
 * The paper-and-orange visual system used by transcript-driven cuts.
 *
 *   - Warm paper ground with a quiet tick field.
 *   - Orange blocks with heavy dark outlines and a hard downward shadow.
 *   - Pictures first: icons, figures, charts, and drawn objects carry the
 *     meaning; words are the exception.
 *   - Left-to-right clipped reveals with a small scale settle; never fades.
 *   - One centred idea with generous empty space.
 *
 * This is a different register from the studio's documentary house style, and
 * it is applied only on the editor page.
 */
import {Beat} from './transcript';
import {BRAND_LOGOS_TEXT, brandsNamedIn} from './logos';
import {UNSLOP_RULES} from './unslop';
import {SpokenWord} from './voice';
import type {GiphyAsset} from './giphy';
import type {ShotPhoto} from './photos';

export const CUT_PALETTE = {
  ground: '#ebeae6',
  card: '#e58527',
  border: '#24211d',
  accent: '#e58527',
  white: '#ffffff',
  ink: '#24211d',
  muted: '#bebbb0',
  ticks: '#d5d3ca',
  guide: '#bebbb0',
  blue: '#3d6f8e',
  green: '#477a55',
  red: '#b94b42',
  teal: '#d5d3ca',
};

/** The dark register of the same system: near-black ground, light ink, and a
    soft violet accent — no orange in the dark mode. */
export const CUT_PALETTE_DARK = {
  ground: '#15151a',
  card: '#a29bf5',
  border: '#ece7da',
  accent: '#a29bf5',
  white: '#ffffff',
  ink: '#ece7da',
  muted: '#6b6b75',
  ticks: '#33333a',
  guide: '#4a4a54',
  blue: '#7aa7c9',
  green: '#7fae8a',
  red: '#d97b72',
  teal: '#33333a',
};

/**
 * The dev register: a charcoal terminal stage on pure black, lit by one
 * orange.
 *
 * The accent is the house orange, the same value the paper register uses, and
 * it is the ONLY hue in the theme: filled badge pills, icon glyphs, data
 * marks, and the one figure a shot is about. It was briefly white, which made
 * every shot read as a grey wireframe — the badges, the pin rows and the
 * hero numbers all went flat at once.
 *
 * The remaining semantic slots (blue/green/red/teal) still carry no hue —
 * they are the rungs of one neutral ramp, so a scene written against
 * `palette.green` lands on a deliberate grey rather than an accident. The
 * steps are spaced by eye on a black ground, not by even hex arithmetic: the
 * dark end needs small increments to stay separable and the light end needs
 * large ones.
 *
 * Measured contrast against the ground: ink 20.1:1, blue 12.6:1, muted 7.5:1,
 * green 4.9:1, red 3.1:1, border 1.9:1, guide 1.4:1. The one that mattered is
 * `muted`, the workhorse for labels and context: it was #666666 at 3.4:1,
 * under the 4.5:1 floor for body copy, which is why grey type read as muddy
 * rather than quiet. The dimmer rungs are deliberately below any text floor —
 * they are for rules and fills, and the palette note tells the model so.
 */
export const CUT_PALETTE_DEV = {
  ground: '#000000',
  card: '#121212',
  border: '#3A3A3A',
  /** The one hue in the theme. Dark type on a filled accent pill, never white. */
  accent: '#e58527',
  white: '#ffffff',
  /** Active content. Just off pure white, which blooms on a black field. */
  ink: '#FAFAFA',
  /** Labels and context: the grey that has to stay readable at 22px. */
  muted: '#9A9A9A',
  ticks: '#000000',
  guide: '#242424',
  /** Secondary emphasis, one step under the active white. */
  blue: '#C8C8C8',
  /** Tertiary marks and inactive series. */
  green: '#7A7A7A',
  /** Quiet marks: visible, never competing. */
  red: '#5C5C5C',
  /** Fills only — below the threshold for type of any size. */
  teal: '#1C1C1C',
};

/** High-contrast editorial signal graphics: neutral black, charcoal modules,
    crimson data marks, white type, and crisp connectors with no depth effects. */
export const CUT_PALETTE_SIGNAL = {
  ground: '#060410',
  card: '#191a1f',
  border: '#303137',
  accent: '#ef315f',
  white: '#ffffff',
  ink: '#f7f7f8',
  muted: '#929399',
  ticks: '#18191d',
  guide: '#b1b2b7',
  blue: '#a5a6ac',
  green: '#57d68d',
  red: '#ef315f',
  teal: '#777980',
};

export type CutStyle = 'paper' | 'dark' | 'dev' | 'signal';

/** The palette a style draws with. */
export const paletteFor = (style: CutStyle): typeof CUT_PALETTE =>
  style === 'dark'
    ? CUT_PALETTE_DARK
    : style === 'dev'
      ? CUT_PALETTE_DEV
      : style === 'signal'
        ? CUT_PALETTE_SIGNAL
        : CUT_PALETTE;

/**
 * The headline every style brief opens with, and the ONE place the phrase is
 * written.
 *
 * The prompt builder and the source validator both recover a shot's style by
 * looking for this line in the instruction they were handed. When the dev
 * shot marker was rewritten and no longer carried it, both silently fell
 * through to paper: dev cut shots were generated under the paper brief (which
 * asks for carrier tiles and celebrates emoji) and every dev advisory in
 * validation stopped running. Nothing threw, so the only symptom was dev
 * shots that looked like paper shots on a black ground. Derive the phrase,
 * never retype it.
 */
export const cutStyleMarker = (style: CutStyle) =>
  `PICTURE-FIRST ${
    style === 'signal' ? 'SIGNAL' : style === 'dev' ? 'DEV' : style === 'dark' ? 'DARK' : 'PAPER'
  } EXPLAINER STYLE`;

/** The style a built instruction belongs to, read back from its marker line. */
export const cutStyleFromInstruction = (instruction: string): CutStyle =>
  (['dev', 'signal', 'dark'] as const).find((style) =>
    instruction.includes(cutStyleMarker(style)),
  ) ?? 'paper';

/**
 * One subject, one mark.
 *
 * Three separate lines used to invite icons, emoji and brand logos as a set
 * to "host" together, and the generator did exactly that: a four-way tool
 * comparison came back with a Lucide glyph in a tile and a second, unrelated
 * emoji stacked underneath it in every card — two placeholders where one real
 * mark belonged. The order below is the whole rule: the most specific mark
 * that exists for the subject wins, and nothing is ever doubled up.
 */
export const ONE_MARK_PER_SUBJECT = `ONE MARK PER SUBJECT — never two glyphs for one thing
- Each subject gets exactly ONE visual mark, picked in this order: (1) its verified theSVG brand logo (ui.Logo) when the subject is a real product, tool, or company; (2) a Lucide icon (ui.Icon) when the subject is a mechanism, action, or object; (3) one native emoji when the subject is a state or a quality no logo or icon carries (speed, warning, cost).
- NEVER stack two marks on the same subject: no emoji under an icon, no emoji beside a logo, no icon beside a logo. A second glyph reads as a placeholder sitting next to the real thing.
- Comparing named products: either every one of them wears its own logo, or none of them does. Never give one product its logo and its neighbour a generic icon, and never substitute an icon or emoji for a product that has a verified slug.
- A named product with NO verified slug wears its exact name set in type (mono), not a stand-in emoji or a generic glyph.`;

/**
 * The look, with no component names in it.
 *
 * This half goes to the shot planner. When the planner was shown the
 * component vocabulary it wrote briefs like "A ui.DataTable showing…" and
 * "A ui.Window displaying…", and then cycled those same three components for
 * every shot in the cut — it planned against the API instead of against the
 * subject. The planner's job is to say what a viewer sees; picking the
 * component that draws it is the scene generator's job.
 */
const cutLookBrief = (palette: typeof CUT_PALETTE, mode: CutStyle) => {
  const dark = mode === 'dark';
  const dev = mode === 'dev';
  const signal = mode === 'signal';
  const darkGround = dark || dev || signal;
  return `${cutStyleMarker(mode)}
Every shot belongs to an educational, human-centered explainer. The graphics illuminate concepts so viewers absorb them effortlessly: a viewer should comfortably grasp each 3.5–5s shot in under a second with the sound off and every label hidden.
${dev ? `
REGISTER
- This is the DEV register, built with the exact same high-contrast modular architecture as the SIGNAL theme: an obsidian stage (${palette.ground}), sleek charcoal modules (${palette.card}), crisp white typography (${palette.ink}), cool gray context (${palette.muted}), and sharp developer accents (${palette.accent}). It feels like a world-class developer platform explainer.
- NO GLOW, NO SHADOWS, NO STROKE:
  · The dev theme is strictly flat matte: absolutely NO glow, NO shadows (no boxShadow, textShadow, or filter), and NO outer stroke or border on cards, panels, or modules (border: 'none').
  · Only connectors (ui.Wire, ui.Arrow) and line icons (ui.Icon) carry strokes. Contrast comes purely from the charcoal fill (${palette.card}) against the obsidian ground (${palette.ground}).
- ORANGE IS THE REGISTER'S COLOUR:
  · ${palette.accent} is the primary accent and most shots use only it: the filled badge pill the shot is about (with ${palette.ground} text on it), the icon glyph inside a tile, chart and diagram marks, the connector that carries the idea, and the one number that matters. A soft ${palette.accent} wash (rgba of the same orange at 0.10–0.15) is the correct fill for an icon tile or a highlighted chip.
  · A SECOND hue is allowed only when it carries meaning a shape cannot: green for a pass, a completed step, or a verified result; red or amber for a failure, an alert, or a cost; a cool blue for a purely informational secondary stat. Never more than one of these in a shot, and never a hue chosen for decoration.
  · Everything else is ${palette.ink} for active content and ${palette.muted} for context. No gradients, no glow, no tinted grays.
- TYPE IS UPPERCASE FREDOKA:
  · font('Fredoka') is the display face for every viewer-facing word — headings, labels, badges, figures. The stage also sets uppercase for the whole shot, so write the source in natural sentence case and let it render; never type SHOUTING CAPS.
  · font('IBM Plex Mono') is for exact machine values only (commands, hashes, code points, IDs, paths) and those keep their given casing with textTransform: 'none'. Do not use a mono face for ordinary labels, and do not reach for any third family.
- NOT EVERYTHING NEEDS A BACKGROUND CARD — AVOID CARD OVERUSE:
  · Do not trap every element, icon, or label in an opaque card container!
  · Raw typography, open numbers, floating icons and emojis, badges, and diagram marks can and SHOULD live directly on ${palette.ground}.
  · In workflows, trees, and pipelines, keep nodes open, sleek, and floating (clean pill badges, circular icon carriers, open text nodes) without chunky background cards.
- DYNAMIC WORKFLOWS VS WORKTREES:
  · WORKFLOWS & PIPELINES: Show multi-stage causal processes (Input ➔ Step 1 ➔ Step 2 ➔ Output) connected by directional arrows (ui.Arrow, ui.Wire arrow="end"). Add transition labels (ui.EdgeLabel) to explain data movement or actions.
  · WORKTREES & BRANCHING TREES: Show branching git worktrees, decision trees, or dispatcher architectures (Root ➔ [Branch A, Branch B]). NEVER USE ARROWS IN TREES! Trees MUST use DASHED MOVING LINES (ui.TreeWire or ui.Wire arrow="none" dash="8 6" flow={1.5}) to show flowing pulses through the branches!
- NO ANIMATION IN THE LAST 1.5s OF ANY SEGMENT (45 FRAMES):
  · All in-animations, reveals, line draws, counters, and text builds MUST complete at least 1.5 seconds (45 frames) before the shot ends (delay + span <= shotDuration - 45).
  · The scene must hold completely calm and settled in the final 1.5s so the viewer can absorb the concept.
  · The ONLY animations allowed in the last 1.5s are out-animations (exit pushes) and ui.Zoom holds/drifts.
- SMOOTH SEGMENT ZOOMS (ui.Zoom / ui.DevZoom):
  · Emphasize important segments, focal cards, or key nodes with <ui.Zoom scale={1.22} delay={10} span={24} hold={30}>.
  · Zoom in uses a smooth ease with a fast start and a real slow deceleration settle (cubic bezier 0.12, 1, 0.25, 1); zooms out smoothly when hold expires.
- MOTION (FOLLOWS SIGNAL MOTION RULES):
  · Absolutely NO mask or clip-path slide reveals that cut through cards or text.
  · All entries and exits use smooth push with fade (ui.Push or ui.Rise): fast start, decelerating smoothly into a spring settle.
  · Connectors self-draw with ui.Draw, bars grow with ui.Grow, and metrics count with ui.Count.
- REAL PHOTOGRAPHS WHEN THE SHOT HAS ONE:
  · A shot whose direction supplies a VERIFIED PHOTOGRAPH renders it with ui.Photo as the anchor of the frame. A photograph of the actual chip, machine, place, or device is worth more than any drawing of it, and this register is strong enough to hold one: charcoal frame, theme radius, caption in the theme's type.
  · Everything else in that shot supports the photograph — a caption, one label, one figure. Do not surround it with modules, and do not draw the same object beside it.
  · Most shots supply no photograph. Those are drawn exactly as before; never invent an image path.
- ICONS, LOGOS & EMOJIS — ${ONE_MARK_PER_SUBJECT.split('\n')[0]}
${ONE_MARK_PER_SUBJECT.split('\n').slice(1).map((line) => `  ${line.replace(/^- /, '· ')}`).join('\n')}
  · A mark sits either in a carrier (ui.Tile, a pill, a circular backdrop) or open on the ground. Lucide icons run 48–96px. When a real developer tool or company is named (OpenAI, GitHub, Docker, vLLM, Ollama, LM Studio, PostgreSQL), that is a ui.Logo with its verified slug, not an icon standing in for it.
- TECHNICAL CONTENT & TERMINAL:
  · When exact terminal commands, queries, or code snippets are provided in the brief or narration, render them cleanly using ui.DevTyping or a code surface. Never invent fake shell prompts or fake commands.
  · On-screen text strictly follows the 3–5s cognitive budget: 1–4 words per label.` : ''}
${dark ? `
REGISTER
- This is the dark register: a near-black stage with soft violet blocks — cinematic, elegant, and educational.` : ''}
${signal ? `
REGISTER
- This is the signal register: a midnight-navy editorial stage, charcoal data modules, crisp white type, cool gray context, and hot crimson/pink emphasis. It should feel like a premium economics or geopolitics explainer rather than a software interface.
- The player paints the signal ground as an indigo-to-black gradient (${palette.ground} at the bottom, black at the top) with a faint white tick field that stays barely visible. Content and labels must stay readable against the dark ground.
- The layout rules are identical to the other styles — one centred group at 1440×810 (75% of the frame), dead-centre on both axes, full but simple, the same axes and spacing arithmetic. Only the materials differ: midnight ground, charcoal modules, crimson signals. Keep the placement exactly as the other styles would.
- Keep signal modules completely flat: no outer border/stroke, no boxShadow, no text shadow, no filter, and no glow. Use spacing, contrast, and the charcoal fill to separate objects; connector and chart lines remain crisp geometry.
- SIGNAL MOTION RULES: Absolutely NO mask or clip-path slide reveals are allowed in the signal register. All entries and exits must be a push with fade: in-animations push into position with an opacity fade at the start, and out-animations push away with a fade at the end. The start of the animation is fast and the end is slow with a spring settle. Use ui.Push or ui.Rise (which automatically renders as a spring push with fade in signal theme with no masks).` : ''}

STAGE
- The player paints a static ${darkGround ? 'near-black ground' : 'warm paper ground'} (${palette.ground}) ${dev ? 'with no texture at all' : 'with its quiet tick field'} behind every shot, so it never moves during scene changes. Paint no background of your own: no full-frame AbsoluteFill, ground colour, tick field, tint, or gradient. Only the foreground graphic renders.
- Put one centred group around 1440×810px in the middle of the 1920×1080 frame — the focal visual fills 75% of the screen. The group is full but simple: the content spans it with a few supporting marks (a baseline, a faint backdrop line, a small counterbalancing element) — full is visual scale, never packed information.

OBJECTS AND COLOUR
- The signature object is ${dev ? `${palette.card} modular surfaces with flat matte contrast, 20-28px corners, NO stroke (border: 'none'), and NO boxShadow, glow, or blur. It is a structured architecture carrier, a metric card, a comparison block, or an exact code container. NEVER USE #0E172A (navy/slate) OR WHITE FOR BACKGROUND CARD COLORS. Cards must use ${palette.card} (#121212). White is strictly reserved for typography and icons, NEVER card backgrounds` : signal ? `${palette.card} with no outer border or stroke, 28px corners, and no boxShadow, text shadow, filter, or glow. Let contrast and spacing define its edge. NEVER use #0E172A or white for card backgrounds` : `${palette.card} with a 3px solid ${palette.border} border, 20px corners, and exactly boxShadow: '0 5px 0 ${palette.border}'. The shadow has no blur`}.
- ${signal || dev ? 'Icons and connector strokes' : 'Icons, outlines, and connector strokes'} are ${palette.ink}. ${
    signal ? 'Crimson' : dev ? 'White' : dark ? 'Violet' : 'Orange'
  } is the single emphasis colour. ${dev ? `White carries the active subject; ${palette.muted} carries labels and context and ${palette.green} carries anything quieter still. Keep the UI monochrome; one purposeful native emoji may retain its own colour.` : signal ? 'White is the primary text and icon colour; neutral gray carries secondary geography, axes, and context. Do not tint cards, borders, shadows, or inactive marks blue.' : `${dark ? 'Light paper-white' : 'White'} may appear only inside a real document or interface when the subject requires it.`}
- Read every house colour from the palette object in scope — palette.ground, palette.card, palette.border, palette.ink, palette.accent, palette.ticks, palette.blue, palette.green, palette.red. Never hardcode a house colour as a hex literal; referencing palette is what lets a style switch recolour the shot instantly. Colours you choose yourself for content (a data series, a diagram accent) stay literals.
- ${dev ? 'Do not use chromatic UI colour, semantic red/green/blue, glow, boxShadow, text shadow, filter, or tint. Never use #0E172A or white for card backgrounds. A concrete native emoji is the only purposeful colour exception.' : signal ? 'Do not use glow, halo, boxShadow, text-shadow, filter, or drop-shadow anywhere in the signal register. Never use #0E172A or white for card backgrounds. Identify the active data mark or direction of travel with crimson colour, line weight, or a clean scale change only; keep all modules matte.' : 'Avoid tinted panels, soft shadows, glow, translucent overlays, and decorative colour collections. Semantic red/green/blue are allowed only when the narration actually means failure/success/information.'}

CREATIVE VISUAL DESIGNS, CUSTOM SVG DRAWING, EMOJIS & ICONS
- BE CREATIVE WITH DESIGNS! Avoid generic, cookie-cutter boxes. Create original visual compositions: custom diagrams, visual metaphors, mechanical illustrations, gauges, scales, balance beams, and branching routes.
- DRAW WITH CUSTOM SVG (<svg>, <path>, <circle>, <rect>, ui.Draw): Custom vector drawings and bespoke shapes are highly encouraged! Draw custom illustrations, connected architecture meshes, branching routes, custom circular dials/gauges, progress arcs, balance scales, radar sweeps, or pipeline shapes. Animate custom SVG paths effortlessly with ui.Draw.
- EMOJIS ARE LOVED AND CELEBRATED: Use expressive, colorful native emojis boldly and proudly (🚀, ⚡, 💡, 🧠, 🎯, ⏱️, 💰, 📦, 👤, 🛡️, 🔥, ⚙️, 📊, 🔍, etc.) to give the design personality, human warmth, and instant visual comprehension. Size them boldly (48px–120px). Give them clean, sleek carrier tiles (ui.Tile, rounded pill badges, circular backdrops) or let them stand as proud hero anchors. Emojis retain their native full-color artwork: never tint, recolour, or reduce opacity on an emoji.
- Lucide icons (ui.Icon): Use 48px to 96px icons inside rounded tiles or clean circular carriers (ui.Tile) for tools, systems, security, actions, and mechanisms.
- theSVG Brand Logos (ui.Logo): When the narration or brief mentions a real company or product (OpenAI, GitHub, Docker, Stripe, Google, Python, AWS, etc.), use ui.Logo with the exact verified slug so viewers instantly recognize the brand mark. Always provide a fallback icon.
- Keep ordinary icons in ${dev || signal ? palette.accent : palette.ink} or ${dev ? palette.ink : signal ? palette.accent : palette.card} on ${darkGround ? 'the dark ground' : 'paper'}.

TYPE & 3–5 SECOND HUMAN COGNITIVE BUDGET
- CLIPS RUN 3–5 SECONDS: Human working memory can absorb only ONE core concept, ONE dominant visual anchor, and at most 2–4 words or one number.
- On-screen text is strictly limited to 1–4 words per label. If a label requires a sentence to explain the visual, the visual is flawed. Let the visual carry the meaning and narration speak the explanation.
- NO SLOP TEXT, NO EXTRAS: Never add meta-labels, category kickers, or slide tags ("Overview:", "Key Insight:", "Core Feature:", "Result:", "Summary:"). State the concrete noun or metric directly.
- Ban filler labels: "Innovation", "Quality", "Growth", "Trust", "Excellence", "Power", "Solution", "Future", "Limitless", "Next-gen", "Unlock", and generic buzzwords.
- ${dev ? 'A short dev label stays on one row only when sized from content. Long commands or URLs must wrap or use ui.DevTyping with padding.' : "A label is one short phrase on one row: no wrapping (whiteSpace: 'nowrap'), sitting in a pill badge sized to fit it with padding."}
- ${
    dev
      ? "font('Fredoka') is mandatory for every viewer-facing word, label, caption, badge, and figure, and every one of them is set UPPERCASE. Use weight 400-600 and natural spacing. font('IBM Plex Mono') is for exact machine values only — commands, hashes, paths, IDs — and those keep their original casing (set textTransform: 'none' on them)."
      : signal
        ? "font('Bricolage Grotesque') is mandatory for every viewer-facing title, label, figure, and annotation. It is loaded through the studio's Google Fonts helper. Use weight 500-800, with tighter tracking on large figures and no synthetic italics."
      : "font('Fredoka') is mandatory for every viewer-facing label, title, list item, milestone, annotation, and number. Use weight 500-700."
  }
- Display type is 64-120px; card labels are 32-44px; nothing meaningful is smaller than 22px. A label longer than about a dozen characters is two labels or one cut label.

SIMPLE TO READ & EDUCATIONAL
- Compositions are educational and uncluttered: 1–3 visual units maximum. One focal subject (a hero metric, a 2-item comparison, a 2-3 step pipeline, or a central hero icon with callouts) anchors the viewer's attention.
- When an asset (icon, emoji, logo) can communicate the concept, use it directly instead of text.
- No watermark-style branding, taglines, chatbot phrasing, or closing flourishes. The frame ends clean.

COMPOSITION
- One shot shows one idea as a picture. Build it from drawn objects, icons, shapes, and figures — a scale, a path, a stack of blocks, two shapes in comparison — so the meaning lands without reading. When in doubt, draw the thing instead of labelling it.
- THE FRAME IS NEVER EMPTY: at every single frame, real content covers at least 30% of the screen. That fill is the actual graphic — an object, a figure, a chart, a card, a badge — never thin lines, tiny labels, hairline marks, or decorative filler. From the first frame on, the shot is at least a third full, and it only gets fuller from there.
- Most shots are one focal object or at most a pair of matching objects, surrounded by the marks that make the shot full: a baseline, a guide line, a scale, a counterbalancing element, a backdrop chart. A shot that reads as mostly blank ground is a failure — but so is a shot that needs reading: full is visual, simple is the goal. If a shot takes more than two meaning-bearing elements to explain, it is cluttered, not fuller — cut the least important element and let an icon carry what remains.
- COMPONENT WINDOW — at any frame show only 1–4 foreground visual units, with 1–2 as the normal target and four as an absolute ceiling. Stage the next unit on its voice cue; when the narration changes subject, animate the old unit out or let its short Sequence end before introducing the replacement. Prefer a Sequence with from=startCue and durationInFrames=Math.max(1, nextCue - startCue) for a phrase and shotDuration() - startCue for the final phrase, so a delay-only child is not left mounted indefinitely. Keep a simple persistent base for coverage, but never accumulate prior facts into a card wall.
- A list of words becomes a row of icons or stacked blocks. A table becomes a chart or a comparison of shapes. A statement becomes one drawn object. A mock interface appears only when the narration is specifically about software, and even then one element carries the point while the rest stays sparse.
- A number is one large ${dev ? 'Fredoka' : signal ? 'Bricolage Grotesque' : 'Fredoka'} figure, one short label at most, and optionally one faint line.
- The group sits dead-centre on both axes, and everything inside it shares the same axes: one vertical centre line for the stack, one baseline for the row, one gap value for every spacing. Nothing drifts off-axis, and no two objects are positioned by feel — compute each position from the shared centre and the shared gap.
- Align every repeated object to the same axis and use exact arithmetic for spacing.

CHARTS, GRAPHS AND ANIMATED TYPE
- A shot about data is a real chart, not a card: bars grow from a shared baseline (ui.Grow), lines and routes draw themselves across axes (ui.Draw), a donut or area fills in, values sit directly on the marks with one label each. The axes arrive first, the data second, the punchline last — each landing on the beat that says it. When an object travels on a chart line or route, wrap it in ui.FollowPath and give ui.FollowPath the exact same d, delay, and span as ui.Draw. Never animate a route marker with separate x/y guesses.
${dev ? `- DEV GRAPH OVERRIDE: render charts as one static SVG or positioned plot inside data-layout-main; generic ui.Grow, ui.Draw, ui.FollowPath, ui.Count, anim(), spring(), and interpolate() remain forbidden. If motion is needed, reveal the complete plot or a meaningful series/bar group with ui.DevScale, and reveal exact supplied labels with ui.DevWordRise.
- THE LINE ABOVE ABOUT AXES FIRST AND DATA SECOND DOES NOT APPLY IN DEV. Dev marks do not draw themselves, so an early axis is not a route being drawn — it is an empty box holding the screen while nothing happens, and the shot reads as frozen. Axes, baseline, gridlines, and the first series enter together in one ui.DevScale around the whole plot, on the cue for the phrase the chart answers. If the plot must exist earlier for layout, its data follows within about 10 frames, never on the next spoken beat. Only a genuine second fact — another series, a threshold, a called-out point — takes a later cue, and it lands on a chart that already has data in it.
- Define one plot rectangle with explicit left, top, width, height, and label gutters. Derive every x position with scale.band or scale.linear, every y position with one scale.linear, and every bar height from baseline - y(value). All bars share exactly the same baseline; all points and labels use the same scale functions. Never hand-place repeated marks, use flexbox for quantitative spacing, or give each value its own card.
- Keep axes and grid rules inside the plot bounds. Reserve gutters before computing scales so labels never collide with marks or canvas edges. Place value labels from each mark's computed center and use textAnchor="middle"; place y-axis labels from the shared tick y and use textAnchor="end". Graph strokes and rules may repeat and do not count as outlined containers.` : ''}
- ${signal ? `For charts and maps, keep axes and inactive geography in ${palette.blue} or ${palette.muted}; use ${palette.accent} for exactly one active series, country, arrow, or causal node. Keep every mark flat: no boxShadow, filter, drop-shadow, or halo.` : 'Keep chart marks flat and free of glow.'}
- ${signal ? 'Use round linecaps and linejoins on chart series, routes, arrows, and connector paths. Rounded corners and endpoints belong to the geometry; emphasis comes from crimson colour and clean line weight, never blur.' : 'Keep corners and line endings consistent within the shot.'}
- A shot about a statement is animated type: the line wipes in word by word (Words), the emphasis word pops (ui.Shout), a number counts (ui.Count). Type is the graphic, so give it scale.
- KINETIC CENTER BUILD is the one typography-only exception. Use it only when WHAT TO BUILD starts with the exact marker "KINETIC CENTER BUILD:". Render one ui.KineticCenterBuild and nothing else in the foreground: two to six exact narration words/short phrases sliding up word by word on one horizontal line, keeping the line centered in the comp according to the words visible in the comp, with the final text clearing before the shot ends. MUST NOT BE UPPERCASE: use natural sentence case (e.g. ["How", "important", "is", "memory?"]). Font size is restrained and elegant (48–72px), never gigantic screaming uppercase letters. All words must complete entry at least 1.5s (45 frames) before the shot ends. This is an occasional fast beat, never a default type treatment.
${dev ? `- DEV MOTION VOCABULARY — choreograph 2–4 short, meaning-bearing entrances across the spoken beats when the shot has enough content. The allowed helpers are ui.DevTyping, ui.DevWordRise, ui.KineticCenterBuild, ui.DevScale, plus the icon-only ui.DevIcon companion. A grouped continuation may additionally use ui.DevGroupMorph for its shared-element handoff. They may be combined on distinct focal elements; do not double-animate the same container. Do not call anim(), spring(), interpolate(), cameraZoom(), or generic ui reveal helpers from a dev scene. Keep every component at its authored position and size except the explicit grouped handoff; never add a cue-driven zoom, camera move, or automatic focus effect.
- Typing is used only when the narration or brief provides the exact command, query, status, code, or generated line. Copy that text verbatim. Never infer or fabricate a command, tool, or flag from a technical concept. The terminal row exists from frame 0; only its exact supplied text types. The cursor is a thin "|" line that blinks while visible, never a solid block glyph.
- ui.DevScale is a single fast pop entrance, never a pulse: it may scale a whole focal object or surface, but it never rotates the card, surface, text, or group. If a glyph needs rotation, use ui.DevIcon and keep the container flat. Do not pass rotateFrom to ui.DevScale.` : ''}
- Vary the form across the cut — graph, animated type, object, icon sequence, comparison of shapes — and never let two adjacent shots be the same kind of picture.
- Colour discipline: one ${
    signal ? 'crimson' : dev ? 'white' : dark ? 'violet' : 'orange'
  } accent per shot; everything else stays in the ground and ink range (ground, ticks, ${
    darkGround ? 'bright on near-black' : 'near-black'
  }). Blue, green, and red appear only when the narration means information, success, or failure.

SPACING AND CLIPPING
- No two objects may overlap or touch: every element keeps explicit clearance from its neighbours (at least 24px between separate objects) and sits fully inside its parent's box, with padding rather than flush edges.
- Nothing clips. Content stays inside the safe area (96px from every frame edge) and inside any mask or clip with at least one line-height of clearance from the clip edge — a mask that cuts a label, figure, or icon is a bug, not a crop. If an element would be cut, enlarge the mask or shrink the element, never crop the message.
${dev ? '- DEV TEXT FIT: never put a long command, URL, ID, Unicode code point, or label in a fixed-size box with overflow hidden and nowrap. Use ui.DevTyping for long terminal copy, or give the text box enough padded room to wrap; every character must remain readable at the settled frame.' : ''}

LAYER ORDER
- JSX paints later siblings on top. Use one fixed stack per shot: player ground → routes and connectors → signature blocks → icons and figures → labels and badges → luminous emphasis marks last.
- At the settled frame every element is fully inside its clip box: an icon cut at the top or a card cut at the bottom means the box is too small. Enlarge the box; never shrink the object to squeeze it into the clip.
- When a clipped box gets a fixed width or height, make it larger than the content. If a ui.Rise, ui.Wipe, or clipPath reveal would cut the object, add padding to the clip box instead of reducing the object's own box.

INTERNAL MOTION
- ${dev ? 'The player camera is completely static for dev shots. Never animate the scene root, data-layout-main, or root AbsoluteFill; spread 2–4 short permitted foreground entrances across the narration instead.' : 'The player applies a slow push-in to the whole shot and owns every scene-boundary transform. Never animate the scene root, data-layout-main, or the root AbsoluteFill; spend your motion on the foreground.'}
- All frame-driven motion uses the shared decelerating curve cubic-bezier(0.16, 1, 0.3, 1) — extremely fast start, slow settle — including any direct interpolate call. Never use a linear visible move, an ease-in or ease-in-out curve, or an abrupt value jump.
- Start and end keyframes must differ enough to be legible frame by frame: entrances travel 40-90px, entering scales start at 0.85-0.9, and opacity goes the full 0 -> 1. Sub-pixel moves read as stepping however high the frame rate is.
- FOCAL OBJECTS ARRIVE WITH MOTION; SUPPORT CAN SETTLE. Meaning-bearing elements enter through the reveal that explains them: numbers and figures count (ui.Count), bars and fills grow (ui.Grow), paths and lines draw (ui.Draw), icons and chips rise or wipe (ui.Rise / ui.Wipe), words enter word by word (Words). Background textures, borders, guides, decorative blobs, odd filler, and settled support marks can remain static; never animate them merely because they exist.
- ${signal ? 'In signal style, NEVER use mask clipPath slide reveals. Reveal elements with ui.Push or ui.Rise (push with fade): fast start, decelerating smoothly into a spring settle.' : 'Reveal repeated objects from left to right with a rounded clipPath: inset(0 ... 0 0 round 20px), paired with scale 0.88→1.'}
- Use 18-28 frames per focal reveal and 10-16 frames between genuinely related staggered items, so each entry reads as motion rather than a burst. ${signal ? 'All signal reveals use a push with fade (fast launch, spring settle).' : 'Nothing fades, and no meaningful beat should be delayed so long that the viewer sees only the ground'} — except the final hold: every reveal and meaningful sustained motion completes at least 90 frames (1.5s) before the end, and the last 1.5s of the shot is a static, settled frame. If a shot has only two or three objects, animate the focal object itself — a counter mid-climb, a path still drawing, a block still growing — rather than adding decorative motion.
- Motion is spread across the WHOLE shot, never bunched. The first focal element lands within the first 15% of the shot (on or before the first spoken word), the middle beats land mid-shot, and the last reveal arrives early enough that everything has settled at least 1.5s before the handoff — the final 90 frames are a static settled frame, animated only by the player's out envelope. Keep a persistent base visible from frame 0; do not manufacture movement in the background just to make a shot look busy.
- ${signal ? 'In signal style, masks and clipPaths are prohibited. Elements stay unclipped and animate via push with fade.' : 'Every mask must be genuinely closed before it begins: pair clipPath with overflow: \'hidden\' and visibility: progress <= 0 ? \'hidden\' : \'visible\'. Never animate a vertical clip edge and a vertical child translation at the same time. Use one motion owner. Prefer left-to-right text wipes; avoid slide-up text masks.'}
- An element that ends small starts big. A date, number, or name that will settle as a small badge beside a card opens the shot centred and large — the hero of the frame — and compacts into its small badge position on the beat when the next element arrives. At no moment may an element sit small in empty space: if a frame holds only a small badge in a void, that badge should have been the big opener instead.
- Other marks draw, wipe, count, or scale in.
${dev ? '- DEV OVERRIDE: do not spread motion across the whole shot and do not add a sustained animation. Use one brief voice-cued action from the dev motion vocabulary, then hold the settled frame. The player camera is static in dev shots.' : ''}

SUSTAINED MOTION
- Entries are not the whole story. Give every shot one sustained movement that is still going after the elements have entered: a counter that keeps climbing, a fill or progress bar still advancing, a live cursor typing or pressing, a route still drawing, a value updating again. That is what makes the frame feel alive across the narration.
- THE LAST 1.5 SECONDS ARE STILL, in this and every other theme: nothing may start or still be running in the final 90 frames except an outgoing animation and the player's zoom. Schedule each reveal so its start plus its span lands at or under durationInFrames - 90.
- One sustained motion per shot, placed where it matters, timed to finish at least 1.5s before the handoff so the tail of the shot is a static settled frame. Entries arrive early and settle; the sustained element carries the middle; nothing bounces, loops, pulses, or drifts idly. When no element genuinely needs to keep moving, the shot simply settles — motion is density, not spam.
${dev ? '- DEV OVERRIDE: dev shots do not need sustained motion. Once typing, word-rise, push-left, or the one scale/rotate entrance completes, hold still.' : ''}

FOCAL-MOTION AND COVERAGE OVERRIDE
- Motion follows the viewer's eye. Animate only the primary subject, active data mark, or one supporting relationship that explains the narration. Background textures, borders, guides, decorative blobs, odd filler, and settled support marks stay still; never animate them merely because they are present.
- No idle drift, random wiggle, pulse, loop, bounce, or unrelated simultaneous motion. Use at most one sustained focal movement per shot, and only when the narration gives it a real action or change. If an object is not where the viewer should look, it does not move.
- Keep a substantial foreground component visible from frame 0. Never leave only the ground during a lead-in or handoff for more than 60 frames (one second). At every frame, real foreground components — not texture, hairlines, or tiny labels — cover at least 30% of the 1920×1080 canvas. A persistent large object, chart field, diagram, or surface may provide that coverage while the focal reveal happens.

SEAMLESS SHOT BOUNDARIES — OWNED BY THE PLAYER
- The cut host applies the complete outer transition only between unrelated pictures. A grouped continuation has no player transition because its generated scene owns a seamless shared-element handoff: its first frame exactly matches the prior settled frame, then one retained component moves while stale support fades and replacement support arrives.
- The cut host already applies the complete outer transition to every scene. Do not animate data-layout-main, AbsoluteFill, or the whole composition in or out. Do not call exit() or inOut() for a scene-level transition.
- Each boundary is one continuous envelope centred on the edit. The outgoing shot starts leaving two frames early and keeps moving for ten frames past the cut; the incoming shot is mounted underneath it for those same frames and decelerates into rest. The two genuinely overlap, so maximum motion is at the cut and no frame of the edit is empty.
- The player rotates through one boundary family only: a push up with a fast cross-fade. Both halves travel up and both grow, and the incoming shot enters at exactly the scale the outgoing one is passing through, so an edit reads as one gesture. The ground is handed over underneath, unbroken. No mask, wipe, or scale-mask is used, and no shot ever has both a fade and a competing root mask or transform. Do not assume every edit is a slide and do not add a competing root transform or mask.
- Generate only internal item reveals. Never add opacity to hide the player-owned boundary.

BE INVENTIVE INSIDE THIS SYSTEM
- Change the diagram or object to fit the idea, while keeping the ${
    darkGround ? 'dark ground' : 'paper'
  }, ${dev ? 'no texture' : 'ticks'}, ${signal ? 'charcoal blocks with crimson signals' : dev ? 'thin monochrome terminal lines' : dark ? 'violet blocks' : 'orange blocks'}, ${
    darkGround ? 'light ink' : 'dark ink'
  }, ${dev ? 'uppercase Fredoka, one orange accent on white and gray, flat charcoal modules, and a brief sequence of permitted cue-timed entrances—nothing else' : signal ? 'Bricolage Grotesque, flat charcoal modules, precise crisp connectors, no glow, and spring push-with-fade motion with no masks' : 'Fredoka, hard outline, and clip-plus-scale motion'} unmistakably consistent.`;
};

export const CUT_LOOK_BRIEF = cutLookBrief(CUT_PALETTE, 'paper');
export const CUT_LOOK_BRIEF_DARK = cutLookBrief(CUT_PALETTE_DARK, 'dark');
export const CUT_LOOK_BRIEF_DEV = cutLookBrief(CUT_PALETTE_DEV, 'dev');
export const CUT_LOOK_BRIEF_SIGNAL = cutLookBrief(CUT_PALETTE_SIGNAL, 'signal');

/**
 * The planner and per-shot request need the dev grammar, not the complete
 * cross-theme component manual. Keeping this compact avoids sending the same
 * 30k-character style block at planning, system-prompt, and shot-prompt time.
 */
export const CUT_LOOK_BRIEF_DEV_COMPACT = `${cutStyleMarker('dev')} — MODULAR DEV REGISTER (SIGNAL ARCHITECTURE)
- Stage & Materials: Obsidian ${CUT_PALETTE_DEV.ground} stage, UPPERCASE Fredoka (IBM Plex Mono for exact machine values only, in their own casing), crisp white ${CUT_PALETTE_DEV.ink} active content, cool gray ${CUT_PALETTE_DEV.muted} context, one orange ${CUT_PALETTE_DEV.accent} accent as the only hue — filled badge pills with dark text, icon glyphs, data marks and the one figure that matters, sleek charcoal ${CUT_PALETTE_DEV.card} modules with 20–28px rounded corners, flat matte finish with NO stroke or border (border: 'none'), NO shadows, NO glow, and NO fake chrome.
- Flat Matte Dev Architecture: Pure #000000 obsidian ground, sleek flat charcoal surfaces (${CUT_PALETTE_DEV.card} #121212), crisp white typography (${CUT_PALETTE_DEV.ink}), cool gray context (${CUT_PALETTE_DEV.muted}). Absolutely NO glow, NO shadows, NO stroke/border on cards (border: 'none'). NEVER USE #0E172A OR WHITE FOR BACKGROUND CARD COLORS. Cards use ${CUT_PALETTE_DEV.card} (#121212); white is strictly for text/icons.
- Workflows vs Worktrees:
  · Linear workflows/pipelines: Step 1 ➔ Step 2 ➔ Step 3 with directional arrows (ui.Arrow or ui.Wire arrow="end").
  · Branching trees / worktrees: Root ➔ Branches. NEVER use arrows in trees! Use DASHED MOVING LINES (ui.TreeWire or ui.Wire arrow="none" dash="8 6" flow={1.5}) to show flowing data pulses!
- NO ANIMATION IN THE LAST 1.5s: All in-animations, reveals, draws, counters, and text builds MUST finish at least 1.5s (45 frames) before the shot ends (delay + span <= shotDuration - 45). The visual must settle so the viewer can absorb it. Only out-animations and ui.Zoom holds/drifts may run in the last 1.5s.
- Kinetic Center Build: Write the words in natural sentence case (e.g. ["How", "important", "\n", "is", "memory?"]) — the dev stage sets the whole register uppercase for you, so never type SHOUTING CAPS into the source. If the line gets big (>4 words or >24 chars), it automatically balances across 2–3 cleanly stacked lines with proper vertical line spacing (or manual \n linebreaks). Restrained font size (48–72px). Never leave opening seconds empty.
- Motion & Smooth Zooms: Spring push with fade (ui.Push, ui.Rise). Energetic Pop-up animation that goes from 0% to 115% really quick then settles slowly to 100% with eased motion (<ui.Pop delay={10}> / <ui.Popup>), punchy stamp for badges/verdicts (<ui.Stamp>), 3D perspective flip (<ui.Flip>), highlight pulse (<ui.Pulse>), and ambient floating drift (<ui.Float>). Smooth zooms in and out (<ui.Zoom scale={1.22} span={24} hold={30}>) to emphasize important segments. Self-drawing connectors (ui.Draw), bar growth (ui.Grow), and live counters (ui.Count). Zero clipPath masks.
- Proper Card & Pill Spacing: Cards, narrow containers, and pills MUST have generous vertical padding (min padding: '16px 28px' or '18px 32px', boxSizing: 'border-box', lineHeight: 1.3). Text must NEVER touch or crowd the top or bottom edges!
- Visual Anchors — ONE MARK PER SUBJECT: a real product or tool wears its verified theSVG brand logo (ui.Logo); a mechanism wears a Lucide icon (ui.Icon); a state or quality with no logo or icon may wear one native emoji. Never stack two marks on the same subject (no emoji under an icon, no icon beside a logo), and in a comparison either every named product wears its own logo or none does. Marks sit in sleek module tiles (ui.Tile) or open on the ground.
- 3.5–5s Cognitive Budget: Segments run strictly 3.5 to 5 seconds (never less than 3.5s). Max 1–3 visual modules per shot, 1 core idea, strictly 1–4 words per label. Zero slop text or meta categories.
- Real Technical Content: Render ui.DevTyping for exact supplied commands or code; never invent fake CLI commands.`;

const DEV_SHOT_STYLE_MARKER = `${cutStyleMarker('dev')} — MODULAR DEV REGISTER (SIGNAL ARCHITECTURE)
Apply the modular dev system. Segments run strictly 3.5-5s (never less than 3.5s). Strictly flat matte: NO glow, NO shadows, NO stroke (border: 'none'). NEVER USE #0E172A (navy) OR WHITE FOR BACKGROUND CARD COLORS (cards use flat charcoal palette.card #121212; white is for text/icons only). Ensure cards and narrow containers have generous top/bottom padding (min 16px 28px, boxSizing: 'border-box', lineHeight: 1.3) so text never touches card edges. Use open layouts. In workflows use directional arrows (ui.Arrow); in trees NEVER use arrows, use dashed moving lines (ui.TreeWire). NO animation in the last 1.5s of the segment (delay + span <= shotDuration - 45). Type the source in natural sentence case: the dev stage renders every viewer-facing word in UPPERCASE Fredoka on its own, and exact machine values (commands, hashes, paths) opt out with textTransform: 'none'. Max 1-4 words per label; zero slop text.

${ONE_MARK_PER_SUBJECT}`;

/** The look plus the components that draw it. Only the scene generator sees this. */
const cutStyleBrief = (palette: typeof CUT_PALETTE, mode: CutStyle) =>
  `${cutLookBrief(palette, mode)}

COMPONENTS TO BUILD IT WITH
${mode === 'dev' ? '- DEV STYLE ARCHITECTURE (SIGNAL-INSPIRED MODULAR REGISTER): Dev shots build dynamic workflows (ui.Arrow) and branching trees (ui.TreeWire with dashed moving lines, NO arrows). Use ui.Surface, ui.Tile, ui.FlowNode, ui.Wire, ui.Arrow, ui.TreeWire, ui.Zoom, ui.Callout, ui.Push, ui.Rise, ui.Grow, ui.Draw, ui.Count, ui.BigNumber, and ui.Logo, paired with ui.DevTyping (when exact code is provided). Strictly flat matte: NO glow, NO shadows, NO stroke (border: "none"). Emphasize key segments with <ui.Zoom scale={1.22} span={24}> (fast-start slow-end smooth ease). All in-animations must complete by shotDuration - 45 frames.' : ''}
- ui.Photo is a REAL PHOTOGRAPH, and it appears only when the shot's direction supplies one under VERIFIED PHOTOGRAPH FOR THIS SHOT. Props: src (always staticFile('images/…'), copied exactly), caption, credit, width, height, focusX, focusY, radius, style. It crops the image to the box you give it, so pick a real rectangle. When a shot has one, it is the anchor the rest of the composition serves — never a thumbnail in a corner, never beside a drawn illustration of the same thing. Most shots have no photograph and are drawn as always.
- ui.Window is a browser or app window; ui.Panel is a form, dialog, document page, or any plain card; ui.DataTable is records, with {redacted: n} cells for withheld values and a highlight row.
- ui.Caption is the state-carrying line under the artifact. ui.Verdict is the cross or tick. ui.Shout is the one emphasised word. ui.Disclaimer is the corner fine print. ui.Countdown is a live counter.
- The hand-drawn register is ui.Brace and ui.BraceGroup (gathering a set under a label), ui.NumberList (a numbered list with circled indices), ui.SegmentBar (a filled header strip whose children render-prop gives the segment centres to column-align against), ui.LabelValue (a big label over its value), ui.Underline, and ui.MonoLine (a mono line whose emphasis is colour contrast, never opacity).
- ${mode === 'signal' || mode === 'dev' ? 'The modular rail is ui.Rail with flat charcoal ui.StatCard children: no border/stroke, boxShadow, text shadow, filter, or glow.' : 'The paper-and-orange rail register is ui.Rail with ui.StatCard children. Its defaults use a hard 5px shadow and dark border.'} ui.BigNumber is the ${mode === 'dev' ? 'Fredoka' : mode === 'signal' ? 'Bricolage Grotesque' : 'Fredoka'} counting-number shot with an optional faint ui.Sparkline; ui.OneLine is the restrained centred statement. Use ui.railPalette for the exact ground, card, border, accent and text colours.
- ${mode === 'dev' ? 'Build with open layouts, workflows, branching worktrees, ui.Arrow, ui.Wire, ui.Tile, ui.FlowNode, ui.Logo, ui.Icon, native emojis, and ui.DevTyping for exact terminal lines. Avoid wrapping everything in background cards.' : 'These are the shortcuts, not the limit. A terminal, a chat thread, a receipt, a file tree, a chart, or a phone screen is built inside a ui.Panel or ui.Window out of ordinary elements, ui.Rise, ui.Wipe, ui.Grow, ui.Draw, ui.FollowPath and ui.Count. Build what the brief describes; do not substitute the nearest named component for it.'}
- Most ideas are faster as a picture than as an interface: prefer ui.Tile, ui.NumberBadge, ui.BraceGroup, ui.SegmentBar, ui.Sparkline, ui.BigNumber, ui.Icon (any Lucide name), and vibrant emojis, with words kept to one label. Reach for ui.Window, ui.Panel, and ui.DataTable only when the narration is about software. Draw custom SVG paths, animated shapes, and visual metaphors freely with ui.Draw, <path>, and <circle> whenever they make the idea more intuitive and visually engaging.
- STAGE, DO NOT STACK — use the 1–4 component window above. A component appears when its voice cue begins, remains only for the phrase it supports, then exits, compacts, or is replaced. Do not keep every earlier component visible for continuity; continuity is a clean handoff in the same spatial system, not an ever-growing pile.
- An element travelling along a route or curve is positioned with pathPoint(d, t) or pathProgress(d, t) — never by hand, never with a straight line, and never estimated. Sample the exact point on the path with anim() as the progress, and use the returned angle to rotate the element to face the route.
- VERIFIED BRAND ASSETS — when the narration names a real company or product, use ui.Logo only with a literal slug copied exactly from this curated theSVG list: ${BRAND_LOGOS_TEXT}. Never guess, abbreviate, translate, compute, or substitute a hand-drawn approximation. Use variant='default' first, and always provide a visible fallback. If the name is not on the list, use a concrete ui.Icon/emoji or a WebImage URL you know exists; do not invent a logo.
- ${mode === 'dark' ? `The dark palette: ground ${palette.ground}, card ${palette.card}, border ${palette.border}, accent ${palette.accent}, ink ${palette.ink}. Use these exact values; ui.railPalette is the light palette.` : mode === 'dev' ? `The dev palette is high-contrast obsidian/charcoal: dark ground ${palette.ground}, charcoal module surface ${palette.card}, thin border ${palette.border}, white ink ${palette.ink}, muted context ${palette.muted}, accent ${palette.accent}. Every viewer-facing word is UPPERCASE font('Fredoka'); font('IBM Plex Mono') carries exact machine values and keeps their casing (textTransform: 'none'). The accent is the theme's ONE hue — filled badge pills with ${palette.ground} text on them, icon glyphs, data marks, connectors, and the single figure the shot is about. Everything else is ${palette.ink} for active content and ${palette.muted} for context. Use ui.Push and ui.Rise (spring push with fade) for entrances. A native emoji may keep its own colour. ui.railPalette is the light palette.` : mode === 'signal' ? `The signal palette: neutral near-black ground ${palette.ground}, charcoal card ${palette.card}, graphite border ${palette.border}, crimson accent ${palette.accent}, white ink ${palette.ink}, neutral-gray context ${palette.blue}, green ${palette.green}. Use these exact values, font('Bricolage Grotesque'), 26-30px primary module corners, and round connector caps. Do not introduce blue tint. Keep modules and labels flat with no border/stroke, shadow, filter, or glow; signal emphasis is colour and line weight only. ui.railPalette is the light palette.` : 'Use ui.railPalette for the exact ground, card, border, accent and text colours.'}

${UNSLOP_RULES}`;

export const CUT_STYLE_BRIEF = cutStyleBrief(CUT_PALETTE, 'paper');
export const CUT_STYLE_BRIEF_DARK = cutStyleBrief(CUT_PALETTE_DARK, 'dark');
export const CUT_STYLE_BRIEF_DEV = cutStyleBrief(CUT_PALETTE_DEV, 'dev');
export const CUT_STYLE_BRIEF_SIGNAL = cutStyleBrief(CUT_PALETTE_SIGNAL, 'signal');

/** Prepended to every generation on the editor page. */
export const cutInstruction = ({
  narration,
  brief,
  styleNote,
  background,
  durationInFrames,
  beats = [],
  wordTimings = [],
  style = 'paper',
  previousCode,
  giphyAssets = [],
  photo = null,
}: {
  narration: string;
  brief: string;
  styleNote: string;
  background: {mode: 'transparent' | 'solid'; color: string};
  durationInFrames: number;
  /** The shot's beats, so reveals can be scheduled onto the narration. */
  beats?: Beat[];
  /** Measured from the final voice file, after its rate adjustment. */
  wordTimings?: SpokenWord[];
  style?: CutStyle;
  /** When set, this shot continues the previous shot's composition. */
  previousCode?: string;
  /** Exact assets returned by the current GIPHY Trending feed. */
  giphyAssets?: GiphyAsset[];
  /** The photograph resolved for this shot, already saved under public/. */
  photo?: ShotPhoto | null;
}) => {
  const seconds = (durationInFrames / 60).toFixed(1);
  const ground =
    background.mode === 'solid'
      ? `The canvas is a solid ${background.color} field. The player paints that ground as a static layer behind the scene, so paint no background of your own: no full-frame AbsoluteFill, ground colour, tick field, tint, or gradient. Only the foreground graphic renders.`
      : 'The canvas is transparent — this shot lays over footage. Paint no background of any kind; only the foreground graphic renders.';
  const giphyDirection = style === 'dev'
    ? ''
    : giphyAssets.length
      ? `VERIFIED CURRENT GIPHY ASSETS
These exact assets came from GIPHY's live PG-rated Trending feed for this build. Choose at most ONE only when its title is a clear semantic fit for the narration; otherwise use none. Never alter, compute, search for, or invent either URL.
${giphyAssets
  .map(
    (asset, index) => `${index + 1}. ${JSON.stringify(asset.title)}
   MP4: ${JSON.stringify(asset.mp4Url)}
   PAGE: ${JSON.stringify(asset.pageUrl)}`,
  )
  .join('\n')}

If used, render exactly <ui.Giphy src="the exact MP4 above" sourceUrl="the matching exact PAGE above" title="the matching title" />. Keep it muted, foreground-only, and on screen for a short 60–150 frame reaction beat. It counts as one of the 1–4 visible components. Reveal and remove its container with the shared smooth bezier motion, timed to the relevant spoken phrase. The component supplies its required GIPHY attribution. Do not use raw OffthreadVideo, Video, Img, WebImage, or another URL for a GIF.`
      : `NO VERIFIED GIPHY ASSET
No current Trending asset was supplied for this shot. Do not render ui.Giphy and do not invent, search for, or embed any GIF URL.`;
  // Recall, not reasoning, was the failure: the model is handed a 200-name
  // slug catalogue and has to notice that this shot's tools are in it. It
  // stopped noticing — a comparison of Ollama, llama.cpp, vLLM and LM Studio
  // came back with four generic glyphs. Resolving the shot's own words here
  // makes the marks a supplied fact, and names the one tool that genuinely
  // has no mark so it gets typography instead of a stand-in emoji.
  const isKineticShot = brief.trim().toUpperCase().startsWith('KINETIC CENTER BUILD:');
  // A photograph is resolved before generation and either exists or does not.
  // Saying so explicitly in both directions is what stops the model inventing
  // a URL for a shot that has no image, which is the failure GIPHY taught.
  const photoDirection =
    photo && !isKineticShot
      ? `VERIFIED PHOTOGRAPH FOR THIS SHOT
A real photograph of ${JSON.stringify(photo.subject)} was searched and chosen for this shot. Render it EXACTLY as:
<ui.Photo src=${JSON.stringify(photo.file)} caption=${JSON.stringify(photo.subject)}${photo.source ? ` credit=${JSON.stringify(photo.source)}` : ''} width={...} height={...} />
- It is the shot's visual anchor, not decoration: give it the frame's attention, around 520-760px wide, and build the rest of the shot around it. Do not shrink it into a corner and do not stack a drawn illustration of the same thing beside it.
- ui.Photo crops to the width and height you give it, so choose a real rectangle rather than the photo's own aspect ratio. Keep it inside the 1440x810 footprint like everything else.
- Do not change the src, do not add a second ui.Photo, and do not use Img or WebImage for it.
- One mark per subject still holds: a photograph IS the subject's mark, so it never gets an icon, a logo, or an emoji of the same thing beside it.`
      : `NO PHOTOGRAPH FOR THIS SHOT
No real photograph was resolved for this shot${isKineticShot ? ' (a kinetic build is typography-only)' : ''}. Do not render ui.Photo, Img, or WebImage, and do not invent an image path or URL. Draw the idea.`;
  const namedBrands = isKineticShot ? [] : brandsNamedIn(`${narration}\n${brief}`);
  // A kinetic build is typography-only, so it gets no brand direction at all.
  const brandDirection = isKineticShot
    ? ''
    : namedBrands.length
    ? `VERIFIED BRAND MARKS FOR THIS SHOT
These products are named in this shot's narration or brief and have verified theSVG marks. Use ui.Logo with the exact slug for each one you put on screen — never a Lucide icon, an emoji, or a drawn approximation in its place:
${namedBrands.map(({slug, label}) => `- ${label} → <ui.Logo name="${slug}" variant="default" size={...} fallback={...} />`).join('\n')}
Any other product this shot names is NOT in the curated registry: set its exact name in type (mono) instead, and never invent a slug or swap in an emoji for it. If one product in a comparison has no mark, either set every name in type or keep the marks and let that one carry its name — do not mix real logos with generic icons.`
    : `NO VERIFIED BRAND MARK FOR THIS SHOT
This shot's narration and brief name no product in the curated theSVG registry. Do not render ui.Logo and do not invent a slug; anchor the idea with a Lucide icon, a number, or type.`;
  const kineticDirection = isKineticShot
    ? `KINETIC CENTER BUILD — TYPOGRAPHY ONLY
Render exactly one ui.KineticCenterBuild and no other foreground component, icon, card, chart, image, logo, GIF, caption, or decorative mark. Pass words as two to six exact words or short phrases copied from this shot's narration, in spoken order. MUST NOT BE UPPERCASE: words must use natural sentence case (e.g. ["How", "important", "is", "memory?"]). NEVER LEAVE THE FIRST FEW SECONDS EMPTY: the first word begins entering immediately at frame 0, and all words finish entering at least 1.5s (45 frames) before the shot ends (by frame ${Math.max(1, durationInFrames - 45)}). Pass cues with one voiceCue(...) result per item as the fallback. Keep the default short 8–24 frame shared cubic-bezier handoff. Do not animate the scene root and do not add fades, blur, bounce, or looping motion.`
    : '';

  // Real word alignment always outranks the transcript's WPM estimate.
  const timingMap = wordTimings.length
    ? `\nWORD-LOCKED VOICE CUES — measured from the final voiceover file. These are shot-relative 60fps frames and are authoritative:\n${(() => {
        const cueToken = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
        // A measured anchor per beat — the frame the beat's first words are
        // actually spoken — so every element of a beat has a correct
        // fallback even when a full phrase does not match word-for-word.
        const anchors = (beats ?? [])
          .map((beat) => {
            const wanted = beat.text
              .split(/\s+/)
              .map(cueToken)
              .filter(Boolean)
              .slice(0, 3);
            if (!wanted.length) return null;
            for (let index = 0; index + wanted.length <= wordTimings.length; index += 1) {
              const match = wanted.every(
                (token, offset) => cueToken(wordTimings[index + offset].word) === token,
              );
              if (!match) continue;
              const frame = Math.min(
                durationInFrames - 1,
                Math.max(0, Math.round(wordTimings[index].start * 60)),
              );
              return `- frame ${frame}: "${beat.text.trim().replace(/"/g, '\\"')}"`;
            }
            return null;
          })
          .filter((line): line is string => Boolean(line))
          .join('\n');
        return `${anchors}\n\nFULL WORD MAP — every spoken word with its measured frame range:\n${wordTimings
          .map((word) => {
            const from = Math.min(durationInFrames - 1, Math.max(0, Math.round(word.start * 60)));
            const to = Math.min(durationInFrames, Math.max(from, Math.round(word.end * 60)));
            return `- frame ${from}-${to}: "${word.word.replace(/"/g, '\\"')}"`;
          })
          .join('\n')}`;
      })()}

VOICE-LOCK RULES
- Start each meaning-bearing animation on the exact start frame of the first word that names or explains it. The first visible pixel belongs on that frame, never earlier.
- The first spoken word of a shot lands within its first ~15% — anchor the first element there so the opening is already in motion. Never leave the frame static waiting for a later cue: if the narration begins late, open with supporting marks and the sustained element so the shot is alive from frame 0.
- Anchor every beat's elements to its measured BEAT ANCHOR frame above: use voiceCue('the first relevant spoken phrase of that beat', occurrence, thatBeatAnchorFrame) as each Sequence from value or helper delay. The fallbackFrame is the beat's measured anchor, never an estimate. voiceCue reads the active shot's current alignment at render time, so changing the voice or rate stays synchronized. Do not replace it with an evenly spaced stagger or an aesthetic guess.
- A multi-word idea starts on its first relevant word and may finish across the rest of the phrase. Decorative ground may exist at frame 0, but semantic icons, logos, labels, chart marks, routes, and counters wait for their spoken cue.
- If two elements belong to the same spoken phrase, share its cue frame unless the word map gives each one a distinct named cue.`
    : beats.length
      ? `\nFALLBACK TIMING MAP — no aligned voice file is available. These shot-relative frames are estimates:\n${(() => {
        const firstStart = beats[0]?.startMs ?? 0;
        return beats
          .map((beat) => {
            const from = Math.max(0, Math.round(((beat.startMs - firstStart) / 1000) * 60));
            const to = Math.min(
              durationInFrames,
              Math.max(from, Math.round(((beat.endMs - firstStart) / 1000) * 60)),
            );
            return `- frame ${from}-${to}: "${beat.text.trim()}"`;
          })
          .join('\n');
      })()}`
      : '';

  return [
    style === 'dark'
      ? CUT_STYLE_BRIEF_DARK
      : style === 'dev'
        ? DEV_SHOT_STYLE_MARKER
        : style === 'signal'
          ? CUT_STYLE_BRIEF_SIGNAL
          : CUT_STYLE_BRIEF,
    styleNote.trim() ? `EXTRA DIRECTION FOR THIS CUT\n${styleNote.trim()}` : '',
    previousCode
      ? `CONTINUE FROM THE PREVIOUS SCENE — this beat is the next moment of the SAME continuous piece, and the previous scene source is attached above as CURRENT SCENE. The player adds no outer transition, so frame 0 MUST exactly match the previous scene's settled frame. Preserve one meaningful shared component with the same appearance and starting geometry, then move it into its new role while stale support fades out and replacement support fades in. In dev style use ui.DevGroupMorph for this handoff; start the shared movement at frame 0 and voice-lock later semantic additions. If no literal component survives, keep the prior focal group at frame 0 and cross-morph matched old/new groups through the same center and footprint—never jump directly to an unrelated complete frame. Keep only elements that still explain this beat, maintain the 1–4 component window, and never start from scratch.`
      : '',
    giphyDirection,
    photoDirection,
    brandDirection,
    kineticDirection,
    `THIS SHOT
${ground}
It runs ${durationInFrames} frames (${seconds}s) and is one shot in a longer cut, so it starts on its own and ends without a sign-off.${timingMap}

SHOT COVERAGE, COGNITIVE BUDGET & EYE PATH
- Clips are strictly 3.5–5 seconds long (never less than 3.5s). Keep cognitive load low: ONE primary idea, ONE prominent visual anchor (icon/emoji/logo), and at most 2–4 words or one number.
- NO ANIMATION IN THE LAST 1.5s (45 frames): All entrance animations, reveals, text builds, counters, and draws must complete at or before frame ${Math.max(1, durationInFrames - 45)} (delay + span <= ${Math.max(1, durationInFrames - 45)}). The final 1.5s must hold calm and settled so the viewer can absorb the concept. Only out-animations and ui.Zoom holds/drifts may run in the last 1.5s.
- WORKFLOWS VS TREES: Use directional arrows (ui.Arrow) for sequential workflows (A ➔ B ➔ C). NEVER use arrows in branching trees! Trees must use dashed moving lines (ui.TreeWire, flow={1.5}).
- Visually anchor with ONE mark per subject: a named real product or tool takes its verified brand logo (ui.Logo with a curated slug and a fallback), a mechanism takes a Lucide icon (ui.Icon at 48-96px), and only a state or quality that neither carries takes a native emoji. Never place two marks on the same subject, and never let one named product wear a logo while its neighbour wears a generic icon.
- Keep one substantial foreground component visible from frame 0; the viewer must never see only the ground for more than 60 frames (one second).
- At every frame, foreground components cover at least 30% of the 1920×1080 canvas.
- COMPONENT WINDOW — show 1–3 foreground components at a time (1–2 is ideal; never more than 3). Replace stale elements instead of accumulating a card wall.
- NO SLOP TEXT, NO EXTRAS: On-screen text is strictly 1–4 words per label. Never add meta-labels ("Overview:", "Result:") or explanatory sentences. The voiceover explains; the screen anchors.
- Animate only the focal subject or active relationship. Keep textures, guides, borders, and settled support marks static.`,
    `NARRATION OVER THIS SHOT
"${narration}"`,
    `WHAT TO BUILD
${brief}
Build exactly this. The narration is context for what the graphic means, not text to put on screen — put words on screen only where the brief calls for a label, caption, or shouted word.`,
  ]
    .filter(Boolean)
    .join('\n\n');
};
