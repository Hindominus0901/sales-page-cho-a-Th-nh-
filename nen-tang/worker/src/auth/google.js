/**
 * Dang nhap bang Google (Authorization Code + PKCE).
 *
 * Bon thu bat buoc phai kiem, thieu mot cai la lo:
 *   1. `state`  - buoc luot chuyen huong ve dung trinh duyet da bat dau luong.
 *                 Thieu no thi ke tan cong ep duoc nan nhan dang nhap vao tai
 *                 khoan Google cua chinh ke do.
 *   2. PKCE     - ma doi token phai kem "code_verifier" chi trinh duyet nay biet.
 *   3. Chu ky id_token - xac minh bang khoa cong khai cua Google (JWKS), khong
 *                 bao gio tin phan payload doc tran.
 *   4. email_verified - Google co the tra ve email chua xac thuc; nhan bua thi
 *                 ai cung "dang nhap" thanh nguoi khac duoc.
 */
import { setCookie } from '../lib/http.js';
import { randomToken, toHex } from '../lib/crypto.js';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

const STATE_COOKIE = 'pf_oauth';
const STATE_TTL = 600; // 10 phut

const enc = new TextEncoder();

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const b64urlDecode = (text) => {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

const sha256 = (text) => crypto.subtle.digest('SHA-256', enc.encode(text));

export const redirectUri = (rc) => `${rc.origin}/api/auth/google/callback`;

export const isConfigured = (rc) => !!(rc.env.GOOGLE_CLIENT_ID && rc.env.GOOGLE_CLIENT_SECRET);

/**
 * Buoc 1: tao state + code_verifier, cat vao KV, chuyen huong sang Google.
 */
export async function startFlow(rc, returnTo) {
  const state = randomToken();
  const verifier = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const nonce = randomToken();

  // Gia tri that nam trong KV o phia may chu; trinh duyet chi giu mot chia khoa.
  await rc.env.CACHE.put(`oauth:${state}`, JSON.stringify({ verifier, nonce, returnTo }),
    { expirationTtl: STATE_TTL });
  setCookie(rc, STATE_COOKIE, state, { maxAge: STATE_TTL, sameSite: 'Lax' });

  const params = new URLSearchParams({
    client_id: rc.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(rc),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce,
    code_challenge: b64url(await sha256(verifier)),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function getJwks(rc) {
  const cached = await rc.env.CACHE.get('google:jwks', 'json');
  if (cached) return cached;
  const res = await fetch(JWKS_URL, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error('khong lay duoc khoa cong khai cua Google');
  const jwks = await res.json();
  await rc.env.CACHE.put('google:jwks', JSON.stringify(jwks), { expirationTtl: 6 * 60 * 60 });
  return jwks;
}

/** Kiem chu ky va noi dung id_token. Nem loi neu bat ky diem nao khong dat. */
async function verifyIdToken(rc, idToken, expectedNonce) {
  const [headerB64, payloadB64, signatureB64] = String(idToken).split('.');
  if (!headerB64 || !payloadB64 || !signatureB64) throw new Error('id_token sai dinh dang');

  const header = JSON.parse(new TextDecoder().decode(b64urlDecode(headerB64)));
  const jwks = await getJwks(rc);
  const jwk = (jwks.keys || []).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('khong tim thay khoa cong khai khop kid');

  const key = await crypto.subtle.importKey('jwk', jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key,
    b64urlDecode(signatureB64), enc.encode(`${headerB64}.${payloadB64}`));
  if (!valid) throw new Error('chu ky id_token khong hop le');

  const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64)));
  if (!ISSUERS.has(claims.iss)) throw new Error('iss khong phai Google');
  if (claims.aud !== rc.env.GOOGLE_CLIENT_ID) throw new Error('aud khong khop ung dung nay');
  if (!claims.exp || claims.exp * 1000 < Date.now()) throw new Error('id_token het han');
  if (expectedNonce && claims.nonce !== expectedNonce) throw new Error('nonce khong khop');
  if (!claims.email) throw new Error('Google khong tra ve email');
  if (claims.email_verified !== true && claims.email_verified !== 'true') {
    throw Object.assign(new Error('email ben Google chua duoc xac thuc'), { ma: 'email_chua_xac_thuc' });
  }
  return claims;
}

/**
 * Buoc 2: doi ma lay id_token, kiem tra, tra ve thong tin nguoi dung.
 * @returns {Promise<{claims:object, returnTo:string}>}
 */
export async function completeFlow(rc) {
  const state = rc.url.searchParams.get('state') || '';
  const code = rc.url.searchParams.get('code') || '';
  const cookieState = rc.cookies[STATE_COOKIE] || '';

  if (!state || !code) throw Object.assign(new Error('thieu tham so tra ve tu Google'), { ma: 'thieu_tham_so' });
  // So khop ca hai phia: cookie cua trinh duyet VA ban ghi phia may chu.
  if (state !== cookieState) throw Object.assign(new Error('state khong khop trinh duyet'), { ma: 'trinh_duyet_chan' });

  const saved = await rc.env.CACHE.get(`oauth:${state}`, 'json');
  if (!saved) throw Object.assign(new Error('phien dang nhap Google da het han'), { ma: 'het_han' });
  // Dung mot lan.
  await rc.env.CACHE.delete(`oauth:${state}`);
  setCookie(rc, STATE_COOKIE, '', { maxAge: 0 });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: rc.env.GOOGLE_CLIENT_ID,
      client_secret: rc.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(rc),
      grant_type: 'authorization_code',
      code_verifier: saved.verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id_token) throw new Error('Google tu choi doi ma dang nhap');

  const claims = await verifyIdToken(rc, data.id_token, saved.nonce);
  return { claims, returnTo: saved.returnTo || '/' };
}
