/**
 * Bao tin ra ngoai (Slack / Zapier / n8n / Google Apps Script...).
 *
 * Day la kenh "biet thi tot", khong phai kenh quan trong: loi chi ghi log.
 * Email cho nguoi dung KHONG duoc di qua duong nay - xem worker/src/mail/.
 */
export async function notify(cfg, event, title, data = {}) {
  const line = `[notify] ${event} - ${title}`;
  console.log(line, JSON.stringify(data));

  const url = cfg.webhook.notifyUrl;
  if (!url) return;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, title, text: line, data, at: new Date().toISOString() }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.warn('[notify] webhook tra ve', res.status);
  } catch (err) {
    console.warn('[notify] khong gui duoc webhook:', err?.message || err);
  }
}

/**
 * Ban di ma khong cho ket qua.
 *
 * Tren Vercel viec nay hay bi giet giua chung khi ham dong bang. Cloudflare co
 * ctx.waitUntil() - Worker song them den khi viec xong - nen o day dung duoc that.
 */
export function notifyAsync(rc, event, title, data = {}) {
  rc.waitUntil(notify(rc.cfg, event, title, data).catch(() => {}));
}
