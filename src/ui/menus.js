// Menüs: Pause, Optionen, Steuerung, Karte, Sarg, Sargreise, Schriften,
// Tod, Spielstände, Abspann. Alles per Gamepad bedienbar.

import { FONT_TITLE, FONT_HEAD, FONT_BODY, wrap, strokeText, drawGlyph, gothicPanel, roundRect, formatGlyphs } from './text.js';
import { glyph } from '../core/input.js';
import { clamp, TAU } from '../core/math.js';
import { ZONES, ZONE_ORDER } from '../data/zones.js';
import { SLOT_COUNT, formatPlayTime } from '../core/save.js';
import { T } from '../game/tiles.js';
import { makeCanvas } from '../render/renderer.js';

/** Richtungstasten mit Wiederholung beim Gedrückthalten (Stick-freundlich). */
class RepeatNav {
  constructor() { this.hold = {}; }
  step(input, dt, action) {
    if (input.pressed(action)) { this.hold[action] = 0; return true; }
    if (input.down(action)) {
      const before = this.hold[action] ?? 0;
      const now = before + dt;
      this.hold[action] = now;
      if (now > 0.38) {
        const n0 = Math.floor((before - 0.38) / 0.085), n1 = Math.floor((now - 0.38) / 0.085);
        return n1 > n0;
      }
    } else this.hold[action] = 0;
    return false;
  }
}

// === Allgemeines Menü =======================================================

export class MenuScreen {
  /**
   * items: [{ label, type: 'action'|'slider'|'toggle'|'choice', get, set, min, max, step,
   *           options: [{label, value}], onSelect, disabled, desc }]
   */
  constructor(app, { title, subtitle = '', items, onCancel = null, width = 1000, backdrop = 0.6, footer = true }) {
    this.app = app;
    this.title = title;
    this.subtitle = subtitle;
    this.items = items;
    this.onCancel = onCancel;
    this.width = width;
    this.backdrop = backdrop;
    this.footer = footer;
    this.sel = Math.max(0, items.findIndex((i) => !i.disabled));
    this.nav = new RepeatNav();
    this.t = 0;
  }

  update(dt) {
    const input = this.app.input;
    const audio = this.app.audio;
    this.t += dt;
    const n = this.items.length;
    const move = (d) => {
      for (let k = 1; k <= n; k++) {
        const i = (this.sel + d * k + n * 4) % n;
        if (!this.items[i].disabled) { this.sel = i; break; }
      }
      audio.play('uiMove');
    };
    if (this.nav.step(input, dt, 'up')) move(-1);
    if (this.nav.step(input, dt, 'down')) move(1);
    const it = this.items[this.sel];
    if (!it) return;
    const left = this.nav.step(input, dt, 'left'), right = this.nav.step(input, dt, 'right');
    if (it.type === 'slider' && (left || right)) {
      const v = clamp(it.get() + (right ? it.step : -it.step), it.min, it.max);
      it.set(Math.round(v * 1000) / 1000);
      audio.play('uiMove');
    } else if (it.type === 'choice' && (left || right)) {
      const opts = it.options;
      const i = opts.findIndex((o) => o.value === it.get());
      const ni = (i + (right ? 1 : -1) + opts.length) % opts.length;
      it.set(opts[ni].value);
      audio.play('uiMove');
    } else if (it.type === 'toggle' && (left || right)) {
      it.set(!it.get());
      audio.play('uiMove');
    }
    if (input.pressed('confirm')) {
      if (it.type === 'toggle') { it.set(!it.get()); audio.play('uiConfirm'); }
      else if (it.type === 'action' && it.onSelect) { audio.play('uiConfirm'); it.onSelect(); }
      else if (it.type === 'choice') {
        const opts = it.options;
        const i = opts.findIndex((o) => o.value === it.get());
        it.set(opts[(i + 1) % opts.length].value);
        audio.play('uiMove');
      }
    } else if (input.pressed('cancel') || input.pressed('menu')) {
      if (this.onCancel) { audio.play('uiCancel'); this.onCancel(); }
    }
  }

  draw(ctx, W, H) {
    ctx.save();
    if (this.backdrop) { ctx.fillStyle = `rgba(4,0,6,${this.backdrop})`; ctx.fillRect(0, 0, W, H); }
    const rowH = 84;
    const h = 200 + this.items.length * rowH + (this.subtitle ? 40 : 0);
    const w = this.width, x = W / 2 - w / 2, y = Math.max(40, H / 2 - h / 2);
    gothicPanel(ctx, x, y, w, h, { accent: true });
    ctx.textAlign = 'center';
    ctx.font = `700 64px ${FONT_TITLE}`;
    strokeText(ctx, this.title, W / 2, y + 100, '#f4e0d0', 'rgba(30,0,8,0.9)', 8);
    let iy = y + 150;
    if (this.subtitle) {
      ctx.font = `italic 500 32px ${FONT_BODY}`;
      ctx.fillStyle = '#c8a8b0';
      ctx.fillText(this.subtitle, W / 2, iy + 6);
      iy += 40;
    }
    this.items.forEach((it, i) => {
      const sel = i === this.sel;
      const ry = iy + i * rowH;
      if (sel) {
        const pulse = 0.75 + 0.25 * Math.sin(this.t * 5);
        ctx.fillStyle = `rgba(150,16,40,${0.55 * pulse})`;
        roundRect(ctx, x + 50, ry, w - 100, rowH - 12, 12); ctx.fill();
        ctx.strokeStyle = '#ffcf70'; ctx.lineWidth = 3; ctx.stroke();
        // Fledermaus-Zeiger
        ctx.fillStyle = '#ffcf70';
        ctx.beginPath(); ctx.moveTo(x + 70, ry + rowH / 2 - 6); ctx.lineTo(x + 88, ry + rowH / 2 - 16); ctx.lineTo(x + 84, ry + rowH / 2 - 6); ctx.lineTo(x + 88, ry + rowH / 2 + 4); ctx.closePath(); ctx.fill();
      }
      ctx.font = `600 40px ${FONT_HEAD}`;
      ctx.textBaseline = 'middle';
      const col = it.disabled ? '#5a4e58' : sel ? '#fff4f0' : '#c8b8c4';
      const cy = ry + rowH / 2 - 6;
      if (it.type === 'action') {
        ctx.textAlign = 'center';
        ctx.fillStyle = col;
        ctx.fillText(it.label, W / 2, cy);
      } else {
        ctx.textAlign = 'left';
        ctx.fillStyle = col;
        ctx.fillText(it.label, x + 110, cy);
        ctx.textAlign = 'right';
        const vx = x + w - 100;
        if (it.type === 'slider') {
          const k = (it.get() - it.min) / (it.max - it.min);
          const bw = 300;
          ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(vx - bw, cy - 8, bw, 16);
          ctx.fillStyle = sel ? '#e8304a' : '#8a1a2e'; ctx.fillRect(vx - bw, cy - 8, bw * k, 16);
          ctx.strokeStyle = '#c9a048'; ctx.lineWidth = 2; ctx.strokeRect(vx - bw, cy - 8, bw, 16);
          ctx.fillStyle = col;
          ctx.font = `600 32px ${FONT_HEAD}`;
          ctx.fillText(it.format ? it.format(it.get()) : String(Math.round(k * 10)), vx - bw - 20, cy);
        } else if (it.type === 'toggle') {
          ctx.fillStyle = it.get() ? '#ff8a9a' : '#7a6a78';
          ctx.fillText(it.get() ? 'An' : 'Aus', vx, cy);
        } else if (it.type === 'choice') {
          const o = it.options.find((q) => q.value === it.get());
          ctx.fillStyle = sel ? '#ffd8a0' : '#b8a8b0';
          ctx.fillText(`‹  ${o ? o.label : '?'}  ›`, vx, cy);
        }
      }
    });
    // Beschreibung des gewählten Eintrags
    const it = this.items[this.sel];
    if (it && it.desc) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.font = `italic 500 30px ${FONT_BODY}`;
      ctx.fillStyle = '#a898a4';
      ctx.fillText(it.desc, W / 2, y + h - 40);
    }
    if (this.footer) drawFooter(ctx, W, H, this.app.input, this.onCancel ? [['confirm', 'Auswählen'], ['cancel', 'Zurück']] : [['confirm', 'Auswählen']]);
    ctx.restore();
  }
}

export function drawFooter(ctx, W, H, input, pairs) {
  ctx.save();
  ctx.font = `600 30px ${FONT_HEAD}`;
  ctx.textBaseline = 'middle';
  let total = 0;
  const widths = pairs.map(([a, l]) => { const w = ctx.measureText(l).width + 90; total += w + 30; return w; });
  let x = W / 2 - total / 2;
  pairs.forEach(([a, l], i) => {
    const gw = drawGlyph(ctx, glyph(input, a), x + 24, H - 50, 44);
    ctx.textAlign = 'left';
    strokeText(ctx, l, x + gw / 2 + 36, H - 48, '#e0d4dc', 'rgba(0,0,0,0.85)', 5);
    x += widths[i] + 30;
  });
  ctx.restore();
}

// === Optionen ===============================================================

export function optionsMenu(app, onClose) {
  const s = app.settings;
  const apply = () => app.applySettings();
  const vol = (key, label) => ({
    label, type: 'slider', min: 0, max: 1, step: 0.1,
    get: () => s[key], set: (v) => { s[key] = v; apply(); },
  });
  return new MenuScreen(app, {
    title: 'Optionen',
    width: 1200,
    onCancel: onClose,
    items: [
      vol('masterVolume', 'Gesamtlautstärke'),
      vol('musicVolume', 'Musik'),
      vol('sfxVolume', 'Effekte'),
      { label: 'Bildqualität', type: 'choice', get: () => (s.autoQuality ? 'auto' : s.quality),
        set: (v) => { if (v === 'auto') s.autoQuality = true; else { s.autoQuality = false; s.quality = v; } apply(); },
        options: [{ label: 'Automatisch', value: 'auto' }, { label: '540p (schnell)', value: 0 }, { label: '720p', value: 1 }, { label: '900p', value: 2 }, { label: '1080p (scharf)', value: 3 }],
        desc: 'Automatisch passt die Schärfe an dein Gerät an, damit es flüssig läuft.' },
      { label: 'Helligkeit', type: 'slider', min: 0.6, max: 1.8, step: 0.1, get: () => s.brightness, set: (v) => { s.brightness = v; apply(); },
        format: (v) => `${Math.round(v * 100)} %`, desc: 'Wirkt das Bild zu dunkel? Viele Fernseher verschlucken dunkle Töne.' },
      { label: 'Bildrand (Overscan)', type: 'slider', min: 0, max: 6, step: 1, get: () => s.safeAreaInset, set: (v) => { s.safeAreaInset = v; apply(); },
        format: (v) => `${v} %`, desc: 'Werden die Ränder abgeschnitten? Erhöhen, bis alles sichtbar ist.' },
      { label: 'Bildschirmwackeln', type: 'slider', min: 0, max: 1.5, step: 0.25, get: () => s.screenShake, set: (v) => { s.screenShake = v; apply(); },
        format: (v) => `${Math.round(v * 100)} %` },
      { label: 'Vibration', type: 'toggle', get: () => s.rumble, set: (v) => { s.rumble = v; apply(); } },
      { label: 'Schadenszahlen', type: 'toggle', get: () => s.showDamageNumbers, set: (v) => { s.showDamageNumbers = v; apply(); } },
      { label: 'Filmkorn', type: 'toggle', get: () => s.grain, set: (v) => { s.grain = v; apply(); } },
      { label: 'Leichter Modus', type: 'toggle', get: () => s.assistMode, set: (v) => { s.assistMode = v; apply(); },
        desc: 'Du erleidest nur halben Schaden. Keine Schande – auch Fürsten brauchen Pausen.' },
      { label: 'Vollbild', type: 'action', onSelect: () => app.toggleFullscreen(), desc: 'Am Fernseher empfohlen. Auch mit F11 möglich.' },
      { label: 'Fertig', type: 'action', onSelect: onClose },
    ],
  });
}

// === Steuerung ==============================================================

export class ControlsScreen {
  constructor(app, onClose) { this.app = app; this.onClose = onClose; }
  update() {
    const i = this.app.input;
    if (i.pressed('cancel') || i.pressed('confirm') || i.pressed('menu')) { this.app.audio.play('uiCancel'); this.onClose(); }
  }
  draw(ctx, W, H) {
    const input = this.app.input;
    ctx.save();
    ctx.fillStyle = 'rgba(4,0,6,0.75)'; ctx.fillRect(0, 0, W, H);
    const w = 1300, h = 820, x = W / 2 - w / 2, y = H / 2 - h / 2 - 20;
    gothicPanel(ctx, x, y, w, h, { accent: true });
    ctx.textAlign = 'center';
    ctx.font = `700 64px ${FONT_TITLE}`;
    strokeText(ctx, 'Steuerung', W / 2, y + 100, '#f4e0d0');
    const dev = input.lastDevice === 'gamepad' ? 'Gamepad erkannt' : 'Tastatur – mit Gamepad spielt es sich am besten';
    ctx.font = `italic 500 30px ${FONT_BODY}`; ctx.fillStyle = '#c8a8b0';
    ctx.fillText(dev, W / 2, y + 145);
    const rows = [
      ['jump', 'Springen', 'Halten = höher · mit Fledermausgestalt: in der Luft nochmal, halten = gleiten'],
      ['attack', 'Blutklinge', 'Dreimal drücken für die volle Kombo'],
      ['lance', 'Blutlanze', 'Kostet Blut · durchbohrt Schilde und mehrere Gegner'],
      ['wolfClaw', 'Wolfsklaue', 'Kostet Blut · bricht Schilde und morsche Mauern'],
      ['dash', 'Ausweichen / Nebel', 'Mit Nebelschritt: unverwundbar und durch Gitter'],
      ['drain', 'Trinken / Handeln', 'Taumelnde Gegner aussaugen · Särge, Gefangene, Schriften'],
      ['map', 'Karte', ''],
      ['menu', 'Pause', ''],
    ];
    let ry = y + 220;
    for (const [a, name, desc] of rows) {
      drawGlyph(ctx, glyph(input, a), x + 140, ry, 54);
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = `700 38px ${FONT_HEAD}`;
      strokeText(ctx, name, x + 220, ry - (desc ? 12 : 0), '#f4ecf0', 'rgba(0,0,0,0.7)', 4);
      if (desc) { ctx.font = `500 26px ${FONT_BODY}`; ctx.fillStyle = '#a898a4'; ctx.fillText(desc, x + 220, ry + 22); }
      ry += 72;
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = `500 28px ${FONT_BODY}`; ctx.fillStyle = '#c9a048';
    ctx.fillText('Bewegen: linker Stick oder Steuerkreuz · Durch Plattformen fallen: unten + Springen', W / 2, y + h - 40);
    ctx.restore();
    drawFooter(ctx, W, H, input, [['cancel', 'Zurück']]);
  }
}

// === Karte ==================================================================

export class MapScreen {
  constructor(app, game, onClose) {
    this.app = app; this.game = game; this.onClose = onClose;
    this.canvas = buildMapCanvas(game);
    this.t = 0;
  }
  update(dt) {
    this.t += dt;
    const i = this.app.input;
    if (i.pressed('cancel') || i.pressed('map') || i.pressed('menu') || i.pressed('confirm')) { this.app.audio.play('uiCancel'); this.onClose(); }
  }
  draw(ctx, W, H) {
    const g = this.game;
    ctx.save();
    ctx.fillStyle = 'rgba(4,0,6,0.88)'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.font = `700 60px ${FONT_TITLE}`;
    strokeText(ctx, g.zone.name, W / 2, 110, '#f4e0d0');
    ctx.font = `italic 500 30px ${FONT_BODY}`; ctx.fillStyle = '#c8a8b0';
    ctx.fillText(`${g.zone.subtitle} · Schloss Nachtfels, Ingonesien`, W / 2, 150);
    const c = this.canvas;
    const maxW = W - 200, maxH = H - 330;
    const s = Math.min(maxW / c.width, maxH / c.height);
    const mw = c.width * s, mh = c.height * s;
    const mx = W / 2 - mw / 2, my = 200 + (maxH - mh) / 2;
    gothicPanel(ctx, mx - 30, my - 30, mw + 60, mh + 60, {});
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(c, mx, my, mw, mh);
    ctx.imageSmoothingEnabled = true;
    const toMap = (wx, wy) => [mx + (wx / 20) * s, my + (wy / 20) * s];
    // Särge, Ausgang, Boss
    for (const e of g.level.entities) {
      if (!g.isSeen(e.x, e.y)) continue;
      const [ex, ey] = toMap(e.x, e.y - 10);
      if (e.type === 'checkpoint') { ctx.fillStyle = '#ff4060'; ctx.fillRect(ex - 7, ey - 7, 14, 14); }
      if (e.type === 'exit') { ctx.fillStyle = '#ffd070'; ctx.beginPath(); ctx.arc(ex, ey, 8, 0, TAU); ctx.fill(); }
      if (e.type === 'item' && !g.save.storyFlags['got:' + e.id]) { ctx.fillStyle = '#ff90a0'; ctx.beginPath(); ctx.arc(ex, ey, 5, 0, TAU); ctx.fill(); }
    }
    if (g.level.bossArena && g.isSeen(g.level.bossArena.x + 20, g.level.bossArena.floorY)) {
      const [bx, by] = toMap(g.level.bossArena.x + g.level.bossArena.w / 2, g.level.bossArena.floorY - 60);
      ctx.font = `700 34px ${FONT_HEAD}`; ctx.fillStyle = g.save.bossesDefeated.includes(g.zone.boss) ? '#6a5a60' : '#ff4a5a';
      ctx.fillText('☠', bx, by);
    }
    // Spieler blinkt
    const [px, py] = toMap(g.player.x, g.player.y - 15);
    if (Math.sin(this.t * 8) > -0.3) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(px, py, 9, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e0102c';
      ctx.beginPath(); ctx.arc(px, py, 5, 0, TAU); ctx.fill();
    }
    // Legende
    ctx.font = `500 28px ${FONT_BODY}`; ctx.textAlign = 'left';
    const ly = H - 110;
    const leg = [['#ff4060', 'Sarg (Speichern)'], ['#ffd070', 'Ausgang'], ['#ff90a0', 'Geheimnis'], ['#ffffff', 'Du']];
    let lx = W / 2 - 520;
    for (const [col, lab] of leg) { ctx.fillStyle = col; ctx.fillRect(lx, ly - 10, 18, 18); ctx.fillStyle = '#d8ccd4'; ctx.fillText(lab, lx + 30, ly + 4); lx += 270; }
    ctx.restore();
    drawFooter(ctx, W, H, this.app.input, [['cancel', 'Schließen']]);
  }
}

/** Karte aus erkundeten Kacheln: 1 Pixel pro Kachel. */
function buildMapCanvas(game) {
  const w = game.world;
  const c = makeCanvas(w.w, w.h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w.w, w.h);
  for (let y = 0; y < w.h; y++) {
    for (let x = 0; x < w.w; x++) {
      const i = (y * w.w + x) * 4;
      if (!game.isSeen(x * 20, y * 20)) { img.data[i + 3] = 0; continue; }
      const t = w.tile(x, y);
      let col;
      if (t === T.SOLID || t === T.BREAKABLE || t === T.GATE) {
        // Nur Ränder zeichnen – das Innere der Mauern bleibt dunkel.
        const edge = [w.tile(x - 1, y), w.tile(x + 1, y), w.tile(x, y - 1), w.tile(x, y + 1)].some((n) => n === T.EMPTY || n === T.WATER || n === T.PLATFORM);
        col = edge ? [150, 120, 130] : [34, 22, 30];
      } else if (t === T.PLATFORM) col = [170, 130, 90];
      else if (t === T.SPIKES) col = [200, 200, 220];
      else if (t === T.WATER) col = [50, 80, 150];
      else if (t === T.GRATE) col = [120, 120, 140];
      else col = [70, 18, 30];
      img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// === Schriftstück lesen ====================================================

export class LoreScreen {
  constructor(app, lore, onClose) { this.app = app; this.lore = lore; this.onClose = onClose; this.t = 0; }
  update(dt) {
    this.t += dt;
    const i = this.app.input;
    if (this.t > 0.3 && (i.pressed('confirm') || i.pressed('cancel') || i.pressed('drain') || i.pressed('attack'))) { this.app.audio.play('uiCancel'); this.onClose(); }
  }
  draw(ctx, W, H) {
    ctx.save();
    ctx.fillStyle = 'rgba(4,0,6,0.7)'; ctx.fillRect(0, 0, W, H);
    const w = 1100, h = 640, x = W / 2 - w / 2, y = H / 2 - h / 2 - 20;
    // Pergament
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#e8d8b0'); g.addColorStop(0.5, '#f4e6c4'); g.addColorStop(1, '#d4bc8c');
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; roundRect(ctx, x + 10, y + 14, w, h, 10); ctx.fill();
    ctx.fillStyle = g; roundRect(ctx, x, y, w, h, 10); ctx.fill();
    ctx.strokeStyle = '#6a4a24'; ctx.lineWidth = 4; roundRect(ctx, x + 14, y + 14, w - 28, h - 28, 6); ctx.stroke();
    // Siegel des Ordens
    ctx.fillStyle = '#b8a060';
    ctx.beginPath(); ctx.arc(x + w - 90, y + 90, 36, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#6a5220'; ctx.lineWidth = 3;
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; ctx.beginPath(); ctx.moveTo(x + w - 90 + Math.cos(a) * 16, y + 90 + Math.sin(a) * 16); ctx.lineTo(x + w - 90 + Math.cos(a) * 30, y + 90 + Math.sin(a) * 30); ctx.stroke(); }
    ctx.textAlign = 'left';
    ctx.font = `700 46px ${FONT_HEAD}`;
    ctx.fillStyle = '#3a1a0a';
    ctx.fillText(this.lore.title, x + 70, y + 110);
    ctx.font = `italic 500 40px ${FONT_BODY}`;
    ctx.fillStyle = '#2a1608';
    const lines = wrap(ctx, this.lore.text, w - 160);
    lines.forEach((l, i) => ctx.fillText(l, x + 70, y + 200 + i * 54));
    ctx.restore();
    drawFooter(ctx, W, H, this.app.input, [['confirm', 'Weglegen']]);
  }
}

// === Spielstände ============================================================

export function slotMenu(app, slots, { title, onPick, onCancel, forNewGame }) {
  const items = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    const s = slots[i];
    const label = s
      ? `${i + 1}.  ${ZONES[s.zone]?.name || '?'}  ·  ${formatPlayTime(s.playTime)}  ·  Macht ${s.power}`
      : `${i + 1}.  — leer —`;
    items.push({
      label, type: 'action', disabled: !forNewGame && !s,
      desc: s ? (forNewGame ? 'Achtung: Dieser Spielstand wird überschrieben.' : `${s.bossesDefeated.length} von 6 Helden besiegt · ${s.deaths}× zu Staub zerfallen`) : 'Ein neuer Anfang.',
      onSelect: () => onPick(i),
    });
  }
  items.push({ label: 'Zurück', type: 'action', onSelect: onCancel });
  return new MenuScreen(app, { title, items, onCancel, width: 1300 });
}

// === Tod ====================================================================

export class DeathScreen {
  constructor(app, onContinue) { this.app = app; this.onContinue = onContinue; this.t = 0; }
  update(dt) {
    this.t += dt;
    const i = this.app.input;
    if (this.t > 1.6 && (i.pressed('confirm') || i.pressed('attack') || i.pressed('drain'))) { this.app.audio.play('uiConfirm'); this.onContinue(); }
  }
  draw(ctx, W, H) {
    const a = clamp(this.t / 1.2, 0, 1);
    ctx.save();
    ctx.fillStyle = `rgba(10,0,4,${0.8 * a})`; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.font = `700 110px ${FONT_TITLE}`;
    strokeText(ctx, 'Zu Staub zerfallen', W / 2, H / 2 - 20, '#c01830', 'rgba(0,0,0,0.9)', 10);
    ctx.font = `italic 500 38px ${FONT_BODY}`;
    ctx.fillStyle = '#c8a8b0';
    ctx.fillText('Doch ein Fürst der Nacht stirbt nicht so leicht.', W / 2, H / 2 + 50);
    ctx.restore();
    if (this.t > 1.6) drawFooter(ctx, W, H, this.app.input, [['confirm', 'Aus dem Sarg erheben']]);
  }
}

// === Abspann ================================================================

export class EndingScreen {
  constructor(app, ending, stats, onDone) {
    this.app = app; this.ending = ending; this.stats = stats; this.onDone = onDone;
    this.page = 0; this.t = 0;
    this.pages = [...ending.lines.map((l) => ({ text: l })), { credits: true }];
  }
  update(dt) {
    this.t += dt;
    const i = this.app.input;
    if (this.t > 0.8 && (i.pressed('confirm') || i.pressed('attack') || i.pressed('drain'))) {
      this.app.audio.play('uiConfirm');
      this.page++;
      this.t = 0;
      if (this.page >= this.pages.length) this.onDone();
    }
  }
  draw(ctx, W, H) {
    const p = this.pages[Math.min(this.page, this.pages.length - 1)];
    const a = clamp(this.t * 1.2, 0, 1);
    ctx.save();
    ctx.fillStyle = '#050207'; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    if (p.credits) {
      ctx.font = `700 90px ${FONT_TITLE}`;
      strokeText(ctx, this.ending.title, W / 2, 170, '#e8304a');
      ctx.font = `600 34px ${FONT_HEAD}`; ctx.fillStyle = '#c9a048';
      ctx.fillText('IN DEN HAUPTROLLEN', W / 2, 280);
      const cast = [
        ['Ingo', 'als Fürst Ingomar von Nachtfels'],
        ['Yvonne', 'als Fürstin Yvonne'],
        ['Henry', 'als Prinz Henry'],
        ['Renate', 'als Oma Renate'],
        ['Egon', 'als Opa Egon'],
      ];
      cast.forEach(([n, r], i) => {
        const y = 360 + i * 70;
        ctx.font = `700 46px ${FONT_TITLE}`; ctx.textAlign = 'right'; strokeText(ctx, n, W / 2 - 20, y, '#f4e0d0');
        ctx.font = `italic 500 38px ${FONT_BODY}`; ctx.textAlign = 'left'; ctx.fillStyle = '#c8b0bc'; ctx.fillText(r, W / 2 + 20, y);
      });
      ctx.textAlign = 'center';
      ctx.font = `500 32px ${FONT_BODY}`; ctx.fillStyle = '#a898a4';
      const s = this.stats;
      ctx.fillText(`Spielzeit ${formatPlayTime(s.playTime)} · ${s.bloodDrunk} Blut getrunken · ${s.mercy} verschont · ${s.greed} ausgesaugt · ${s.deaths}× zu Staub zerfallen`, W / 2, 780);
      ctx.fillText('Ein Spiel aus Schloss Nachtfels, Ingonesien. Gemacht mit Claude.', W / 2, 850);
    } else {
      ctx.font = `italic 500 50px ${FONT_BODY}`;
      const lines = wrap(ctx, p.text, 1400);
      lines.forEach((l, i) => strokeText(ctx, l, W / 2, H / 2 - (lines.length - 1) * 34 + i * 68, '#f0e4ec', 'rgba(0,0,0,0.9)', 6));
    }
    ctx.restore();
    if (this.t > 0.8) drawFooter(ctx, W, H, this.app.input, [['confirm', 'Weiter']]);
  }
}

export { formatGlyphs, ZONE_ORDER };
