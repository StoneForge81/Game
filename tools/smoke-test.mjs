// Rauchtest: startet das Spiel in Chromium, spielt den Anfang durch und
// meldet jeden JavaScript-Fehler. Macht dabei Bildschirmfotos.
// Aufruf: node tools/smoke-test.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const PORT = 8125;
fs.mkdirSync('screenshots', { recursive: true });
const srv = spawn(process.execPath, ['tools/serve.mjs', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts\.g/.test(m.text())) errors.push('console: ' + m.text()); });
// Schriftarten von Google laufen in der Testumgebung nicht durch den Proxy – Ersatzschrift ist ok.
page.on('requestfailed', () => {});

const shot = async (name) => { await page.screenshot({ path: `screenshots/smoke-${name}.png` }); console.log('  📸 ' + name); };
const press = async (key, times = 1, wait = 120) => { for (let i = 0; i < times; i++) { await page.keyboard.down(key); await page.waitForTimeout(60); await page.keyboard.up(key); await page.waitForTimeout(wait); } };
const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };
const state = () => page.evaluate(() => {
  const a = window.__app, s = a.scene;
  const g = s.player ? s : null;
  return {
    scene: s.constructor.name,
    zone: g?.zoneId, x: g ? Math.round(g.player.x) : null, y: g ? Math.round(g.player.y) : null,
    hp: g ? Math.round(g.player.hp) : null, blood: g ? Math.round(g.player.blood) : null,
    dialogue: g?.dialogue.active ?? null, cutscene: g?.cutscene ?? null, prologue: !!g?.prologue,
    overlay: g?.overlay?.constructor.name ?? null, enemies: g?.enemies.length ?? null, fps: Math.round(a.loop.fps),
  };
});

try {
  console.log('1) Titelbildschirm');
  await page.goto(`http://localhost:${PORT}/index.html`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 15000 });
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.waitForTimeout(1500);
  await shot('01-title');
  await press('Enter');
  await page.waitForTimeout(400);
  await shot('02-title-menu');

  console.log('2) Neues Spiel → Vorspann');
  await press('Enter'); // "Neues Spiel" (erster Eintrag ohne Spielstände)
  await page.waitForTimeout(1500);
  console.log('   ', await state());
  await shot('03-prologue');
  await press('Escape'); // Vorspann überspringen
  await page.waitForTimeout(1500);

  console.log('3) Erwachen in der Gruft');
  console.log('   ', await state());
  await shot('04-awaken');
  // Intro-Dialog durchklicken
  for (let i = 0; i < 30; i++) {
    const s = await state();
    if (!s.dialogue && !s.cutscene) break;
    await press('Enter', 1, 250);
  }
  await page.waitForTimeout(800);
  console.log('   ', await state());
  await shot('05-after-intro');

  console.log('4) Laufen, springen, kämpfen');
  await hold('ArrowRight', 1400);
  await press('Space');
  await hold('ArrowRight', 800);
  await shot('06-walking');
  for (let i = 0; i < 6; i++) await press('KeyJ', 1, 110);
  await page.waitForTimeout(300);
  await shot('07-combat');
  console.log('   ', await state());
  await hold('ArrowRight', 2500);
  await press('Space');
  await hold('ArrowRight', 1500);
  console.log('   ', await state());
  await shot('08-further');
} catch (e) {
  errors.push('test: ' + e.message);
} finally {
  await browser.close();
  srv.kill();
}

if (errors.length) {
  console.log(`\n✗ ${errors.length} Fehler:`);
  for (const e of [...new Set(errors)].slice(0, 20)) console.log('  ' + e);
  process.exit(1);
}
console.log('\n✓ Keine JavaScript-Fehler');
