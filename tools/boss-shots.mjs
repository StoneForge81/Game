// Fotografiert jeden Bosskampf mitten im Gefecht (zur Sichtprüfung).
// Aufruf: node tools/boss-shots.mjs [zonen...]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const ZONES = process.argv.slice(2).length ? process.argv.slice(2) : ['krypta', 'katakomben', 'hof', 'bibliothek', 'uhrturm', 'kathedrale'];
const PORT = 8128;
fs.mkdirSync('screenshots', { recursive: true });
const srv = spawn(process.execPath, ['tools/serve.mjs', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => { try { localStorage.setItem('blutmond.settings', JSON.stringify({ quality: 3, autoQuality: false })); } catch {} });
const src = fs.readFileSync('tools/playthrough.mjs', 'utf8');
const botSrc = src.slice(src.indexOf('const BOT = () => {'), src.indexOf('const report = [];'));
const BOT = new Function(botSrc + '; return BOT;')();

for (const zone of ZONES) {
  await page.goto(`http://localhost:${PORT}/index.html?zone=${zone}`);
  await page.waitForFunction(() => window.__ready === true);
  await page.evaluate(BOT);
  const info = await page.evaluate((z) => {
    const A = window.__app, g = A.scene, B = window.__bot;
    const ba = g.level.bossArena;
    g.player.teleport(ba.x + 30, ba.floorY);
    // Intro durchlaufen, dann ein Stück kämpfen (Serafine bis Phase 2)
    B.run(120 * 60, (s) => s.boss && s.boss.state === 'fight' && !s.dialogue.active);
    const target = z === 'kathedrale' ? 0.45 : 0.75;
    B.run(120 * 60, (s) => !s.boss || s.boss.hp < s.boss.maxHp * target);
    B.bot.idle = true;
    B.run(90);          // kurz zusehen: Boss greift an
    B.bot.idle = false;
    B.render();
    return { boss: g.boss?.kind, hp: g.boss && Math.round(g.boss.hp), phase: g.boss?.phase, projectiles: g.projectiles.length };
  }, zone);
  await page.screenshot({ path: `screenshots/boss-${zone}.png` });
  console.log(zone, JSON.stringify(info));
}
await browser.close();
srv.kill();
if (errors.length) { console.log('FEHLER:\n' + errors.join('\n')); process.exit(1); }
