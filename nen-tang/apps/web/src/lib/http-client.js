/**
 * Thay cho createAxiosClient cua @base44/sdk.
 *
 * Chi can dung ba thu: .get/.post tra ve THAN phan hoi da parse (khong boc
 * trong { data }), va loi nem ra phai giu .status / .data / .message vi
 * AuthContext doc ca ba.
 */

/** Doc mot cookie khong-HttpOnly (dung cho token CSRF). */
export function readCookie(name) {
  const hit = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export class HttpError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.data = data;
  }
}

/**
 * @param {object}   opts
 * @param {string}   [opts.baseURL]
 * @param {object}   [opts.headers]
 */
export function createAxiosClient({ baseURL = '', headers = {} } = {}) {
  const request = async (method, path, body, extraHeaders) => {
    const upper = method.toUpperCase();
    const outgoing = { Accept: 'application/json', ...headers, ...extraHeaders };

    if (!SAFE_METHODS.has(upper)) {
      // Lop chong CSRF: trinh duyet khac origin khong dat duoc header nay.
      const csrf = readCookie('pf_csrf');
      if (csrf) outgoing['X-CSRF-Token'] = csrf;
    }

    let payload;
    if (body instanceof FormData) {
      payload = body; // de trinh duyet tu dat Content-Type kem boundary
    } else if (body !== undefined) {
      payload = JSON.stringify(body);
      outgoing['Content-Type'] = 'application/json';
    }

    const res = await fetch(baseURL + path, {
      method: upper,
      headers: outgoing,
      body: payload,
      credentials: 'include',
    });

    const text = await res.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = text; }
    }

    if (!res.ok) {
      // Backend tra loi dang { ok:false, error: { code, message } }. Lay thang
      // `data.error` se ra chuoi "[object Object]" hien len man hinh nguoi dung.
      const message =
        data?.error?.message
        || (typeof data?.error === 'string' ? data.error : null)
        || data?.message
        || `Yêu cầu thất bại (${res.status})`;
      throw new HttpError(message, res.status, data);
    }
    return data;
  };

  return {
    get: (path, opts) => request('GET', path, undefined, opts?.headers),
    post: (path, body, opts) => request('POST', path, body, opts?.headers),
    put: (path, body, opts) => request('PUT', path, body, opts?.headers),
    patch: (path, body, opts) => request('PATCH', path, body, opts?.headers),
    delete: (path, opts) => request('DELETE', path, undefined, opts?.headers),
    request,
  };
}
