// Dialogfenster mit Porträts, Schreibmaschinen-Text und Entscheidungen.
// Pausiert das Spielgeschehen, solange es offen ist.

import { SPEAKERS } from '../data/story.js';
import { COSTUMES, makePose, drawHumanoid, Cloth, solveRig } from '../render/puppet.js';
import { makeCanvas } from '../render/renderer.js';
import { FONT_HEAD, FONT_BODY, wrap, gothicPanel, drawGlyph, strokeText, formatGlyphs } from './text.js';
import { glyph } from '../core/input.js';
import { CHAR_SCALE } from '../data/config.js';
import { voiceId } from '../core/voice-id.js';

const CHOICES = {
  prisoner: [
    { id: 'drink', label: 'Trinken', desc: 'Stillt deinen Hunger. Dein Blut wächst dauerhaft.' },
    { id: 'spare', label: 'Freilassen', desc: 'Er läuft heim nach Ingopolis. Deine Lebenskraft wächst dauerhaft.' },
  ],
  serafine: [
    { id: 'drink', label: 'Trinken', desc: 'Nimm dir das Blut der Sonnenschwurs.' },
    { id: 'spare', label: 'Verschonen', desc: 'Lass die Jägerin leben.' },
  ],
};

const PORTRAIT_COSTUME = {
  ingomar: 'ingomar', henry: 'henry', yvonne: 'yvonne', renate: 'renate', egon: 'egon', prisoner: 'prisoner',
  ines: 'ines', matthias: 'matthias',
  ambrosius: 'ambrosius', mirella: 'mirella', isolde: 'isolde', malachias: 'malachias', cogliostro: 'cogliostro', serafine: 'serafine',
};

export class Dialogue {
  constructor(app) {
    this.app = app;
    this.active = false;
    this.lines = [];
    this.i = 0;
    this.chars = 0;
    this.onEnd = null;
    this.onChoice = null;
    this.choice = null;      // { kind, options, sel }
    this.portraits = new Map();
    this.fadeIn = 0;
    this._blipT = 0;
  }

  start(lines, onEnd = null, onChoice = null) {
    this.lines = lines;
    this.i = 0;
    this.chars = 0;
    this.onEnd = onEnd;
    this.onChoice = onChoice;
    this.choice = null;
    this.active = true;
    this.fadeIn = 0;
    this.app.audio.setMuffle(0.35);
    this._speak();
  }

  /** Aufgenommene Stimme zur aktuellen Zeile abspielen (falls vorhanden). */
  _speak() {
    const l = this.line;
    if (l) this.app.audio.playVoice(voiceId(l.who, l.text));
    else this.app.audio.stopVoice();
  }

  get line() { return this.lines[this.i]; }

  _text() {
    const l = this.line;
    return l ? formatGlyphs(l.text, this.app.input) : '';
  }

  update(dt) {
    if (!this.active) return;
    const input = this.app.input;
    this.fadeIn = Math.min(1, this.fadeIn + dt * 5);
    const l = this.line;
    if (!l) { this._finish(); return; }
    const full = this._text();

    if (this.choice) {
      const n = this.choice.options.length;
      if (input.pressed('up') || input.pressed('left')) { this.choice.sel = (this.choice.sel + n - 1) % n; this.app.audio.play('uiMove'); }
      if (input.pressed('down') || input.pressed('right')) { this.choice.sel = (this.choice.sel + 1) % n; this.app.audio.play('uiMove'); }
      if (input.pressed('confirm') || input.pressed('drain')) {
        const opt = this.choice.options[this.choice.sel];
        this.app.audio.play('uiConfirm');
        const kind = this.choice.kind;
        this.choice = null;
        this.active = false;
        this.app.audio.setMuffle(0);
        this.app.audio.stopVoice(0.3);
        this.onChoice && this.onChoice(kind, opt.id);
      }
      return;
    }

    // Schreibmaschine – gedrückt halten beschleunigt
    const speed = input.down('confirm') || input.down('attack') ? 140 : 48;
    if (this.chars < full.length) {
      const before = Math.floor(this.chars);
      this.chars = Math.min(full.length, this.chars + dt * speed);
      if (Math.floor(this.chars) !== before && full[before] !== ' ') {
        this._blipT -= 1;
        if (this._blipT <= 0) { this.app.audio.play('textBlip', { gain: l.who === 'narrator' ? 0.3 : 0.7 }); this._blipT = 2; }
      }
    }

    const advance = input.pressed('confirm') || input.pressed('attack') || input.pressed('drain');
    if (advance) {
      if (this.chars < full.length) this.chars = full.length;
      else if (l.choice) {
        this.choice = { kind: l.choice, options: CHOICES[l.choice], sel: 0 };
        this.app.audio.play('uiMove');
      } else {
        this.i++;
        this.chars = 0;
        if (this.i >= this.lines.length) this._finish();
        else this._speak();
      }
    }
  }

  _finish() {
    this.active = false;
    this.app.audio.setMuffle(0);
    this.app.audio.stopVoice(0.3);
    const cb = this.onEnd;
    this.onEnd = null;
    cb && cb();
  }

  /** Porträt einmal pro Sprecher vorzeichnen (Oberkörper im Rahmen). */
  _portrait(who, facing = 1) {
    const cacheKey = who + ':' + facing;
    if (this.portraits.has(cacheKey)) return this.portraits.get(cacheKey);
    const key = PORTRAIT_COSTUME[who];
    if (!key) { this.portraits.set(cacheKey, null); return null; }
    const W = 300, H = 300;
    const c = makeCanvas(W, H);
    const ctx = c.getContext('2d');
    const bg = ctx.createRadialGradient(W / 2, H * 0.45, 20, W / 2, H * 0.5, W * 0.7);
    bg.addColorStop(0, who === 'yvonne' ? '#6a2a4a' : '#3a2438');
    bg.addColorStop(1, '#0c060e');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    const sz = who === 'henry' ? 0.8 : 1;
    // Kopf und Schultern füllen den Rahmen: Kopf ≈ 36 WE über den Füßen.
    const S = 12.5 / sz;
    const headUp = 35.5 * sz * CHAR_SCALE;
    ctx.save();
    ctx.translate(W / 2 - facing * 14, 150 + headUp * S);
    ctx.scale(S, S);
    const pose = makePose('idle', 0.4);
    const costume = COSTUMES[key];
    let cape = null;
    if (costume.cape) {
      const rig = solveRig(pose, sz * CHAR_SCALE);
      cape = new Cloth(8, 3.1, 560, 0.07);
      const ax = facing * (rig.neck.x - 1.6), ay = rig.neck.y + 1.2;
      cape.reset(ax, ay);
      for (let i = 0; i < 90; i++) cape.update(1 / 60, ax, ay, 0, -60 * facing);
    }
    drawHumanoid(ctx, 0, 0, facing, pose, costume, { sz, cape, outline: 0.45 });
    ctx.restore();
    // Kristallschimmer für Yvonnes Stimme
    if (who === 'yvonne') {
      ctx.fillStyle = 'rgba(255,240,210,0.16)';
      ctx.beginPath(); ctx.moveTo(W / 2, 10); ctx.lineTo(W - 30, H * 0.4); ctx.lineTo(W - 50, H); ctx.lineTo(50, H); ctx.lineTo(30, H * 0.4); ctx.closePath(); ctx.fill();
    }
    this.portraits.set(cacheKey, c);
    return c;
  }

  draw(ctx, W, H) {
    if (!this.active && !this.choice) return;
    const l = this.line;
    if (!l) return;
    const sp = SPEAKERS[l.who] || SPEAKERS.narrator;
    const a = this.fadeIn;
    ctx.save();
    ctx.globalAlpha = a;

    const px = 150, pw = W - 300, ph = 270, py = H - ph - 60;
    const narrator = l.who === 'narrator';
    gothicPanel(ctx, px, py, pw, ph, { accent: !narrator });

    // Porträt
    let textX = px + 60, textW = pw - 120;
    const portrait = narrator ? null : this._portrait(l.who, sp.side === 'right' ? -1 : 1);
    if (portrait) {
      const size = 300;
      const left = sp.side !== 'right';
      const x = left ? px + 30 : px + pw - size - 30;
      const y = py - 110;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x, y + size); ctx.lineTo(x, y + 60); ctx.quadraticCurveTo(x, y, x + size / 2, y - 30); ctx.quadraticCurveTo(x + size, y, x + size, y + 60); ctx.lineTo(x + size, y + size);
      ctx.closePath();
      ctx.save(); ctx.clip();
      ctx.drawImage(portrait, x, y - 30, size, size + 30);
      ctx.restore();
      ctx.lineWidth = 4; ctx.strokeStyle = '#c9a048'; ctx.stroke();
      ctx.restore();
      if (left) textX = x + size + 40; else textX = px + 60;
      textW = pw - size - 130;
    }

    // Name
    if (sp.name) {
      ctx.font = `700 42px ${FONT_HEAD}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      strokeText(ctx, sp.name + (sp.voice ? '  (Stimme aus dem Kristall)' : ''), textX, py + 70, sp.color);
    }

    // Text
    const full = this._text();
    const shown = full.slice(0, Math.floor(this.chars));
    ctx.font = `${narrator ? 'italic ' : ''}500 44px ${FONT_BODY}`;
    const lines = wrap(ctx, full, textW);
    let shownLeft = shown.length;
    let y = py + (sp.name ? 130 : 100);
    for (const ln of lines) {
      const part = ln.slice(0, Math.max(0, shownLeft));
      shownLeft -= ln.length + 1;
      ctx.fillStyle = narrator ? '#e0d4e8' : '#f4ecf0';
      ctx.fillText(part, textX, y);
      y += 54;
    }

    // Weiter-Hinweis
    if (this.chars >= full.length && !this.choice && !l.choice) {
      const blink = 0.5 + 0.5 * Math.sin(performance.now() / 180);
      ctx.globalAlpha = a * (0.5 + 0.5 * blink);
      drawGlyph(ctx, glyph(this.app.input, 'confirm'), px + pw - 70, py + ph - 50, 48);
      ctx.globalAlpha = a;
    }
    ctx.restore();

    if (this.choice) this._drawChoice(ctx, W, H);
  }

  _drawChoice(ctx, W, H) {
    const opts = this.choice.options;
    const w = 760, h = 150, gap = 30;
    const x = W / 2 - w / 2;
    let y = H / 2 - (opts.length * (h + gap)) / 2 - 80;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, W, H);
    opts.forEach((o, i) => {
      const sel = i === this.choice.sel;
      gothicPanel(ctx, x, y, w, h, { gold: sel ? '#ffd070' : '#6a5a40', top: sel ? 'rgba(80,10,24,0.95)' : 'rgba(26,14,26,0.9)' });
      ctx.textAlign = 'center';
      ctx.font = `700 54px ${FONT_HEAD}`;
      strokeText(ctx, o.label, W / 2, y + 68, sel ? '#ffe0e4' : '#a898a8');
      ctx.font = `500 32px ${FONT_BODY}`;
      ctx.fillStyle = sel ? '#e8d8dc' : '#7a6c7a';
      ctx.fillText(o.desc, W / 2, y + 116);
      y += h + gap;
    });
    ctx.restore();
  }
}
