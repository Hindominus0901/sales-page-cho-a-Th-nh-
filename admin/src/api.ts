/**
 * Lớp gọi API dùng chung. Giữ token CSRF trong bộ nhớ (không phải localStorage:
 * token này chỉ có giá trị cùng phiên, và để trong bộ nhớ thì XSS lấy được ít
 * hơn) và tự gắn vào mọi thao tác ghi.
 */
let csrf: string | null = null;

export const setCsrf = (t: string | null) => { csrf = t; };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fields?: Record<string, string>,
  ) { super(message); }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (csrf && method !== 'GET') headers['x-csrf-token'] = csrf;

  const res = await fetch(path, {
    method, headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let json: Record<string, unknown>;
  try { json = await res.json() as Record<string, unknown>; }
  catch { throw new ApiError('Máy chủ trả về dữ liệu không đọc được.', res.status); }

  if (!res.ok || json.ok === false) {
    throw new ApiError(
      String(json.error ?? 'Không thực hiện được, thử lại giúp em.'),
      res.status,
      json.errors as Record<string, string> | undefined,
    );
  }
  return json as T;
}

export const api = {
  get:   <T,>(p: string) => request<T>('GET', p),
  post:  <T,>(p: string, b?: unknown) => request<T>('POST', p, b ?? {}),
  patch: <T,>(p: string, b?: unknown) => request<T>('PATCH', p, b ?? {}),
  put:   <T,>(p: string, b?: unknown) => request<T>('PUT', p, b ?? {}),
};

// ---------------------------------------------------------------- định dạng

export const vnd = (n: number | null | undefined): string =>
  n === null || n === undefined ? '—' : new Intl.NumberFormat('vi-VN').format(n) + 'đ';

export function dateTime(unixSec: number | null | undefined): string {
  if (!unixSec) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(unixSec * 1000));
}

export function relativeTime(unixSec: number | null | undefined): string {
  if (!unixSec) return '—';
  const diff = Math.floor(Date.now() / 1000) - unixSec;
  if (diff < 60) return 'vừa xong';
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} ngày trước`;
  return dateTime(unixSec);
}

/** 84912345678 → 0912345678, dạng người Việt quen nhìn. */
export const displayPhone = (v: string | null | undefined): string =>
  !v ? '—' : v.startsWith('84') ? '0' + v.slice(2) : v;
