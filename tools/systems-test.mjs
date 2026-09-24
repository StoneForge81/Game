// Systemtest: Speichern/Laden, Gamepad-Steuerung, Ton.
// Aufruf: node tools/systems-test.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = 8130;
const srv = spawn(process.execPath, ['tools/serve.mjs', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 500));
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));

// Ein simulierter Xbox-Controller, den der Test fernsteuert.
await page.addInitScript(() => {
  const pad = {
    id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)', index: 0, connected: true, mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    vibrationActuator: { playEffect: () => { window.__rumbles = (window.__rumbles || 0) + 1; return Promise.resolve('complete'); } },
  };
  window.__pad = pad;
  navigator.getGamepads = () => [pad, null, null, null];
});

let ok = 0, fail = 0;
const check = (name, cond, extra = '') => { if (cond) { ok++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (extra ? ' – ' + extra : '')); } };

try {
  await page.goto(`http://localhost:${PORT}/index.html`);
  await page.waitForFunction(() => window.__ready === true);
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });

  // --- Gamepad ------------------------------------------------------------
  console.log('Gamepad');
  const r1 = await page.evaluate(async () => {
    const a = window.__app, pad = window.__pad;
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const press = async (b) => { pad.buttons[b].pressed = true; pad.buttons[b].value = 1; await frame(); await frame(); pad.buttons[b].pressed = false; pad.buttons[b].value = 0; await frame(); await frame(); };
    await press(0); // A: Titel bestätigen
    const started = a.scene.started;
    const device = a.input.lastDevice, type = a.input.padType;
    const { glyph } = await import('/src/core/input.js');
    const glyphs = { jump: glyph(a.input, 'jump'), attack: glyph(a.input, 'attack'), dash: glyph(a.input, 'dash') };
    // Stick nach unten: Menüauswahl bewegt sich
    const sel0 = a.scene.menu.sel;
    pad.axes[1] = 0.9; await frame(); await frame(); pad.axes[1] = 0; await frame(); await frame();
    const sel1 = a.scene.menu.sel;
    return { started, device, type, glyphs, moved: sel1 !== sel0 };
  });
  check('A-Taste startet den Titelbildschirm', r1.started);
  check('Gamepad als Eingabegerät erkannt (Xbox)', r1.device === 'gamepad' && r1.type === 'xbox', JSON.stringify(r1));
  check('Tastensymbole zeigen Xbox-Belegung', r1.glyphs.jump === 'A' && r1.glyphs.attack === 'X' && r1.glyphs.dash === 'RB', JSON.stringify(r1.glyphs));
  check('Analogstick bewegt die Menüauswahl', r1.moved);

  // --- Neues Spiel und Spielen mit dem Gamepad ----------------------------
  console.log('Spielen mit Gamepad');
  const r2 = await page.evaluate(async () => {
    const a = window.__app, pad = window.__pad;
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const press = async (b) => { pad.buttons[b].pressed = true; pad.buttons[b].value = 1; await frame(); await frame(); pad.buttons[b].pressed = false; pad.buttons[b].value = 0; await frame(); await frame(); };
    a.scene.menu.sel = 0;
    await press(0);                        // Neues Spiel
    await frame();
    const g = a.scene;
    g.prologue = null; g.save.storyFlags.prologue = true; g.fade = 0; g.fadeTarget = 0;
    // Warten, bis das Intro beginnt, dann durchklicken, bis Henry dabei ist
    for (let i = 0; i < 30 && !g.dialogue.active && !g.cutscene; i++) await frame();
    for (let i = 0; i < 80 && (g.dialogue.active || g.cutscene || !g.save.storyFlags.henryJoined); i++) await press(0);
    for (let i = 0; i < 6; i++) await frame();
    const x0 = g.player.x;
    pad.axes[0] = 1;                        // Stick nach rechts
    for (let i = 0; i < 20; i++) await frame();
    pad.axes[0] = 0;
    const moved = g.player.x - x0;
    // Springen mit A
    pad.buttons[0].pressed = true; pad.buttons[0].value = 1;
    let minY = g.player.y;
    for (let i = 0; i < 12; i++) { await frame(); minY = Math.min(minY, g.player.y); }
    pad.buttons[0].pressed = false; pad.buttons[0].value = 0;
    const jumped = g.player.y - minY;
    // Angriff mit X
    await press(2);
    const attacked = !!g.player.action || g.player.trail.length > 0 || g.player.comboT > 0;
    return { moved, jumped, attacked, henry: g.save.storyFlags.henryJoined };
  });
  check('Stick bewegt den Vampir', r2.moved > 10, `${Math.round(r2.moved)} WE`);
  check('A lässt ihn springen', r2.jumped > 15, `${Math.round(r2.jumped)} WE hoch`);
  check('X schlägt mit der Blutklinge zu', r2.attacked);
  check('Henry hat sich angeschlossen', r2.henry);

  // --- Speichern und Laden -----------------------------------------------
  console.log('Speichern und Laden');
  const r3 = await page.evaluate(async () => {
    const a = window.__app, g = a.scene;
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const cp = g.objects.find((o) => o.constructor.name === 'Checkpoint');
    g.player.teleport(cp.x - 10, cp.y);
    g.save.storyFlags.metFamily = true;
    g._rest(cp);
    g.save.power = 3;
    g.persist();
    const stored = JSON.parse(localStorage.getItem('blutmond.slot0') || 'null');
    a.toTitle();
    await frame();
    a.scene.started = true; a.scene._buildMenu();
    const first = a.scene.menu.items[0].label;
    a.scene.menu.items[0].onSelect();          // "Fortsetzen"
    await frame();
    const g2 = a.scene;
    const near = Math.abs(g2.player.x - cp.x) < 40;
    return { stored: !!stored, cpId: stored?.checkpoint, first, zone: g2.zoneId, near, power: g2.save.power };
  });
  check('Spielstand liegt im Speicher', r3.stored && r3.cpId?.startsWith('krypta.cp'), JSON.stringify(r3));
  check('Titelmenü bietet "Fortsetzen" an', r3.first === 'Fortsetzen');
  check('Fortsetzen lädt am Sarg', r3.zone === 'krypta' && r3.near);
  check('Fortschritt (Macht) bleibt erhalten', r3.power === 3);

  // --- Ton -----------------------------------------------------------------
  console.log('Ton');
  const r4 = await page.evaluate(async () => {
    const a = window.__app, au = a.audio;
    au.unlock();
    await au.ctx.resume();
    const an = au.ctx.createAnalyser();
    an.fftSize = 2048;
    au.master.connect(an);
    const buf = new Float32Array(an.fftSize);
    const peakFor = async (fn, ms) => {
      fn && fn();
      let peak = 0;
      const t0 = performance.now();
      while (performance.now() - t0 < ms) {
        await new Promise((r) => setTimeout(r, 40));
        an.getFloatTimeDomainData(buf);
        for (const v of buf) peak = Math.max(peak, Math.abs(v));
      }
      return peak;
    };
    const music = await peakFor(null, 1500);
    const hit = await peakFor(() => au.play('hitHeavy'), 300);
    const drain = await peakFor(() => au.play('drain'), 400);
    return { state: au.ctx.state, music, hit, drain, track: au.track?.id, ambience: au._ambienceKind };
  });
  check('AudioContext läuft', r4.state === 'running', r4.state);
  check('Musik ist hörbar', r4.music > 0.01, `Pegel ${r4.music.toFixed(3)} (${r4.track})`);
  check('Umgebungsklang aktiv', !!r4.ambience, r4.ambience);
  check('Treffer-Effekt ist hörbar', r4.hit > 0.02, `Pegel ${r4.hit.toFixed(3)}`);
  check('Aussaug-Effekt ist hörbar', r4.drain > 0.02, `Pegel ${r4.drain.toFixed(3)}`);
  check('Kein Übersteuern (Limiter)', Math.max(r4.music, r4.hit, r4.drain) <= 1.0);
} catch (e) {
  errors.push(e.message);
}
await browser.close();
srv.kill();
if (errors.length) { fail++; console.log('FEHLER:\n' + errors.join('\n')); }
console.log(`\n${ok} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
