// Geschosse und flächige Angriffe: Blutlanze, Silberbolzen, heilige Kugeln,
// Lichtsäulen, Bodenwellen, geworfene Speere, Zahnräder, Bücher …
//
// Alle teilen eine Klasse; `kind` bestimmt Aussehen und Sonderverhalten.

import { TAU, clamp, angleDelta } from '../core/math.js';
import { newAttackId, resolveAttack } from './combat.js';

export class Projectile {
  constructor(o) {
    this.kind = o.kind;
    this.x = o.x; this.y = o.y;
    this.vx = o.vx || 0; this.vy = o.vy || 0;
    this.w = o.w ?? 8; this.h = o.h ?? 8;
    this.team = o.team || 'enemy';
    this.damage = o.damage ?? 10;
    this.crit = !!o.crit;
    this.life = o.life ?? 2;
    this.age = 0;
    this.pierce = o.pierce ?? 0;
    this.gravity = o.gravity ?? 0;
    this.homing = o.homing ?? 0;         // Lenkstärke (rad/s)
    this.speed = Math.hypot(this.vx, this.vy);
    this.holy = !!o.holy;
    this.heavy = !!o.heavy;
    this.onWall = o.onWall || 'die';     // 'die' | 'bounce' | 'pass'
    this.delay = o.delay ?? 0;           // Vorwarnzeit ohne Schaden
    this.color = o.color || '#fff';
    this.remove = false;
    this.id = newAttackId();
    this.trail = [];
    this.data = o.data || {};
    this.breaksWalls = !!o.breaksWalls;
  }

  rect() { return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h }; }

  update(dt, game) {
    this.age += dt;
    if (this.age >= this.life) { this.remove = true; return; }

    // Vorwarnung: nur zeichnen, noch nicht treffen
    if (this.age < this.delay) return;

    if (this.homing && game.player && !game.player.dead && this.age > (this.data.seekAfter || 0)) {
      let target = this.team === 'enemy' ? game.player : null;
      if (this.team === 'player') {
        // Zauber des Fürsten suchen sich den nächsten Gegner.
        let bd = this.data.seekRange || 260;
        for (const e of game.hurtables()) {
          const d = Math.hypot(e.x - this.x, e.y - e.h / 2 - this.y);
          if (d < bd) { bd = d; target = e; }
        }
      }
      if (target) {
        const ty = target === game.player ? target.y - 18 : target.y - target.h / 2;
        const want = Math.atan2(ty - this.y, target.x - this.x);
        const cur = Math.atan2(this.vy, this.vx);
        const turn = clamp(angleDelta(cur, want), -this.homing * dt, this.homing * dt);
        const a = cur + turn;
        this.vx = Math.cos(a) * this.speed;
        this.vy = Math.sin(a) * this.speed;
      }
    }
    this.vy += this.gravity * dt;
    const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;

    // Wandkontakt (Flächenangriffe wie Säulen ignorieren Wände)
    if (this.onWall !== 'pass' && game.world.rectSolid(nx - this.w / 4, ny - this.h / 4, this.w / 2, this.h / 2)) {
      if (this.onWall === 'bounce') {
        if (game.world.rectSolid(nx - this.w / 4, this.y - this.h / 4, this.w / 2, this.h / 2)) this.vx *= -0.8;
        else this.vy *= -0.6;
        game.audio.play('gear', { x: this.x, gain: 0.6 });
      } else {
        this._burst(game);
        this.remove = true;
        return;
      }
    } else {
      this.x = nx; this.y = ny;
    }

    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 8) this.trail.shift();

    // Treffer
    const r = this.rect();
    const attack = {
      id: this.id, team: this.team, x: r.x, y: r.y, w: r.w, h: r.h,
      damage: this.damage, dir: Math.sign(this.vx) || 1, heavy: this.heavy, holy: this.holy, crit: this.crit,
      breaksShield: this.kind === 'lance',
    };
    const targets = this.team === 'player' ? game.hurtables() : [game.player];
    const hits = resolveAttack(game, attack, targets);
    if (hits) {
      if (this.team === 'player' && this.kind === 'lance') game.player.gainBlood(3 * hits);
      if (this.pierce > 0) { this.pierce -= hits; this.id = this.kind === 'lance' ? this.id : newAttackId(); }
      else { this._burst(game); this.remove = true; }
    }
    if (this.breaksWalls) game.world.breakWalls(r.x, r.y, r.w, r.h);

    this._fx(dt, game);
  }

  /** Laufende Partikel je Art. */
  _fx(dt, game) {
    const p = game.particles;
    switch (this.kind) {
      case 'lance': if (Math.random() < 0.6) p.blood(this.x, this.y, Math.PI / 2, 1, 40); break;
      case 'holyOrb': if (Math.random() < 0.5) p.holy(this.x, this.y, 1); break;
      case 'flame': if (Math.random() < 0.8) p.embers(this.x, this.y, '#ffb040', 1, 3); break;
      case 'hellfire': if (Math.random() < 0.9) p.embers(this.x, this.y, '#ff8a20', 2, 6); break;
      case 'batSwarm': if (Math.random() < 0.3) p.mist(this.x, this.y, 1, '#3a1030'); break;
      case 'wave': if (Math.random() < 0.7) p.dust(this.x, this.y + this.h / 2, 1, this.data.dust || '#9a9080'); break;
      case 'water': if (Math.random() < 0.7) p.spawn({ kind: 'soft', x: this.x + (Math.random() - 0.5) * this.w, y: this.y - this.h / 2, vx: 0, vy: -40, life: 0.4, size: 2, size1: 5, color: '#a0d0ff', alpha: 0.5 }); break;
      default: break;
    }
  }

  _burst(game) {
    const p = game.particles;
    switch (this.kind) {
      case 'lance':
        p.blood(this.x, this.y, Math.atan2(-this.vy, -this.vx), 10, 180);
        p.ring(this.x, this.y, '#ff3040', 2, 20, 0.25);
        game.audio.play('hit', { x: this.x, gain: 0.6 });
        break;
      case 'bolt':
        p.sparks(this.x, this.y, '#e8ecff', 8, 180);
        game.audio.play('arrow', { x: this.x, gain: 0.5 });
        break;
      case 'hellfire':
        p.embers(this.x, this.y, '#ffb040', 12, 30);
        p.ring(this.x, this.y, '#ff8a20', 3, 26, 0.3);
        game.audio.play('hit', { x: this.x, gain: 0.5 });
        break;
      case 'batSwarm':
        p.bats(this.x, this.y, 2, 0.5);
        break;
      case 'holyOrb':
      case 'lightBlade':
        p.holy(this.x, this.y, 10);
        p.ring(this.x, this.y, '#fff0b0', 2, 22, 0.3);
        break;
      default:
        p.sparks(this.x, this.y, this.color, 6, 140);
    }
  }

  // --- Zeichnen ----------------------------------------------------------

  draw(ctx, game) {
    if (this.kind === 'spear' || this.kind === 'bolt' || this.kind === 'gear' || this.kind === 'book' || this.kind === 'bone') {
      drawSolidProjectile(ctx, this, game.time);
    }
  }

  drawEmissive(ctx, game, isGlow) {
    const t = game.time;
    const warn = this.age < this.delay;
    switch (this.kind) {
      case 'lance': {
        // Speer aus geronnenem Blut mit Schweif
        const a = Math.atan2(this.vy, this.vx);
        for (let i = 1; i < this.trail.length; i++) {
          const p0 = this.trail[i - 1], p1 = this.trail[i];
          ctx.globalAlpha = (i / this.trail.length) * 0.6;
          ctx.strokeStyle = '#ff2040';
          ctx.lineWidth = (isGlow ? 6 : 3) * (i / this.trail.length);
          ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.save();
        ctx.translate(this.x, this.y); ctx.rotate(a);
        ctx.fillStyle = isGlow ? '#ff1030' : '#ff5068';
        ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-10, -2.6); ctx.lineTo(-14, 0); ctx.lineTo(-10, 2.6); ctx.closePath(); ctx.fill();
        if (!isGlow) { ctx.fillStyle = '#ffe0e4'; ctx.fillRect(-6, -0.6, 16, 1.2); }
        ctx.restore();
        break;
      }
      case 'holyOrb': {
        const r = this.w / 2;
        ctx.fillStyle = isGlow ? 'rgba(255,230,150,0.9)' : '#fff8d8';
        ctx.beginPath(); ctx.arc(this.x, this.y, isGlow ? r * 2.2 : r, 0, TAU); ctx.fill();
        if (!isGlow) {
          ctx.strokeStyle = '#ffd060'; ctx.lineWidth = 1;
          for (let i = 0; i < 4; i++) {
            const a = t * 4 + (i / 4) * TAU;
            ctx.beginPath(); ctx.moveTo(this.x + Math.cos(a) * r, this.y + Math.sin(a) * r); ctx.lineTo(this.x + Math.cos(a) * r * 1.9, this.y + Math.sin(a) * r * 1.9); ctx.stroke();
          }
        }
        break;
      }
      case 'pillar': {
        // Lichtsäule: erst dünne Warnlinie, dann gleißender Strahl
        const x = this.x, w = this.w;
        const top = this.y - this.h / 2, h = this.h;
        if (warn) {
          const k = this.age / this.delay;
          ctx.globalAlpha = 0.25 + 0.5 * k;
          ctx.fillStyle = '#fff0b0';
          ctx.fillRect(x - 1 - k * 2, top, 2 + k * 4, h);
          ctx.globalAlpha = 1;
        } else {
          const k = 1 - (this.age - this.delay) / (this.life - this.delay);
          const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
          g.addColorStop(0, 'rgba(255,230,150,0)');
          g.addColorStop(0.5, `rgba(255,250,225,${0.95 * k})`);
          g.addColorStop(1, 'rgba(255,230,150,0)');
          ctx.fillStyle = g;
          ctx.fillRect(x - w / 2 - (isGlow ? 8 : 0), top, w + (isGlow ? 16 : 0), h);
        }
        break;
      }
      case 'wave': {
        // Bodenwelle: Staubkamm mit heiligem Glühen
        ctx.fillStyle = isGlow ? 'rgba(255,200,120,0.7)' : 'rgba(255,230,180,0.85)';
        ctx.beginPath();
        ctx.moveTo(this.x - this.w / 2, this.y + this.h / 2);
        ctx.quadraticCurveTo(this.x, this.y - this.h / 2 - 4, this.x + this.w / 2, this.y + this.h / 2);
        ctx.fill();
        break;
      }
      case 'water': {
        const k = clamp(this.age * 4, 0, 1);
        ctx.fillStyle = isGlow ? 'rgba(120,190,255,0.6)' : 'rgba(170,215,255,0.8)';
        ctx.beginPath();
        ctx.moveTo(this.x - this.w / 2, this.y + this.h / 2);
        ctx.quadraticCurveTo(this.x - this.w / 4, this.y - this.h / 2 * k - 6, this.x + this.w / 2 * Math.sign(this.vx || 1), this.y - this.h / 2 * k);
        ctx.lineTo(this.x + this.w / 2, this.y + this.h / 2);
        ctx.fill();
        break;
      }
      case 'lightBlade': {
        const a = Math.atan2(this.vy, this.vx);
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(a);
        ctx.fillStyle = isGlow ? 'rgba(255,220,130,0.9)' : '#fffbe6';
        ctx.beginPath();
        ctx.arc(0, 0, this.h / 2, -Math.PI / 2, Math.PI / 2);
        ctx.arc(-this.h * 0.18, 0, this.h / 2 * 0.8, Math.PI / 2, -Math.PI / 2, true);
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'hellfire': {
        // Feuerball mit flackerndem Schweif
        for (let i = 1; i < this.trail.length; i++) {
          const q = this.trail[i];
          ctx.globalAlpha = (i / this.trail.length) * 0.5;
          ctx.fillStyle = isGlow ? '#ff6010' : '#ffa040';
          ctx.beginPath(); ctx.arc(q.x, q.y, (isGlow ? 8 : 3) * (i / this.trail.length), 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
        const r = 4 + Math.sin(t * 30 + this.id) * 0.8;
        ctx.fillStyle = isGlow ? 'rgba(255,120,20,0.95)' : '#ffd070';
        ctx.beginPath(); ctx.arc(this.x, this.y, isGlow ? r * 2.4 : r, 0, TAU); ctx.fill();
        if (!isGlow) { ctx.fillStyle = '#fff8e0'; ctx.beginPath(); ctx.arc(this.x, this.y, r * 0.45, 0, TAU); ctx.fill(); }
        break;
      }
      case 'batSwarm': {
        // Fledermaus aus Blutmagie
        const flap = Math.sin(t * 28 + this.id * 1.7);
        const dir = Math.sign(this.vx) || 1;
        ctx.save(); ctx.translate(this.x, this.y); ctx.scale(dir, 1);
        ctx.fillStyle = isGlow ? 'rgba(180,80,255,0.8)' : '#2a0a2a';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(-4, -4 - flap * 3, -8, -1 - flap * 2);
        ctx.quadraticCurveTo(-5, 0, -2, 2);
        ctx.quadraticCurveTo(2, 0, 5, -1 - flap * 2);
        ctx.quadraticCurveTo(3, -4 - flap * 3, 0, 0);
        ctx.fill();
        if (!isGlow) { ctx.fillStyle = '#ff3050'; ctx.fillRect(1, -0.6, 0.9, 0.9); }
        ctx.restore();
        break;
      }
      case 'flame': {
        ctx.fillStyle = isGlow ? 'rgba(255,150,40,0.9)' : '#ffd070';
        ctx.beginPath(); ctx.arc(this.x, this.y, isGlow ? 9 : 4, 0, TAU); ctx.fill();
        break;
      }
      case 'bolt': {
        if (!isGlow) break;
        ctx.strokeStyle = 'rgba(220,230,255,0.6)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x - this.vx * 0.03, this.y - this.vy * 0.03); ctx.stroke();
        break;
      }
      default: break;
    }
  }

  light() {
    if (this.age < this.delay && this.kind !== 'pillar') return null;
    switch (this.kind) {
      case 'lance': return { x: this.x, y: this.y, radius: 70, color: 'rgb(255,40,60)', intensity: 1.0 };
      case 'holyOrb': return { x: this.x, y: this.y, radius: 80, color: 'rgb(255,230,160)', intensity: 1.0 };
      case 'pillar': return this.age < this.delay ? null : { x: this.x, y: this.y, radius: 140, color: 'rgb(255,240,190)', intensity: 1.5 };
      case 'lightBlade': return { x: this.x, y: this.y, radius: 90, color: 'rgb(255,240,190)', intensity: 1.2 };
      case 'flame': return { x: this.x, y: this.y, radius: 60, color: 'rgb(255,160,60)', intensity: 1.0 };
      case 'hellfire': return { x: this.x, y: this.y, radius: 80, color: 'rgb(255,140,40)', intensity: 1.2 };
      case 'batSwarm': return { x: this.x, y: this.y, radius: 40, color: 'rgb(190,90,255)', intensity: 0.6 };
      default: return null;
    }
  }
}

function drawSolidProjectile(ctx, p, t) {
  const a = Math.atan2(p.vy, p.vx);
  ctx.save();
  ctx.translate(p.x, p.y);
  switch (p.kind) {
    case 'bolt':
      ctx.rotate(a);
      ctx.fillStyle = '#e8ecf8'; ctx.fillRect(-7, -0.7, 12, 1.4);
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(5, -1.8); ctx.lineTo(9, 0); ctx.lineTo(5, 1.8); ctx.fill();
      ctx.fillStyle = '#c03040'; ctx.fillRect(-8, -1.6, 3, 3.2);
      break;
    case 'spear':
      ctx.rotate(a);
      ctx.fillStyle = '#6a4a2a'; ctx.fillRect(-16, -0.9, 26, 1.8);
      ctx.fillStyle = '#e8ecf8'; ctx.beginPath(); ctx.moveTo(10, -2.4); ctx.lineTo(18, 0); ctx.lineTo(10, 2.4); ctx.fill();
      break;
    case 'gear': {
      ctx.rotate(t * 10 * Math.sign(p.vx || 1));
      ctx.fillStyle = '#c09040';
      ctx.beginPath();
      const r = p.w / 2;
      for (let i = 0; i < 16; i++) {
        const aa = (i / 16) * TAU, rr = i % 2 ? r * 0.78 : r;
        ctx.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr);
      }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#4a3010'; ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, TAU); ctx.fill();
      break;
    }
    case 'book': {
      const flap = Math.sin(t * 16) * 0.6;
      ctx.rotate(Math.sin(t * 3) * 0.2);
      ctx.fillStyle = '#7a2218';
      ctx.save(); ctx.rotate(-flap); ctx.fillRect(-7, -1, 7, 9); ctx.restore();
      ctx.save(); ctx.rotate(flap); ctx.fillRect(0, -1, 7, 9); ctx.restore();
      ctx.fillStyle = '#f0e4c8'; ctx.fillRect(-5, 0, 10, 1.2);
      break;
    }
    case 'bone':
      ctx.rotate(t * 12);
      ctx.fillStyle = '#e8dfc6';
      ctx.fillRect(-5, -0.9, 10, 1.8);
      ctx.beginPath(); ctx.arc(-5, 0, 1.6, 0, TAU); ctx.arc(5, 0, 1.6, 0, TAU); ctx.fill();
      break;
    default: break;
  }
  ctx.restore();
}

// --- Fabriken für die häufigsten Geschosse ---------------------------------

export class BloodLance extends Projectile {
  constructor(x, y, dir, dmg) {
    super({ kind: 'lance', x, y, vx: dir * 560, vy: 0, w: 24, h: 8, team: 'player', damage: dmg.dmg, crit: dmg.crit, life: 0.9, pierce: 3 });
  }
}

/** Zauber „Fledermausschwarm“: fliegt erst auseinander, dann auf den nächsten Gegner. */
export const batSwarm = (x, y, a, dmg, i) =>
  new Projectile({ kind: 'batSwarm', x, y, vx: Math.cos(a) * 230, vy: Math.sin(a) * 230 - 40, w: 10, h: 8, team: 'player', damage: dmg.dmg, crit: dmg.crit, life: 2.6, homing: 7, onWall: 'die', data: { seekAfter: 0.12 + i * 0.04, seekRange: 300 } });

/** Zauber „Höllenfeuer“: Feuerball, der eine Handvoll Gegner durchschlägt. */
export const hellfire = (x, y, a, dmg) =>
  new Projectile({ kind: 'hellfire', x, y, vx: Math.cos(a) * 330, vy: Math.sin(a) * 330, w: 12, h: 12, team: 'player', damage: dmg.dmg, crit: dmg.crit, life: 1.3, pierce: 1, heavy: true });

export const silverBolt = (x, y, tx, ty, speed = 330) => {
  const a = Math.atan2(ty - y, tx - x);
  return new Projectile({ kind: 'bolt', x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, w: 10, h: 4, damage: 13, life: 2.2 });
};

export const holyOrb = (x, y, a, speed = 150, homing = 1.4, damage = 12) =>
  new Projectile({ kind: 'holyOrb', x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, w: 8, h: 8, damage, life: 3.5, homing, holy: true });

/** Lichtsäule von oben bis zum Boden bei x. */
export const holyPillar = (x, floorY, height = 200, delay = 0.8, damage = 18, width = 22) =>
  new Projectile({ kind: 'pillar', x, y: floorY - height / 2, w: width, h: height, damage, life: delay + 0.55, delay, onWall: 'pass', holy: true, heavy: true });

export const groundWave = (x, floorY, dir, speed = 220, damage = 14, dust = '#9a9080') =>
  new Projectile({ kind: 'wave', x, y: floorY - 8, vx: dir * speed, w: 16, h: 16, damage, life: 1.8, onWall: 'die', data: { dust } });

export const waterWave = (x, floorY, dir, speed = 200, damage = 14) =>
  new Projectile({ kind: 'water', x, y: floorY - 14, vx: dir * speed, w: 22, h: 28, damage, life: 2.2, onWall: 'die', holy: true });

export const thrownSpear = (x, y, tx, ty, speed = 420) => {
  const a = Math.atan2(ty - y, tx - x);
  return new Projectile({ kind: 'spear', x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, w: 20, h: 6, damage: 16, life: 2, gravity: 120 });
};

export const bouncingGear = (x, y, dir) =>
  new Projectile({ kind: 'gear', x, y, vx: dir * 180, vy: -260, w: 16, h: 16, damage: 15, life: 5, gravity: 700, onWall: 'bounce' });

export const flyingBook = (x, y, a) =>
  new Projectile({ kind: 'book', x, y, vx: Math.cos(a) * 110, vy: Math.sin(a) * 110, w: 12, h: 10, damage: 11, life: 5, homing: 1.8 });

export const thrownBone = (x, y, dir) =>
  new Projectile({ kind: 'bone', x, y, vx: dir * 150, vy: -300, w: 10, h: 10, damage: 10, life: 3, gravity: 800 });

export const lightBlade = (x, y, dir, speed = 300, damage = 20) =>
  new Projectile({ kind: 'lightBlade', x, y, vx: dir * speed, vy: 0, w: 14, h: 40, damage, life: 2.5, holy: true, onWall: 'die', heavy: true });

export const flameShot = (x, y, a, speed = 200) =>
  new Projectile({ kind: 'flame', x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, w: 8, h: 8, damage: 12, life: 2.5, gravity: 60 });

