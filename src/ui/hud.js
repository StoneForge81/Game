// Anzeige im Spiel: Lebenskraft, Blut, Macht, Fähigkeiten, Bossleiste,
// Aufforderungen, Henrys Sprechblasen, Gebietstitel und Meldungen.
// Alles in 1920×1080-Einheiten, große Schrift für den Fernseher.

import { FONT_TITLE, FONT_HEAD, FONT_BODY, wrap, strokeText, drawGlyph, gothicPanel, roundRect, formatGlyphs } from './text.js';
import { glyph } from '../core/input.js';
import { clamp, damp, TAU } from '../core/math.js';
import { ABILITY_INFO } from '../data/zones.js';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

export class HUD {
  constructor(app) {
    this.app = app;
    this.toasts = [];
    this.title = null;       // { name, sub, t }
    this.banner = null;      // { title, desc, t }
    this.bloodFlash = 0;
    this.hpShown = 1;        // weich nachgezogene Anzeige
    this.hpLag = 1;          // "Schadensspur" (heller Rest, der langsam schrumpft)
    this.bloodShown = 0;
    this.bossShown = 1;
    this.bossLag = 1;
  }

  notify(text, sub = '', color = '#ffd8dc') {
    this.toasts.push({ text, sub, color, t: 0 });
    if (this.toasts.length > 4) this.toasts.shift();
  }

  zoneTitle(name, sub) { this.title = { name, sub, t: 0 }; }
  showBanner(title, desc) { this.banner = { title, desc, t: 0 }; }
  flashBlood() { this.bloodFlash = 1; }

  update(dt, game) {
    const p = game.player;
    if (p) {
      const hp = clamp(p.hp / p.maxHp, 0, 1);
      this.hpShown = damp(this.hpShown, hp, 0.05, dt);
      if (hp > this.hpLag) this.hpLag = hp;
      else this.hpLag = damp(this.hpLag, hp, 0.35, dt);
      this.bloodShown = damp(this.bloodShown, clamp(p.blood / p.maxBlood, 0, 1), 0.06, dt);
    }
    if (game.boss) {
      const b = clamp(game.boss.hp / game.boss.maxHp, 0, 1);
      this.bossShown = damp(this.bossShown, b, 0.05, dt);
      if (b > this.bossLag) this.bossLag = b; else this.bossLag = damp(this.bossLag, b, 0.4, dt);
    }
    for (const t of this.toasts) t.t += dt;
    this.toasts = this.toasts.filter((t) => t.t < 4);
    if (this.title) { this.title.t += dt; if (this.title.t > 5) this.title = null; }
    if (this.banner) { this.banner.t += dt; if (this.banner.t > 5) this.banner = null; }
    this.bloodFlash = Math.max(0, this.bloodFlash - dt * 2);
  }

  draw(ctx, W, H, game) {
    const p = game.player;
    if (!p) return;
    const inset = 60;

    if (!game.cutscene) {
      this._drawBars(ctx, inset, inset, p, game);
      this._drawAbilities(ctx, inset, inset + 190, p);
    }
    if (game.boss && game.boss.state !== 'wait' && game.boss.state !== 'dead') this._drawBoss(ctx, W, H, game.boss);
    this._drawPrompt(ctx, game);
    this._drawBubble(ctx, game);
    this._drawToasts(ctx, W);
    if (this.title) this._drawTitle(ctx, W, H);
    if (this.banner) this._drawBanner(ctx, W, H);
  }

  // --- Lebenskraft und Blut --------------------------------------------------

  _drawBars(ctx, x, y, p, game) {
    const save = game.save;
    // Medaillon mit Machtstufe
    ctx.save();
    const mx = x + 60, my = y + 70;
    const g = ctx.createRadialGradient(mx - 10, my - 10, 5, mx, my, 62);
    g.addColorStop(0, '#6a1022'); g.addColorStop(1, '#1a0408');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(mx, my, 58, 0, TAU); ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = '#c9a048'; ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(201,160,72,0.5)';
    ctx.beginPath(); ctx.arc(mx, my, 48, 0, TAU); ctx.stroke();
    ctx.font = `700 46px ${FONT_TITLE}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    strokeText(ctx, ROMAN[Math.min(ROMAN.length - 1, save.power - 1)], mx, my + 2, '#ffd8a0');
    ctx.font = `600 18px ${FONT_HEAD}`;
    ctx.fillStyle = '#c9a048';
    ctx.fillText('MACHT', mx, my + 80);

    // Lebenskraft
    const bx = x + 135, bw = 540 * Math.min(1.6, p.maxHp / 100) ** 0.5;
    this._bar(ctx, bx, y + 22, bw, 40, this.hpShown, this.hpLag, ['#e8304a', '#8a0a1e'], 'LEBENSKRAFT', `${Math.max(0, Math.ceil(p.hp))} / ${p.maxHp}`);
    // Blut
    const bw2 = 440 * Math.min(1.6, p.maxBlood / 60) ** 0.5;
    const low = p.blood < 12;
    this._bar(ctx, bx, y + 92, bw2, 30, this.bloodShown, this.bloodShown, low ? ['#ff6080', '#6a0a2a'] : ['#b01848', '#40061a'], 'BLUT', `${Math.floor(p.blood)} / ${p.maxBlood}`, this.bloodFlash);

    // Herzsplitter und Kelche
    ctx.font = `600 26px ${FONT_HEAD}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const sy = y + 150;
    drawHeart(ctx, bx + 14, sy, 13);
    strokeText(ctx, `${save.heartShards % 4}/4`, bx + 36, sy + 2, '#ffc0cc', 'rgba(0,0,0,0.8)', 5);
    drawChalice(ctx, bx + 124, sy, 13);
    strokeText(ctx, `${save.chalices % 4}/4`, bx + 146, sy + 2, '#ffe0a0', 'rgba(0,0,0,0.8)', 5);
    ctx.restore();
  }

  _bar(ctx, x, y, w, h, v, lag, [c0, c1], label, value, flash = 0) {
    ctx.save();
    // Rahmen
    ctx.fillStyle = 'rgba(8,4,10,0.85)';
    roundRect(ctx, x - 4, y - 4, w + 8, h + 8, 8); ctx.fill();
    ctx.strokeStyle = '#c9a048'; ctx.lineWidth = 3;
    roundRect(ctx, x - 4, y - 4, w + 8, h + 8, 8); ctx.stroke();
    // Schadensspur
    ctx.fillStyle = 'rgba(255,230,230,0.55)';
    ctx.fillRect(x, y, w * lag, h);
    // Füllung
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, c0); g.addColorStop(1, c1);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w * v, h);
    // Glanz
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x, y + 3, w * v, h * 0.22);
    if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash * 0.6})`; ctx.fillRect(x, y, w, h); }
    // Beschriftung
    ctx.font = `700 ${Math.round(h * 0.55)}px ${FONT_HEAD}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    strokeText(ctx, label, x + 12, y + h / 2 + 1, '#fff0f2', 'rgba(0,0,0,0.75)', 5);
    ctx.textAlign = 'right';
    strokeText(ctx, value, x + w - 12, y + h / 2 + 1, '#fff0f2', 'rgba(0,0,0,0.75)', 5);
    ctx.restore();
  }

  _drawAbilities(ctx, x, y, p) {
    const list = [];
    if (p.abilities.lance) list.push(['lance', 'Lanze']);
    if (p.abilities.wolf) list.push(['wolfClaw', 'Klaue']);
    if (p.abilities.mist) list.push(['dash', 'Nebel']);
    else list.push(['dash', 'Ausweichen']);
    list.push(['drain', 'Trinken']);
    ctx.save();
    ctx.font = `600 24px ${FONT_HEAD}`;
    ctx.textBaseline = 'middle';
    let cx = x + 10;
    for (const [action, name] of list) {
      const gw = drawGlyph(ctx, glyph(this.app.input, action), cx + 22, y + 22, 40);
      ctx.textAlign = 'left';
      strokeText(ctx, name, cx + gw / 2 + 30, y + 23, '#e8dce4', 'rgba(0,0,0,0.8)', 5);
      cx += gw + ctx.measureText(name).width + 60;
    }
    ctx.restore();
  }

  // --- Boss --------------------------------------------------------------------

  _drawBoss(ctx, W, H, boss) {
    const w = 1100, h = 30, x = W / 2 - w / 2, y = H - 120;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `700 44px ${FONT_TITLE}`;
    strokeText(ctx, boss.info.name, W / 2, y - 48, '#ffe8c0');
    ctx.font = `500 26px ${FONT_BODY}`;
    strokeText(ctx, boss.info.title, W / 2, y - 16, '#c9a8a0', 'rgba(0,0,0,0.8)', 5);
    ctx.fillStyle = 'rgba(8,4,10,0.9)';
    roundRect(ctx, x - 6, y - 2, w + 12, h + 12, 6); ctx.fill();
    ctx.strokeStyle = '#c9a048'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = 'rgba(255,240,220,0.6)';
    ctx.fillRect(x, y + 4, w * this.bossLag, h);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, boss.phase === 2 ? '#ffe070' : '#f0e0c0'); g.addColorStop(1, boss.phase === 2 ? '#a07010' : '#8a7a60');
    ctx.fillStyle = g;
    ctx.fillRect(x, y + 4, w * this.bossShown, h);
    // Markierung bei 50 % (Phase 2)
    ctx.fillStyle = '#b01330';
    ctx.fillRect(x + w / 2 - 2, y, 4, h + 8);
    ctx.restore();
  }

  // --- Aufforderungen und Sprechblasen ----------------------------------------

  _drawPrompt(ctx, game) {
    if (game.cutscene || game.dialogue.active) return;
    const p = game.player;
    let target = null, label = '';
    if (p.drainCandidate) { target = p.drainCandidate; label = 'Trinken'; }
    else if (p.interactTarget) { target = p.interactTarget; label = p.interactTarget.prompt; }
    if (!target) return;
    const pos = game.renderer.worldToUI(target.x, target.y - (target.h || 20) - 30);
    const bob = Math.sin(performance.now() / 200) * 5;
    ctx.save();
    ctx.font = `700 34px ${FONT_HEAD}`;
    const tw = ctx.measureText(label).width;
    const w = tw + 100, h = 64;
    ctx.fillStyle = 'rgba(10,4,12,0.85)';
    roundRect(ctx, pos.x - w / 2, pos.y - h / 2 + bob, w, h, 32); ctx.fill();
    ctx.strokeStyle = label === 'Trinken' ? '#ff3050' : '#c9a048'; ctx.lineWidth = 3; ctx.stroke();
    drawGlyph(ctx, glyph(this.app.input, 'drain'), pos.x - w / 2 + 38, pos.y + bob, 46);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    strokeText(ctx, label, pos.x - w / 2 + 72, pos.y + bob + 2, label === 'Trinken' ? '#ffb0bc' : '#fff0e0', 'rgba(0,0,0,0.8)', 5);
    ctx.restore();
  }

  _drawBubble(ctx, game) {
    const h = game.henry;
    if (!h || !h.bubble || game.dialogue.active) return;
    const b = h.bubble;
    const a = clamp(Math.min(b.t * 5, (b.dur - b.t) * 3), 0, 1);
    const pos = game.renderer.worldToUI(h.x, h.y - 16);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = `600 32px ${FONT_BODY}`;
    const text = formatGlyphs(b.text, this.app.input);
    const lines = wrap(ctx, text, 520);
    const w = Math.min(600, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 60);
    const bh = lines.length * 40 + 64;
    const x = clamp(pos.x - w / 2, 40, 1920 - w - 40);
    // Bevorzugt über der Fledermaus – außer das würde die Anzeige oben links verdecken.
    let y = pos.y - bh - 30;
    const hitsHud = x < 780 && y < 330;
    const below = hitsHud || y < 30;
    if (below) y = pos.y + 36;
    y = clamp(y, 30, 1080 - bh - 30);
    ctx.fillStyle = 'rgba(250,240,244,0.96)';
    roundRect(ctx, x, y, w, bh, 22); ctx.fill();
    ctx.strokeStyle = '#6a1a2a'; ctx.lineWidth = 3; ctx.stroke();
    // Zipfel zur Fledermaus
    ctx.fillStyle = 'rgba(250,240,244,0.96)';
    const tx = clamp(pos.x, x + 30, x + w - 30);
    ctx.beginPath();
    if (below) { ctx.moveTo(tx - 14, y + 2); ctx.lineTo(tx + 14, y + 2); ctx.lineTo(tx, y - 22); }
    else { ctx.moveTo(tx - 14, y + bh - 2); ctx.lineTo(tx + 14, y + bh - 2); ctx.lineTo(tx, y + bh + 22); }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#8a1a2e';
    ctx.font = `700 24px ${FONT_HEAD}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('Henry', x + 26, y + 34);
    ctx.font = `600 32px ${FONT_BODY}`;
    ctx.fillStyle = '#2a1420';
    lines.forEach((l, i) => ctx.fillText(l, x + 26, y + 74 + i * 40));
    ctx.restore();
  }

  _drawToasts(ctx, W) {
    ctx.save();
    let y = 90;
    for (const t of this.toasts) {
      const a = clamp(Math.min(t.t * 4, (4 - t.t) * 2), 0, 1);
      ctx.globalAlpha = a;
      ctx.font = `700 36px ${FONT_HEAD}`;
      const tw = Math.max(ctx.measureText(t.text).width, 200);
      const w = tw + 90, h = t.sub ? 100 : 66;
      const x = W - w - 60 + (1 - a) * 60;
      gothicPanel(ctx, x, y, w, h, {});
      ctx.textAlign = 'center';
      strokeText(ctx, t.text, x + w / 2, y + 46, t.color, 'rgba(0,0,0,0.8)', 5);
      if (t.sub) {
        ctx.font = `500 26px ${FONT_BODY}`;
        ctx.fillStyle = '#c8b8c4';
        ctx.fillText(t.sub, x + w / 2, y + 80);
      }
      y += h + 16;
    }
    ctx.restore();
  }

  _drawTitle(ctx, W, H) {
    const t = this.title.t;
    const a = clamp(Math.min((t - 0.3) * 1.5, (5 - t) * 1.2), 0, 1);
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    const ty = H * 0.3;
    const g = ctx.createLinearGradient(0, ty - 130, 0, ty + 130);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, ty - 130, W, 260);
    ctx.textAlign = 'center';
    ctx.font = `700 96px ${FONT_TITLE}`;
    strokeText(ctx, this.title.name, W / 2, ty, '#f4e0d0', 'rgba(20,0,6,0.9)', 10);
    ctx.font = `italic 500 40px ${FONT_BODY}`;
    strokeText(ctx, this.title.sub, W / 2, ty + 64, '#d8b0b8', 'rgba(0,0,0,0.85)', 6);
    // Zierlinie
    ctx.strokeStyle = '#c9a048'; ctx.lineWidth = 2;
    const lw = 400 * clamp(t - 0.3, 0, 1);
    ctx.beginPath(); ctx.moveTo(W / 2 - lw, ty + 90); ctx.lineTo(W / 2 + lw, ty + 90); ctx.stroke();
    ctx.restore();
  }

  _drawBanner(ctx, W, H) {
    const t = this.banner.t;
    const a = clamp(Math.min(t * 2, (5 - t) * 1.5), 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, W, H);
    const w = 1100, h = 300, x = W / 2 - w / 2, y = H / 2 - h / 2 - 40;
    gothicPanel(ctx, x, y, w, h, { accent: true, top: 'rgba(60,6,20,0.95)', bottom: 'rgba(20,2,8,0.97)' });
    ctx.textAlign = 'center';
    ctx.font = `600 30px ${FONT_HEAD}`;
    ctx.fillStyle = '#c9a048';
    ctx.fillText('NEUE KRAFT ERWACHT', W / 2, y + 70);
    ctx.font = `700 76px ${FONT_TITLE}`;
    strokeText(ctx, this.banner.title, W / 2, y + 150, '#ffe0e4', 'rgba(40,0,10,0.9)', 8);
    ctx.font = `500 34px ${FONT_BODY}`;
    ctx.fillStyle = '#e8d8dc';
    const lines = wrap(ctx, formatGlyphs(this.banner.desc, this.app.input), w - 140);
    lines.forEach((l, i) => ctx.fillText(l, W / 2, y + 210 + i * 42));
    ctx.restore();
  }
}

export function drawHeart(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#e02848';
  ctx.beginPath();
  ctx.moveTo(0, s * 0.8);
  ctx.bezierCurveTo(-s * 1.2, -s * 0.1, -s * 0.6, -s * 1.1, 0, -s * 0.4);
  ctx.bezierCurveTo(s * 0.6, -s * 1.1, s * 1.2, -s * 0.1, 0, s * 0.8);
  ctx.fill();
  ctx.strokeStyle = '#1a0408'; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
}

export function drawChalice(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#e8c050';
  ctx.beginPath();
  ctx.moveTo(-s * 0.8, -s * 0.9); ctx.lineTo(s * 0.8, -s * 0.9); ctx.quadraticCurveTo(s * 0.7, 0, s * 0.15, s * 0.2);
  ctx.lineTo(s * 0.15, s * 0.6); ctx.lineTo(s * 0.6, s * 0.9); ctx.lineTo(-s * 0.6, s * 0.9); ctx.lineTo(-s * 0.15, s * 0.6); ctx.lineTo(-s * 0.15, s * 0.2);
  ctx.quadraticCurveTo(-s * 0.7, 0, -s * 0.8, -s * 0.9);
  ctx.fill();
  ctx.strokeStyle = '#1a0e04'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#c01030'; ctx.fillRect(-s * 0.7, -s * 0.9, s * 1.4, s * 0.3);
  ctx.restore();
}

export { ABILITY_INFO };
