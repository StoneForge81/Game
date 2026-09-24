// Inventar und Laden – ein Fenster, zwei Betriebsarten:
//   'bag'  : eigene Tränke trinken, Waffen/Rüstungen/Ringe anlegen, Zauber wählen
//   'shop' : bei Mortimer kaufen
//
// Bedienung am Fernseher: ←/→ oder LB/RB wechselt die Kategorie, ↑/↓ wählt,
// A (Enter) führt aus, Y (L) legt im Inventar einen Trank auf die Schnelltaste.

import { FONT_TITLE, FONT_HEAD, FONT_BODY, wrap, strokeText, drawGlyph, gothicPanel, roundRect } from './text.js';
import { glyph } from '../core/input.js';
import { clamp, TAU } from '../core/math.js';
import { WEAPONS, ARMORS, RINGS, CONSUMABLES, SPELLS, CATEGORY, gearStats, knownSpells, owns } from '../data/gear.js';
import { drawHumanoid, makePose, COSTUMES, Cloth, drawLordBlade, solveRig } from '../render/puppet.js';

const TABS = ['item', 'weapon', 'armor', 'ring', 'spell'];

export class InventoryScreen {
  /**
   * @param mode 'bag' | 'shop'
   * @param opts { title, subtitle, onClose }
   */
  constructor(app, game, mode, { title, subtitle = '', onClose }) {
    this.app = app;
    this.game = game;
    this.mode = mode;
    this.title = title;
    this.subtitle = subtitle;
    this.onClose = onClose;
    this.tab = 0;
    this.sel = 0;
    this.scroll = 0;
    this.t = 0;
    this.flash = null;      // { text, color, t }
    this._hold = {};
    this._preview = null;   // zwischengespeicherte Vorschaufigur
  }

  get save() { return this.game.save; }
  get cat() { return TABS[this.tab]; }

  /** Einträge der aktuellen Kategorie. */
  entries() {
    const s = this.save, cat = this.cat;
    const list = CATEGORY[cat].list;
    const tier = s.bossesDefeated.length;
    if (this.mode === 'shop') {
      return Object.entries(list)
        .filter(([id, d]) => d.tier <= tier && d.price > 0 && !(cat === 'spell' && d.ability))
        .map(([id, d]) => ({ id, d }));
    }
    if (cat === 'item') return Object.entries(CONSUMABLES).filter(([id]) => s.inventory[id] > 0).map(([id, d]) => ({ id, d, n: s.inventory[id] }));
    if (cat === 'spell') return knownSpells(s).map((id) => ({ id, d: SPELLS[id] }));
    const own = (s.owned[cat] || []).filter((id) => list[id]).map((id) => ({ id, d: list[id] }));
    if (cat === 'ring' && s.equip.ring) own.push({ id: null, d: { name: 'Ring ablegen', desc: 'Keinen Ring tragen.' } });
    return own;
  }

  _step(input, dt, action) {
    // Gedrückt halten wiederholt (wie in den anderen Menüs)
    if (input.pressed(action)) { this._hold[action] = 0; return true; }
    if (input.down(action)) {
      const b = this._hold[action] ?? 0, n = b + dt;
      this._hold[action] = n;
      if (n > 0.38) return Math.floor((n - 0.38) / 0.09) > Math.floor((b - 0.38) / 0.09);
    }
    return false;
  }

  update(dt) {
    const input = this.app.input, audio = this.app.audio;
    this.t += dt;
    if (this.flash) { this.flash.t += dt; if (this.flash.t > 2.2) this.flash = null; }
    const list = this.entries();
    const left = this._step(input, dt, 'left') || input.pressed('wolfClaw');
    const right = this._step(input, dt, 'right') || input.pressed('dash');
    if (left || right) {
      this.tab = (this.tab + (right ? 1 : -1) + TABS.length) % TABS.length;
      this.sel = 0; this.scroll = 0;
      audio.play('uiMove');
      return;
    }
    if (list.length) {
      if (this._step(input, dt, 'up')) { this.sel = (this.sel - 1 + list.length) % list.length; audio.play('uiMove'); }
      if (this._step(input, dt, 'down')) { this.sel = (this.sel + 1) % list.length; audio.play('uiMove'); }
      this.sel = clamp(this.sel, 0, list.length - 1);
    }
    const cur = list[this.sel];
    if (input.pressed('confirm') && cur) this._activate(cur);
    else if (input.pressed('lance') && cur && this.mode === 'bag' && this.cat === 'item') {
      this.save.quickItem = cur.id;
      audio.play('uiConfirm');
      this._say(`${cur.d.name} liegt auf der Schnelltaste`, '#ffd8a0');
    } else if (input.pressed('cancel') || input.pressed('menu') || (this.mode === 'bag' && input.pressed('inventory'))) {
      audio.play('uiCancel');
      this.onClose();
    }
  }

  _say(text, color = '#ffe0e4') { this.flash = { text, color, t: 0 }; }

  _activate(e) {
    const s = this.save, g = this.game, audio = this.app.audio, p = g.player, cat = this.cat;
    if (this.mode === 'shop') {
      const d = e.d;
      if (cat === 'item' && (s.inventory[e.id] || 0) >= d.max) { audio.play('uiDeny'); this._say(`Mehr als ${d.max} passen nicht in deinen Beutel`, '#c8b8c4'); return; }
      if (cat !== 'item' && owns(s, cat, e.id)) { audio.play('uiDeny'); this._say('Das besitzt du schon', '#c8b8c4'); return; }
      if (s.gold < d.price) { audio.play('uiDeny'); this._say(`Dir fehlen ${d.price - s.gold} Gold`, '#ff8a9a'); return; }
      s.gold -= d.price;
      audio.play('buy');
      if (cat === 'item') s.inventory[e.id] = (s.inventory[e.id] || 0) + 1;
      else if (cat === 'spell') { s.spells.push(e.id); s.spell = e.id; }
      else {
        s.owned[cat].push(e.id);
        s.equip[cat] = e.id;   // Gekauft = gleich angelegt; umziehen geht im Inventar
        p.recalcStats();
      }
      this._say(cat === 'item' ? `${d.name} gekauft` : cat === 'spell' ? `${d.name} gelernt` : `${d.name} gekauft und angelegt`, '#ffe0a0');
      g.onPurchase(e.id, cat);
      return;
    }
    // Inventar
    if (cat === 'item') {
      if (p.useItem(g, e.id)) this._say(`${e.d.name} getrunken`, e.d.color);
    } else if (cat === 'spell') {
      s.spell = e.id; audio.play('uiConfirm');
      this._say(`${e.d.name} ist bereit ({lance})`, '#ffd8a0');
    } else {
      if (s.equip[cat] === e.id) { audio.play('uiDeny'); return; }
      s.equip[cat] = e.id;
      p.recalcStats();
      audio.play('uiConfirm');
      this._say(e.id ? `${e.d.name} angelegt` : 'Ring abgelegt', '#ffd8a0');
    }
  }

  // === Zeichnen =============================================================

  draw(ctx, W, H) {
    const s = this.save, input = this.app.input;
    ctx.save();
    ctx.fillStyle = 'rgba(4,0,6,0.82)';
    ctx.fillRect(0, 0, W, H);
    const x = 110, y = 60, w = W - 220, h = H - 150;
    gothicPanel(ctx, x, y, w, h, { accent: true });

    // Titel und Gold
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = `700 60px ${FONT_TITLE}`;
    strokeText(ctx, this.title, x + 60, y + 90, '#f4e0d0', 'rgba(30,0,8,0.9)', 8);
    if (this.subtitle) {
      ctx.font = `italic 500 28px ${FONT_BODY}`;
      ctx.fillStyle = '#c8a8b0';
      const lines = wrap(ctx, this.subtitle, 900);
      ctx.fillText(lines[0] + (lines.length > 1 ? ' …' : ''), x + 62, y + 128);
    }
    drawCoin(ctx, x + w - 250, y + 72, 20);
    ctx.font = `700 44px ${FONT_HEAD}`;
    strokeText(ctx, `${s.gold}`, x + w - 220, y + 88, '#ffe08a', 'rgba(0,0,0,0.85)', 6);
    ctx.font = `600 22px ${FONT_HEAD}`;
    ctx.fillStyle = '#c9a048';
    ctx.fillText('GOLD', x + w - 220, y + 116);

    // Reiter
    const ty = y + 160;
    let tx = x + 60;
    ctx.font = `700 32px ${FONT_HEAD}`;
    TABS.forEach((c, i) => {
      const label = CATEGORY[c].label;
      const tw = ctx.measureText(label).width + 56;
      const on = i === this.tab;
      ctx.fillStyle = on ? 'rgba(150,16,40,0.8)' : 'rgba(30,16,30,0.8)';
      roundRect(ctx, tx, ty, tw, 58, 12); ctx.fill();
      ctx.strokeStyle = on ? '#ffcf70' : '#6a5070'; ctx.lineWidth = on ? 3 : 2; ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = on ? '#fff4f0' : '#b8a8b4';
      ctx.fillText(label, tx + tw / 2, ty + 30);
      tx += tw + 16;
    });
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = `500 24px ${FONT_BODY}`;
    ctx.fillStyle = '#8a7a88';
    ctx.fillText('‹ ›  Kategorie wechseln', tx + 10, ty + 38);

    // Liste
    const list = this.entries();
    const lx = x + 60, ly = ty + 90, lw = 820, rowH = 84;
    const rows = Math.floor((y + h - 90 - ly) / rowH);
    this.scroll = clamp(this.scroll, this.sel - rows + 1, this.sel);
    this.scroll = clamp(this.scroll, 0, Math.max(0, list.length - rows));
    if (!list.length) {
      ctx.font = `italic 500 32px ${FONT_BODY}`;
      ctx.fillStyle = '#a898a4';
      const empty = this.mode === 'shop' ? 'Mortimer hat davon gerade nichts – schau nach dem nächsten Boss wieder vorbei.'
        : this.cat === 'item' ? 'Keine Tränke. Mortimer, der Händler, verkauft welche.'
        : this.cat === 'spell' ? 'Du kennst noch keinen Zauber. Besiege den ersten Jäger oder kaufe ein Zauberbuch.'
        : 'Noch nichts hier. Mortimer, der Händler, hat einiges im Karren.';
      wrap(ctx, empty, lw - 40).forEach((l, i) => ctx.fillText(l, lx + 20, ly + 50 + i * 44));
    }
    list.forEach((e, i) => {
      if (i < this.scroll || i >= this.scroll + rows) return;
      const ry = ly + (i - this.scroll) * rowH;
      const sel = i === this.sel;
      if (sel) {
        const pulse = 0.75 + 0.25 * Math.sin(this.t * 5);
        ctx.fillStyle = `rgba(150,16,40,${0.55 * pulse})`;
        roundRect(ctx, lx, ry, lw, rowH - 10, 12); ctx.fill();
        ctx.strokeStyle = '#ffcf70'; ctx.lineWidth = 3; ctx.stroke();
      }
      drawIcon(ctx, this.cat, e.id, e.d, lx + 48, ry + (rowH - 10) / 2, 26);
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.font = `600 36px ${FONT_HEAD}`;
      const status = this._status(e);
      ctx.fillStyle = status.dim ? '#7a6a78' : sel ? '#fff4f0' : '#d8c8d4';
      ctx.fillText(e.d.name, lx + 96, ry + (rowH - 10) / 2 + 2);
      ctx.textAlign = 'right';
      ctx.font = `600 30px ${FONT_HEAD}`;
      ctx.fillStyle = status.color;
      ctx.fillText(status.text, lx + lw - 24, ry + (rowH - 10) / 2 + 2);
      if (status.coin) drawCoin(ctx, lx + lw - 24 - ctx.measureText(status.text).width - 22, ry + (rowH - 10) / 2, 12);
    });
    if (this.scroll > 0 || this.scroll + rows < list.length) {
      ctx.fillStyle = '#c9a048'; ctx.textAlign = 'center'; ctx.font = `600 28px ${FONT_HEAD}`;
      if (this.scroll > 0) ctx.fillText('▲', lx + lw + 24, ly + 20);
      if (this.scroll + rows < list.length) ctx.fillText('▼', lx + lw + 24, ly + rows * rowH - 30);
    }

    // Details rechts
    const dx = lx + lw + 70, dw = x + w - 60 - dx;
    const cur = list[this.sel];
    if (cur) this._drawDetail(ctx, cur, dx, ly - 10, dw, y + h - 90 - ly);

    // Meldung
    if (this.flash) {
      const a = clamp(Math.min(this.flash.t * 6, (2.2 - this.flash.t) * 3), 0, 1);
      ctx.globalAlpha = a;
      ctx.font = `700 34px ${FONT_HEAD}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const txt = this.flash.text.replace('{lance}', glyph(input, 'lance'));
      const fw = ctx.measureText(txt).width + 80;
      ctx.fillStyle = 'rgba(20,6,16,0.95)';
      roundRect(ctx, W / 2 - fw / 2, y + h - 70, fw, 60, 30); ctx.fill();
      ctx.strokeStyle = '#c9a048'; ctx.lineWidth = 2; ctx.stroke();
      strokeText(ctx, txt, W / 2, y + h - 38, this.flash.color, 'rgba(0,0,0,0.8)', 5);
      ctx.globalAlpha = 1;
    }

    // Tastenhilfe
    const pairs = [];
    const cur2 = cur;
    if (cur2) {
      if (this.mode === 'shop') pairs.push(['confirm', this.cat === 'spell' ? 'Lernen' : 'Kaufen']);
      else if (this.cat === 'item') pairs.push(['confirm', 'Trinken'], ['lance', 'Auf Schnelltaste']);
      else if (this.cat === 'spell') pairs.push(['confirm', 'Auswählen']);
      else pairs.push(['confirm', 'Anlegen']);
    }
    pairs.push(['cancel', 'Zurück']);
    drawFooterPairs(ctx, W, H, input, pairs);
    ctx.restore();
  }

  _status(e) {
    const s = this.save, cat = this.cat;
    if (this.mode === 'shop') {
      if (cat === 'item') {
        const n = s.inventory[e.id] || 0;
        if (n >= e.d.max) return { text: 'Beutel voll', color: '#7a6a78', dim: true };
        return { text: `${e.d.price}`, color: s.gold >= e.d.price ? '#ffe08a' : '#a05a60', coin: true };
      }
      if (owns(s, cat, e.id)) return { text: 'Besitzt du', color: '#7a6a78', dim: true };
      return { text: `${e.d.price}`, color: s.gold >= e.d.price ? '#ffe08a' : '#a05a60', coin: true };
    }
    if (cat === 'item') return { text: `× ${e.n}${s.quickItem === e.id ? '   ⚡' : ''}`, color: '#ffd8a0' };
    if (cat === 'spell') return { text: s.spell === e.id ? 'Bereit' : `${this.game.player.spellCost(e.id)} Blut`, color: s.spell === e.id ? '#ff8a9a' : '#c8a8b8' };
    if (e.id === null) return { text: '', color: '#fff' };
    return s.equip[cat] === e.id ? { text: 'Angelegt', color: '#ff8a9a' } : { text: '', color: '#fff' };
  }

  _drawDetail(ctx, e, x, y, w, h) {
    const s = this.save, cat = this.cat, d = e.d;
    ctx.save();
    ctx.fillStyle = 'rgba(8,4,10,0.55)';
    roundRect(ctx, x, y, w, h, 16); ctx.fill();
    ctx.strokeStyle = 'rgba(201,160,72,0.5)'; ctx.lineWidth = 2; ctx.stroke();

    // Vorschau: bei Ausrüstung der Fürst selbst, sonst ein großes Symbol
    const py = y + 250;
    if ((cat === 'weapon' || cat === 'armor') && e.id) {
      const eq = { ...s.equip, [cat]: e.id };
      this._drawPreview(ctx, x + w / 2, py + 20, eq);
    } else if (e.id || cat !== 'ring') {
      drawIcon(ctx, cat, e.id, d, x + w / 2, py - 70, 90);
    }

    let ty = y + 330;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = `700 44px ${FONT_TITLE}`;
    strokeText(ctx, d.name, x + w / 2, ty, '#ffe8d8', 'rgba(30,0,8,0.9)', 6);
    ty += 50;
    ctx.font = `500 28px ${FONT_BODY}`;
    ctx.fillStyle = '#d8c8d0';
    for (const l of wrap(ctx, d.desc || '', w - 60)) { ctx.fillText(l, x + w / 2, ty); ty += 36; }
    ty += 12;
    ctx.font = `600 28px ${FONT_HEAD}`;
    for (const [label, val, better] of this._stats(e)) {
      ctx.textAlign = 'left'; ctx.fillStyle = '#b8a8b4';
      ctx.fillText(label, x + 50, ty);
      ctx.textAlign = 'right';
      ctx.fillStyle = better === 1 ? '#8ae890' : better === -1 ? '#ff8a8a' : '#f0e0e8';
      ctx.fillText(val, x + w - 50, ty);
      ty += 38;
    }
    ctx.restore();
  }

  /** Werte-Zeilen mit Vergleich zur angelegten Ausrüstung. */
  _stats(e) {
    const cat = this.cat, d = e.d, s = this.save;
    const pct = (v) => `${Math.round(v * 100)} %`;
    const cmp = (a, b, higherBetter = true) => (a === b ? 0 : (a > b) === higherBetter ? 1 : -1);
    const out = [];
    if (cat === 'weapon') {
      const cur = WEAPONS[s.equip.weapon] || WEAPONS.blutklinge;
      out.push(['Schaden', pct(d.dmg), cmp(d.dmg, cur.dmg)]);
      out.push(['Reichweite', pct(d.reach), cmp(d.reach, cur.reach)]);
      out.push(['Tempo', pct(1 / d.speed), cmp(1 / d.speed, 1 / cur.speed)]);
      out.push(['Kritisch', pct(d.crit), cmp(d.crit, cur.crit)]);
      if (d.lifesteal) out.push(['Lebensraub', pct(d.lifesteal), 1]);
      if (d.heavy) out.push(['Bricht Schilde', 'ja', 1]);
    } else if (cat === 'armor') {
      const cur = ARMORS[s.equip.armor] || ARMORS.fuerstenmantel;
      out.push(['Schutz', pct(d.def), cmp(d.def, cur.def)]);
      if (d.hp) out.push(['Lebenskraft', `+${d.hp}`, 1]);
      if (d.spellPower) out.push(['Zauberkraft', `+${Math.round((d.spellPower - 1) * 100)} %`, 1]);
      if (d.spellCost) out.push(['Zauberkosten', `−${Math.round((1 - d.spellCost) * 100)} %`, 1]);
    } else if (cat === 'spell') {
      out.push(['Kosten', `${this.game.player.spellCost(e.id)} Blut`, 0]);
    } else if (cat === 'item') {
      const n = s.inventory[e.id] || 0;
      out.push(['Im Beutel', `${n} / ${d.max}`, 0]);
    }
    if (this.mode === 'shop') out.push(['Preis', `${d.price} Gold`, s.gold >= d.price ? 0 : -1]);
    return out;
  }

  /** Der Fürst in der gewählten Ausrüstung (zwischengespeichert, weil teuer). */
  _drawPreview(ctx, cx, cy, eq) {
    const key = `${eq.weapon}|${eq.armor}`;
    const scale = 7;
    if (!this._preview || this._preview.key !== key) {
      const size = 560;
      const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(size, size) : Object.assign(document.createElement('canvas'), { width: size, height: size });
      const g = c.getContext('2d');
      const st = gearStats({ equip: eq });
      const costume = { ...COSTUMES.ingomar, ...st.armor.palette, plates: !!st.armor.plates };
      const pose = makePose('attack1', 0, { progress: 0.64 });
      // Umhang einmal einschwingen lassen
      const cape = new Cloth(8, 3.1, 560, 0.07), hair = new Cloth(5, 2.6, 400, 0.12);
      g.setTransform(scale, 0, 0, scale, size / 2, size * 0.86);
      const rig = solveRig(pose);
      for (let i = 0; i < 90; i++) {
        cape.update(1 / 60, rig.neck.x - 1.6, rig.neck.y + 1.2, 0, -60 + Math.sin(i * 0.1) * 40);
        hair.update(1 / 60, rig.head.x - 2.2, rig.head.y - 1, 0, -30);
      }
      drawHumanoid(g, 0, 0, 1, pose, costume, { blade: st.weapon, cape, hair });
      this._preview = { key, canvas: c, size };
    }
    const p = this._preview;
    ctx.drawImage(p.canvas, cx - p.size / 2, cy - p.size * 0.86 + 40, p.size * 0.9, p.size * 0.9);
  }
}

// === Symbole =================================================================

export function drawCoin(ctx, x, y, r) {
  ctx.save();
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r);
  g.addColorStop(0, '#fff2a0'); g.addColorStop(1, '#b88a20');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#5a3a08'; ctx.lineWidth = Math.max(1.5, r * 0.12); ctx.stroke();
  ctx.strokeStyle = 'rgba(90,58,8,0.6)'; ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.beginPath(); ctx.arc(x, y, r * 0.66, 0, TAU); ctx.stroke();
  ctx.restore();
}

/** Symbol für einen Eintrag: Flasche, Klinge, Rüstung, Ring, Zauberbuch. */
export function drawIcon(ctx, cat, id, d, x, y, r) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = 'round';
  const ink = '#140810';
  if (cat === 'item') {
    const col = d.color || '#e8304a';
    ctx.fillStyle = 'rgba(230,220,240,0.9)';
    ctx.beginPath();
    ctx.moveTo(-r * 0.28, -r * 0.9); ctx.lineTo(r * 0.28, -r * 0.9); ctx.lineTo(r * 0.28, -r * 0.45);
    ctx.quadraticCurveTo(r * 0.8, -r * 0.2, r * 0.75, r * 0.35); ctx.quadraticCurveTo(r * 0.7, r * 0.95, 0, r * 0.95);
    ctx.quadraticCurveTo(-r * 0.7, r * 0.95, -r * 0.75, r * 0.35); ctx.quadraticCurveTo(-r * 0.8, -r * 0.2, -r * 0.28, -r * 0.45);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = ink; ctx.lineWidth = Math.max(2, r * 0.1); ctx.stroke();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(0, r * 0.35, r * 0.58, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.ellipse(-r * 0.25, r * 0.15, r * 0.12, r * 0.22, 0.4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#8a6a4a'; ctx.fillRect(-r * 0.22, -r * 1.12, r * 0.44, r * 0.26);
  } else if (cat === 'weapon') {
    ctx.rotate(-Math.PI / 4);
    const s = (r * 1.7) / (d.len + 4);
    ctx.scale(s, s);
    ctx.translate(-d.len / 2 + 2, 0);
    drawLordBlade(ctx, 0, 0, 0, d, 1);
  } else if (cat === 'armor') {
    const pal = { coat: '#33254a', coatShade: '#1a1128', trim: '#e2bd62', ...(d.palette || {}) };
    const body = d.plates ? (pal.plate || pal.coat) : pal.coat;
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-r * 0.9, -r * 0.7); ctx.lineTo(-r * 0.35, -r * 0.9); ctx.quadraticCurveTo(0, -r * 0.6, r * 0.35, -r * 0.9);
    ctx.lineTo(r * 0.9, -r * 0.7); ctx.lineTo(r * 0.75, -r * 0.1); ctx.lineTo(r * 0.55, -r * 0.2); ctx.lineTo(r * 0.6, r * 0.9);
    ctx.lineTo(-r * 0.6, r * 0.9); ctx.lineTo(-r * 0.55, -r * 0.2); ctx.lineTo(-r * 0.75, -r * 0.1); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = ink; ctx.lineWidth = Math.max(2, r * 0.1); ctx.stroke();
    ctx.strokeStyle = pal.trim; ctx.lineWidth = Math.max(1.5, r * 0.08);
    ctx.beginPath(); ctx.moveTo(0, -r * 0.62); ctx.lineTo(0, r * 0.88); ctx.stroke();
  } else if (cat === 'ring') {
    if (!id) { ctx.strokeStyle = '#6a5a68'; ctx.lineWidth = r * 0.14; ctx.beginPath(); ctx.arc(0, r * 0.1, r * 0.6, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-r * 0.7, -r * 0.6); ctx.lineTo(r * 0.7, r * 0.8); ctx.stroke(); ctx.restore(); return; }
    ctx.strokeStyle = '#e8c050'; ctx.lineWidth = r * 0.22;
    ctx.beginPath(); ctx.arc(0, r * 0.2, r * 0.6, 0, TAU); ctx.stroke();
    ctx.fillStyle = d.color;
    ctx.beginPath(); ctx.moveTo(0, -r * 0.95); ctx.lineTo(r * 0.4, -r * 0.5); ctx.lineTo(0, -r * 0.2); ctx.lineTo(-r * 0.4, -r * 0.5); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1.5, r * 0.07); ctx.stroke();
  } else if (cat === 'spell') {
    // Zauberbuch mit Siegel in der Farbe des Zaubers
    ctx.fillStyle = '#3a1420';
    roundRect(ctx, -r * 0.75, -r * 0.9, r * 1.5, r * 1.8, r * 0.12); ctx.fill();
    ctx.strokeStyle = ink; ctx.lineWidth = Math.max(2, r * 0.1); ctx.stroke();
    ctx.fillStyle = '#f0e4c8'; ctx.fillRect(r * 0.55, -r * 0.8, r * 0.14, r * 1.6);
    ctx.fillStyle = d.color;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.42, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#e2bd62'; ctx.lineWidth = Math.max(1.5, r * 0.07);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}

function drawFooterPairs(ctx, W, H, input, pairs) {
  ctx.save();
  ctx.font = `600 30px ${FONT_HEAD}`;
  ctx.textBaseline = 'middle';
  let total = 0;
  const widths = pairs.map(([, l]) => { const w = ctx.measureText(l).width + 90; total += w + 30; return w; });
  let x = W / 2 - total / 2;
  pairs.forEach(([a, l], i) => {
    const gw = drawGlyph(ctx, glyph(input, a), x + 24, H - 50, 44);
    ctx.textAlign = 'left';
    strokeText(ctx, l, x + gw / 2 + 36, H - 48, '#e0d4dc', 'rgba(0,0,0,0.85)', 5);
    x += widths[i] + 30;
  });
  ctx.restore();
}
