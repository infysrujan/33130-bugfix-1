export async function fetchApi(url, {
  method = 'GET',
  headers = {},
  body,
  cache,
  signal,
  throwOnError = true,
} = {}) {
  const options = { method, headers };
  if (body !== undefined) {
    options.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  if (cache) options.cache = cache;
  if (signal) options.signal = signal;

  const response = await fetch(url, options);

  if (!response.ok) {
    if (throwOnError) throw new Error(`HTTP ${response.status}: ${url}`);
    return null;
  }

  if (response.status === 204) return null;

  const contentType = response.headers.get('content-type') || '';
  return contentType.includes('application/json') ? response.json() : response.text();
}

export async function fetchGet(url, {
  headers, cache, signal, throwOnError,
} = {}) {
  return fetchApi(url, {
    headers, cache, signal, throwOnError,
  });
}

export async function fetchPost(url, payload, { headers = {}, throwOnError = true } = {}) {
  return fetchApi(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: payload,
    throwOnError,
  });
}

export function buildUrl(template, params = {}) {
  return Object.entries(params).reduce((url, [key, value]) => {
    const str = String(value);
    return [`{{${key}}}`, `{{${key}`, `{${key}}`, `{${key}`, `:${key}`]
      .reduce((u, token) => u.split(token).join(str), url);
  }, template);
}
