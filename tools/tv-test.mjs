// Test der Fernseher-App: baut dist/tizen und startet sie wie am Samsung-TV
// direkt als Datei (file://), mit nachgebautem `tizen`-Objekt und Fernbedienung.
// Aufruf: node tools/tv-test.mjs [bilderordner]
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const shots = process.argv[2] || null;
execFileSync(process.execPath, ['tools/tizen-build.mjs'], { stdio: 'ignore' });
const url = 'file://' + path.resolve('dist/tizen/Blutmond/index.html');

// Wie der Fernseher: Dateien dürfen einander per XMLHttpRequest laden.
const browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.addInitScript(() => {
  window.__tv = { keys: [], exited: false };
  window.tizen = {
    tvinputdevice: { registerKey: (k) => window.__tv.keys.push(k) },
    application: { getCurrentApplication: () => ({ exit: () => { window.__tv.exited = true; } }) },
  };
});

let ok = 0, fail = 0;
const check = (name, cond, extra = '') => { if (cond) { ok++; console.log('  ✓ ' + name + (extra ? ' – ' + extra : '')); } else { fail++; console.log('  ✗ ' + name + (extra ? ' – ' + extra : '')); } };
// Taste der Fernbedienung: nur keyCode, kein e.code
const remote = (keyCode) => page.evaluate((keyCode) => {
  for (const type of ['keydown', 'keyup']) {
    const e = new KeyboardEvent(type, { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'keyCode', { get: () => keyCode });
    window.dispatchEvent(e);
    if (type === 'keydown') { const a = window.__app; a.loop.update(1 / 120); }
  }
  window.__app.loop.update(1 / 120);
}, keyCode);
const scene = () => page.evaluate(() => window.__app.scene.constructor.name);

try {
  console.log('Start als Datei');
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(async () => {
    await document.fonts.ready;
    const a = window.__app;
    return {
      manifest: !!a.audio.samples.manifest,
      fonts: document.fonts.check('900 40px "Cinzel Decorative"') && [...document.fonts].some((f) => f.family.includes('Cinzel') && f.status === 'loaded'),
      keys: window.__tv.keys.length,
    };
  });
  check('Spiel startet ohne Server (file://)', true);
  check('Klangliste geladen (XMLHttpRequest)', r.manifest);
  check('Schriften aus dem Spiel geladen', r.fonts);
  check('Farbtasten angemeldet', r.keys >= 4, `${r.keys} Tasten`);
  if (shots) await page.screenshot({ path: `${shots}/tv-title.png` });

  console.log('Fernbedienung');
  await page.evaluate(() => window.__app.loop.stop());
  await remote(13);   // OK
  const items = await page.evaluate(() => window.__app.scene.menu?.items.map((i) => i.label) || []);
  check('OK öffnet das Titelmenü', items.length > 0, items.join(', '));
  check('„Beenden“ statt „Vollbild“', items.includes('Beenden') && !items.includes('Vollbild'));
  await remote(40);   // runter
  const sel = await page.evaluate(() => window.__app.scene.menu.sel);
  check('Pfeil runter bewegt die Auswahl', sel === 1);
  await remote(38);
  // Neues Spiel (erster Eintrag ohne Spielstand)
  await page.evaluate(() => { try { localStorage.clear(); } catch {} const m = window.__app.scene.menu; m.sel = m.items.findIndex((i) => i.label === 'Neues Spiel'); });
  await remote(13);
  for (let i = 0; i < 30; i++) await page.evaluate(() => window.__app.loop.update(1 / 120));
  check('Neues Spiel startet', (await scene()) === 'Game');
  // Klänge werden aus Dateien geladen
  await page.evaluate(() => window.__app.loop.start());
  await page.waitForTimeout(2500);
  const buffers = await page.evaluate(() => [...window.__app.audio.samples.buffers.values()].filter(Boolean).length);
  check('Klänge laden am Fernseher', buffers > 5, `${buffers} Dateien`);
  if (shots) await page.screenshot({ path: `${shots}/tv-game.png` });
  // Zurück öffnet das Pausenmenü
  await page.evaluate(() => { const g = window.__app.scene; g.dialogue.active = false; g.prologue = null; g.cutscene = null; window.__app.loop.stop(); });
  await remote(10009);
  for (let i = 0; i < 5; i++) await page.evaluate(() => window.__app.loop.update(1 / 120));
  const ov = await page.evaluate(() => window.__app.scene.overlay?.constructor.name || window.__app.scene.paused || null);
  check('Zurück öffnet das Pausenmenü', !!ov, String(ov));
  // Rot = Angriff
  const act = await page.evaluate(() => { const g = window.__app.scene; g.overlay = null; g.paused = false; return true; });
  await remote(403);
  const attack = await page.evaluate(() => { const p = window.__app.scene.player; return p.action?.def?.anim || null; });
  check('Rote Taste schlägt zu', !!attack && act, String(attack));

  // Zurück im Titelmenü beendet die App
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 20000 });
  await page.evaluate(() => window.__app.loop.stop());
  await remote(13);
  await remote(10009);
  check('Zurück im Titelmenü beendet die App', await page.evaluate(() => window.__tv.exited));
} catch (e) {
  fail++;
  console.log('  ✗ Ausnahme: ' + e.message);
}
check('Keine JavaScript-Fehler', errors.length === 0, errors.join('\n'));
console.log(`\n${ok} bestanden, ${fail} fehlgeschlagen`);
await browser.close();
process.exit(fail ? 1 : 0);
