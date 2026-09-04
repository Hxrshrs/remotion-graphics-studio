import type {ApiRequest, ApiResponse} from '../../../server/http';
import {errorStatus, httpError, readJsonBody, routeParam, sendJson, sendUpstream} from '../../../server/http';

export default async function handler(request: ApiRequest, response: ApiResponse) {
  try {
    const provider = routeParam(request, 'provider');
    if (provider === 'openrouter' && request.method === 'GET') {
      await sendUpstream(response, await fetch('https://openrouter.ai/api/v1/models'));
      return;
    }
    if (provider === 'openlux' && request.method === 'POST') {
      const payload = await readJsonBody(request);
      const apiKey = typeof payload.apiKey === 'string' ? payload.apiKey.trim() : '';
      if (!apiKey) throw httpError('No OpenLux key was sent.', 400);
      await sendUpstream(
        response,
        await fetch('https://api.openlux.ai/v1/models', {
          headers: {Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json'},
        }),
      );
      return;
    }
    throw httpError('Unknown model catalog route.', 404);
  } catch (error) {
    sendJson(response, errorStatus(error, 502), {
      detail: error instanceof Error ? error.message : 'The model catalog request failed.',
    });
  }
}
