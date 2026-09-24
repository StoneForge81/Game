// Die sechs Helden des Ordens – aus ihrer Sicht bist du das Ungeheuer.
//
// Jeder Boss hat ein Repertoire an Angriffen mit klarer Vorwarnung.
// Ab 50 % Leben beginnt Phase 2: schneller, mehr Muster.

import { Entity } from './entity.js';
import { TAU, clamp, approach, damp, lerp } from '../core/math.js';
import { newAttackId, resolveAttack, rollDamage, impactFx } from './combat.js';
import { makePose, blendPose, drawHumanoid, drawEyesGlow, COSTUMES, Cloth, solveRig, outlined, cel, smoothPath, P } from '../render/puppet.js';
import { holyOrb, holyPillar, groundWave, waterWave, thrownSpear, bouncingGear, flyingBook, lightBlade, flameShot, Projectile } from './projectiles.js';
import { BOSS_TITLES } from '../data/story.js';
import { CHAR_SCALE } from '../data/config.js';

const BOSS_STATS = {
  ambrosius:  { hp: 360, dmg: 16, w: 26, h: 48, sz: 1.55, fly: false },
  mirella:    { hp: 400, dmg: 15, w: 20, h: 40, sz: 1.25, fly: true },
  isolde:     { hp: 440, dmg: 17, w: 18, h: 38, sz: 1.2,  fly: false },
  malachias:  { hp: 460, dmg: 16, w: 20, h: 40, sz: 1.25, fly: true },
  cogliostro: { hp: 540, dmg: 19, w: 48, h: 58, sz: 1.3,  fly: false },
  serafine:   { hp: 720, dmg: 20, w: 20, h: 40, sz: 1.3,  fly: false },
};

export function createBoss(kind, arena, game) {
  const C = { ambrosius: Ambrosius, mirella: Mirella, isolde: Isolde, malachias: Malachias, cogliostro: Cogliostro, serafine: Serafine }[kind];
  return new C(kind, arena, game);
}

class Boss extends Entity {
  constructor(kind, arena) {
    const s = BOSS_STATS[kind];
    super(arena.x + arena.w * 0.72, arena.floorY, s.w, s.h);
    this.kind = kind;
    this.stats = s;
    this.arena = arena;
    this.floorY = arena.floorY;
    this.maxHp = this.hp = s.hp;
    this.damage = s.dmg;
    this.team = 'enemy';
    this.hurtable = false;
    this.isBoss = true;
    this.facing = -1;
    this.state = 'wait';
    this.attack = null;
    this.idleT = 1.2;
    this.phase = 1;
    this.sz = s.sz;
    this.pose = makePose('idle', 0);
    this.animT = 0;
    this.runPhase = 0;
    this.last = null;
    this.dyingT = 0;
    this.info = BOSS_TITLES[kind];
    this.fly = s.fly;
    if (this.fly) { this.gravity = 0; this.y = this.floorY - 60; }
    this.rig = null;
    this.armor = 1;          // Schadensfaktor (Cogliostro betäubt = 2)
  }

  begin() { this.state = 'fight'; this.hurtable = true; this.idleT = 0.8; }

  /** Einmaliges Ereignis, wenn die Angriffszeit t überschritten wird. */
  at(t) { return this.attack && this._prevT < t && this.attack.t >= t; }

  get left() { return this.x - this.w / 2; }

  update(dt, game) {
    super.update(dt, game);
    this.animT += dt;
    this.flash = Math.max(0, this.flash - dt * 5);
    const p = game.player;

    if (this.state === 'wait') {
      this.facing = p.x < this.x ? -1 : 1;
      if (!this.fly) this.physics(dt, game.world);
      this._animate(dt, 'idle');
      return;
    }
    if (this.state === 'dying') {
      this.dyingT += dt;
      this.vx = 0;
      if (!this.fly) this.physics(dt, game.world);
      else this.y = approach(this.y, this.floorY, 60 * dt);
      if (Math.random() < 0.5) {
        game.particles.blood(this.x + (Math.random() - 0.5) * this.w, this.y - Math.random() * this.h, -Math.PI / 2, 4, 180);
        game.particles.holy(this.x, this.y - this.h / 2, 2);
      }
      if (Math.floor(this.dyingT * 4) !== Math.floor((this.dyingT - dt) * 4)) {
        game.renderer.doFlash(255, 240, 220, 0.25);
        game.audio.play('hitHeavy', { x: this.x });
        game.fx.shake(0.3);
      }
      this._animate(dt, 'hurt');
      if (this.dyingT > 2.4) { this.state = 'dead'; this.hurtable = false; game.onBossDefeated(this); }
      return;
    }
    if (this.state === 'dead') { this._animate(dt, 'kneel'); return; }

    // Kampf
    if (this.attack) {
      this._prevT = this.attack.t;
      this.attack.t += dt;
      this.runAttack(dt, game, p, this.attack);
      if (this.attack && this.attack.t >= this.attack.dur) {
        this.attack = null;
        this.idleT = (this.phase === 2 ? 0.55 : 0.9) + Math.random() * 0.4;
      }
    } else {
      this.idleT -= dt;
      this.idleMove(dt, game, p);
      if (this.idleT <= 0) this._choose(game, p);
    }

    this._keepInArena(dt, game);
    this._contact(game, p);
    if (!this.attack) this._animate(dt, Math.abs(this.vx) > 15 ? 'walk' : 'idle');

    // Phase 2
    if (this.phase === 1 && this.hp <= this.maxHp * 0.5) {
      this.phase = 2;
      this.attack = null;
      this.idleT = 1.2;
      game.audio.play('bossRoar', { x: this.x });
      game.fx.shake(0.6);
      game.renderer.doFlash(255, 240, 200, 0.35);
      game.particles.ring(this.x, this.y - this.h / 2, '#fff0c0', 8, 90, 0.6);
      this.onPhase2 && this.onPhase2(game);
    }
  }

  _choose(game, p) {
    const list = this.patterns(game, p).filter((a) => a.name !== this.last || Math.random() < 0.2);
    let total = 0;
    for (const a of list) total += a.w ?? 1;
    let r = Math.random() * total;
    let pick = list[0];
    for (const a of list) { r -= a.w ?? 1; if (r <= 0) { pick = a; break; } }
    this.last = pick.name;
    this.attack = { name: pick.name, t: 0, dur: pick.dur, data: {}, id: newAttackId() };
    this._prevT = -1;
    this.facing = p.x < this.x ? -1 : 1;
  }

  /** Standard: langsam auf den Spieler zugehen. */
  idleMove(dt, game, p) {
    const dx = p.x - this.x;
    this.facing = Math.sign(dx) || this.facing;
    if (!this.fly) {
      this.vx = approach(this.vx, Math.abs(dx) > 70 ? this.facing * 42 : 0, 400 * dt);
      this.physics(dt, game.world);
    }
  }

  /**
   * Schwebende Bosse suchen sich eine Stelle, bleiben dort ein paar Sekunden
   * (Zeit für Sprungangriffe) und wechseln dann. Nie direkt über dem Spieler.
   */
  hover(dt, game, p, height = 60, stay = 2.8) {
    const a = this.arena;
    this._hoverT = (this._hoverT ?? 0) - dt;
    if (this._hoverT <= 0 || this._hoverX == null) {
      let x;
      for (let i = 0; i < 6; i++) {
        x = a.x + 60 + Math.random() * (a.w - 120);
        if (Math.abs(x - p.x) > 70) break;
      }
      this._hoverX = x;
      this._hoverT = stay + Math.random();
    }
    this.x = damp(this.x, this._hoverX, 0.35, dt);
    this.y = damp(this.y, this.floorY - height + Math.sin(this.animT * 1.5) * 5, 0.3, dt);
    this.facing = p.x < this.x ? -1 : 1;
  }

  _keepInArena(dt, game) {
    const a = this.arena;
    const minX = a.x + 30 + this.w / 2, maxX = a.x + a.w - 30 - this.w / 2;
    if (this.x < minX) { this.x = minX; if (this.vx < 0) this.vx = 0; }
    if (this.x > maxX) { this.x = maxX; if (this.vx > 0) this.vx = 0; }
  }

  _contact(game, p) {
    if (!this.hurtable || p.invuln > 0) return;
    const a = this.rect(), b = p.rect();
    if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) p.hurt(game, Math.round(this.damage * 0.6), this.x);
  }

  /** Nahkampf-Hitbox vor dem Boss aktiv halten. */
  strike(game, p, w, h, dy = 0, heavy = true, dmgMul = 1) {
    const hb = { x: this.facing > 0 ? this.x : this.x - w, y: this.y - h + dy, w, h, id: this.attack.id, team: 'enemy', damage: Math.round(this.damage * dmgMul), heavy, dir: this.facing };
    resolveAttack(game, hb, [p]);
  }

  takeHit(game, attack) {
    if (!this.hurtable || this.state !== 'fight') return false;
    let dmg = attack.damage, crit = !!attack.crit;
    if (attack.team === 'player' && attack.source) { const r = rollDamage(attack.damage, game.player.power); dmg = r.dmg; crit = r.crit; }
    dmg = Math.round(dmg * this.armor);
    this.hp -= dmg;
    this.flash = 1;
    game.damageNumber(this.x, this.y - this.h - 6, dmg, crit ? '#ffd0a0' : '#ffffff', crit);
    impactFx(game, attack.x + attack.w / 2, this.y - this.h * 0.55, attack.dir || 1, { heavy: attack.heavy, crit, blood: this.kind !== 'cogliostro', sparks: this.kind === 'cogliostro' });
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = 'dying';
      this.dyingT = 0;
      this.attack = null;
      this.hurtable = false;
      game.onBossDying(this);
    }
    return dmg;
  }

  _animate(dt, anim, opts = {}) {
    const target = makePose(anim, this.animT, { ...opts, phase: this.runPhase });
    if (anim === 'walk' || anim === 'run') this.runPhase += dt * Math.abs(this.vx) * 0.07;
    this.pose = blendPose(this.pose, target, 1 - Math.pow(2, -dt / 0.06));
  }

  drawBar() {}

  draw(ctx, game) {
    const alpha = this.state === 'dead' && this.kind !== 'serafine' ? Math.max(0, 1 - (game.time - (this._deadAt ?? game.time))) : 1;
    if (this.state === 'dead' && this.kind !== 'serafine') { this._deadAt = this._deadAt ?? game.time; if (alpha <= 0) return; }
    this.rig = drawHumanoid(ctx, this.x, this.y, this.facing, this.pose, COSTUMES[this.kind], {
      sz: this.sz, flash: this.flash * 0.85, t: this.animT, cape: this.cape, hair: this.hair, alpha,
    });
  }

  drawEmissive(ctx, game, isGlow) {
    const c = COSTUMES[this.kind];
    if (c.eyes && this.rig && this.state !== 'dead') drawEyesGlow(ctx, this.x, this.y, this.facing, this.rig, c.eyes, isGlow, this.sz);
    // Vorwarnung
    if (this.attack && this.attack.t < 0.25) {
      ctx.globalAlpha = 1 - this.attack.t / 0.25;
      ctx.fillStyle = isGlow ? '#ff2030' : '#ffd0d0';
      const y = this.y - this.h - 18;
      ctx.beginPath(); ctx.moveTo(this.x, y - 8); ctx.lineTo(this.x + 3, y); ctx.lineTo(this.x, y + 8); ctx.lineTo(this.x - 3, y); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  light() { return { x: this.x, y: this.y - this.h / 2, radius: 110, color: 'rgb(255,230,180)', intensity: 0.7 }; }
}

// === Bruder Ambrosius – Kerkermeister der Gruft ===========================

class Ambrosius extends Boss {
  patterns() {
    return [
      { name: 'swing', dur: 1.25, w: 3 },
      { name: 'slam', dur: 1.7, w: 2 },
      { name: 'orbs', dur: 1.2, w: 2 },
    ];
  }
  runAttack(dt, game, p, a) {
    const k = a.t;
    if (a.name === 'swing') {
      this.vx = approach(this.vx, 0, 600 * dt);
      this._animate(dt, 'swingOverhead', { progress: k < 0.65 ? k / 0.65 * 0.35 : 0.35 + (k - 0.65) / 0.25 * 0.65 });
      if (this.at(0.65)) { game.audio.play('swing', { x: this.x, gain: 1.4 }); this.vx = this.facing * 160; }
      if (k > 0.65 && k < 0.85) this.strike(game, p, 60, 44);
      if (this.at(0.8)) { game.fx.shake(0.35); game.particles.dust(this.x + this.facing * 40, this.y, 12); }
      this.physics(dt, game.world);
    } else if (a.name === 'slam') {
      this._animate(dt, k < 0.3 ? 'crouch' : 'jump');
      if (this.at(0.3)) { this.vy = -560; this.vx = clamp((p.x - this.x) * 1.6, -260, 260); game.audio.play('jump', { x: this.x, gain: 1.5 }); a.data.air = true; }
      const res = this.physics(dt, game.world);
      if (a.data.air && k > 0.4 && this.onGround) {
        a.data.air = false;
        this.vx = 0;
        game.fx.shake(0.7);
        game.audio.play('explosion', { x: this.x });
        game.particles.dust(this.x, this.y, 20);
        game.spawnProjectile(groundWave(this.x, this.floorY, -1, 230, this.damage, '#c0b090'));
        game.spawnProjectile(groundWave(this.x, this.floorY, 1, 230, this.damage, '#c0b090'));
        if (this.phase === 2) game.spawnProjectile(holyPillar(p.x, this.floorY, 220, 0.8, this.damage));
        a.t = Math.max(a.t, 1.2);
      }
      void res;
    } else if (a.name === 'orbs') {
      this.vx = 0;
      this.physics(dt, game.world);
      this._animate(dt, 'pray');
      if (this.at(0.55)) {
        const base = Math.atan2(p.y - 20 - (this.y - 40), p.x - this.x);
        const n = this.phase === 2 ? 5 : 3;
        for (let i = 0; i < n; i++) game.spawnProjectile(holyOrb(this.x + this.facing * 16, this.y - 40, base + (i - (n - 1) / 2) * 0.35, 140, 0.8, this.damage));
        game.audio.play('holyShot', { x: this.x, gain: 1.3 });
      }
    }
  }
  drawEmissive(ctx, game, isGlow) {
    super.drawEmissive(ctx, game, isGlow);
    if (this.rig && this.state !== 'dead') {
      // Glühendes Weihrauchfass
      const h = this.rig.armF.hand;
      const x = this.x + this.facing * h.x, y = this.y + h.y + 12 * this.sz;
      ctx.fillStyle = isGlow ? 'rgba(255,220,120,0.8)' : '#fff0c0';
      ctx.beginPath(); ctx.arc(x, y, isGlow ? 10 : 2.5, 0, TAU); ctx.fill();
    }
  }
}

// === Schwester Mirella – Weiherin der Wasser ===============================

class Mirella extends Boss {
  patterns() {
    return [
      { name: 'wave', dur: 1.7, w: 3 },
      { name: 'rain', dur: 2.4, w: 2 },
      { name: 'baptism', dur: 1.6, w: 2 },
    ];
  }
  idleMove(dt, game, p) { this.hover(dt, game, p, 58, 2.6); }
  runAttack(dt, game, p, a) {
    const k = a.t;
    this._animate(dt, 'pray');
    this.y = damp(this.y, this.floorY - 62 + Math.sin(this.animT * 1.5) * 6, 0.3, dt);
    if (a.name === 'wave') {
      if (this.at(0.5)) {
        const fromLeft = p.x > this.arena.x + this.arena.w / 2;
        const sx = fromLeft ? this.arena.x + 40 : this.arena.x + this.arena.w - 40;
        game.spawnProjectile(waterWave(sx, this.floorY, fromLeft ? 1 : -1, 190, this.damage));
        if (this.phase === 2) game.spawnProjectile(waterWave(fromLeft ? this.arena.x + this.arena.w - 40 : this.arena.x + 40, this.floorY, fromLeft ? -1 : 1, 130, this.damage));
        game.audio.play('mist', { x: sx, gain: 1.3 });
      }
    } else if (a.name === 'rain') {
      const n = this.phase === 2 ? 10 : 7;
      for (let i = 0; i < n; i++) {
        if (this.at(0.3 + i * 0.18)) {
          const x = this.arena.x + 40 + Math.random() * (this.arena.w - 80);
          const drop = new Projectile({ kind: 'holyOrb', x, y: this.arena.y + 20, vx: 0, vy: 150, w: 7, h: 7, damage: Math.round(this.damage * 0.8), life: 3, holy: true });
          game.spawnProjectile(drop);
        }
      }
    } else if (a.name === 'baptism') {
      if (this.at(0.2)) {
        game.particles.mist(this.x, this.y - 20, 10, '#6a90c0');
        this.x = clamp(p.x, this.arena.x + 50, this.arena.x + this.arena.w - 50);
        game.particles.mist(this.x, this.y - 20, 10, '#6a90c0');
        game.audio.play('mist', { x: this.x });
      }
      if (this.at(0.45)) {
        game.spawnProjectile(holyPillar(p.x, this.floorY, 180, 0.7, this.damage));
        if (this.phase === 2) { game.spawnProjectile(holyPillar(p.x - 50, this.floorY, 180, 0.9, this.damage)); game.spawnProjectile(holyPillar(p.x + 50, this.floorY, 180, 0.9, this.damage)); }
      }
    }
  }
}

// === Isolde von Hagen – Herrin der Hunde ===================================

class Isolde extends Boss {
  constructor(kind, arena) {
    super(kind, arena);
    this.hair = new Cloth(5, 2.8, 420, 0.1);
  }
  patterns(game) {
    const hounds = game.enemies.filter((e) => e.kind === 'hound' && !e.dead).length;
    return [
      { name: 'throw', dur: 1.1, w: 3 },
      { name: 'lunge', dur: 1.35, w: 2 },
      ...(hounds < 2 ? [{ name: 'whistle', dur: 1.0, w: 1.5 }] : []),
    ];
  }
  idleMove(dt, game, p) {
    const dx = p.x - this.x;
    this.facing = Math.sign(dx) || this.facing;
    const want = Math.abs(dx) < 80 ? -this.facing * 90 : Math.abs(dx) > 140 ? this.facing * 70 : 0;
    this.vx = approach(this.vx, want, 500 * dt);
    this.physics(dt, game.world);
  }
  update(dt, game) {
    super.update(dt, game);
    if (this.rig) this.hair.update(dt, this.x + this.facing * (this.rig.head.x - 2) , this.y + this.rig.head.y - 1, this.y, -this.vx * 3);
  }
  runAttack(dt, game, p, a) {
    const k = a.t;
    this.physics(dt, game.world);
    if (a.name === 'throw') {
      this.vx = approach(this.vx, 0, 500 * dt);
      this._animate(dt, 'cast', { progress: k / 1.1 });
      if (this.at(0.5)) {
        const n = this.phase === 2 ? 3 : 1;
        for (let i = 0; i < n; i++) {
          const s = thrownSpear(this.x + this.facing * 10, this.y - 30, p.x + (i - (n - 1) / 2) * 50, p.y - 26, 400);
          s.damage = this.damage;
          game.spawnProjectile(s);
        }
        game.audio.play('arrow', { x: this.x, gain: 1.2 });
      }
    } else if (a.name === 'lunge') {
      if (k < 0.55) { this.vx = approach(this.vx, 0, 800 * dt); this._animate(dt, 'crouch'); }
      else if (k < 0.95) {
        if (this.at(0.55)) { this.vx = this.facing * 430; game.audio.play('dash', { x: this.x, gain: 1.3 }); }
        this._animate(dt, 'attack3', { progress: 0.5 });
        this.strike(game, p, 40, 30, 0, true);
        if (Math.random() < 0.6) game.particles.dust(this.x, this.y, 1);
      } else { this.vx = approach(this.vx, 0, 900 * dt); this._animate(dt, 'idle'); }
    } else if (a.name === 'whistle') {
      this.vx = 0;
      this._animate(dt, 'pray');
      if (this.at(0.4)) {
        game.audio.play('alert', { x: this.x, gain: 1.4 });
        for (const side of [-1, 1]) game.spawnEnemy('hound', side < 0 ? this.arena.x + 40 : this.arena.x + this.arena.w - 40, this.floorY);
      }
    }
  }
}

// === Skriptor Malachias – Der dich aufgeschrieben hat ======================

class Malachias extends Boss {
  patterns() {
    return [
      { name: 'books', dur: 1.3, w: 3 },
      { name: 'glyphs', dur: 2.6, w: 2 },
      { name: 'blades', dur: 1.5, w: 2 },
    ];
  }
  idleMove(dt, game, p) { this.hover(dt, game, p, 54, 3.0); }
  runAttack(dt, game, p, a) {
    this._animate(dt, 'pray');
    if (a.name === 'books') {
      const n = this.phase === 2 ? 5 : 3;
      for (let i = 0; i < n; i++) {
        if (this.at(0.35 + i * 0.16)) {
          const ang = -Math.PI / 2 + (i - (n - 1) / 2) * 0.6;
          const b = flyingBook(this.x, this.y - 30, ang);
          b.damage = Math.round(this.damage * 0.8);
          game.spawnProjectile(b);
          game.audio.play('bat', { x: this.x, gain: 0.6 });
        }
      }
    } else if (a.name === 'glyphs') {
      // Säulen fegen von einer Seite zur anderen – man muss durch die Lücke
      const fromLeft = a.data.fromLeft ?? (a.data.fromLeft = Math.random() < 0.5);
      const n = 7;
      for (let i = 0; i < n; i++) {
        if (this.at(0.2 + i * 0.22)) {
          const idx = fromLeft ? i : n - 1 - i;
          const x = this.arena.x + (idx + 0.5) * (this.arena.w / n);
          game.spawnProjectile(holyPillar(x, this.floorY, 200, 0.7, this.damage, 26));
        }
      }
    } else if (a.name === 'blades') {
      if (this.at(0.2)) {
        game.particles.holy(this.x, this.y - 20, 12);
        this.x = p.x < this.arena.x + this.arena.w / 2 ? this.arena.x + this.arena.w - 50 : this.arena.x + 50;
        this.facing = p.x < this.x ? -1 : 1;
        game.particles.holy(this.x, this.y - 20, 12);
      }
      if (this.at(0.6)) game.spawnProjectile(lightBlade(this.x, this.floorY - 20, this.facing, 260, this.damage));
      if (this.phase === 2 && this.at(0.95)) game.spawnProjectile(lightBlade(this.x, this.floorY - 58, this.facing, 260, this.damage));
    }
  }
  draw(ctx, game) {
    super.draw(ctx, game);
    if (this.state === 'dead') return;
    // Kreisende Bücher
    for (let i = 0; i < 3; i++) {
      const ang = this.animT * 1.6 + (i / 3) * TAU;
      const bx = this.x + Math.cos(ang) * 30, by = this.y - 30 + Math.sin(ang) * 12;
      ctx.save(); ctx.translate(bx, by); ctx.rotate(Math.sin(ang) * 0.3);
      ctx.fillStyle = '#6a1e14'; ctx.fillRect(-5, -4, 10, 8);
      ctx.fillStyle = '#f0e4c8'; ctx.fillRect(-4, -3, 8, 1.5);
      ctx.restore();
    }
  }
}

// === Magister Cogliostro – im Uhrwerk-Koloss ===============================

class Cogliostro extends Boss {
  constructor(kind, arena) {
    super(kind, arena);
    this.stunT = 0;
  }
  patterns() {
    return [
      { name: 'gears', dur: 1.3, w: 2 },
      { name: 'charge', dur: 3.2, w: 2 },
      { name: 'flame', dur: 1.5, w: 2 },
      ...(this.phase === 2 ? [{ name: 'sunlamp', dur: 2.0, w: 1.5 }] : []),
    ];
  }
  runAttack(dt, game, p, a) {
    const k = a.t;
    this.armor = 1;
    if (a.name === 'gears') {
      this.vx = approach(this.vx, 0, 500 * dt);
      const n = this.phase === 2 ? 3 : 2;
      for (let i = 0; i < n; i++) if (this.at(0.4 + i * 0.25)) {
        const g = bouncingGear(this.x + this.facing * 20, this.y - 50, this.facing);
        g.vx = this.facing * (120 + i * 60); g.damage = this.damage;
        game.spawnProjectile(g);
        game.audio.play('gear', { x: this.x });
      }
    } else if (a.name === 'charge') {
      if (k < 0.8) { this.vx = 0; if (Math.random() < 0.5) game.particles.dust(this.x - this.facing * 20, this.y - 50, 1, '#e0e0e0'); }
      else if (!a.data.stunned) {
        this.vx = this.facing * 360;
        this.strike(game, p, 50, 50, 0, true);
        if (Math.random() < 0.8) game.particles.dust(this.x, this.y, 1);
        // Wand erreicht → betäubt, Zahnräder fallen
        const edge = this.facing > 0 ? this.x >= this.arena.x + this.arena.w - 32 - this.w / 2 : this.x <= this.arena.x + 32 + this.w / 2;
        if (edge) {
          a.data.stunned = true;
          a.data.stunAt = k;
          this.vx = -this.facing * 60;
          game.fx.shake(0.8);
          game.audio.play('explosion', { x: this.x });
          for (let i = 0; i < 3; i++) {
            const gx = this.arena.x + 60 + Math.random() * (this.arena.w - 120);
            const g = bouncingGear(gx, this.arena.y + 20, Math.random() < 0.5 ? -1 : 1);
            g.vy = 0; g.damage = this.damage;
            game.spawnProjectile(g);
          }
        }
        if (k > 2.6 && !a.data.stunned) a.t = a.dur;
      } else {
        // Betäubt: doppelter Schaden – das ist deine Chance!
        this.vx = approach(this.vx, 0, 200 * dt);
        this.armor = 2;
        if (Math.random() < 0.3) game.particles.sparks(this.x, this.y - 50, '#ffd070', 2, 80);
        if (k - a.data.stunAt > 1.5) a.t = a.dur;
      }
    } else if (a.name === 'flame') {
      this.vx = 0;
      for (let i = 0; i < 5; i++) if (this.at(0.5 + i * 0.1)) {
        const base = Math.atan2(p.y - 20 - (this.y - 44), p.x - this.x);
        const f = flameShot(this.x + this.facing * 24, this.y - 44, base + (i - 2) * 0.18, 210);
        f.damage = Math.round(this.damage * 0.8);
        game.spawnProjectile(f);
      }
      if (this.at(0.5)) game.audio.play('wolf', { x: this.x });
    } else if (a.name === 'sunlamp') {
      this.vx = 0;
      if (this.at(0.3)) for (let i = 0; i < 4; i++) game.spawnProjectile(holyPillar(this.arena.x + 40 + Math.random() * (this.arena.w - 80), this.floorY, 220, 0.8 + i * 0.12, this.damage));
      if (this.at(0.5)) game.spawnProjectile(holyPillar(p.x, this.floorY, 220, 0.8, this.damage));
    }
    this.physics(dt, game.world);
  }
  draw(ctx, game) {
    const x = this.x, y = this.y;
    const stunned = this.attack?.name === 'charge' && this.attack.data.stunned;
    const walk = Math.sin(this.animT * (Math.abs(this.vx) > 10 ? 8 : 1.5));
    outlined(ctx, x, y, 1.5, (c) => {
      c.save();
      c.translate(x, y);
      c.scale(this.facing, 1);
      // Kolbenbeine
      for (const [lx, ph] of [[-12, 0], [12, Math.PI]]) {
        const lift = Math.max(0, Math.sin(this.animT * 8 + ph)) * (Math.abs(this.vx) > 10 ? 4 : 0);
        const leg = new Path2D(); leg.rect(lx - 4, -22 - lift, 8, 20);
        cel(c, leg, '#8a6a34', '#4a3818', 0.8, -0.8, '#d0a860');
        const foot = new Path2D(); foot.rect(lx - 7, -3 - lift, 14, 3);
        cel(c, foot, '#5a4422', '#2e2210', 0.5, -0.5);
      }
      // Kessel-Rumpf
      const body = smoothPath([P(-24, -22, true), P(-26, -48), P(-16, -60, true), P(16, -60, true), P(26, -48), P(24, -22, true)]);
      cel(c, body, '#b08440', '#6a4c20', 1.4, -1.2, '#ffe0a0');
      c.strokeStyle = '#4a3010'; c.lineWidth = 1;
      for (let i = -18; i <= 18; i += 9) { c.beginPath(); c.moveTo(i, -58); c.lineTo(i * 1.1, -24); c.stroke(); }
      c.fillStyle = '#e8c070';
      for (let i = -20; i <= 20; i += 8) { c.beginPath(); c.arc(i, -26, 1, 0, TAU); c.fill(); c.beginPath(); c.arc(i, -56, 1, 0, TAU); c.fill(); }
      // Druckanzeige
      c.fillStyle = '#f4ecd8'; c.beginPath(); c.arc(-12, -40, 5, 0, TAU); c.fill();
      c.strokeStyle = '#3a2008'; c.lineWidth = 0.8; c.stroke();
      c.beginPath(); c.moveTo(-12, -40); c.lineTo(-12 + Math.cos(this.animT * 3) * 4, -40 + Math.sin(this.animT * 3) * 4); c.stroke();
      // Glaskuppel mit Cogliostro
      const dome = new Path2D(); dome.arc(6, -60, 11, Math.PI, 0);
      c.fillStyle = 'rgba(200,230,255,0.35)'; c.fill(dome);
      c.save(); c.clip(dome);
      c.restore();
      // Arm mit Greifzange
      const armA = stunned ? 0.8 : Math.sin(this.animT * 2) * 0.2 - 0.3;
      c.save(); c.translate(22, -44); c.rotate(armA);
      const arm = new Path2D(); arm.rect(0, -3, 18, 6);
      cel(c, arm, '#9a7438', '#5a4018', 0.5, -0.5, '#e0b870');
      c.fillStyle = '#5a4018';
      c.beginPath(); c.moveTo(18, -5); c.lineTo(25, -8); c.lineTo(22, -2); c.fill();
      c.beginPath(); c.moveTo(18, 5); c.lineTo(25, 8); c.lineTo(22, 2); c.fill();
      c.restore();
      // Schornstein
      const chim = new Path2D(); chim.rect(-18, -72, 6, 14);
      cel(c, chim, '#6a5030', '#3a2a14', 0.4, -0.4);
      c.restore();
    }, { box: 130, footAt: 0.82, flash: this.flash * 0.85, alpha: this.state === 'dead' ? Math.max(0, 1 - (game.time - (this._deadAt ??= game.time))) : 1 });
    // Cogliostro in der Kuppel (kleine Figur)
    if (this.state !== 'dead') {
      const pose = makePose(stunned ? 'hurt' : 'idle', this.animT);
      drawHumanoid(ctx, x + this.facing * 6, y - 52, this.facing, pose, COSTUMES.cogliostro, { sz: 0.5 });
    }
  }
  drawEmissive(ctx, game, isGlow) {
    if (this.state === 'dead') return;
    // Glühender Kesselkern und Dampf
    const x = this.x + this.facing * 8, y = this.y - 36;
    ctx.fillStyle = isGlow ? 'rgba(255,170,60,0.9)' : '#ffe0a0';
    ctx.beginPath(); ctx.arc(x, y, isGlow ? 12 : 3.5, 0, TAU); ctx.fill();
    if (Math.random() < 0.3) game.particles.spawn({ kind: 'soft', x: this.x - this.facing * 15, y: this.y - 74, vx: 0, vy: -40, life: 0.8, size: 3, size1: 9, color: '#d8d8d8', alpha: 0.35 });
    super.drawEmissive(ctx, game, isGlow);
  }
  light() { return { x: this.x, y: this.y - 40, radius: 140, color: 'rgb(255,180,90)', intensity: 1.0 }; }
}

// === Großinquisitorin Serafine Sonnenschwur ================================

class Serafine extends Boss {
  constructor(kind, arena) {
    super(kind, arena);
    this.cape = new Cloth(8, 3.4, 520, 0.08);
    this.hair = new Cloth(5, 2.8, 400, 0.12);
    this.wings = 0;
  }
  patterns() {
    if (this.phase === 1) return [
      { name: 'combo', dur: 1.7, w: 3 },
      { name: 'blade', dur: 1.1, w: 2 },
      { name: 'dash', dur: 1.2, w: 2 },
    ];
    return [
      { name: 'sunrain', dur: 2.4, w: 2 },
      { name: 'ring', dur: 1.5, w: 2 },
      { name: 'dive', dur: 1.9, w: 3 },
      { name: 'blade', dur: 1.1, w: 1 },
    ];
  }
  onPhase2(game) {
    this.fly = true;
    this.gravity = 0;
    game.startScene('kathedrale.boss.phase2');
  }
  idleMove(dt, game, p) {
    if (!this.fly) return super.idleMove(dt, game, p);
    this.wings = damp(this.wings, 1, 0.3, dt);
    this.hover(dt, game, p, 62, 2.2);
  }
  update(dt, game) {
    super.update(dt, game);
    if (this.rig) {
      const f = this.facing;
      this.cape.update(dt, this.x + f * (this.rig.neck.x - 1.6 * this.sz), this.y + this.rig.neck.y + 1.2, this.y, -this.vx * 3 + (this.fly ? -150 * f : 0));
      this.hair.update(dt, this.x + f * (this.rig.head.x - 2.2 * this.sz), this.y + this.rig.head.y - 1, this.y, -this.vx * 2);
    }
    if (this.fly && this.state === 'fight' && Math.random() < 0.4) game.particles.holy(this.x - this.facing * 10, this.y - 30, 1);
  }
  runAttack(dt, game, p, a) {
    const k = a.t;
    if (a.name === 'combo') {
      for (const t0 of [0.35, 0.8, 1.25]) {
        if (this.at(t0 - 0.25)) this.facing = p.x < this.x ? -1 : 1;
        if (this.at(t0)) { this.vx = this.facing * 180; game.audio.play('swing', { x: this.x, gain: 1.2 }); this.attack.id = newAttackId(); }
        if (k > t0 && k < t0 + 0.15) this.strike(game, p, 46, 34, 0, true);
      }
      this.vx = approach(this.vx, 0, 600 * dt);
      this._animate(dt, 'attack1', { progress: ((k - 0.1) % 0.45) / 0.45 });
      this.physics(dt, game.world);
    } else if (a.name === 'blade') {
      this.vx = 0;
      this._animate(dt, 'attack3', { progress: clamp(k / 0.7, 0, 1) });
      if (this.at(0.45)) {
        game.spawnProjectile(lightBlade(this.x + this.facing * 20, this.fly ? this.y - 20 : this.floorY - 20, this.facing, 300, this.damage));
        game.audio.play('holyShot', { x: this.x, gain: 1.3 });
      }
      if (!this.fly) this.physics(dt, game.world);
    } else if (a.name === 'dash') {
      if (k < 0.5) { this.vx = 0; this._animate(dt, 'crouch'); }
      else if (k < 0.9) {
        if (this.at(0.5)) { this.vx = this.facing * 500; game.audio.play('dash', { x: this.x, gain: 1.4 }); }
        this._animate(dt, 'dash');
        this.strike(game, p, 36, 32, 0, true);
        game.particles.holy(this.x, this.y - 20, 1);
      } else { this.vx = approach(this.vx, 0, 1200 * dt); this._animate(dt, 'idle'); }
      this.physics(dt, game.world);
    } else if (a.name === 'sunrain') {
      this._animate(dt, 'pray');
      for (let i = 0; i < 6; i++) if (this.at(0.3 + i * 0.25)) {
        const x = i % 2 ? p.x : this.arena.x + 40 + Math.random() * (this.arena.w - 80);
        game.spawnProjectile(holyPillar(x, this.floorY, 230, 0.75, this.damage));
      }
    } else if (a.name === 'ring') {
      this._animate(dt, 'pray');
      if (this.at(0.6)) {
        for (let i = 0; i < 10; i++) game.spawnProjectile(holyOrb(this.x, this.y - 24, (i / 10) * TAU, 120, 0.25, Math.round(this.damage * 0.8)));
        game.particles.ring(this.x, this.y - 24, '#fff4c0', 8, 70, 0.5);
        game.audio.play('holyShot', { x: this.x, gain: 1.5 });
      }
    } else if (a.name === 'dive') {
      if (k < 0.7) {
        // Über den Spieler steigen
        this.x = damp(this.x, p.x, 0.12, dt);
        this.y = damp(this.y, this.floorY - 110, 0.12, dt);
        this._animate(dt, 'jump');
      } else if (k < 1.1) {
        if (this.at(0.7)) { a.data.tx = p.x; game.audio.play('dash', { x: this.x, gain: 1.4 }); }
        this.y = approach(this.y, this.floorY, 520 * dt);
        this.x = approach(this.x, a.data.tx, 200 * dt);
        this._animate(dt, 'attack2', { progress: 0.6 });
        this.strike(game, p, 30, 40, 10, true);
        if (this.y >= this.floorY - 1 && !a.data.hit) {
          a.data.hit = true;
          game.fx.shake(0.6);
          game.spawnProjectile(groundWave(this.x, this.floorY, -1, 240, this.damage, '#fff0c0'));
          game.spawnProjectile(groundWave(this.x, this.floorY, 1, 240, this.damage, '#fff0c0'));
        }
      } else {
        this.y = damp(this.y, this.floorY - 70, 0.25, dt);
        this._animate(dt, 'idle');
      }
    }
  }
  drawEmissive(ctx, game, isGlow) {
    // Lichtflügel in Phase 2
    if (this.wings > 0.02 && this.state !== 'dead') {
      const x = this.x, y = this.y - 30 * CHAR_SCALE;
      const flap = Math.sin(this.animT * 4) * 0.15;
      ctx.globalAlpha = this.wings * (isGlow ? 0.8 : 0.55);
      for (const s of [-1, 1]) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(s, 1);
        ctx.rotate(-0.2 + flap);
        ctx.fillStyle = isGlow ? 'rgba(255,230,150,0.9)' : '#fff8e0';
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.ellipse(10 + i * 7, -10 + i * 5, 22 - i * 2, 4, -0.5 + i * 0.22, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
    super.drawEmissive(ctx, game, isGlow);
  }
  light() { return { x: this.x, y: this.y - 24, radius: this.fly ? 200 : 120, color: 'rgb(255,240,200)', intensity: this.fly ? 1.4 : 0.9 }; }
}

void lerp; void solveRig;
