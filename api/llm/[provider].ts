import type {ApiRequest, ApiResponse, JsonRecord} from '../../server/http';
import {errorStatus, httpError, readJsonBody, routeParam, sendJson, sendUpstream} from '../../server/http';

const PROVIDERS = {
  openrouter: {
    label: 'OpenRouter',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
  },
  openlux: {
    label: 'OpenLux',
    endpoint: 'https://api.openlux.ai/v1/chat/completions',
  },
  google: {
    label: 'Google AI Studio',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
  },
} as const;

type Provider = keyof typeof PROVIDERS;

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'POST') {
    sendJson(response, 405, {detail: 'Use POST for model requests.'});
    return;
  }

  try {
    const provider = routeParam(request, 'provider') as Provider;
    const config = PROVIDERS[provider];
    if (!config) throw httpError('Unknown model provider.', 404);
    const payload = await readJsonBody(request);
    const apiKey = typeof payload.apiKey === 'string' ? payload.apiKey.trim() : '';
    if (!apiKey) throw httpError(`No ${config.label} key was sent.`, 400);
    if (!payload.requestBody || typeof payload.requestBody !== 'object' || Array.isArray(payload.requestBody)) {
      throw httpError(`The ${config.label} request body is invalid.`, 400);
    }

    const headers: Record<string, string> = {'Content-Type': 'application/json'};
    if (provider === 'google') headers['x-goog-api-key'] = apiKey;
    else headers.Authorization = `Bearer ${apiKey}`;
    if (provider === 'openrouter') headers['X-Title'] = 'Motion Studio';

    const model = typeof payload.model === 'string' ? payload.model.trim() : '';
    if (provider === 'google' && !model) throw httpError('The Google model id is missing.', 400);
    const endpoint =
      provider === 'google'
        ? `${config.endpoint}/${encodeURIComponent(model)}:generateContent`
        : config.endpoint;
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload.requestBody as JsonRecord),
    });
    await sendUpstream(response, upstream);
  } catch (error) {
    sendJson(response, errorStatus(error, 502), {
      detail: error instanceof Error ? error.message : 'The model provider request failed.',
    });
  }
}
