// Die Jäger des Ordens vom Silbernen Morgen – und was sie gegen dich aufbieten.
//
// Gemeinsames Muster: Wache/Patrouille → entdeckt dich → verfolgt →
// Vorwarnung (rotes Aufblitzen) → Angriff → Erholung.
// Unter 35 % Leben gehen sie einmal in die Knie: dann kannst du trinken.

import { Entity } from './entity.js';

import { clamp, approach, TAU, dist } from '../core/math.js';
import { newAttackId, resolveAttack, rollDamage, impactFx } from './combat.js';
import { makePose, blendPose, drawHumanoid, drawEyesGlow, COSTUMES, outlined, cel, smoothPath, P } from '../render/puppet.js';
import { silverBolt, holyOrb, holyPillar, thrownBone } from './projectiles.js';

export const ENEMY_DEFS = {
  novice:     { name: 'Novize',            hp: 30, dmg: 10, speed: 50, chase: 92,  w: 14, h: 30, ai: 'melee',   range: 24, windup: 0.42, active: 0.16, recover: 0.5, sight: 170, attackAnim: 'attack3' },
  skeleton:   { name: 'Geweihte Gebeine',  hp: 26, dmg: 9,  speed: 38, chase: 68,  w: 12, h: 30, ai: 'thrower', range: 22, windup: 0.45, active: 0.14, recover: 0.6, sight: 180, attackAnim: 'attack1', throwCd: 2.6 },
  acolyte:    { name: 'Akolyth',           hp: 40, dmg: 11, speed: 30, chase: 44,  w: 15, h: 30, ai: 'priest',  range: 26, windup: 0.5,  active: 0.2,  recover: 0.6, sight: 190, attackAnim: 'attack1', auraR: 44 },
  crossbow:   { name: 'Armbrustjäger',     hp: 28, dmg: 13, speed: 44, chase: 66,  w: 14, h: 30, ai: 'shooter', keepAway: 110, windup: 0.8, recover: 1.0, sight: 230 },
  knight:     { name: 'Silberritter',      hp: 64, dmg: 16, speed: 30, chase: 56,  w: 18, h: 32, ai: 'knight',  range: 30, windup: 0.65, active: 0.2, recover: 0.85, sight: 170, shield: true, poise: 0.7 },
  inquisitor: { name: 'Inquisitor',        hp: 52, dmg: 18, speed: 28, chase: 36,  w: 15, h: 31, ai: 'caster',  windup: 0.95, recover: 1.5, sight: 250 },
  automaton:  { name: 'Uhrwerk-Wächter',   hp: 56, dmg: 15, speed: 34, chase: 62,  w: 17, h: 32, ai: 'spinner', range: 34, windup: 0.55, active: 0.7, recover: 0.85, sight: 180, poise: 0.5 },
  hound:      { name: 'Jagdhund',          hp: 22, dmg: 10, speed: 66, chase: 170, w: 24, h: 16, ai: 'hound',   range: 74, windup: 0.32, active: 0.4, recover: 0.6, sight: 230 },
  tome:       { name: 'Fluchbuch',         hp: 16, dmg: 9,  speed: 40, chase: 80,  w: 14, h: 12, ai: 'flyer',   range: 100, windup: 0.45, active: 0.55, recover: 0.9, sight: 210, fly: true },
};

const STAGGER_AT = 0.35;

export class Enemy extends Entity {
  constructor(kind, x, y, zoneIndex = 0, opts = {}) {
    const d = ENEMY_DEFS[kind];
    super(x, y, d.w, d.h);
    this.kind = kind;
    this.def = d;
    this.team = 'enemy';
    this.hurtable = true;
    const hpMul = 1 + zoneIndex * 0.3;
    this.maxHp = this.hp = Math.round(d.hp * hpMul);
    this.damage = Math.round(d.dmg * (1 + zoneIndex * 0.16));
    this.state = opts.passive ? 'idle' : 'patrol';
    this.passive = !!opts.passive;     // Tutorial-Skelett: greift erst an, wenn es angegriffen wird
    this.stateT = Math.random() * 0.5;
    this.facing = Math.random() < 0.5 ? -1 : 1;
    this.homeX = x;
    this.aware = 0;                    // Sekunden seit der Spieler zuletzt gesehen wurde
    this.cd = 1 + Math.random();       // Abklingzeit für Fernangriffe
    this.staggered = false;
    this.drainable = false;
    this.shieldBroken = false;
    this.attackId = 0;
    this.pose = makePose('idle', 0);
    this.animT = Math.random() * 10;
    this.phase = 0;
    this.deadT = 0;
    this.drainedBy = null;
    this.alertFlash = 0;
    this.fly = !!d.fly;
    if (this.fly) { this.gravity = 0; this.baseY = y - 50; this.y = this.baseY; }
    this.auraT = 0;
    this.rig = null;
    this.spawnX = x; this.spawnY = this.y;
    // Arena-Gegner und gerufene Hunde vergessen den Spieler nie.
    this.alwaysAware = !!opts.alwaysAware;
  }

  get alive() { return !this.dead; }

  // === Wahrnehmung =========================================================

  _see(game) {
    const p = game.player;
    if (!p || p.state === 'dead') return false;
    const dx = p.x - this.x, dy = (p.y - p.h / 2) - (this.y - this.h / 2);
    const d = Math.hypot(dx, dy);
    if (d > this.def.sight) return false;
    if (Math.abs(dy) > 90 && !this.fly) return false;
    // Wer schon alarmiert ist, sieht auch nach hinten.
    if (this.aware <= 0 && Math.sign(dx) !== this.facing && d > 50) return false;
    return game.world.lineOfSight(this.x, this.y - this.h * 0.7, p.x, p.y - p.h * 0.6);
  }

  // === Hauptschleife =======================================================

  update(dt, game) {
    super.update(dt, game);
    this.stateT += dt;
    this.animT += dt;
    this.flash = Math.max(0, this.flash - dt * 6);
    this.alertFlash = Math.max(0, this.alertFlash - dt * 2.5);
    this.cd = Math.max(0, this.cd - dt);

    if (this.dead) { this._updateDead(dt, game); return; }
    if (this.state === 'drained') { this.vx = 0; this.physicsStep(dt, game); this._animate(dt); return; }

    const p = game.player;
    const sees = this._see(game);
    if (sees && !this.passive) {
      if (this.aware <= 0) { this.alertFlash = 1; game.audio.play('alert', { x: this.x, gain: 0.5 }); }
      this.aware = 3;
    } else this.aware = this.alwaysAware ? 3 : Math.max(0, this.aware - dt);

    switch (this.state) {
      case 'hurt':
        this.vx = approach(this.vx, 0, 700 * dt);
        if (this.stateT > 0.25) this._to('chase');
        break;
      case 'stagger':
        this.vx = approach(this.vx, 0, 800 * dt);
        this.drainable = true;
        if (this.stateT > 3.2) {
          // Er rappelt sich wieder auf.
          this.drainable = false;
          this.hp = Math.max(this.hp, Math.round(this.maxHp * 0.3));
          this._to('chase');
        }
        break;
      default:
        this._ai(dt, game, p, sees);
    }

    this.physicsStep(dt, game);
    this._contact(game, p);
    this._animate(dt);
  }

  physicsStep(dt, game) {
    if (this.fly) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      // Fliegende Gegner prallen an Wänden ab
      if (game.world.rectSolid(this.left, this.top, this.w, this.h)) {
        this.x -= this.vx * dt; this.y -= this.vy * dt;
        this.vx *= -0.5; this.vy *= -0.5;
      }
      return;
    }
    const res = this.physics(dt, game.world);
    if (res.hitWall && (this.state === 'patrol')) this.facing = -this.facing;
  }

  _to(state) {
    this.state = state;
    this.stateT = 0;
  }

  /** Steht vor mir Boden? Verhindert, dass Gegner in Abgründe laufen. */
  _groundAhead(game, dir) {
    const ax = this.x + dir * (this.w / 2 + 4);
    return game.world.groundBelow(ax, this.y, 0);
  }

  _walk(dt, game, dir, speed) {
    if (!this.fly && (!this._groundAhead(game, dir) || game.world.rectSolid(this.x + dir * (this.w / 2 + 2) - 1, this.top + 2, 2, this.h - 4))) {
      this.vx = approach(this.vx, 0, 900 * dt);
      return false;
    }
    this.vx = approach(this.vx, dir * speed, 700 * dt);
    return true;
  }

  // === KI ==================================================================

  _ai(dt, game, p, sees) {
    const d = this.def;
    const dx = p.x - this.x;
    const adx = Math.abs(dx);
    const dy = p.y - this.y;
    const dir = Math.sign(dx) || 1;

    if (this.state === 'idle') {
      this.vx = approach(this.vx, 0, 600 * dt);
      if (!this.passive && this.aware > 0) this._to('chase');
      return;
    }

    if (this.state === 'patrol') {
      if (this.aware > 0) { this._to('chase'); return; }
      if (this.fly) {
        this.vx = Math.cos(this.animT * 0.6) * 30;
        this.vy = (this.baseY + Math.sin(this.animT * 1.6) * 8 - this.y) * 2;
        this.facing = this.vx >= 0 ? 1 : -1;
        return;
      }
      // Hin und her um den Startpunkt, kurze Pausen an den Enden
      if (Math.abs(this.x - this.homeX) > 70 && Math.sign(this.x - this.homeX) === this.facing) this.facing = -this.facing;
      const moved = this._walk(dt, game, this.facing, d.speed);
      if (!moved && this.stateT > 0.6) { this.facing = -this.facing; this.stateT = 0; }
      return;
    }

    if (this.state === 'chase') {
      if (this.aware <= 0) { this._to('patrol'); this.homeX = this.x; return; }
      this.facing = dir;
      switch (d.ai) {
        case 'shooter': {
          if (adx < d.keepAway && this._groundAhead(game, -dir)) this._walk(dt, game, -dir, d.chase);
          else this.vx = approach(this.vx, 0, 800 * dt);
          if (this.cd <= 0 && sees) this._to('windup');
          return;
        }
        case 'caster': {
          this.vx = approach(this.vx, 0, 600 * dt);
          if (this.cd <= 0 && sees) this._to('windup');
          else if (adx < 70 && this.cd <= 0.5) this._teleport(game, p);
          return;
        }
        case 'flyer': {
          // Schwebt schräg über dem Spieler
          const tx = p.x - dir * 50, ty = p.y - 70;
          this.vx = approach(this.vx, clamp((tx - this.x) * 2, -d.chase, d.chase), 400 * dt);
          this.vy = approach(this.vy, clamp((ty - this.y) * 2, -d.chase, d.chase), 400 * dt);
          if (this.cd <= 0 && dist(this.x, this.y, p.x, p.y - 15) < d.range + 30) this._to('windup');
          return;
        }
        case 'thrower': {
          if (this.cd <= 0 && adx > 50 && adx < 170 && Math.abs(dy) < 50 && sees) { this._to('windup'); this.throwing = true; return; }
          break;
        }
        case 'priest': {
          this.auraT += dt;
          if (this.cd <= 0 && sees && adx > 60) { this.cd = 4; game.spawnProjectile(holyOrb(this.x + dir * 10, this.y - 24, Math.atan2(p.y - 20 - (this.y - 24), dx), 130, 1.2, Math.round(this.damage * 0.9))); game.audio.play('holyShot', { x: this.x }); }
          break;
        }
        default: break;
      }
      // Nahkämpfer: herankommen, dann ausholen
      const range = d.range ?? 26;
      if (adx > range * 0.85) {
        const moved = this._walk(dt, game, dir, d.chase);
        if (!moved && d.ai === 'hound' && adx < d.range * 1.5) this._to('windup');
      } else {
        this.vx = approach(this.vx, 0, 900 * dt);
      }
      if (adx <= range && Math.abs(dy) < 36 && this.stateT > 0.2) {
        this.throwing = false;
        this._to('windup');
      }
      return;
    }

    if (this.state === 'windup') {
      this.vx = approach(this.vx, 0, 900 * dt);
      if (this.stateT < 0.05) { this.alertFlash = 1; this.facing = dir; }
      if (d.ai === 'flyer') { this.vx *= 0.9; this.vy = Math.sin(this.stateT * 60) * 20; }
      if (this.stateT >= d.windup) this._startAttack(game, p, dir);
      return;
    }

    if (this.state === 'attack') {
      this._updateAttack(dt, game, p);
      return;
    }

    if (this.state === 'recover') {
      this.vx = approach(this.vx, 0, 700 * dt);
      if (this.fly) this.vy = approach(this.vy, -30, 200 * dt);
      if (this.stateT >= d.recover) this._to('chase');
    }
  }

  _startAttack(game, p, dir) {
    const d = this.def;
    this._to('attack');
    this.attackId = newAttackId();
    switch (d.ai) {
      case 'shooter':
        game.spawnProjectile(silverBolt(this.x + this.facing * 12, this.y - 20, p.x, p.y - 16));
        game.audio.play('arrow', { x: this.x });
        this.cd = 2.2;
        this._to('recover');
        return;
      case 'caster': {
        // Drei Lichtsäulen: auf dem Spieler und daneben
        const floorY = p.onGround ? p.y : p.y + 40;
        for (const off of [0, -44, 44]) game.spawnProjectile(holyPillar(p.x + off, floorY, 200, 0.85 + Math.abs(off) * 0.004, this.damage));
        game.audio.play('holyShot', { x: this.x, gain: 1.2 });
        this.cd = 3.5;
        this._to('recover');
        return;
      }
      case 'thrower':
        if (this.throwing) {
          const bone = thrownBone(this.x, this.y - 22, this.facing);
          bone.vx = clamp((p.x - this.x) / 0.75, -230, 230);
          bone.damage = this.damage;
          game.spawnProjectile(bone);
          game.audio.play('swing', { x: this.x, gain: 0.7 });
          this.cd = d.throwCd;
          this.throwing = false;
          this._to('recover');
          return;
        }
        break;
      case 'hound':
        this.vx = this.facing * 250;
        this.vy = -230;
        game.audio.play('swing', { x: this.x });
        break;
      case 'flyer': {
        const a = Math.atan2(p.y - 16 - this.y, p.x - this.x);
        this.vx = Math.cos(a) * 240; this.vy = Math.sin(a) * 240;
        game.audio.play('swing', { x: this.x });
        break;
      }
      case 'knight':
        this.vx = this.facing * 110;
        game.audio.play('swing', { x: this.x, gain: 1.2 });
        break;
      case 'spinner':
        game.audio.play('gear', { x: this.x });
        break;
      default:
        this.vx = this.facing * 60;
        game.audio.play('swing', { x: this.x, gain: 0.8 });
    }
  }

  _updateAttack(dt, game, p) {
    const d = this.def;
    let hb = null;
    if (d.ai === 'hound' || d.ai === 'flyer') {
      hb = { x: this.left - 2, y: this.top - 2, w: this.w + 4, h: this.h + 4 };
      if (d.ai === 'flyer') { this.vx *= 0.985; this.vy *= 0.985; }
    } else if (d.ai === 'spinner') {
      // Wirbel: trifft rundum und rückt dabei vor
      this.vx = approach(this.vx, this.facing * 70, 400 * dt);
      if (Math.floor(this.stateT * 12) !== Math.floor((this.stateT - dt) * 12)) this.attackId = newAttackId();
      hb = { x: this.x - 22, y: this.y - 30, w: 44, h: 26 };
    } else {
      const reach = (d.range ?? 26) + 6;
      hb = { x: this.facing > 0 ? this.x : this.x - reach, y: this.y - 26, w: reach, h: 18 };
    }
    if (this.stateT <= (d.active ?? 0.2)) {
      resolveAttack(game, { ...hb, id: this.attackId, team: 'enemy', damage: this.damage, heavy: d.ai === 'knight', dir: this.facing }, [p]);
    }
    if (d.ai === 'priest' && this.stateT < 0.05) this._holyPulse(game, p);
    if (this.stateT >= (d.active ?? 0.2)) {
      this._to('recover');
      if (d.ai === 'flyer') this.cd = 1.2;
    }
  }

  /** Heiliger Impuls des Weihrauchfasses – trifft im Umkreis. */
  _holyPulse(game, p) {
    const r = this.def.auraR;
    game.particles.ring(this.x, this.y - 18, '#fff0b0', 6, r, 0.4);
    game.particles.holy(this.x, this.y - 18, 10);
    game.audio.play('holyShot', { x: this.x, gain: 0.8 });
    if (dist(this.x, this.y - 18, p.x, p.y - 15) < r + 6) p.hurt(game, Math.round(this.damage * 0.8), this.x, { holy: true });
  }

  _teleport(game, p) {
    game.particles.holy(this.x, this.y - 16, 14);
    const side = Math.random() < 0.5 ? -1 : 1;
    for (const off of [side * 120, -side * 120, side * 90]) {
      const nx = p.x + off;
      if (game.world.groundBelow(nx, p.y, 4) && !game.world.rectSolid(nx - this.w / 2, p.y - this.h, this.w, this.h)) {
        this.x = nx; this.y = p.y;
        break;
      }
    }
    game.particles.holy(this.x, this.y - 16, 14);
    game.audio.play('mist', { x: this.x, gain: 0.7 });
    this.cd = 1.2;
  }

  /** Berührungsschaden – wer in einen Gegner läuft, bekommt etwas ab. */
  _contact(game, p) {
    if (this.state === 'stagger' || this.state === 'drained' || this.state === 'hurt' || this.passive) return;
    if (p.invuln > 0 || p.state === 'dead') return;
    const a = this.rect(), b = p.rect();
    if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
      p.hurt(game, Math.round(this.damage * 0.6), this.x);
    }
  }

  // === Getroffen werden ===================================================

  takeHit(game, attack) {
    if (this.dead || this.state === 'drained') return false;
    const d = this.def;
    // Schild blockt Angriffe von vorn – außer Wolfsklaue und Blutlanze.
    if (d.shield && !this.shieldBroken && this.state !== 'stagger' && attack.dir === -this.facing) {
      if (attack.breaksShield) {
        this.shieldBroken = true;
        game.particles.debris(this.x + this.facing * 8, this.y - 18, '#dfe3f0', 10, 220);
        game.audio.play('glassBreak', { x: this.x });
        game.fx.shake(0.3);
        game.fx.hitstop(0.1);
        this._to('stagger');
        this.staggered = true;
        return 0;
      }
      game.particles.sparks(this.x + this.facing * 10, this.y - 18, '#ffe8a8', 12, 220, attack.dir > 0 ? Math.PI : 0);
      game.audio.play('parry', { x: this.x });
      game.fx.hitstop(0.05);
      if (attack.source) attack.source.vx = -attack.dir * 140;
      return false;
    }

    // Wenn der Angriff vom Spieler kommt, Machtstufe einrechnen.
    let dmg = attack.damage, crit = !!attack.crit;
    if (attack.team === 'player' && attack.source) {
      const r = rollDamage(attack.damage, game.player.power);
      dmg = r.dmg; crit = r.crit;
    }
    this.hp -= dmg;
    this.flash = 1;
    this.passive = false;
    this.aware = 3;
    game.damageNumber(this.x, this.y - this.h - 4, dmg, crit ? '#ffd0a0' : '#ffffff', crit);
    impactFx(game, this.x, this.y - this.h * 0.55, attack.dir || 1, { heavy: attack.heavy, crit, blood: d.ai !== 'flyer' && this.kind !== 'automaton', sparks: this.kind === 'automaton' || this.kind === 'knight' });

    if (this.hp <= 0) { this.die(game, attack.dir || 1); return dmg; }

    // Taumeln: einmal pro Gegner, unter 35 % Leben – dann kann man trinken.
    if (!this.staggered && this.hp <= this.maxHp * STAGGER_AT && !this.fly && d.ai !== 'hound') {
      this.staggered = true;
      this._to('stagger');
      this.vx = (attack.dir || 1) * 80;
      game.audio.play('plead', { x: this.x, gain: 0.5 });
      return dmg;
    }
    if (this.state === 'stagger') return dmg;

    // Rückstoß; schwere Gegner (Standfestigkeit) werden nur von wuchtigen Treffern unterbrochen.
    const poise = d.poise ?? 0;
    if (attack.heavy || Math.random() > poise) {
      this.vx = (attack.dir || 1) * (attack.heavy ? 220 : 120) * (1 - poise * 0.5);
      if (!this.fly) this.vy = attack.heavy ? -150 : -60;
      this._to('hurt');
    }
    return dmg;
  }

  /** Zieht der Spieler gerade Blut, bleibt der Gegner in seinem Griff. */
  beginDrain(game, player) {
    this.state = 'drained';
    this.drainable = false;
    this.drainedBy = player;
    this.vx = 0;
  }

  finishDrain(game) {
    // Zerfällt zu Asche
    this.dead = true;
    this.hurtable = false;
    this.deadT = 0;
    this.ashes = true;
    for (let i = 0; i < 18; i++) game.particles.embers(this.x, this.y - this.h / 2, i % 2 ? '#8a8090' : '#ff4050', 1, 10);
    game.particles.dust(this.x, this.y, 10, '#6a6070');
    game.onEnemyKilled(this, true);
  }

  die(game, dir = 1) {
    this.dead = true;
    this.hurtable = false;
    this.deadT = 0;
    this.drainable = false;
    this.vx = dir * 140;
    this.vy = -180;
    game.audio.play('enemyDeath', { x: this.x });
    if (this.kind === 'skeleton' || this.kind === 'automaton') {
      game.particles.debris(this.x, this.y - 16, this.kind === 'skeleton' ? '#e8dfc6' : '#c09848', 12, 260);
    } else if (this.kind === 'tome') {
      for (let i = 0; i < 10; i++) game.particles.spawn({ kind: 'chunk', x: this.x, y: this.y, vx: (Math.random() - 0.5) * 200, vy: -Math.random() * 200, life: 1.2, size: 3, size1: 3, color: '#f0e4c8', gravity: 300, vr: 8 });
    }
    game.onEnemyKilled(this, false);
  }

  _updateDead(dt, game) {
    this.deadT += dt;
    if (!this.fly && !this.ashes) {
      this.physics(dt, game.world);
      this.vx = approach(this.vx, 0, 300 * dt);
    }
    if (this.fly && !this.ashes) { this.vy += 400 * dt; this.y += this.vy * dt; }
    this._animate(dt);
    if (this.deadT > (this.ashes ? 0.5 : 1.3)) this.remove = true;
  }

  // === Animation ===========================================================

  _animate(dt) {
    const d = this.def;
    let anim = 'idle', opts = {};
    if (this.dead) anim = this.ashes ? 'kneel' : 'dead';
    else if (this.state === 'stagger' || this.state === 'drained') anim = 'kneel';
    else if (this.state === 'hurt') anim = 'hurt';
    else if (this.state === 'windup') {
      const k = this.stateT / d.windup;
      if (d.ai === 'shooter') anim = 'aim';
      else if (d.ai === 'caster' || d.ai === 'priest') anim = 'pray';
      else if (d.ai === 'knight') { anim = 'swingOverhead'; opts.progress = k * 0.35; }
      else { anim = d.attackAnim || 'attack1'; opts.progress = k * 0.22; }
    } else if (this.state === 'attack') {
      if (d.ai === 'knight') { anim = 'swingOverhead'; opts.progress = 0.35 + this.stateT / d.active * 0.65; }
      else if (d.ai === 'spinner') { anim = 'attack1'; opts.progress = (this.stateT * 6) % 1; }
      else { anim = d.attackAnim || 'attack1'; opts.progress = 0.25 + this.stateT / (d.active ?? 0.2) * 0.5; }
    } else if (this.state === 'recover' && d.ai === 'shooter') anim = 'aim';
    else if (Math.abs(this.vx) > 12 && !this.fly) {
      anim = Math.abs(this.vx) > d.speed * 1.2 ? 'run' : 'walk';
      this.phase += dt * Math.abs(this.vx) * (anim === 'run' ? 0.06 : 0.09);
      opts.phase = this.phase;
    }
    const target = makePose(anim, this.animT, opts);
    this.pose = blendPose(this.pose, target, 1 - Math.pow(2, -dt / 0.05));
    this.anim = anim;
  }

  // === Zeichnen ============================================================

  draw(ctx, game) {
    const alpha = this.dead ? clamp(1 - (this.deadT - (this.ashes ? 0 : 0.6)) / (this.ashes ? 0.5 : 0.7), 0, 1) : 1;
    if (alpha <= 0) return;
    const extra = {
      alpha, flash: this.flash * 0.9, t: this.animT, shieldBroken: this.shieldBroken,
      flashColor: `rgba(255,255,255,${this.flash * 0.9})`,
    };
    if (this.ashes) { extra.flash = 1; extra.flashColor = `rgba(90,80,96,${0.9})`; }
    if (this.kind === 'hound') return drawHound(ctx, this, extra);
    if (this.kind === 'tome') return drawTome(ctx, this, extra, game.time);
    this.rig = drawHumanoid(ctx, this.x, this.y, this.facing, this.pose, COSTUMES[this.kind], extra);

    // Lebensbalken über angeschlagenen Gegnern
    if (!this.dead && this.hp < this.maxHp && this.state !== 'drained') {
      const w = 22, x = this.x - w / 2, y = this.y - this.h - 12;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x - 1, y - 1, w + 2, 4);
      ctx.fillStyle = this.state === 'stagger' ? '#ff3050' : '#e8d8c0';
      ctx.fillRect(x, y, w * clamp(this.hp / this.maxHp, 0, 1), 2);
    }
  }

  drawEmissive(ctx, game, isGlow) {
    if (this.dead) return;
    const c = COSTUMES[this.kind];
    if (c && c.eyes && this.rig) drawEyesGlow(ctx, this.x, this.y, this.facing, this.rig, c.eyes, isGlow);
    // Vorwarnung vor einem Angriff: rotes Aufblitzen über dem Kopf
    if (this.alertFlash > 0 || (this.state === 'windup' && this.stateT < 0.2)) {
      const a = Math.max(this.alertFlash, this.state === 'windup' ? 1 - this.stateT / 0.2 : 0);
      ctx.globalAlpha = a;
      ctx.fillStyle = isGlow ? '#ff2030' : '#ffd0d0';
      const y = this.y - this.h - 14;
      ctx.beginPath();
      ctx.moveTo(this.x, y - 6); ctx.lineTo(this.x + 2.2, y); ctx.lineTo(this.x, y + 6); ctx.lineTo(this.x - 2.2, y);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }
    // Aura des Akolythen / Zielstrahl des Armbrustjägers
    if (this.kind === 'acolyte') {
      const r = this.def.auraR;
      ctx.globalAlpha = 0.18 + 0.1 * Math.sin(game.time * 4);
      ctx.strokeStyle = '#fff0b0';
      ctx.lineWidth = isGlow ? 3 : 1;
      ctx.beginPath(); ctx.arc(this.x, this.y - 18, r, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (this.kind === 'crossbow' && this.state === 'windup') {
      const p = game.player;
      ctx.globalAlpha = 0.25 + 0.5 * (this.stateT / this.def.windup);
      ctx.strokeStyle = '#ff4050';
      ctx.lineWidth = isGlow ? 2 : 0.7;
      ctx.beginPath(); ctx.moveTo(this.x + this.facing * 12, this.y - 20); ctx.lineTo(p.x, p.y - 16); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (this.state === 'stagger') {
      // Pulsierender Blutpunkt: hier kann man trinken
      const k = 0.5 + 0.5 * Math.sin(game.time * 8);
      ctx.fillStyle = isGlow ? `rgba(255,30,60,${0.6 + k * 0.4})` : '#ff5070';
      ctx.beginPath(); ctx.arc(this.x, this.y - this.h + 4, isGlow ? 7 : 2.4, 0, TAU); ctx.fill();
    }
  }

  light(game) {
    if (this.dead) return null;
    if (this.kind === 'acolyte') return { x: this.x, y: this.y - 18, radius: 70, color: 'rgb(255,230,160)', intensity: 0.7 };
    if (this.kind === 'inquisitor') return { x: this.x, y: this.y - 26, radius: 60, color: 'rgb(255,220,140)', intensity: 0.6 };
    if (this.kind === 'automaton') return { x: this.x, y: this.y - 16, radius: 50, color: 'rgb(255,200,90)', intensity: 0.6 };
    return null;
  }
}

// === Nicht-menschliche Gegner ==============================================

function drawHound(ctx, e, extra) {
  const run = Math.abs(e.vx) > 10 || e.state === 'attack';
  const ph = e.phase * 1.4 + e.animT * (run ? 0 : 0);
  outlined(ctx, e.x, e.y, 1, (c) => {
    c.save();
    c.translate(e.x, e.y);
    c.scale(e.facing, 1);
    const kneel = e.state === 'stagger' || e.state === 'drained' || e.dead;
    const bodyY = kneel ? -7 : -13 + (run ? Math.sin(ph * 2) * 1.2 : 0);
    const fur = '#6a5446', furS = '#3a2c24', furL = '#9a8068';
    // Beine (hinten dunkler)
    const legs = [[-8, 0.0, true], [6, Math.PI, true], [-6, Math.PI, false], [8, 0.0, false]];
    for (const [lx, off, back] of legs) {
      const sw = run ? Math.sin(ph + off) * 5 : 0;
      c.strokeStyle = back ? furS : fur;
      c.lineWidth = 2.6;
      c.lineCap = 'round';
      c.beginPath(); c.moveTo(lx, bodyY + 3); c.lineTo(lx + sw * 0.5, bodyY + 8); c.lineTo(lx + sw, kneel ? -1 : 0); c.stroke();
    }
    // Rumpf
    const body = smoothPath([P(-13, bodyY - 1), P(-4, bodyY - 5), P(8, bodyY - 5), P(13, bodyY - 2), P(11, bodyY + 4), P(-2, bodyY + 5), P(-12, bodyY + 3)]);
    cel(c, body, fur, furS, 1.0, -1.0, furL);
    // Schwanz
    c.strokeStyle = fur; c.lineWidth = 2;
    c.beginPath(); c.moveTo(-12, bodyY); c.quadraticCurveTo(-18, bodyY - 6 + Math.sin(e.animT * 8) * 2, -20, bodyY - 2); c.stroke();
    // Kopf mit Schnauze und Ohr
    const hy = bodyY - 5;
    const head = smoothPath([P(9, hy + 2), P(12, hy - 5), P(17, hy - 4), P(23, hy - 1, true), P(22, hy + 2), P(14, hy + 4)]);
    cel(c, head, fur, furS, 0.8, -0.8, furL);
    const ear = smoothPath([P(12, hy - 4), P(13, hy - 10, true), P(16, hy - 4)]);
    cel(c, ear, furS, '#1e1612', 0.3, -0.3);
    c.fillStyle = '#1a1210'; c.beginPath(); c.arc(22.6, hy - 0.5, 1, 0, TAU); c.fill();
    // Halsband mit goldener Sonne des Ordens
    c.fillStyle = '#8a2020'; c.fillRect(9, hy + 1, 3, 5);
    c.fillStyle = '#e8c050'; c.beginPath(); c.arc(10.5, hy + 6.5, 1.3, 0, TAU); c.fill();
    // Zähne beim Sprung
    if (e.state === 'attack' || e.state === 'windup') { c.fillStyle = '#fff'; c.fillRect(19, hy + 1.5, 3, 1); }
    c.fillStyle = '#ffb040'; c.beginPath(); c.arc(16.5, hy - 2, 0.9, 0, TAU); c.fill();
    c.restore();
  }, { ...extra, box: 70, footAt: 0.7 });
}

function drawTome(ctx, e, extra, t) {
  outlined(ctx, e.x, e.y, 1, (c) => {
    c.save();
    c.translate(e.x, e.y);
    const flap = Math.sin(t * (e.state === 'attack' ? 22 : 9)) * 0.7;
    c.rotate(Math.sin(t * 2) * 0.15);
    // Einband zwei Hälften
    for (const s of [-1, 1]) {
      c.save();
      c.scale(s, 1);
      c.rotate(-flap * 0.6);
      const cover = new Path2D(); cover.rect(0, -7, 10, 13);
      cel(c, cover, '#7a2a1c', '#4a140c', 0.6, -0.6, '#b04a30');
      c.fillStyle = '#f2e6c8'; c.fillRect(0.5, -6, 8.5, 11);
      c.fillStyle = 'rgba(80,60,40,0.5)';
      for (let i = 0; i < 4; i++) c.fillRect(2, -4 + i * 2.6, 5.5, 0.6);
      c.restore();
    }
    // Goldene Sonnenglyphe
    c.fillStyle = '#f0c850';
    c.beginPath(); c.arc(0, 0, 2.2, 0, TAU); c.fill();
    c.restore();
  }, { ...extra, box: 60, footAt: 0.5 });
}

export { STAGGER_AT };
