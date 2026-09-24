// Vergleich WebGL ↔ klassisch: gleiche Szene (Fürst an einer Fackel) je Zone.
// Aufruf: node tools/gl-compare.mjs <ausgabeordner> [zonen...] [--only=webgl|classic]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const args = process.argv.slice(2);
const out = args[0] || 'screenshots';
const only = (args.find((a) => a.startsWith('--only=')) || '').slice(7);
const dbg = Number((args.find((a) => a.startsWith('--debug=')) || '').slice(8) || 0);
const zones = args.slice(1).filter((a) => !a.startsWith('--'));
const ZONES = zones.length ? zones : ['krypta', 'katakomben', 'hof', 'bibliothek', 'uhrturm', 'kathedrale'];
fs.mkdirSync(out, { recursive: true });
const PORT = 8131;
const srv = spawn(process.execPath, ['tools/serve.mjs', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 500));
const b = await chromium.launch();
const errs = [];
for (const zone of ZONES) {
  for (const engine of ['webgl', 'classic']) {
    if (only && only !== engine) continue;
    const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
    p.on('pageerror', (e) => errs.push(`${zone}/${engine}: ${e.message}`));
    await p.addInitScript(() => { try { localStorage.setItem('blutmond.settings', JSON.stringify({ quality: 2, autoQuality: false })); } catch {} });
    await p.goto(`http://localhost:${PORT}/?zone=${zone}&engine=${engine}`);
    await p.waitForFunction(() => window.__ready && window.__app.scene.player, null, { timeout: 30000 });
    const info = await p.evaluate((DBG) => {
      const a = window.__app; a.loop.stop();
      const g = a.scene;
      // Fackel in gut einem Drittel des Levels
      const ls = g.level.lights.filter((l) => l.shadows);
      const target = g.world.pxW * 0.3;
      const L = ls.sort((x, y) => Math.abs(x.x - target) - Math.abs(y.x - target))[0] || { x: g.player.x, y: g.player.y };
      g.player.teleport(L.x - 34, L.y);
      g.camera.snap(L.x, L.y);
      for (let i = 0; i < 360; i++) { a.input.poll(); g.update(1 / 120); if (g.dialogue.active) g.dialogue.active = false; }
      g.camera.snap(g.player.x, g.player.y);
      a.renderer.debugView = DBG;
      for (let i = 0; i < 30; i++) g.render(0, 1 / 60);
      const c = g.camera, k = 1280 / 416;
      return { engine: a.renderer.engine, lights: ls.length, px: (g.player.x - c.x) * k, py: (g.player.y - c.y) * k };
    }, dbg);
    await p.waitForTimeout(200);
    await p.screenshot({ path: `${out}/${zone}-${engine}${dbg ? '-dbg' + dbg : ''}.png` });
    const cx = Math.max(0, Math.min(1280 - 480, info.px - 240)), cy = Math.max(0, Math.min(720 - 300, info.py - 200));
    await p.screenshot({ path: `${out}/${zone}-${engine}${dbg ? '-dbg' + dbg : ''}-close.png`, clip: { x: cx, y: cy, width: 480, height: 300 } });
    console.log(zone, engine, '→', info.engine);
    await p.close();
  }
}
await b.close(); srv.kill();
if (errs.length) { console.log('FEHLER:\n' + errs.join('\n')); process.exit(1); }
