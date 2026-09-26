import { setTimeout as sleep } from 'node:timers/promises';

const DEFAULT_BASE = process.env.NITRADO_BASE_URL || 'https://api.nitrado.net';

/**
 * Error thrown for anything that goes wrong talking to Nitrado.
 * `status` mirrors the HTTP status where one was received.
 */
export class NitradoError extends Error {
  constructor(message, { status = 0, payload = null, path = '' } = {}) {
    super(message);
    this.name = 'NitradoError';
    this.status = status;
    this.payload = payload;
    this.path = path;
  }
}

function encodeForm(obj) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(obj || {})) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) params.set(key, value.join(','));
    else if (typeof value === 'boolean') params.set(key, value ? 'true' : 'false');
    else params.set(key, String(value));
  }
  return params.toString();
}

/**
 * Thin Nitrado REST client. A fresh token is read on every call so the panel
 * can pick up a newly saved token without a restart.
 */
export function createClient({ getToken, baseUrl = DEFAULT_BASE } = {}) {
  const root = String(baseUrl).replace(/\/+$/, '');

  async function request(method, path, { query, form, json, asText = false, retries = 2 } = {}) {
    const token = getToken();
    if (!token) {
      throw new NitradoError('No Nitrado API token configured yet.', { status: 401, path });
    }

    const url = new URL(root + path);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === '') continue;
        url.searchParams.set(key, String(value));
      }
    }

    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
    let body;
    if (form) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = encodeForm(form);
    } else if (json) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(json);
    }

    let res;
    try {
      res = await fetch(url, { method, headers, body });
    } catch (err) {
      throw new NitradoError(`Could not reach Nitrado: ${err.message}`, { status: 0, path });
    }

    // Nitrado throttles with 429 and occasionally returns 503 during maintenance.
    if ((res.status === 429 || res.status === 503) && retries > 0) {
      const retryAfter = Number(res.headers.get('retry-after')) || 3;
      await sleep(Math.min(retryAfter, 10) * 1000);
      return request(method, path, { query, form, json, asText, retries: retries - 1 });
    }

    const text = await res.text();

    if (asText) {
      if (!res.ok) {
        throw new NitradoError(`Nitrado API error (${res.status})`, { status: res.status, path, payload: text });
      }
      return text;
    }

    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { raw: text };
    }

    if (!res.ok || payload?.status === 'error') {
      const message =
        payload?.message ||
        payload?.raw?.slice?.(0, 300) ||
        `Nitrado API error (${res.status})`;
      throw new NitradoError(message, { status: res.status, payload, path });
    }

    return payload;
  }

  return {
    request,
    get: (path, opts) => request('GET', path, opts),
    post: (path, opts) => request('POST', path, opts),
    put: (path, opts) => request('PUT', path, opts),
    del: (path, opts) => request('DELETE', path, opts),

    /** Follow a one-time transfer URL returned by the file_server endpoints. */
    async transfer(url, { method = 'GET', body, headers } = {}) {
      let res;
      try {
        res = await fetch(url, { method, body, headers, redirect: 'follow' });
      } catch (err) {
        throw new NitradoError(`File transfer failed: ${err.message}`, { status: 0 });
      }
      if (!res.ok) {
        throw new NitradoError(`File transfer failed (${res.status})`, { status: res.status });
      }
      return res;
    },
  };
}
