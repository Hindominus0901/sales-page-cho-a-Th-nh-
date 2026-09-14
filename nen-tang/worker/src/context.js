/**
 * Boi canh cua mot request.
 *
 * Ban cu tren Node dung singleton o cap module (config, store, affiliates deu
 * la bien toan cuc). Tren Workers moi request co `env` rieng nen tat ca phai
 * di theo doi tuong nay - do cung la ly do cac module domain gio la HAM tao
 * (createStore, createAffiliates...) chu khong phai doi tuong dung san.
 */
import { readConfig } from './config.js';
import { createStore } from './db.js';
import { createRewards } from './rewards.js';
import { createAffiliates } from './affiliates.js';
import { parseCookies, clientIp, ensureSessionId } from './lib/http.js';

export function createContext(request, env, execCtx, url) {
  const cfg = readConfig(env);
  const store = createStore(env);
  const rewards = createRewards(env, cfg);

  const rc = {
    request,
    env,
    url,
    cfg,
    store,
    rewards,
    ip: clientIp(request),
    userAgent: request.headers.get('user-agent') || '',
    cookies: parseCookies(request),
    body: {},
    params: {},
    setCookies: [],
    extraHeaders: {},
    waitUntil: (promise) => execCtx.waitUntil(promise),
  };

  rc.affiliates = createAffiliates({ store, cfg, rewards });
  rc.sid = ensureSessionId(rc);
  rc.origin = url.origin;
  return rc;
}
