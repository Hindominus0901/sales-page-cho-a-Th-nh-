import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
const D = '/tmp/claude-0/-home-user-sales-page-cho-a-Th-nh-/b155fac4-2042-555c-a406-67210ddb99e8/scratchpad/adm';
await p.goto('file://' + D + '/Admin Portal.dc.html', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);
await p.screenshot({ path: '/tmp/adm-src.png', fullPage: false });
console.log('cao:', await p.evaluate(() => document.body.scrollHeight));
console.log('nav:', await p.evaluate(() =>
  [...document.querySelectorAll('nav a, nav button, aside a, aside button, [role=tab]')]
    .map(e => e.textContent.trim().replace(/\s+/g,' ')).filter(t => t && t.length < 40).slice(0, 30)));
await b.close();
