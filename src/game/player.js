// Ingomar von Nachtfels – der Fürst der Nacht. Du.
//
// Zustände: normal | dash | hurt | drain | dead | locked (Zwischensequenz)
// Angriffe (Klinge, Lanze, Klaue) laufen als "Aktion" über dem Normalzustand.

import { Entity } from './entity.js';
import { PLAYER, PHYS, COST, HOLY, TILE, difficultyOf } from '../data/config.js';
import { approach, clamp, damp } from '../core/math.js';
import { T } from './tiles.js';
import { newAttackId, resolveAttack, rollDamage } from './combat.js';
import { Cloth, makePose, blendPose, solveRig, drawHumanoid, drawEyesGlow, COSTUMES } from '../render/puppet.js';
import { BloodLance } from './projectiles.js';

// Kombo der Blutklinge: Dauer, aktives Fenster, Schaden, Reichweite.
const COMBO = [
  { anim: 'attack1', dur: 0.30, on: [0.22, 0.55], dmg: 10, w: 34, h: 22, dy: -18, lunge: 40 },
  { anim: 'attack2', dur: 0.30, on: [0.22, 0.55], dmg: 12, w: 30, h: 34, dy: -24, lunge: 50 },
  { anim: 'attack3', dur: 0.44, on: [0.25, 0.55], dmg: 19, w: 42, h: 18, dy: -16, lunge: 230, heavy: true },
];
const AIR_ATTACK = { anim: 'airAttack', dur: 0.32, on: [0.2, 0.6], dmg: 11, w: 38, h: 34, dy: -14, lunge: 0 };

const GHOST = {
  ...COSTUMES.ingomar,
  skin: '#5a0a18', skinShade: '#3a0610', coat: '#6a0a1c', coatShade: '#40060f',
  pants: '#50081a', boots: '#3a0610', hair: '#7a1022', hairShade: '#5a0a18', trim: '#8a1a2a', lining: '#8a0a1e',
  collar: false,
};

export class Player extends Entity {
  constructor(x, y, save) {
    super(x, y, PLAYER.w, PLAYER.h);
    this.team = 'player';
    this.hurtable = true;
    this.save = save;
    this.maxHp = save.maxHealth;
    this.hp = Math.min(save.health, this.maxHp);
    this.blood = save.blood;

    this.state = 'normal';
    this.stateT = 0;
    this.coyote = 0;
    this.jumpBuf = 0;
    this.airJumps = 0;
    this.airDashUsed = false;
    this.gliding = false;
    this.dropT = 0;

    this.action = null;           // { kind:'attack'|'cast'|'claw', ... }
    this.comboStep = 0;
    this.comboQueued = false;
    this.comboT = 0;

    this.dashT = 0;
    this.dashCd = 0;
    this.dashDir = 1;
    this.mist = false;

    this.invuln = 0;
    this.holyTick = 0;
    this.holyExposure = 0;
    this.inWater = false;
    this.lastSafe = { x, y };
    this._safeT = 0;
    this.landT = 0;
    this.stepT = 0;

    this.pose = makePose('idle', 0);
    this.anim = 'idle';
    this.animT = 0;
    this.runPhase = 0;
    this.rig = null;

    this.cape = new Cloth(8, 3.1, 560, 0.07);
    this.hair = new Cloth(5, 2.6, 400, 0.12);
    this.afterimages = [];
    this._ghostT = 0;
    this.trail = [];

    this.drainTarget = null;
    this.interactTarget = null;   // wird vom Spiel jedes Bild gesetzt
    this.drainCandidate = null;   // taumelnder Gegner in Reichweite
    this.locked = false;          // Zwischensequenz: keine Eingabe
    this.deathT = 0;
  }

  get abilities() { return this.save.abilities; }
  get power() { return this.save.power; }
  get maxBlood() { return this.save.maxBlood; }

  // === Hauptschleife ========================================================

  update(dt, game) {
    super.update(dt, game);
    const input = this.locked || this.state === 'dead' ? NULL_INPUT : game.input;

    this.invuln = Math.max(0, this.invuln - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.flash = Math.max(0, this.flash - dt * 5);
    this.comboT = Math.max(0, this.comboT - dt);
    this.dropT = Math.max(0, this.dropT - dt);
    this.landT = Math.max(0, this.landT - dt);
    this.stateT += dt;
    this.animT += dt;

    switch (this.state) {
      case 'dash': this._updateDash(dt, game, input); break;
      case 'hurt': this._updateHurt(dt, game); break;
      case 'drain': this._updateDrain(dt, game); break;
      case 'dead': this._updateDead(dt, game); break;
      default: this._updateNormal(dt, game, input); break;
    }

    this._hazards(dt, game);
    this._animate(dt, game);
    this._updateCloth(dt);
    this._updateGhosts(dt);
  }

  // --- Normalzustand: laufen, springen, angreifen --------------------------

  _updateNormal(dt, game, input) {
    const world = game.world;
    const water = this.inWater ? 0.62 : 1;

    // --- Aktionen auslösen (nur wenn keine läuft) ---
    if (!this.action) {
      if (input.pressed('attack')) this._startAttack(game);
      else if (input.pressed('lance') && this.abilities.lance) this._startCast(game);
      else if (input.pressed('wolfClaw') && this.abilities.wolf) this._startClaw(game);
      else if (input.pressed('drain')) this._contextAction(game);
    } else if (this.action.kind === 'attack' && input.pressed('attack')) {
      // Eingabepuffer: der nächste Schlag wird vorgemerkt.
      this.comboQueued = true;
    }

    // --- Dash ---
    if (input.pressed('dash') && this.dashCd <= 0 && (this.onGround || !this.airDashUsed) && (!this.action || this.action.kind === 'attack')) {
      this._startDash(game, input);
      return;
    }

    // --- Laufen ---
    const locked = this.action && this.action.kind !== 'attack' ? 0.15 : this.action ? (this.onGround ? 0.12 : 0.85) : 1;
    const target = input.axisX * PLAYER.runSpeed * water * locked;
    const accel = this.onGround ? PLAYER.accelGround : PLAYER.accelAir;
    const fric = this.onGround ? PLAYER.frictionGround : PLAYER.frictionAir;
    if (Math.abs(input.axisX) > 0.05) {
      this.vx = approach(this.vx, target, accel * dt);
      if (!this.action) {
        const nf = input.axisX > 0 ? 1 : -1;
        if (nf !== this.facing && this.onGround) game.audio.play('cloak', { x: this.x, gain: 0.6 });
        this.facing = nf;
      }
    } else {
      this.vx = approach(this.vx, 0, fric * dt);
    }

    // --- Springen ---
    if (this.onGround) { this.coyote = PHYS.coyoteTime; this.airJumps = this.abilities.bat ? 1 : 0; this.airDashUsed = false; }
    else this.coyote = Math.max(0, this.coyote - dt);

    if (input.pressed('jump')) this.jumpBuf = PHYS.jumpBuffer;
    else this.jumpBuf = Math.max(0, this.jumpBuf - dt);

    const onPlatform = this.onGround && world.tileAt(this.x, this.y + 1) === T.PLATFORM;
    if (this.jumpBuf > 0 && input.down('down') && onPlatform) {
      // Durch die Plattform fallen lassen
      this.dropT = 0.22;
      this.jumpBuf = 0;
      this.onGround = false;
      this.y += 1;
    } else if (this.jumpBuf > 0 && this.coyote > 0 && (!this.action || this.action.kind === 'attack')) {
      this.vy = -PLAYER.jumpSpeed * (this.inWater ? 0.86 : 1);
      this.coyote = 0;
      this.jumpBuf = 0;
      this.onGround = false;
      game.audio.play('jump', { x: this.x });
      game.particles.dust(this.x, this.y, 5);
    } else if (this.jumpBuf > 0 && !this.onGround && this.airJumps > 0 && !this.action) {
      // Fledermausgestalt: zweiter Sprung aus einem Schwarm Fledermäuse
      this.vy = -PLAYER.batJumpSpeed;
      this.airJumps--;
      this.jumpBuf = 0;
      game.audio.play('bat', { x: this.x });
      game.particles.bats(this.x, this.y - 12, 7);
      game.particles.mist(this.x, this.y - 8, 5, '#3a1030');
    }
    // Variable Sprunghöhe: früh loslassen = niedriger Sprung
    if (input.released('jump') && this.vy < 0) this.vy *= PLAYER.jumpCutMultiplier;

    // Gleiten in Fledermausgestalt
    this.gliding = this.abilities.bat && !this.onGround && input.down('jump') && this.vy > 0 && !this.action;
    if (this.gliding && this.vy > PLAYER.glideFallSpeed) this.vy = approach(this.vy, PLAYER.glideFallSpeed, 2600 * dt);

    // --- Aktion fortschreiben ---
    if (this.action) this._updateAction(dt, game, input);

    // --- Physik ---
    const wasGround = this.onGround;
    const fallSpeed = this.vy;
    const res = this.physics(dt, world, {
      dropThrough: this.dropT > 0,
      gravityScale: this.inWater ? 0.55 : 1,
    });
    if (this.inWater && this.vy > 240) this.vy = 240;
    if (res.landed && !wasGround) this._onLand(game, fallSpeed);
    if (res.hitWall && this.action?.kind === 'attack') this.vx = 0;

    // Schritte hörbar machen
    if (this.onGround && Math.abs(this.vx) > 60) {
      this.stepT -= dt * Math.abs(this.vx) / 190;
      if (this.stepT <= 0) {
        this.stepT = 0.28;
        const surf = this.inWater ? 'water' : res.groundTile === T.PLATFORM ? 'wood' : game.zone.bg === 'clock' ? 'metal' : 'stone';
        game.audio.play('step', { x: this.x, surface: surf });
      }
    }
  }

  _onLand(game, fallSpeed) {
    if (fallSpeed > 320) {
      this.landT = 0.1;
      game.audio.play('land', { x: this.x, gain: clamp(fallSpeed / 700, 0.3, 1) });
      game.particles.dust(this.x, this.y, fallSpeed > 650 ? 10 : 5);
      if (fallSpeed > 700) game.fx.shake(0.18);
    }
  }

  // --- Blutklinge ------------------------------------------------------------

  _startAttack(game) {
    const air = !this.onGround;
    let def;
    if (air) def = AIR_ATTACK;
    else {
      this.comboStep = this.comboT > 0 ? (this.comboStep % 3) + 1 : 1;
      def = COMBO[this.comboStep - 1];
    }
    this.action = { kind: 'attack', def, t: 0, id: newAttackId(), air, lunged: false, hitAny: false };
    this.comboQueued = false;
    this.trail.length = 0;
    game.audio.play('swing', { x: this.x, gain: def.heavy ? 1.2 : 1 });
  }

  _updateAction(dt, game, input) {
    const a = this.action;
    a.t += dt;
    if (a.kind === 'attack') return this._updateAttack(dt, game, input);
    if (a.kind === 'cast') return this._updateCast(dt, game);
    if (a.kind === 'claw') return this._updateClaw(dt, game);
  }

  _updateAttack(dt, game, input) {
    const a = this.action;
    const d = a.def;
    const k = a.t / d.dur;

    // Vorwärtsschub am Anfang des aktiven Fensters
    if (!a.lunged && k >= d.on[0] && d.lunge && this.onGround) {
      this.vx = this.facing * d.lunge;
      a.lunged = true;
      if (d.heavy) game.particles.dust(this.x - this.facing * 6, this.y, 6);
    }

    if (k >= d.on[0] && k <= d.on[1]) {
      const hb = {
        id: a.id, team: 'player',
        x: this.facing > 0 ? this.x : this.x - d.w, y: this.y + d.dy - d.h / 2, w: d.w, h: d.h,
        dir: this.facing, heavy: !!d.heavy,
        damage: d.dmg, source: this,
      };
      const hits = resolveAttack(game, hb, game.hurtables());
      if (hits) {
        a.hitAny = true;
        this.gainBlood(PLAYER.bloodPerHit * hits);
      }
      // Morsche Mauern bröckeln nur unter der Wolfsklaue – die Klinge prallt ab.
    }

    if (a.t >= d.dur) {
      const next = this.comboQueued && !a.air && this.onGround;
      this.action = null;
      this.comboT = 0.42;
      if (next) this._startAttack(game);
      else if (this.comboStep === 3) this.comboT = 0;
    }
  }

  // --- Blutlanze -------------------------------------------------------------

  _startCast(game) {
    if (!this.spendBlood(COST.bloodLance, game)) return;
    this.action = { kind: 'cast', t: 0, dur: 0.34, fired: false };
    this.vx *= 0.3;
  }

  _updateCast(dt, game) {
    const a = this.action;
    if (!a.fired && a.t >= 0.12) {
      a.fired = true;
      const dmg = rollDamage(24, this.power, 0.1);
      game.spawnProjectile(new BloodLance(this.x + this.facing * 14, this.y - 20, this.facing, dmg));
      game.audio.play('lance', { x: this.x });
      game.particles.blood(this.x + this.facing * 10, this.y - 20, this.facing > 0 ? 0 : Math.PI, 6, 160);
      game.fx.shake(0.1);
    }
    if (a.t >= a.dur) this.action = null;
  }

  // --- Wolfsklaue ------------------------------------------------------------

  _startClaw(game) {
    if (!this.spendBlood(COST.wolfClaw, game)) return;
    this.action = { kind: 'claw', t: 0, dur: 0.52, id: newAttackId(), lunged: false };
    game.audio.play('wolf', { x: this.x });
  }

  _updateClaw(dt, game) {
    const a = this.action;
    const k = a.t / a.dur;
    if (!a.lunged && k > 0.2) {
      a.lunged = true;
      this.vx = this.facing * 300;
      if (!this.onGround) this.vy = Math.min(this.vy, -60);
    }
    if (k > 0.25 && k < 0.6) {
      const w = 48, h = 40;
      const hb = {
        id: a.id, team: 'player',
        x: this.facing > 0 ? this.x - 4 : this.x - w + 4, y: this.y - 36, w, h,
        dir: this.facing, heavy: true, breaksShield: true,
        damage: 40, source: this,
      };
      const hits = resolveAttack(game, hb, game.hurtables());
      if (hits) this.gainBlood(PLAYER.bloodPerHit * hits);
      // Mauern einreißen
      const broken = game.world.breakWalls(hb.x - 4, hb.y, hb.w + 8, hb.h);
      if (broken.length) {
        for (const [tx, ty] of broken) {
          game.particles.debris(tx * TILE + TILE / 2, ty * TILE + TILE / 2, game.zone.tiles.base, 5, 280);
          game.particles.dust(tx * TILE + TILE / 2, ty * TILE + TILE, 3);
        }
        game.audio.play('stoneBreak', { x: this.x });
        game.fx.shake(0.5);
        game.fx.hitstop(0.08);
      }
    }
    if (a.t >= a.dur) this.action = null;
  }

  // --- Dash / Nebelschritt ---------------------------------------------------

  _startDash(game, input) {
    this.state = 'dash';
    this.stateT = 0;
    this.action = null;
    this.dashDir = Math.abs(input.axisX) > 0.3 ? Math.sign(input.axisX) : this.facing;
    this.facing = this.dashDir;
    this.mist = !!this.abilities.mist;
    this.dashT = PLAYER.dashTime * (this.mist ? 1.3 : 1);
    this.dashCd = PLAYER.dashCooldown;
    if (!this.onGround) this.airDashUsed = true;
    this.vy = 0;
    if (this.mist) {
      game.audio.play('mist', { x: this.x });
      game.particles.mist(this.x, this.y - 14, 12);
      this.invuln = Math.max(this.invuln, this.dashT + 0.05);
    } else {
      game.audio.play('dash', { x: this.x });
      game.particles.dust(this.x, this.y, 5, '#6a6078', -this.dashDir);
    }
  }

  _updateDash(dt, game, input) {
    this.dashT -= dt;
    const speed = PLAYER.dashSpeed * (this.mist ? 1.15 : 1);
    this.vx = this.dashDir * speed;
    this.vy = 0;
    if (this.mist && Math.random() < 0.7) game.particles.mist(this.x, this.y - 14, 2);
    this.physics(dt, game.world, { noGravity: true, mist: this.mist });

    if (this.dashT <= 0) {
      // Im Nebel durch ein Gitter: nie mitten im Gitter wieder feste Gestalt annehmen.
      if (this.mist && game.world.rectSolid(this.left, this.top, this.w, this.h, false)) {
        this.dashT = 0.02;
        return;
      }
      this.state = 'normal';
      this.stateT = 0;
      this.vx = this.dashDir * PLAYER.runSpeed * 0.8;
      this.mist = false;
    }
    // Sprung bricht den Dash ab (Dash-Sprung für mehr Weite)
    if (input.pressed('jump') && this.onGround && !this.mist) {
      this.state = 'normal';
      this.jumpBuf = PHYS.jumpBuffer;
    }
  }

  // --- Getroffen werden --------------------------------------------------------

  /** Treffer durch Gegner (Hitbox-System). */
  takeHit(game, attack) {
    return this.hurt(game, attack.damage, attack.x + attack.w / 2, { holy: attack.holy, heavy: attack.heavy }) ? attack.damage : false;
  }

  hurt(game, amount, fromX, opts = {}) {
    if (this.invuln > 0 || this.state === 'dead' || this.state === 'drain' || this.locked) return false;
    const dmg = Math.max(1, Math.round(amount * difficultyOf(game.settings).dmgTaken));
    this.hp -= dmg;
    this.flash = 1;
    this.invuln = PLAYER.invulnAfterHit;
    this.action = null;
    const dir = this.x < fromX ? -1 : 1;
    this.vx = dir * PLAYER.hitKnockback;
    this.vy = -210;
    this.state = 'hurt';
    this.stateT = 0;
    game.particles.blood(this.x, this.y - 18, dir > 0 ? -0.4 : -Math.PI + 0.4, 14, 200);
    game.audio.play('hurt', { x: this.x });
    game.fx.shake(opts.heavy ? 0.5 : 0.32);
    game.fx.hitstop(0.07);
    game.renderer.chroma = Math.max(game.renderer.chroma, 0.8);
    game.renderer.doFlash(160, 0, 20, 0.22);
    game.input.rumble(0.8, 0.6, 180);
    game.damageNumber(this.x, this.y - 34, dmg, '#ff6070');
    if (this.hp <= 0) this.die(game);
    return true;
  }

  _updateHurt(dt, game) {
    this.physics(dt, game.world);
    this.vx = approach(this.vx, 0, 900 * dt);
    if (this.stateT > 0.28 && this.onGround) { this.state = 'normal'; this.stateT = 0; }
    else if (this.stateT > 0.6) { this.state = 'normal'; this.stateT = 0; }
  }

  die(game) {
    this.hp = 0;
    this.state = 'dead';
    this.stateT = 0;
    this.deathT = 0;
    this.action = null;
    this.vx = 0;
    game.audio.play('death', { x: this.x });
    game.fx.hitstop(0.25);
    game.fx.shake(0.7);
    game.onPlayerDeath();
  }

  _updateDead(dt, game) {
    this.deathT += dt;
    this.physics(dt, game.world);
    this.vx = approach(this.vx, 0, 600 * dt);
    // Zerfall zu Asche und Fledermäusen
    if (this.deathT > 0.6 && this.deathT < 2.0 && Math.random() < 0.5) {
      game.particles.bats(this.x, this.y - 16, 1, 0.6);
      game.particles.embers(this.x, this.y - 10, '#ff4040', 2, 10);
    }
  }

  // --- Aussaugen / Kontextaktion ---------------------------------------------

  _contextAction(game) {
    if (this.drainCandidate && this.onGround) {
      this._startDrain(game, this.drainCandidate);
      return;
    }
    if (this.interactTarget) {
      this.interactTarget.interact(game, this);
      return;
    }
  }

  _startDrain(game, target) {
    this.state = 'drain';
    this.stateT = 0;
    this.drainTarget = target;
    this.action = null;
    this.vx = 0;
    this.facing = target.x > this.x ? 1 : -1;
    this.invuln = Math.max(this.invuln, 1.3);
    target.beginDrain(game, this);
    game.audio.play('drain', { x: this.x });
    game.camera.targetZoom = 1.12;
    game.audio.setMuffle(0.4);
  }

  _updateDrain(dt, game) {
    const t = this.drainTarget;
    this.physics(dt, game.world);
    // Opfer an den Vampir heranziehen
    if (t && !t.remove) {
      const want = this.x + this.facing * 11;
      t.x = damp(t.x, want, 0.05, dt);
      const mx = this.x + this.facing * 5, my = this.y - 25;
      if (Math.random() < 0.9) game.particles.bloodStream(t.x, t.y - t.h * 0.7, mx, my, 2);
    }
    const DUR = 0.95;
    if (this.stateT >= DUR) {
      this.state = 'normal';
      this.stateT = 0;
      game.camera.targetZoom = 1;
      game.audio.setMuffle(0);
      if (t) {
        const healed = Math.min(this.maxHp - this.hp, 18);
        this.hp += healed;
        this.gainBlood(PLAYER.bloodPerDrain);
        game.onBloodDrunk(PLAYER.bloodPerDrain);
        t.finishDrain(game, this);
        game.audio.play('drainFinish', { x: this.x });
        game.particles.ring(this.x, this.y - 20, '#ff2a40', 6, 60, 0.4);
        if (healed > 0) game.damageNumber(this.x, this.y - 38, '+' + healed, '#ff8aa0');
        game.renderer.doFlash(120, 0, 20, 0.18);
      }
      this.drainTarget = null;
      this.invuln = 0.4;
    }
  }

  // --- Ressourcen ------------------------------------------------------------

  gainBlood(v) { this.blood = Math.min(this.maxBlood, this.blood + v); }

  spendBlood(cost, game) {
    let c = cost;
    if (this.holyExposure > 0) c = Math.ceil(c * HOLY.costMultiplier);
    if (this.blood < c) {
      game.audio.play('uiDeny');
      game.hud && game.hud.flashBlood();
      return false;
    }
    this.blood -= c;
    return true;
  }

  heal(v) { this.hp = Math.min(this.maxHp, this.hp + v); }

  // --- Gefahren: heiliges Licht, Dornen, Wasser -----------------------------

  _hazards(dt, game) {
    const world = game.world;
    const r = this.rect();
    this.inWater = world.inWater(r.x, r.y + r.h * 0.5, r.w, r.h * 0.5);

    // Heiliges Licht brennt – außer im Nebel (du bist dann kaum stofflich).
    const exp = this.state === 'dead' ? 0 : world.holyExposure(r.x, r.y, r.w, r.h);
    this.holyExposure = exp;
    if (exp > 0 && !(this.state === 'dash' && this.mist)) {
      this.holyTick -= dt;
      if (Math.random() < 0.5) game.particles.embers(this.x, this.y - 6, '#fff0c0', 1, 7);
      if (Math.random() < 0.3) game.particles.dust(this.x, this.y - 20, 1, '#d8d0e0');
      if (this.holyTick <= 0) {
        this.holyTick = 0.2;
        let dmg = HOLY.damagePerSecond * 0.2 * (this.abilities.moonskin ? 0.5 : 1);
        dmg *= difficultyOf(game.settings).dmgTaken;
        this.hp -= dmg;
        this.flash = Math.max(this.flash, 0.6);
        game.audio.play('holyBurn', { x: this.x, gain: 0.7 });
        game.renderer.doFlash(255, 240, 200, 0.08);
        game.input.rumble(0.2, 0.4, 90);
        if (this.hp <= 0) this.die(game);
      }
    } else {
      this.holyTick = Math.min(this.holyTick, 0.05);
    }

    if (this.state === 'dead') return;

    // Silberdornen: Schaden und zurück an den letzten sicheren Punkt.
    const spike = world.tilesInRect(r.x + 2, r.y + r.h - 4, r.w - 4, 6, T.SPIKES).length > 0;
    if (spike && !(this.state === 'dash' && this.mist)) {
      game.onPlayerFellInPit(18);
      return;
    }

    // Letzten sicheren Stand merken (für Dornen und Abgründe).
    this._safeT -= dt;
    if (this.onGround && exp === 0 && this.state === 'normal' && this._safeT <= 0) {
      const below = world.tileAt(this.x, this.y + 1);
      const l = world.tileAt(this.left + 1, this.y + 1), rr = world.tileAt(this.right - 1, this.y + 1);
      const solidish = (t) => t === T.SOLID || t === T.PLATFORM;
      if (solidish(below) && solidish(l) && solidish(rr)) {
        this.lastSafe = { x: this.x, y: this.y };
        this._safeT = 0.2;
      }
    }
  }

  // === Animation ============================================================

  _animate(dt, game) {
    let anim = 'idle', opts = {}, hl = 0.045;
    if (this.state === 'dead') { anim = 'dead'; hl = 0.12; }
    else if (this.state === 'drain') anim = 'drain';
    else if (this.state === 'hurt') anim = 'hurt';
    else if (this.state === 'dash') anim = this.dashDir === this.facing ? 'dash' : 'backdash';
    else if (this.action?.kind === 'attack') { anim = this.action.def.anim; opts.progress = this.action.t / this.action.def.dur; hl = 0.012; }
    else if (this.action?.kind === 'cast') { anim = 'cast'; opts.progress = this.action.t / this.action.dur; hl = 0.015; }
    else if (this.action?.kind === 'claw') { anim = 'claw'; opts.progress = this.action.t / this.action.dur; hl = 0.015; }
    else if (!this.onGround) anim = this.gliding ? 'fall' : this.vy < -40 ? 'jump' : 'fall';
    else if (this.landT > 0) anim = 'land';
    else if (Math.abs(this.vx) > 25) {
      anim = 'run';
      this.runPhase += dt * Math.abs(this.vx) * 0.058;
      opts.phase = this.runPhase;
      opts.speed = Math.abs(this.vx);
    }
    this.anim = anim;
    const target = makePose(anim, this.animT, opts);
    this.pose = blendPose(this.pose, target, 1 - Math.pow(2, -dt / hl));
    this.rig = solveRig(this.pose);

    // Klingenspur mitschreiben
    if (this.action?.kind === 'attack') {
      const hand = this.rig.armF.hand;
      const ang = this.rig.armF.angle;
      const wa = this.pose.weaponAngle;
      // Klinge verlängert den Unterarm; weaponAngle kippt sie zusätzlich
      // (Bogenmaß, positiv = im Uhrzeigersinn, also nach vorn-unten).
      const dirA = -ang + Math.PI / 2 + wa;
      const len = this.action.def.heavy ? 26 : 22;
      const bx = this.x + this.facing * (hand.x + Math.cos(dirA) * 3), by = this.y + hand.y + Math.sin(dirA) * 3;
      const tx = this.x + this.facing * (hand.x + Math.cos(dirA) * len), ty = this.y + hand.y + Math.sin(dirA) * len;
      this.trail.push({ bx, by, tx, ty, life: 0.14 });
      if (this.trail.length > 10) this.trail.shift();
      this.blade = { bx, by, tx, ty };
    } else {
      this.blade = null;
    }
    for (const p of this.trail) p.life -= dt;
    while (this.trail.length && this.trail[0].life <= 0) this.trail.shift();
  }

  _updateCloth(dt) {
    const r = this.rig;
    if (!r) return;
    const f = this.facing;
    const ax = this.x + f * (r.neck.x - 1.6), ay = this.y + r.neck.y + 1.2;
    const wind = -this.vx * 4 + (this.gliding ? 0 : 0) + (this.state === 'dash' ? -this.dashDir * 1400 : 0);
    this.cape.gravity = this.gliding ? 120 : this.vy < -100 ? 700 : 560;
    this.cape.update(dt, ax, ay, this.y - 0.5, wind + Math.sin(this.age * 1.7) * 40);
    this.hair.update(dt, this.x + f * (r.head.x - 2.2), this.y + r.head.y - 1, this.y, wind * 0.6);
  }

  _updateGhosts(dt) {
    const want = (this.state === 'dash') || (this.action?.def?.heavy && this.action.t < this.action.def.dur * 0.6) || (this.action?.kind === 'claw');
    this._ghostT -= dt;
    if (want && this._ghostT <= 0) {
      this._ghostT = 0.028;
      this.afterimages.push({ x: this.x, y: this.y, facing: this.facing, pose: { ...this.pose }, life: 0.22, mist: this.mist });
      if (this.afterimages.length > 8) this.afterimages.shift();
    }
    for (const g of this.afterimages) g.life -= dt;
    while (this.afterimages.length && this.afterimages[0].life <= 0) this.afterimages.shift();
  }

  /** Position für die Pose zurücksetzen (nach Teleport). */
  teleport(x, y) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.cape.inited = false;
    this.hair.inited = false;
    this.trail.length = 0;
    this.afterimages.length = 0;
  }

  // === Zeichnen =============================================================

  draw(ctx, game) {
    // Nachbilder
    for (const g of this.afterimages) {
      const a = (g.life / 0.22) * (g.mist ? 0.25 : 0.4);
      drawHumanoid(ctx, g.x, g.y, g.facing, g.pose, GHOST, { alpha: a });
    }

    if (this.state === 'dead' && this.deathT > 1.4) return; // zu Asche zerfallen

    let alpha = 1;
    if (this.state === 'dash' && this.mist) alpha = 0.3;
    else if (this.invuln > 0 && this.state !== 'drain' && Math.floor(this.invuln * 18) % 2 === 0) alpha = 0.55;
    if (this.state === 'dead') alpha = clamp(1 - (this.deathT - 0.4), 0, 1);

    if (this.gliding) this._drawBatWings(ctx, game.time);

    drawHumanoid(ctx, this.x, this.y, this.facing, this.pose, COSTUMES.ingomar, {
      cape: this.cape, hair: this.hair, alpha,
      flash: this.flash * 0.8,
      flashColor: this.holyExposure > 0 ? `rgba(255,240,200,${this.flash})` : `rgba(255,255,255,${this.flash * 0.8})`,
    });
  }

  /** Beim Gleiten spannen sich Fledermausflügel aus dem Umhang. */
  _drawBatWings(ctx, t) {
    const x = this.x, y = this.y - 24;
    const flap = Math.sin(t * 9) * 0.25;
    ctx.save();
    ctx.translate(x, y);
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.scale(side, 1);
      ctx.rotate(flap * side * 0.5);
      ctx.fillStyle = '#1a0e1c';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(14, -18, 34, -10);
      ctx.lineTo(30, -2);
      ctx.quadraticCurveTo(24, 2, 22, 8);
      ctx.quadraticCurveTo(16, 4, 12, 10);
      ctx.quadraticCurveTo(8, 6, 3, 10);
      ctx.closePath();
      ctx.fill();
      // Adern im Flügel
      ctx.strokeStyle = 'rgba(160,20,40,0.6)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(1, 1); ctx.lineTo(30, -6);
      ctx.moveTo(1, 2); ctx.lineTo(22, 7);
      ctx.moveTo(1, 3); ctx.lineTo(12, 9);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  drawEmissive(ctx, game, isGlow) {
    if (this.state === 'dead' && this.deathT > 1.2) return;
    // Rote Augen
    if (this.rig && !(this.state === 'dash' && this.mist)) {
      drawEyesGlow(ctx, this.x, this.y, this.facing, this.rig, '#ff1f35', isGlow);
    }
    // Klingenspur: leuchtender Bogen aus geronnenem Blut
    if (this.trail.length > 1) {
      for (let i = 1; i < this.trail.length; i++) {
        const a = this.trail[i - 1], b = this.trail[i];
        const k = i / this.trail.length;
        ctx.globalAlpha = clamp(b.life / 0.14, 0, 1) * k * (isGlow ? 0.7 : 0.85);
        ctx.fillStyle = isGlow ? '#ff1030' : k > 0.7 ? '#ffd0d6' : '#ff2a40';
        ctx.beginPath();
        ctx.moveTo(a.bx, a.by); ctx.lineTo(a.tx, a.ty); ctx.lineTo(b.tx, b.ty); ctx.lineTo(b.bx, b.by);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // Die Klinge selbst
    if (this.blade) {
      const b = this.blade;
      ctx.strokeStyle = isGlow ? '#ff2040' : '#ff6070';
      ctx.lineWidth = isGlow ? 4 : 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(b.bx, b.by); ctx.lineTo(b.tx, b.ty); ctx.stroke();
      if (!isGlow) {
        ctx.strokeStyle = '#fff0f2';
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(b.bx, b.by); ctx.lineTo(b.tx, b.ty); ctx.stroke();
      }
    }
    // Wolfsklaue: drei leuchtende Krallenspuren
    if (this.action?.kind === 'claw') {
      const k = this.action.t / this.action.dur;
      if (k > 0.2 && k < 0.7) {
        const a = 1 - Math.abs(k - 0.42) / 0.28;
        ctx.globalAlpha = clamp(a, 0, 1);
        ctx.strokeStyle = isGlow ? '#ff2040' : '#ffb0bc';
        ctx.lineWidth = isGlow ? 5 : 2;
        for (let i = 0; i < 3; i++) {
          const oy = -30 + i * 9;
          ctx.beginPath();
          ctx.arc(this.x + this.facing * 8, this.y + oy + 14, 26 - i * 2, this.facing > 0 ? -1.2 : Math.PI + 1.2 - 1.6, this.facing > 0 ? 0.4 : Math.PI + 1.2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }
  }

  light(game) {
    // Die rote Aura des Fürsten – damit man ihn auch im tiefsten Dunkel sieht.
    const pulse = this.state === 'drain' ? 1.5 : 1;
    return { x: this.x, y: this.y - 20, radius: 150, color: 'rgb(225,190,200)', intensity: 0.75 * pulse, shadows: true };
  }
}

// Eingabe-Attrappe für gesperrte Zustände.
const NULL_INPUT = {
  axisX: 0, axisY: 0,
  down: () => false, pressed: () => false, released: () => false,
};
