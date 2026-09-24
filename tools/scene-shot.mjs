// Stellt den Spieler an ein bestimmtes Objekt und fotografiert die Szene.
// Aufruf: node tools/scene-shot.mjs <zone> <objekttyp> <datei> [dialog]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const [,, zone, type, out, talk] = process.argv;
const PORT = 8129;
const srv = spawn(process.execPath, ['tools/serve.mjs', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 500));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
await page.addInitScript(() => { try { localStorage.setItem('blutmond.settings', JSON.stringify({ quality: 3, autoQuality: false })); } catch {} });
await page.goto(`http://localhost:${PORT}/index.html?zone=${zone}`);
await page.waitForFunction(() => window.__ready === true);
await page.evaluate(([type, talk]) => {
  const a = window.__app; a.loop.stop();
  const g = a.scene;
  const o = g.level.entities.find((e) => e.type === type);
  g.player.teleport(o.x - 50, o.y);
  g.camera.snap(o.x, o.y);
  for (let i = 0; i < 240; i++) { a.input.poll(); g.update(1 / 120); }
  if (talk) {
    const obj = g.objects.find((x) => x.constructor.name.toLowerCase().startsWith(type.slice(0, 5)));
    obj.interact(g, g.player);
    for (let k = 0; k < Number(talk); k++) {
      for (let i = 0; i < 400 && g.dialogue.chars < g.dialogue._text().length; i++) g.update(1 / 120);
      if (k < Number(talk) - 1) { g.dialogue.i++; g.dialogue.chars = 0; }
    }
  }
  for (let i = 0; i < 3; i++) g.render(0, 1 / 60);
}, [type, talk]);
await page.screenshot({ path: out });
await browser.close(); srv.kill();
console.log(errors.length ? 'FEHLER\n' + errors.join('\n') : 'ok ' + out);
