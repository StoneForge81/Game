// Dinge in der Welt, mit denen man etwas tun kann: Särge (Speichern),
// Gefangene, Schriften, Blutkugeln, Herzsplitter, Kelche, Ausgänge …

import { Entity } from './entity.js';
import { TAU, clamp, damp, dist } from '../core/math.js';
import { drawHumanoid, makePose, COSTUMES, outlined, cel, smoothPath, P } from '../render/puppet.js';

// === Basisklasse für Interaktionen =========================================

class Interactable extends Entity {
  constructor(x, y, w, h) {
    super(x, y, w, h);
    this.solid = false;
    this.gravity = 0;
    this.prompt = null;      // Text der Aufforderung, z. B. "Ruhen"
    this.range = 26;
  }
  canInteract(player) {
    if (!this.prompt) return false;
    return Math.abs(player.x - this.x) < this.range && Math.abs(player.y - this.y) < 28;
  }
  interact(game, player) {}
}

// === Sarg mit Oma Renate und Opa Egon ======================================

export class Checkpoint extends Interactable {
  constructor(def) {
    super(def.x, def.y, 34, 20);
    this.cpId = def.id;
    this.prompt = 'Ruhen';
    this.range = 30;
    this.poseR = makePose('idle', 0);
    this.poseE = makePose('idle', 1.3);
    this.glow = 0;
  }
  interact(game) { game.openCheckpoint(this); }
  update(dt, game) {
    super.update(dt, game);
    this.glow = damp(this.glow, this.canInteract(game.player) ? 1 : 0, 0.15, dt);
    this.poseR = makePose('idle', this.age * 0.8);
    this.poseE = makePose('idle', this.age * 0.8 + 2);
  }
  draw(ctx, game) {
    // Renate links, Egon rechts neben dem Sarg – sie drehen sich zum Spieler.
    const p = game.player;
    drawHumanoid(ctx, this.x - 30, this.y, p.x < this.x - 30 ? -1 : 1, this.poseR, COSTUMES.renate, { sz: 0.94 });
    const rigE = drawHumanoid(ctx, this.x + 30, this.y, p.x < this.x + 30 ? -1 : 1, this.poseE, COSTUMES.egon, { sz: 0.96, t: this.age });
    this._rigE = rigE;
    drawCoffin(ctx, this.x, this.y, false, this.glow);
  }
  drawEmissive(ctx, game, isGlow) {
    // Blutrotes Leuchten des Sargs, Egons Laterne
    const k = 0.6 + 0.4 * Math.sin(this.age * 2) + this.glow * 0.5;
    ctx.fillStyle = isGlow ? `rgba(255,40,70,${0.5 * k})` : `rgba(255,90,110,${0.5 * k})`;
    ctx.beginPath(); ctx.ellipse(this.x, this.y - 12, isGlow ? 20 : 3, isGlow ? 10 : 3, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = isGlow ? 'rgba(255,190,90,0.8)' : '#ffe0a0';
    ctx.beginPath(); ctx.arc(this.x + 38, this.y - 12, isGlow ? 7 : 1.6, 0, TAU); ctx.fill();
  }
  light() { return { x: this.x + 38, y: this.y - 14, radius: 90, color: 'rgb(255,200,120)', intensity: 0.9 }; }
}

/** Sarg: geschlossen mit Blutsiegel, oder offen (am Anfang). */
export function drawCoffin(ctx, x, y, open, glow = 0) {
  outlined(ctx, x, y, 1, (c) => {
    const lid = smoothPath([P(x - 17, y - 3, true), P(x - 13, y - 13, true), P(x + 13, y - 13, true), P(x + 17, y - 3, true), P(x + 12, y, true), P(x - 12, y, true)]);
    cel(c, lid, '#3a1a24', '#1e0c12', 0.8, -0.8, '#6a3444');
    c.strokeStyle = '#c9a040'; c.lineWidth = 0.8;
    c.stroke(lid);
    if (open) {
      c.fillStyle = '#8a0a1e';
      c.fillRect(x - 12, y - 11, 24, 7);
      c.fillStyle = '#b01330';
      c.fillRect(x - 12, y - 11, 24, 2);
    } else {
      // Kreuz aus Gold und Blutsiegel
      c.fillStyle = '#c9a040';
      c.fillRect(x - 1, y - 12, 2, 10);
      c.fillRect(x - 5, y - 9, 10, 2);
      c.fillStyle = glow > 0.1 ? '#ff4060' : '#8a0a1e';
      c.beginPath(); c.arc(x, y - 8, 1.6, 0, TAU); c.fill();
    }
    // Sockel
    const base = new Path2D(); base.rect(x - 19, y - 3, 38, 3);
    cel(c, base, '#4a3a40', '#2a2024', 0.3, -0.3);
  }, { box: 60, footAt: 0.8 });
}

// === Offener Sarg am Spielanfang ===========================================

export class StartCoffin extends Entity {
  constructor(def) { super(def.x, def.y, 34, 16); this.solid = false; this.gravity = 0; }
  draw(ctx) { drawCoffin(ctx, this.x, this.y, true); }
}

// === Gefangener aus Ingopolis ===============================================

export class Prisoner extends Interactable {
  constructor(def) {
    super(def.x, def.y, 14, 24);
    this.pid = def.id;
    this.variant = ((def.variant - 1) % 3) + 1;
    this.prompt = 'Ansprechen';
    this.state = 'caged';    // caged | freed | drunk
    this.pose = makePose('kneel', 0);
    this.fade = 1;
    this.runT = 0;
  }
  interact(game) { if (this.state === 'caged') game.talkToPrisoner(this); }
  free(game) {
    this.state = 'freed';
    this.prompt = null;
    game.audio.play('spare', { x: this.x });
    game.particles.sparks(this.x, this.y - 20, '#c0c8d8', 10, 160);
  }
  drink(game) {
    this.state = 'drunk';
    this.prompt = null;
  }
  update(dt, game) {
    super.update(dt, game);
    if (this.state === 'caged') this.pose = makePose('kneel', this.age);
    else if (this.state === 'freed') {
      // Läuft davon, Richtung Ingopolis
      this.runT += dt;
      this.x += 110 * dt;
      this.pose = makePose('run', this.age, { phase: this.age * 11 });
      this.fade = clamp(1 - (this.runT - 0.8) / 0.8, 0, 1);
      if (this.fade <= 0) this.remove = true;
    } else if (this.state === 'drunk') {
      this.runT += dt;
      this.pose = makePose('dead', this.age);
      this.fade = clamp(1 - this.runT / 1.2, 0, 1);
      if (this.fade <= 0) this.remove = true;
    }
  }
  draw(ctx, game) {
    if (this.state === 'caged') {
      // Ketten zu den Handgelenken
      ctx.strokeStyle = '#3a3440'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(this.x - 10, this.y - 60); ctx.lineTo(this.x - 3, this.y - 16); ctx.moveTo(this.x + 10, this.y - 60); ctx.lineTo(this.x + 4, this.y - 16); ctx.stroke();
    }
    drawHumanoid(ctx, this.x, this.y, -1, this.pose, COSTUMES.prisoner, { alpha: this.fade, sz: 0.92 });
    if (this.state === 'caged') drawCage(ctx, this.x, this.y);
  }
}

function drawCage(ctx, x, y) {
  ctx.strokeStyle = '#2a2430';
  ctx.lineWidth = 1.6;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath(); ctx.moveTo(x + i * 5, y); ctx.lineTo(x + i * 5, y - 40); ctx.stroke();
  }
  ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(x - 17, y - 40); ctx.lineTo(x + 17, y - 40); ctx.moveTo(x - 17, y - 1); ctx.lineTo(x + 17, y - 1); ctx.stroke();
  ctx.strokeStyle = 'rgba(200,210,240,0.3)'; ctx.lineWidth = 0.5;
  for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(x + i * 5 + 0.5, y); ctx.lineTo(x + i * 5 + 0.5, y - 40); ctx.stroke(); }
}

// === Ines und Matthias, die Chronisten von Ingopolis ========================

export class Archivists extends Interactable {
  constructor(def) {
    super(def.x, def.y, 60, 30);
    this.prompt = 'Ansprechen';
    this.range = 44;
    this.talked = false;
  }
  interact(game) { game.talkToArchivists(this); }
  draw(ctx, game) {
    const p = game.player;
    const x = this.x, y = this.y;
    // Schreibpult mit Papierstapeln
    outlined(ctx, x, y, 1, (c) => {
      const desk = new Path2D(); desk.rect(x - 14, y - 15, 28, 3); desk.rect(x - 12, y - 12, 2.5, 12); desk.rect(x + 9.5, y - 12, 2.5, 12);
      cel(c, desk, '#6a4428', '#3a2414', 0.4, -0.4, '#9a6a40');
      c.fillStyle = '#f4ecd8'; c.fillRect(x - 10, y - 17.5, 9, 2.5); c.fillRect(x + 2, y - 16.8, 8, 1.8);
      c.fillStyle = 'rgba(60,40,20,0.5)'; c.fillRect(x - 9, y - 17, 7, 0.4); c.fillRect(x + 3, y - 16.4, 6, 0.4);
    }, { box: 50, footAt: 0.8 });
    const fM = p.x < x - 20 ? -1 : 1, fI = p.x < x + 20 ? -1 : 1;
    drawHumanoid(ctx, x - 20, y, fM, makePose('idle', this.age + 0.6), COSTUMES.matthias, { t: this.age });
    drawHumanoid(ctx, x + 20, y, fI, makePose('idle', this.age), COSTUMES.ines, { sz: 0.96, t: this.age });
  }
  drawEmissive(ctx, game, isGlow) {
    if (this.talked) return;
    const k = 0.5 + 0.5 * Math.sin(this.age * 3);
    ctx.fillStyle = isGlow ? `rgba(255,220,140,${0.6 * k})` : `rgba(255,240,200,${0.8 * k})`;
    ctx.beginPath(); ctx.arc(this.x, this.y - 48 - k * 2, isGlow ? 7 : 1.8, 0, TAU); ctx.fill();
  }
}

// === Schriften: Tagebücher und Briefe ======================================

export class LorePoint extends Interactable {
  constructor(def) {
    super(def.x, def.y, 16, 22);
    this.loreId = def.id;
    this.key = def.key;
    this.prompt = 'Lesen';
    this.read = false;
  }
  interact(game) { game.showLore(this); }
  draw(ctx) {
    // Lesepult mit aufgeschlagenem Buch
    outlined(ctx, this.x, this.y, 1, (c) => {
      const stand = new Path2D(); stand.rect(this.x - 1.5, this.y - 16, 3, 16); stand.rect(this.x - 6, this.y - 2, 12, 2);
      cel(c, stand, '#4a3020', '#2a180c', 0.4, 0);
      const top = smoothPath([P(this.x - 9, this.y - 16, true), P(this.x + 9, this.y - 20, true), P(this.x + 9, this.y - 17, true), P(this.x - 9, this.y - 13, true)]);
      cel(c, top, '#5a3a24', '#2a180c', 0.3, -0.3);
      c.fillStyle = this.read ? '#c8bca0' : '#f4ead0';
      c.beginPath(); c.moveTo(this.x - 8, this.y - 17); c.lineTo(this.x, this.y - 19.5); c.lineTo(this.x + 8, this.y - 21); c.lineTo(this.x + 8, this.y - 19.3); c.lineTo(this.x, this.y - 17.6); c.lineTo(this.x - 8, this.y - 15.2); c.fill();
    }, { box: 50, footAt: 0.8 });
  }
  drawEmissive(ctx, game, isGlow) {
    if (this.read) return;
    const k = 0.5 + 0.5 * Math.sin(this.age * 3);
    ctx.fillStyle = isGlow ? `rgba(255,220,140,${0.5 * k})` : `rgba(255,240,200,${0.7 * k})`;
    ctx.beginPath(); ctx.arc(this.x, this.y - 27 - k * 2, isGlow ? 6 : 1.4, 0, TAU); ctx.fill();
  }
}

// === Aufsammelbares =========================================================

export class Pickup extends Entity {
  /**
   * kind: 'bloodOrb' (kleine Heilung + Blut), 'heartShard', 'chalice', 'ability'
   */
  constructor(kind, x, y, opts = {}) {
    super(x, y, 10, 10);
    this.kind = kind;
    this.itemId = opts.id || null;
    this.ability = opts.ability || null;
    this.solid = kind === 'bloodOrb';
    this.gravity = kind === 'bloodOrb' ? 600 : 0;
    this.vx = opts.vx ?? 0;
    this.vy = opts.vy ?? 0;
    this.baseY = y;
    this.collectDelay = kind === 'bloodOrb' ? 0.35 : 0.2;
    this.life = kind === 'bloodOrb' ? 12 : Infinity;
  }
  update(dt, game) {
    super.update(dt, game);
    const p = game.player;
    if (this.kind === 'bloodOrb') {
      this.physics(dt, game.world);
      this.vx *= 0.96;
      // Blut zieht es zum Vampir
      const d = dist(this.x, this.y - 5, p.x, p.y - 15);
      if (this.age > this.collectDelay && d < 60) {
        const k = 1 - d / 60;
        this.x += (p.x - this.x) * k * 8 * dt;
        this.y += (p.y - 15 - this.y) * k * 8 * dt;
      }
      if (this.age > this.life) this.remove = true;
    } else if (this.kind === 'ability' && this.age > 1.2) {
      // Die neue Kraft sucht ihren Fürsten – man kann sie nicht verpassen.
      const k = Math.min(1, (this.age - 1.2) * 0.8);
      this.x += (p.x - this.x) * k * 6 * dt;
      this.y += (p.y - 18 - this.y) * k * 6 * dt;
    } else {
      this.y = this.baseY + Math.sin(this.age * 2.4) * 2.5;
    }
    // Eingesammelt wird bei Berührung mit der Körperbox – im Stehen wie im Sprung.
    if (this.age > this.collectDelay && p.state !== 'dead') {
      const r = p.rect();
      const px = this.x, py = this.y - 4;
      if (px > r.x - 7 && px < r.x + r.w + 7 && py > r.y - 7 && py < r.y + r.h + 4) {
        game.collect(this);
        this.remove = true;
      }
    }
  }
  draw(ctx, game) {
    if (this.kind === 'chalice') {
      outlined(ctx, this.x, this.y + 6, 1, (c) => {
        const cup = smoothPath([P(this.x - 5, this.y - 7, true), P(this.x + 5, this.y - 7, true), P(this.x + 3, this.y - 1), P(this.x + 1, this.y + 1), P(this.x + 1, this.y + 4), P(this.x + 4, this.y + 6, true), P(this.x - 4, this.y + 6, true), P(this.x - 1, this.y + 4), P(this.x - 1, this.y + 1), P(this.x - 3, this.y - 1)]);
        cel(c, cup, '#e8c050', '#9a7020', 0.5, -0.5, '#fff4c0');
        c.fillStyle = '#c01030'; c.fillRect(this.x - 4.4, this.y - 7, 8.8, 1.8);
      }, { box: 40, footAt: 0.7 });
    }
  }
  drawEmissive(ctx, game, isGlow) {
    const t = this.age;
    if (this.kind === 'bloodOrb') {
      ctx.fillStyle = isGlow ? 'rgba(255,30,60,0.8)' : '#ff4a60';
      ctx.beginPath(); ctx.arc(this.x, this.y - 4, isGlow ? 6 : 2.4, 0, TAU); ctx.fill();
      if (!isGlow) { ctx.fillStyle = '#ffd0d8'; ctx.beginPath(); ctx.arc(this.x - 0.7, this.y - 4.8, 0.8, 0, TAU); ctx.fill(); }
    } else if (this.kind === 'heartShard') {
      // Pulsierender Herzsplitter
      const s = 1 + Math.sin(t * 5) * 0.12;
      ctx.save(); ctx.translate(this.x, this.y); ctx.scale(s, s);
      ctx.fillStyle = isGlow ? 'rgba(255,40,70,0.9)' : '#ff3050';
      ctx.beginPath();
      ctx.moveTo(0, 5);
      ctx.bezierCurveTo(-7, -1, -4, -7, 0, -3);
      ctx.bezierCurveTo(4, -7, 7, -1, 0, 5);
      ctx.fill();
      if (!isGlow) { ctx.fillStyle = '#ffc0cc'; ctx.beginPath(); ctx.arc(-2, -2.5, 1, 0, TAU); ctx.fill(); }
      ctx.restore();
    } else if (this.kind === 'chalice' && isGlow) {
      ctx.fillStyle = 'rgba(255,200,90,0.6)';
      ctx.beginPath(); ctx.arc(this.x, this.y, 12, 0, TAU); ctx.fill();
    } else if (this.kind === 'ability') {
      // Große Kugel aus Blutmagie, umkreist von Funken
      const r = 6 + Math.sin(t * 3) * 1;
      ctx.fillStyle = isGlow ? 'rgba(255,40,80,0.9)' : '#ff6080';
      ctx.beginPath(); ctx.arc(this.x, this.y, isGlow ? r * 2.5 : r, 0, TAU); ctx.fill();
      if (!isGlow) {
        ctx.fillStyle = '#fff0f4'; ctx.beginPath(); ctx.arc(this.x, this.y, r * 0.45, 0, TAU); ctx.fill();
        for (let i = 0; i < 5; i++) {
          const a = t * 2 + (i / 5) * TAU;
          ctx.fillStyle = '#ffb0c0';
          ctx.beginPath(); ctx.arc(this.x + Math.cos(a) * r * 2, this.y + Math.sin(a) * r * 1.3, 1, 0, TAU); ctx.fill();
        }
      }
    }
  }
  light() {
    if (this.kind === 'bloodOrb') return null;
    return { x: this.x, y: this.y, radius: this.kind === 'ability' ? 130 : 70, color: this.kind === 'chalice' ? 'rgb(255,200,110)' : 'rgb(255,60,90)', intensity: 1.0 };
  }
}

// === Türen und Ausgänge =====================================================

export class Door extends Entity {
  constructor(def) { super(def.x, def.y, 20, 60); this.solid = false; this.gravity = 0; this.sealed = def.sealed; this.kind = def.type; }
  draw(ctx) {
    // Schweres Holztor im Spitzbogen, beim Eingang mit Trümmern versperrt
    const x = this.x, y = this.y;
    ctx.fillStyle = '#140c0a';
    ctx.beginPath(); ctx.moveTo(x - 14, y); ctx.lineTo(x - 14, y - 34); ctx.quadraticCurveTo(x - 14, y - 50, x, y - 56); ctx.quadraticCurveTo(x + 14, y - 50, x + 14, y - 34); ctx.lineTo(x + 14, y); ctx.fill();
    ctx.fillStyle = this.kind === 'bossDoor' ? '#4a0e14' : '#3a2418';
    ctx.beginPath(); ctx.moveTo(x - 11, y); ctx.lineTo(x - 11, y - 33); ctx.quadraticCurveTo(x - 11, y - 46, x, y - 51); ctx.quadraticCurveTo(x + 11, y - 46, x + 11, y - 33); ctx.lineTo(x + 11, y); ctx.fill();
    ctx.fillStyle = '#1e140e';
    for (let i = -8; i <= 8; i += 4) ctx.fillRect(x + i, y - 48 + Math.abs(i) * 0.6, 0.8, 48 - Math.abs(i) * 0.6);
    ctx.fillStyle = '#6a5a4a';
    ctx.fillRect(x - 11, y - 30, 22, 2); ctx.fillRect(x - 11, y - 12, 22, 2);
    if (this.sealed) {
      ctx.fillStyle = '#3a3438';
      for (let i = 0; i < 6; i++) ctx.fillRect(x - 12 + (i * 7) % 20, y - 8 - (i % 3) * 5, 8, 6);
    }
  }
}

/** Ausgang in die nächste Zone: ein Torbogen, durch den man hindurchgeht. */
export class Exit extends Entity {
  constructor(def) { super(def.x, def.y, 20, 50); this.solid = false; this.gravity = 0; this.to = def.to; this.used = false; }
  update(dt, game) {
    super.update(dt, game);
    if (!this.used && Math.abs(game.player.x - this.x) < 12 && Math.abs(game.player.y - this.y) < 30) {
      this.used = true;
      game.exitZone(this.to);
    }
  }
  draw(ctx) {
    const x = this.x, y = this.y;
    ctx.fillStyle = '#0a0608';
    ctx.beginPath(); ctx.moveTo(x - 14, y); ctx.lineTo(x - 14, y - 34); ctx.quadraticCurveTo(x - 14, y - 50, x, y - 56); ctx.quadraticCurveTo(x + 14, y - 50, x + 14, y - 34); ctx.lineTo(x + 14, y); ctx.fill();
  }
  drawEmissive(ctx, game, isGlow) {
    const k = 0.6 + 0.4 * Math.sin(this.age * 2);
    const g = ctx.createLinearGradient(0, this.y - 50, 0, this.y);
    g.addColorStop(0, 'rgba(255,60,80,0)');
    g.addColorStop(1, `rgba(255,60,80,${0.5 * k})`);
    ctx.fillStyle = g;
    ctx.fillRect(this.x - 10, this.y - 50, 20, 50);
  }
  light() { return { x: this.x, y: this.y - 20, radius: 90, color: 'rgb(255,70,90)', intensity: 0.9 }; }
}

/** Der Kristall mit Yvonne hinter dem Thron (Kathedrale). */
export class Throne extends Entity {
  constructor(def) { super(def.x, def.y, 40, 60); this.solid = false; this.gravity = 0; this.freed = false; this.yvPose = makePose('pray', 0); this.shatter = 0; }
  update(dt, game) {
    super.update(dt, game);
    this.yvPose = makePose(this.freed ? 'idle' : 'pray', this.age);
    if (this.freed) this.shatter = Math.min(1, this.shatter + dt * 2);
  }
  draw(ctx, game) {
    const x = this.x, y = this.y;
    // Thron
    outlined(ctx, x + 40, y, 1, (c) => {
      const back = smoothPath([P(x + 30, y, true), P(x + 30, y - 44, true), P(x + 36, y - 56, true), P(x + 40, y - 48, true), P(x + 44, y - 56, true), P(x + 50, y - 44, true), P(x + 50, y, true)]);
      cel(c, back, '#4a0e18', '#2a060c', 0.8, -0.8, '#8a2030');
      c.strokeStyle = '#c9a040'; c.lineWidth = 1; c.stroke(back);
    }, { box: 90, footAt: 0.85 });
    // Yvonne
    drawHumanoid(ctx, x, y - (this.freed ? 0 : 8), -1, this.yvPose, COSTUMES.yvonne, { alpha: this.freed ? 1 : 0.85 });
  }
  drawEmissive(ctx, game, isGlow) {
    if (this.shatter >= 1) return;
    const x = this.x, y = this.y - 28;
    ctx.globalAlpha = 1 - this.shatter;
    ctx.fillStyle = isGlow ? 'rgba(255,240,190,0.6)' : 'rgba(255,250,230,0.35)';
    ctx.beginPath(); ctx.moveTo(x, y - 34); ctx.lineTo(x + 16, y - 6); ctx.lineTo(x + 12, y + 30); ctx.lineTo(x - 12, y + 30); ctx.lineTo(x - 16, y - 6); ctx.closePath(); ctx.fill();
    if (!isGlow) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 0.8; ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  light() { return { x: this.x, y: this.y - 30, radius: 200, color: this.freed ? 'rgb(255,80,100)' : 'rgb(255,240,200)', intensity: 1.4 }; }
}

