export const COOKIE_SESSION_SENTINEL = '__cookie__';

export function buildApiHeaders(
  token?: string | null,
  extraHeaders?: Record<string, string>
): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Requested-With': 'LocalPro',
    ...extraHeaders,
  };
  if (token && token !== COOKIE_SESSION_SENTINEL) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export async function apiFetch(
  url: string,
  options: RequestInit & { token?: string | null; extraHeaders?: Record<string, string> } = {}
): Promise<Response> {
  const { token, extraHeaders, headers: rawHeaders, ...rest } = options;
  const mergedHeaders = buildApiHeaders(token, {
    ...(rawHeaders as Record<string, string> | undefined),
    ...extraHeaders,
  });

  return fetch(url, {
    ...rest,
    credentials: 'same-origin',
    headers: mergedHeaders,
  });
}

export async function parseApiJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message =
      typeof data.error === 'string' && data.error.length > 0
        ? data.error
        : 'Something went wrong. Please try again.';
    throw new Error(message);
  }
  return data as T;
}
