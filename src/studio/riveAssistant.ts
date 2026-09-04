import {apiModelId, keyFieldForProvider, providerForModel, sanitizeApiKey} from './models';
import {StudioSettings} from './types';

type ChatTurn = {role: 'user' | 'assistant'; content: string};

export const requestRiveHelp = async ({
  settings,
  instruction,
  history,
}: {
  settings: StudioSettings;
  instruction: string;
  history: ChatTurn[];
}) => {
  const model = settings.selectedModel;
  const provider = providerForModel(model);
  if (provider === 'codex') {
    throw new Error('Choose an OpenLux, Google, or OpenRouter model for Rive chat.');
  }
  const keyField = keyFieldForProvider[provider];
  const apiKey = keyField ? sanitizeApiKey(settings[keyField] ?? '') : '';
  if (!apiKey) throw new Error(`Add your ${provider} API key in Settings and try again.`);

  const system = `You are the Rive assistant inside Rendr Studio. Help the user design interactive Rive animations, state machines, data binding, and Luau scripts. Give practical, concise steps and complete Luau snippets when useful. Never claim you changed the loaded .riv file: browser runtimes only play exported files, so tell the user exactly what to paste or configure in the Rive editor.`;
  if (provider === 'google') {
    const response = await fetch('/api/llm/google', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        apiKey,
        model,
        requestBody: {
          systemInstruction: {parts: [{text: system}]},
          contents: [
            ...history.map((turn) => ({role: turn.role === 'assistant' ? 'model' : 'user', parts: [{text: turn.content}]})),
            {role: 'user', parts: [{text: instruction}]},
          ],
          generationConfig: {maxOutputTokens: 6000},
        },
      }),
    });
    if (!response.ok) throw new Error(`Google returned ${response.status}: ${(await response.text()).slice(0, 180)}`);
    const data = (await response.json()) as {candidates?: Array<{content?: {parts?: Array<{text?: string}>}}>};
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim();
    if (!text) throw new Error('Google returned an empty response.');
    return {text, cost: 0 as number | null};
  }

  const response = await fetch(`/api/llm/${provider}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      apiKey,
      requestBody: {
        model: apiModelId(model),
        temperature: 0.4,
        max_tokens: 6000,
        messages: [{role: 'system', content: system}, ...history, {role: 'user', content: instruction}],
      },
    }),
  });
  if (!response.ok) throw new Error(`${provider} returned ${response.status}: ${(await response.text()).slice(0, 180)}`);
  const data = (await response.json()) as {choices?: Array<{message?: {content?: string | Array<{text?: string}>}}> ; usage?: {cost?: number}};
  const raw = data.choices?.[0]?.message?.content;
  const text = (Array.isArray(raw) ? raw.map((part) => part.text ?? '').join('') : raw)?.trim();
  if (!text) throw new Error(`${provider} returned an empty response.`);
  return {text, cost: typeof data.usage?.cost === 'number' ? data.usage.cost : null};
};
