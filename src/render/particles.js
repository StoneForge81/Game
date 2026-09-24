// Partikelsystem mit fester Obergrenze und Objekt-Pool (kein Müll für den GC –
// auf schwachen TV-Browsern sind GC-Pausen sonst als Ruckler sichtbar).
//
// Blut ist etwas Besonderes: Tropfen, die den Boden treffen, werden zu
// Flecken, die liegen bleiben. Nach einem harten Kampf sieht man, was passiert ist.

import { TAU, clamp, makeRng } from '../core/math.js';
import { makeCanvas, withAlpha } from './renderer.js';

const MAX = 1800;
const MAX_DECALS = 420;

export class Particles {
  constructor() {
    this.pool = [];
    for (let i = 0; i < MAX; i++) this.pool.push({ alive: false });
    this.count = 0;
    this.decals = [];
    this.texts = [];
    this.rng = makeRng(4242);
    this._soft = new Map();
    // Abfrage "ist hier fester Boden?" – setzt die Welt.
    this.isSolidAt = null;
  }

  clear() {
    for (const p of this.pool) p.alive = false;
    this.count = 0;
    this.decals.length = 0;
    this.texts.length = 0;
  }

  /** Einen freien Partikel holen. Ist alles voll, wird der älteste überschrieben. */
  _alloc() {
    for (let i = 0; i < MAX; i++) {
      const idx = (this._cursor = ((this._cursor || 0) + 1) % MAX);
      const p = this.pool[idx];
      if (!p.alive) return p;
    }
    return this.pool[(this._cursor = ((this._cursor || 0) + 1) % MAX)];
  }

  spawn(o) {
    const p = this._alloc();
    p.alive = true;
    p.kind = o.kind || 'dust';
    p.x = o.x; p.y = o.y;
    p.vx = o.vx || 0; p.vy = o.vy || 0;
    p.life = p.maxLife = o.life ?? 0.6;
    p.size = o.size ?? 2;
    p.size1 = o.size1 ?? p.size;
    p.color = o.color || '#fff';
    p.gravity = o.gravity ?? 0;
    p.drag = o.drag ?? 0;
    p.rot = o.rot ?? 0;
    p.vr = o.vr ?? 0;
    p.emissive = !!o.emissive;
    p.alpha = o.alpha ?? 1;
    p.bounce = o.bounce ?? 0;
    p.stick = !!o.stick;
    p.w = o.w ?? 0;
    p.h = o.h ?? 0;
    p.seed = this.rng.next() * 100;
    return p;
  }

  // --- Voreinstellungen ----------------------------------------------------

  /** Blutspritzer in Richtung `dir` (Bogenmaß). Tropfen werden zu Bodenflecken. */
  blood(x, y, dir = -Math.PI / 2, amount = 14, force = 220) {
    const r = this.rng;
    for (let i = 0; i < amount; i++) {
      const a = dir + r.range(-0.75, 0.75);
      const sp = r.range(0.25, 1) * force;
      this.spawn({
        kind: 'blood', x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - r.range(20, 90),
        life: r.range(0.5, 1.1), size: r.range(1, 2.6), size1: 0.8,
        color: r.pick(['#8a0612', '#b0101c', '#6a030c', '#c8182a']),
        gravity: 900, drag: 0.4, stick: true,
      });
    }
    // Feiner Nebel dazu, damit der Treffer "platzt".
    for (let i = 0; i < amount / 3; i++) {
      this.spawn({
        kind: 'soft', x: x + r.range(-4, 4), y: y + r.range(-4, 4),
        vx: Math.cos(dir) * r.range(10, 60), vy: r.range(-30, 10),
        life: r.range(0.3, 0.55), size: r.range(4, 7), size1: r.range(9, 14),
        color: '#7a0010', alpha: 0.45, drag: 2,
      });
    }
  }

  /** Blutstrom beim Aussaugen: vom Opfer zum Mund des Vampirs, leuchtend. */
  bloodStream(fromX, fromY, toX, toY, count = 3) {
    const r = this.rng;
    for (let i = 0; i < count; i++) {
      const t = r.range(0.35, 0.6);
      const mx = (fromX + toX) / 2 + r.range(-18, 18);
      const my = Math.min(fromY, toY) - r.range(10, 34);
      const sx = fromX + r.range(-5, 5);
      const sy = fromY + r.range(-8, 4);
      const p = this.spawn({
        kind: 'stream', x: sx, y: sy,
        life: t, size: r.range(1.6, 3), size1: 1,
        color: r.pick(['#ff2238', '#d0102a', '#ff4a5a']),
        emissive: true,
        // Ziel (w,h) und Kontrollpunkt (vx,vy) einer quadratischen Bezierkurve.
        w: toX, h: toY, vx: mx, vy: my,
      });
      p.sx = sx;
      p.sy = sy;
    }
  }

  sparks(x, y, color = '#ffd27a', amount = 10, force = 260, dir = null) {
    const r = this.rng;
    for (let i = 0; i < amount; i++) {
      const a = dir == null ? r.range(0, TAU) : dir + r.range(-0.9, 0.9);
      const sp = r.range(0.3, 1) * force;
      this.spawn({
        kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: r.range(0.18, 0.42), size: r.range(1, 2.2), size1: 0.3,
        color, emissive: true, gravity: 500, drag: 1.4,
      });
    }
  }

  embers(x, y, color = '#ff8a3a', amount = 1, spread = 6) {
    const r = this.rng;
    for (let i = 0; i < amount; i++) {
      this.spawn({
        kind: 'ember', x: x + r.range(-spread, spread), y: y + r.range(-2, 2),
        vx: r.range(-12, 12), vy: r.range(-55, -20),
        life: r.range(0.8, 1.8), size: r.range(0.8, 1.8), size1: 0.2,
        color, emissive: true, gravity: -8, drag: 0.6,
      });
    }
  }

  dust(x, y, amount = 6, color = '#7d7488', dir = 0, force = 60) {
    const r = this.rng;
    for (let i = 0; i < amount; i++) {
      const a = dir + r.range(-1.2, 1.2) - Math.PI / 2 * (dir === 0 ? 1 : 0);
      this.spawn({
        kind: 'soft', x: x + r.range(-6, 6), y: y + r.range(-2, 1),
        vx: Math.cos(a) * r.range(0.2, 1) * force, vy: -r.range(5, 35),
        life: r.range(0.35, 0.8), size: r.range(2.5, 4), size1: r.range(7, 11),
        color, alpha: 0.32, drag: 2.6,
      });
    }
  }

  /** Nebel für den Nebelschritt – groß, weich, dunkelrot-violett. */
  mist(x, y, amount = 8, color = '#5a2a55') {
    const r = this.rng;
    for (let i = 0; i < amount; i++) {
      this.spawn({
        kind: 'soft', x: x + r.range(-10, 10), y: y + r.range(-16, 12),
        vx: r.range(-30, 30), vy: r.range(-24, 8),
        life: r.range(0.5, 1.0), size: r.range(6, 10), size1: r.range(14, 22),
        color, alpha: 0.5, drag: 1.8,
      });
    }
  }

  /** Kleine Fledermäuse, die davonflattern – beim Verwandeln oder als Effekt. */
  bats(x, y, amount = 6, spread = 1) {
    const r = this.rng;
    for (let i = 0; i < amount; i++) {
      const a = r.range(-Math.PI * 0.95, -Math.PI * 0.05);
      const sp = r.range(70, 190) * spread;
      this.spawn({
        kind: 'bat', x: x + r.range(-6, 6), y: y + r.range(-8, 6),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: r.range(0.6, 1.3), size: r.range(3, 5), size1: r.range(2, 3.5),
        color: '#120912', gravity: -40, drag: 0.5,
      });
    }
  }

  holy(x, y, amount = 6, color = '#fff2b0') {
    const r = this.rng;
    for (let i = 0; i < amount; i++) {
      this.spawn({
        kind: 'mote', x: x + r.range(-10, 10), y: y + r.range(-10, 10),
        vx: r.range(-18, 18), vy: r.range(-40, -8),
        life: r.range(0.6, 1.4), size: r.range(0.8, 2), size1: 0.2,
        color, emissive: true, drag: 0.8,
      });
    }
  }

  /** Brocken von Stein, Knochen oder Holz – drehen sich und prallen ab. */
  debris(x, y, color = '#5b5566', amount = 8, force = 240) {
    const r = this.rng;
    for (let i = 0; i < amount; i++) {
      const a = r.range(-Math.PI, 0);
      const sp = r.range(0.3, 1) * force;
      this.spawn({
        kind: 'chunk', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: r.range(0.8, 1.6), size: r.range(1.6, 4), size1: r.range(1.2, 3),
        color, gravity: 1100, drag: 0.2, rot: r.range(0, TAU), vr: r.range(-14, 14),
        bounce: 0.4,
      });
    }
  }

  /** Ausbreitende Schockwelle. */
  ring(x, y, color = '#ff3a4a', r0 = 4, r1 = 48, life = 0.35) {
    this.spawn({ kind: 'ring', x, y, life, size: r0, size1: r1, color, emissive: true });
  }

  /** Aufsteigende Schadenszahl. */
  number(x, y, value, color = '#ffffff', crit = false) {
    this.texts.push({
      x, y, vy: -70, life: 0.9, maxLife: 0.9, text: String(value), color, crit,
      vx: this.rng.range(-20, 20),
    });
    if (this.texts.length > 40) this.texts.shift();
  }

  // --- Simulation ----------------------------------------------------------

  update(dt) {
    let alive = 0;
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; continue; }
      alive++;

      if (p.kind === 'stream') continue; // Position wird aus der Kurve berechnet

      p.vy += p.gravity * dt;
      if (p.drag) {
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k; p.vy *= k;
      }
      const nx = p.x + p.vx * dt;
      const ny = p.y + p.vy * dt;

      if ((p.stick || p.bounce) && this.isSolidAt && this.isSolidAt(nx, ny)) {
        if (p.stick) {
          this._decal(p);
          p.alive = false;
          continue;
        }
        // Abprallen: vertikal umkehren und bremsen.
        p.vy = -p.vy * p.bounce;
        p.vx *= 0.7;
        p.vr *= 0.6;
        if (Math.abs(p.vy) < 30) p.vy = 0;
      } else {
        p.x = nx;
        p.y = ny;
      }
      p.rot += p.vr * dt;
    }
    this.count = alive;

    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.y += t.vy * dt;
      t.x += t.vx * dt;
      t.vy += 160 * dt;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
  }

  _decal(p) {
    const r = this.rng;
    this.decals.push({
      x: p.x, y: p.y,
      w: r.range(2, 5) * (p.size / 1.6),
      h: r.range(0.8, 1.6),
      color: p.color,
      a: r.range(0.55, 0.9),
    });
    if (this.decals.length > MAX_DECALS) this.decals.shift();
  }

  // --- Zeichnen ------------------------------------------------------------

  /** Weiche Kreisscheibe als vorberechnetes Bild – schnell und hübsch. */
  _softSprite(color) {
    let s = this._soft.get(color);
    if (s) return s;
    const size = 32;
    s = makeCanvas(size, size);
    const c = s.getContext('2d');
    const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, withAlpha(color, 1));
    g.addColorStop(0.5, withAlpha(color, 0.66));
    g.addColorStop(1, withAlpha(color, 0));
    c.fillStyle = g;
    c.fillRect(0, 0, size, size);
    this._soft.set(color, s);
    return s;
  }

  drawDecals(ctx, view) {
    for (const d of this.decals) {
      if (d.x < view.x - 10 || d.x > view.x + view.w + 10 || d.y < view.y - 10 || d.y > view.y + view.h + 10) continue;
      ctx.globalAlpha = d.a;
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, d.w, d.h, 0, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Nicht leuchtende Partikel (vor dem Lichtdurchgang zeichnen). */
  drawNormal(ctx, view) {
    for (const p of this.pool) {
      if (!p.alive || p.emissive) continue;
      if (p.x < view.x - 30 || p.x > view.x + view.w + 30 || p.y < view.y - 30 || p.y > view.y + view.h + 30) continue;
      const t = 1 - p.life / p.maxLife;
      const size = p.size + (p.size1 - p.size) * t;
      const a = p.alpha * (1 - t * t);
      ctx.globalAlpha = clamp(a, 0, 1);

      switch (p.kind) {
        case 'blood':
          ctx.fillStyle = p.color;
          ctx.beginPath();
          // Tropfen strecken sich in Flugrichtung.
          ctx.ellipse(p.x, p.y, size, size * 0.8 + Math.min(2.5, Math.abs(p.vy) * 0.006), Math.atan2(p.vy, p.vx), 0, TAU);
          ctx.fill();
          break;
        case 'soft': {
          const spr = this._softSprite(p.color);
          ctx.drawImage(spr, p.x - size, p.y - size, size * 2, size * 2);
          break;
        }
        case 'chunk':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-size / 2, -size / 2, size, size * 0.7);
          ctx.restore();
          break;
        case 'bat':
          drawTinyBat(ctx, p.x, p.y, size, p.seed + (p.maxLife - p.life) * 22, p.color, p.vx);
          break;
        case 'rain':
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02);
          ctx.stroke();
          break;
        default:
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Leuchtende Partikel (im Emissive-Durchgang zeichnen). */
  drawEmissive(ctx, view, isGlow) {
    for (const p of this.pool) {
      if (!p.alive || !p.emissive) continue;
      const t = 1 - p.life / p.maxLife;
      let x = p.x, y = p.y;
      if (p.kind === 'stream') {
        // Quadratische Bezierkurve von der Quelle zum Mund – der Blutbogen.
        const e = t * t * (3 - 2 * t);
        const u = 1 - e;
        x = u * u * p.sx + 2 * u * e * p.vx + e * e * p.w;
        y = u * u * p.sy + 2 * u * e * p.vy + e * e * p.h;
      }
      if (x < view.x - 40 || x > view.x + view.w + 40 || y < view.y - 40 || y > view.y + view.h + 40) continue;
      const size = p.size + (p.size1 - p.size) * t;
      let a = p.alpha * (1 - t);
      if (p.kind === 'ember' || p.kind === 'mote') a *= 0.6 + 0.4 * Math.sin(p.seed + t * 30);
      ctx.globalAlpha = clamp(a, 0, 1);

      if (p.kind === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(0.5, (1 - t) * 3 * (isGlow ? 2 : 1));
        ctx.beginPath();
        ctx.arc(x, y, size, 0, TAU);
        ctx.stroke();
        continue;
      }
      if (p.kind === 'spark') {
        // Funken als kurze Striche in Flugrichtung.
        ctx.strokeStyle = p.color;
        ctx.lineWidth = size * (isGlow ? 2 : 1);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - p.vx * 0.025, y - p.vy * 0.025);
        ctx.stroke();
        continue;
      }
      ctx.fillStyle = p.color;
      const s = isGlow ? size * 2.2 : size;
      ctx.beginPath();
      ctx.arc(x, y, s, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Schadenszahlen in Weltkoordinaten. */
  drawTexts(ctx) {
    for (const t of this.texts) {
      const k = t.life / t.maxLife;
      const pop = t.crit ? 1 + Math.max(0, (k - 0.75) * 2.4) : 1;
      ctx.globalAlpha = clamp(k * 1.8, 0, 1);
      ctx.font = `${t.crit ? 900 : 700} ${Math.round((t.crit ? 13 : 10) * pop)}px Cinzel, Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }
}

/** Winzige Fledermaus mit schlagenden Flügeln. Auch für Deko und HUD. */
export function drawTinyBat(ctx, x, y, s, phase, color = '#120912', vx = 1) {
  const flap = Math.sin(phase) * 0.9;
  ctx.save();
  ctx.translate(x, y);
  if (vx < 0) ctx.scale(-1, 1);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  // Linker Flügel
  ctx.quadraticCurveTo(-s * 0.6, -s * (0.5 + flap), -s * 1.4, -s * (0.1 + flap * 0.8));
  ctx.quadraticCurveTo(-s * 0.9, s * 0.1, -s * 0.9, s * 0.35);
  ctx.quadraticCurveTo(-s * 0.5, s * 0.05, 0, s * 0.3);
  // Rechter Flügel
  ctx.quadraticCurveTo(s * 0.5, s * 0.05, s * 0.9, s * 0.35);
  ctx.quadraticCurveTo(s * 0.9, s * 0.1, s * 1.4, -s * (0.1 + flap * 0.8));
  ctx.quadraticCurveTo(s * 0.6, -s * (0.5 + flap), 0, 0);
  ctx.fill();
  ctx.restore();
}
