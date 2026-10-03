/** Thin fetch wrapper: same-origin `/api`, JSON in/out, CSRF header on unsafe staff requests. */

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fields: string[] = [],
  ) {
    super(message);
  }
}

type Options = Omit<RequestInit, 'body'> & { body?: unknown; query?: Record<string, string | number | boolean | undefined | null | string[]> };

export function buildQuery(query: Options['query']) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) continue;
    params.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const { body, query, headers, ...rest } = options;
  const method = (rest.method ?? 'GET').toUpperCase();
  const finalHeaders = new Headers(headers);
  if (body !== undefined) finalHeaders.set('Content-Type', 'application/json');
  if (method !== 'GET' && csrfToken) finalHeaders.set('X-CSRF-Token', csrfToken);

  let response: Response;
  try {
    response = await fetch(`/api${path}${buildQuery(query)}`, {
      ...rest,
      method,
      headers: finalHeaders,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('We could not reach the server. Check your connection and try again.', 0);
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  const data = text ? safeJson(text) : null;
  if (!response.ok) {
    const raw = (data as { message?: string | string[]; fields?: string[] } | null) ?? {};
    const message = Array.isArray(raw.message) ? raw.message[0] : raw.message;
    throw new ApiError(message || response.statusText || 'Something went wrong.', response.status, raw.fields ?? []);
  }
  return data as T;
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

export function errorMessage(error: unknown, fallback = 'Something went wrong.') {
  return error instanceof Error ? error.message : fallback;
}
