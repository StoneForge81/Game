// Fotografiert Vorschau- oder Spielszenen mit Chromium.
// Aufruf: node tools/screenshots.mjs [preview|game] [zonen...]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const mode = process.argv[2] || 'preview';
const zones = process.argv.slice(3).length ? process.argv.slice(3) : ['krypta', 'katakomben', 'hof', 'bibliothek', 'uhrturm', 'kathedrale'];
const PORT = 8123;
fs.mkdirSync('screenshots', { recursive: true });

const server = spawn(process.execPath, ['tools/serve.mjs', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

try {
  for (const z of zones) {
    const [zone, x] = z.split('@');
    const url = mode === 'preview'
      ? `http://localhost:${PORT}/tools/preview.html?zone=${zone}${x ? '&x=' + x : ''}`
      : `http://localhost:${PORT}/index.html?zone=${zone}&test=1`;
    await page.goto(url);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 15000 });
    await page.waitForTimeout(mode === 'preview' ? 100 : 1500);
    const file = `screenshots/${mode}-${zone}${x ? '-' + x : ''}.png`;
    await page.screenshot({ path: file });
    const stats = await page.evaluate(() => window.__stats || null);
    console.log(`✓ ${file}`, stats ? JSON.stringify(stats) : '');
  }
} finally {
  await browser.close();
  server.kill();
}
if (errors.length) {
  console.log('\nFEHLER IM BROWSER:');
  for (const e of [...new Set(errors)]) console.log('  ' + e);
  process.exit(1);
}
