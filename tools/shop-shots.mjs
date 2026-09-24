// Bilder von Laden, Inventar und Anzeige (für die Kontrolle der Menüs).
// Aufruf: node tools/shop-shots.mjs <ausgabeordner>
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const out = process.argv[2] || 'screenshots';
const PORT = 8127;
const srv = spawn(process.execPath, ['tools/serve.mjs', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 500));
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.goto(`http://localhost:${PORT}/?zone=hof`);
await p.waitForFunction(() => window.__ready && window.__app.scene.player, null, { timeout: 20000 });
await p.waitForTimeout(1200);
for (let i = 0; i < 40; i++) {
  const busy = await p.evaluate(() => { const g = window.__app.scene; return g.dialogue.active || g.cutscene; });
  if (!busy && i > 3) break;
  await p.keyboard.press('Enter'); await p.waitForTimeout(250);
}
await p.evaluate(() => {
  const g = window.__app.scene, s = g.save;
  s.gold = 1234; s.bossesDefeated = ['ambrosius', 'mirella']; s.abilities.lance = true;
  s.inventory = { heiltrank: 3, blutphiole: 2, zorntrank: 1 };
  s.owned.weapon.push('saebel'); s.owned.armor.push('lederwams'); s.spells.push('fledermaeuse');
  s.storyFlags.metMerchant = true;
  g.player.recalcStats();
});
await p.waitForTimeout(500);
await p.screenshot({ path: `${out}/hud.png` });
const merchant = await p.evaluate(() => !!window.__app.scene.objects.find((o) => o.constructor.name === 'Merchant'));
await p.evaluate(() => { const g = window.__app.scene; g.openShop(g.objects.find((o) => o.constructor.name === 'Merchant') || {}); });
await p.waitForTimeout(400);
for (let t = 0; t < 5; t++) {
  await p.screenshot({ path: `${out}/shop-${t}.png` });
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(300);
}
await p.keyboard.press('Escape'); await p.waitForTimeout(300);
await p.keyboard.press('KeyI'); await p.waitForTimeout(400);
for (let t = 0; t < 5; t++) {
  await p.screenshot({ path: `${out}/bag-${t}.png` });
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(300);
}
await p.keyboard.press('Escape'); await p.waitForTimeout(300);
// Händler im Level ansehen
await p.evaluate(() => {
  const g = window.__app.scene, m = g.objects.find((o) => o.constructor.name === 'Merchant');
  if (m) { g.player.teleport(m.x - 50, m.y); g.camera.snap(g.player.x, g.player.y); g.player.facing = 1; }
});
await p.waitForTimeout(800);
await p.screenshot({ path: `${out}/merchant.png` });
console.log('merchant in zone:', merchant, 'errors:', errors);
await b.close(); srv.kill();
