import {requestCompletion} from './complete';
import {RiveProject} from './rive';
import {StudioSettings} from './types';

type ChatTurn = {role: 'user' | 'assistant'; content: string};

const RIVE_SYSTEM_PROMPT = `You are the Rive scripting assistant inside Rendr Studio. Give concise, executable guidance for the current Rive Editor scripting API.

NON-NEGOTIABLE API RULES
- Rive scripts use a selected protocol: Node, Layout, Converter, PathEffect, TransitionCondition, ListenerAction, or Test.
- A Node script defines a typed data table and returns a factory exactly shaped like: return function(): Node<MyType> return { init = init, advance = advance, draw = draw, ... } end.
- Node lifecycle signatures are init(self, context): boolean, advance(self, seconds): boolean, update(self), and draw(self, renderer).
- The supported Node pointer callbacks are pointerDown, pointerMove, pointerUp, and pointerExit. Register them in the returned table and call event:hit() when handling an event.
- Script inputs use Input<T>. Inputs are configured by the editor and cannot be mutated by a script. Mutable state belongs in ordinary fields or in View Model properties, whose values are read or written through .value.
- A scripted Node renders in its host node's local transform space. Draw with Renderer, Path, Paint, Mat2D, and related documented types. Do not invent direct host-node mutation.
- Never use rive.Component:extend, self.node, node.scaleX/node.scaleY, onPointerEnter/onPointerExit, artboard:getStateMachine(), or getBool(). Those belong to other APIs or do not exist in current Rive Luau.
- For a normal hover animation on an existing editor object, prefer Rive's built-in Listener + State Machine or Data Binding workflow. Use Luau only when custom scripted behavior is actually needed.
- If you provide code, name the required protocol first, use typed Luau, include the complete returned factory, and give exact editor setup steps after it.
- Do not claim Rendr or the browser modified the .riv file. The web runtime can load and play an exported .riv file, but authoring and script attachment happen in the Rive Editor.

Authoritative references:
https://rive.app/docs/scripting/protocols/overview
https://rive.app/docs/scripting/protocols/node-scripts
https://rive.app/docs/scripting/pointer-events
https://rive.app/docs/scripting/script-inputs`;

const unsupportedPatterns: Array<[RegExp, string]> = [
  [/rive\.Component\s*:\s*extend/i, 'rive.Component:extend is not a Rive scripting protocol'],
  [/onPointerEnter|onPointerExit/i, 'onPointerEnter/onPointerExit are not Node callback names'],
  [/\.scaleX\s*=|\.scaleY\s*=/i, 'direct scaleX/scaleY mutation is not supported'],
  [/:getStateMachine\s*\(/i, 'getStateMachine is not part of the Luau scripting API'],
  [/:getBool\s*\(/i, 'getBool is not part of the Luau scripting API'],
  [/self\.node\b/i, 'self.node is not provided to a scripted Node'],
];

export const validateRiveAssistantReply = (reply: string) => {
  const issues = unsupportedPatterns
    .filter(([pattern]) => pattern.test(reply))
    .map(([, message]) => message);
  const hasLuau = /```(?:lua|luau)|return\s+function\s*\(/i.test(reply);
  if (
    hasLuau &&
    !/return\s+function\s*\(\s*\)\s*:\s*(?:Node|Layout|Converter|PathEffect|TransitionCondition|ListenerAction|Test)\s*</i.test(reply)
  ) {
    issues.push('the code does not return a typed Rive protocol factory');
  }
  return issues;
};

const conversationText = (history: ChatTurn[]) =>
  history.length
    ? `RECENT PROJECT CHAT\n${history.map((turn) => `${turn.role.toUpperCase()}: ${turn.content}`).join('\n\n')}\n\n`
    : '';

export const requestRiveHelp = async ({
  settings,
  instruction,
  history,
  project,
}: {
  settings: StudioSettings;
  instruction: string;
  history: ChatTurn[];
  project: Pick<RiveProject, 'src' | 'artboard' | 'stateMachine'>;
}) => {
  const context = `CURRENT RIVE PROJECT\nFile: ${project.src ? 'loaded' : 'not loaded'}\nArtboard: ${project.artboard || 'default'}\nState machine: ${project.stateMachine || 'not specified'}`;
  const user = `${conversationText(history)}${context}\n\nREQUEST\n${instruction}`;
  const first = await requestCompletion({
    settings,
    model: settings.selectedModel,
    system: RIVE_SYSTEM_PROMPT,
    user,
    maxTokens: 6000,
  });
  const issues = validateRiveAssistantReply(first.text);
  if (!issues.length) return first;

  // One grounded correction prevents plausible-looking Roblox/JS-style APIs
  // from reaching the user as paste-ready Rive Luau.
  const repaired = await requestCompletion({
    settings,
    model: settings.selectedModel,
    system: RIVE_SYSTEM_PROMPT,
    user: `${user}\n\nYOUR PREVIOUS ANSWER WAS INVALID\n${first.text}\n\nRewrite it completely. Fix these violations: ${issues.join('; ')}. Use only the API rules and official references in the system instructions.`,
    maxTokens: 6000,
  });
  const remainingIssues = validateRiveAssistantReply(repaired.text);
  if (remainingIssues.length) {
    throw new Error(
      `The model produced unsupported Rive APIs twice (${remainingIssues.join('; ')}). The invalid answer was withheld. Try a more specific request.`,
    );
  }
  return {
    text: repaired.text,
    cost:
      first.cost === null && repaired.cost === null
        ? null
        : (first.cost ?? 0) + (repaired.cost ?? 0),
  };
};
