// Einzelbilder der Schwerthiebe (Kombo 1–3, Hieb nach oben, Luftangriff).
// Die Spielschleife wird angehalten und Schritt für Schritt vorgespult,
// damit jedes Bild genau an derselben Stelle des Hiebs liegt.
// Aufruf: node tools/sword-shots.mjs <ausgabeordner> [waffe] [rüstung]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const out = process.argv[2] || 'screenshots';
const weapon = process.argv[3] || 'blutklinge';
const armor = process.argv[4] || 'fuerstenmantel';
const PORT = 8126;
const srv = spawn(process.execPath, ['tools/serve.mjs', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 500));
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto(`http://localhost:${PORT}/?zone=krypta`);
await p.waitForFunction(() => window.__ready && window.__app.scene.player, null, { timeout: 20000 });
await p.waitForTimeout(1500);
for (let i = 0; i < 60; i++) {
  const busy = await p.evaluate(() => { const g = window.__app.scene; return g.dialogue.active || g.cutscene; });
  if (!busy && i > 3) break;
  await p.keyboard.press('Enter'); await p.waitForTimeout(250);
}
await p.waitForTimeout(600);
await p.evaluate(({ weapon, armor }) => {
  const g = window.__app.scene;
  g.save.equip.weapon = weapon; g.save.equip.armor = armor;
  g.player.recalcStats();
  g.player.x += 60; g.player.facing = 1;
  for (const e of g.enemies) e.remove = true;
  window.__app.loop.stop();
}, { weapon, armor });

const step = (n) => p.evaluate((n) => { const a = window.__app; for (let i = 0; i < n; i++) a.loop.update(1 / 120); a.loop.render(0, 1 / 60); }, n);
const clip = () => p.evaluate(() => {
  const g = window.__app.scene, c = g.camera, s = 1280 / 416;
  const x = (g.player.x - c.x) * s, y = (g.player.y - c.y) * s;
  return { x: Math.max(0, x - 150), y: Math.max(0, y - 190), width: 300, height: 230 };
});

const kinds = [['c1', 1], ['c2', 2], ['c3', 3], ['up', 'up'], ['air', 'air']];
let n = 0;
for (const [name, kind] of kinds) {
  const dur = await p.evaluate((kind) => {
    const g = window.__app.scene, pl = g.player;
    pl.action = null; pl.state = 'normal';
    if (kind === 'air') { pl.y -= 50; pl.vy = -60; pl.onGround = false; }
    pl._upHeld = kind === 'up';
    pl.comboT = typeof kind === 'number' && kind > 1 ? 1 : 0;
    pl.comboStep = typeof kind === 'number' ? kind - 1 : 0;
    pl._startAttack(g);
    return pl.action.def.dur;
  }, kind);
  const frames = 8;
  const perFrame = Math.max(1, Math.round((dur * 120) / frames));
  for (let f = 0; f < frames; f++) {
    await step(perFrame);
    await p.screenshot({ path: `${out}/sw-${name}-${f}.png`, clip: await clip() });
    n++;
  }
  await step(40);
}
await b.close(); srv.kill();
console.log('ok', n);
