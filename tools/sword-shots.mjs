// Nahaufnahmen der Schwerthiebe (Kombo 1-3) in Zeitlupe.
// Aufruf: node tools/sword-shots.mjs <ausgabeordner>
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const out = process.argv[2] || 'screenshots';
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
await p.waitForTimeout(800);
const clip = () => p.evaluate(() => {
  const g = window.__app.scene, c = g.camera, s = 1280 / 416;
  const x = (g.player.x - c.x) * s, y = (g.player.y - c.y) * s;
  return { x: Math.max(0, x - 160), y: Math.max(0, y - 220), width: 320, height: 260 };
});
await p.evaluate(() => { window.__app.loop.timeScale = 0.08; });
let n = 0;
for (let hit = 0; hit < 3; hit++) {
  await p.keyboard.down('KeyJ'); await p.waitForTimeout(40); await p.keyboard.up('KeyJ');
  for (let f = 0; f < 5; f++) {
    await p.waitForTimeout(hit === 2 ? 900 : 650);
    await p.screenshot({ path: `${out}/sw-${hit + 1}-${f}.png`, clip: await clip() }); n++;
  }
}
// Stehend (Schwert weg?) und Luftangriff
await b.close(); srv.kill();
console.log('ok', n);
