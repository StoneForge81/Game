// Einzelner Screenshot einer beliebigen Seite des Projekts.
// Aufruf: node tools/shot.mjs <pfad?query> <ausgabe.png> [wartezeit-ms]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const [,, url, out, wait = '0'] = process.argv;
const PORT = 8124;
const srv = spawn(process.execPath, ['tools/serve.mjs', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 500));
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message + '\n' + (e.stack || '')));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
try {
  await p.goto(`http://localhost:${PORT}/${url}`);
  await p.waitForFunction(() => window.__ready, null, { timeout: 15000 });
  if (Number(wait)) await p.waitForTimeout(Number(wait));
  await p.screenshot({ path: out });
} catch (e) {
  errs.push(e.message);
} finally {
  await b.close();
  srv.kill();
}
if (errs.length) { console.log('FEHLER:\n' + errs.join('\n')); process.exit(1); }
console.log('ok ' + out);
