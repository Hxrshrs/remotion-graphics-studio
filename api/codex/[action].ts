import type {ApiRequest, ApiResponse} from '../../server/http';
import {routeParam, sendJson} from '../../server/http';

export default function handler(request: ApiRequest, response: ApiResponse) {
  const action = routeParam(request, 'action');
  const detail = 'Codex subscription sign-in is available only when Rendr Studio runs locally.';
  if (action === 'status' && request.method === 'GET') {
    sendJson(response, 200, {status: 'unavailable', detail});
    return;
  }
  sendJson(response, 501, {detail});
}
