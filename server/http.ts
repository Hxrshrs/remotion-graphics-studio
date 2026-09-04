import type {IncomingMessage, ServerResponse} from 'node:http';

export type ApiRequest = IncomingMessage & {
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
};

export type ApiResponse = ServerResponse;
export type JsonRecord = Record<string, unknown>;

const MAX_BODY_BYTES = 30 * 1024 * 1024;

export const readJsonBody = async (request: ApiRequest): Promise<JsonRecord> => {
  if (request.body && typeof request.body === 'object' && !Array.isArray(request.body)) {
    return request.body as JsonRecord;
  }
  if (typeof request.body === 'string') {
    const parsed = JSON.parse(request.body) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as JsonRecord;
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw httpError('The request is too large.', 413);
    chunks.push(buffer);
  }
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw httpError('The request body must be a JSON object.', 400);
  }
  return parsed as JsonRecord;
};

export const sendJson = (response: ApiResponse, status: number, payload: unknown) => {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
};

/** Start the response before large media metadata exceeds Vercel's buffered limit. */
export const sendStreamingJson = (response: ApiResponse, status: number, payload: unknown) => {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  for (let offset = 0; offset < body.length; offset += 64 * 1024) {
    response.write(body.subarray(offset, offset + 64 * 1024));
  }
  response.end();
};

export const sendUpstream = async (response: ApiResponse, upstream: Response) => {
  response.statusCode = upstream.status;
  response.setHeader(
    'Content-Type',
    upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
  );
  response.setHeader('Cache-Control', 'no-store');
  response.end(await upstream.text());
};

export const httpError = (message: string, status: number) => {
  const error = new Error(message) as Error & {status: number};
  error.status = status;
  return error;
};

export const errorStatus = (error: unknown, fallback = 500) =>
  error && typeof error === 'object' && 'status' in error && typeof error.status === 'number'
    ? error.status
    : fallback;

export const routeParam = (request: ApiRequest, name: string) => {
  const value = request.query?.[name];
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
};
