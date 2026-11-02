const BASE = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api`;

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * All API calls go through here: cookies are sent (credentials: include) and the anti-CSRF header is
 * always present. The session token itself is an httpOnly cookie and is never visible to this code.
 */
export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'include',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'You appear to be offline');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = data.error || {};
    throw new ApiError(res.status, e.code || 'ERROR', e.message || 'Request failed', e.details);
  }
  return data;
}

/** Turns a validation error's details into a readable list. */
export function errorText(err) {
  if (!err) return '';
  if (err.details?.length) return `${err.message}: ${err.details.map((d) => `${d.path || 'field'} — ${d.message}`).join('; ')}`;
  return err.message;
}
