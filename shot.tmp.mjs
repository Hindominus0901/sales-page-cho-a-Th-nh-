import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errs = [];
const shot = async (url, file, act) => {
  const p = await b.newPage({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 2 });
  p.on('pageerror', e => errs.push(url + ' → ' + e.message));
  await p.goto(url, { waitUntil: 'networkidle' });
  if (act) await act(p);
  await p.screenshot({ path: file, fullPage: !act });
  await p.close();
};
await shot('http://127.0.0.1:8787/chinh-sach-hoan-tien', '/tmp/p-refund.png');
await shot('http://127.0.0.1:8787/tra-cuu', '/tmp/p-tracuu.png', async (p) => {
  await p.fill('input[name=phone]', process.argv[2]);
  await p.click('button[type=submit]');
  await p.waitForTimeout(900);
});
console.log(errs.length ? errs.join('\n') : 'không có lỗi JS');
await b.close();
