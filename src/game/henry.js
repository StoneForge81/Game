// Henry – dein Sohn. Als Fledermaus begleitet er dich durch das Schloss,
// gibt Tipps und schießt kleine Blutpfeile auf Gegner in der Nähe.
// In Zwischensequenzen steht er als Junge neben dir.

import { Entity } from './entity.js';
import { TAU, damp, dist } from '../core/math.js';
import { drawHumanoid, makePose, COSTUMES, Cloth, solveRig, drawEyesGlow, outlined, cel, smoothPath, P } from '../render/puppet.js';
import { Projectile } from './projectiles.js';
import { CHAR_SCALE } from '../data/config.js';

const BOY_SZ = 0.76;

export class Henry extends Entity {
  constructor(x, y) {
    super(x, y, 10, 10);
    this.solid = false;
    this.gravity = 0;
    this.form = 'boy';            // 'boy' | 'bat'
    this.facing = 1;
    this.shootCd = 2;
    this.bubble = null;           // { text, t, dur }
    this.pose = makePose('idle', 0);
    this.cape = new Cloth(6, 2.4, 520, 0.08);
    this.rig = null;
    this.flap = 0;
    this.visible = true;
  }

  /** Sprechblase anzeigen (ersetzt eine laufende). */
  /**
   * Sprechblase anzeigen (ersetzt eine laufende). Ohne feste Dauer bleibt sie
   * stehen, bis der Spieler X (Angriff) oder Bestätigen drückt – so kann man
   * in Ruhe lesen.
   */
  say(text, dur = null) {
    this.bubble = { text, t: 0, dur: dur ?? 60, wait: dur == null };
  }

  transform(game, form) {
    if (this.form === form) return;
    this.form = form;
    game.particles.bats(this.x, this.y - 10, 8, 0.7);
    game.particles.mist(this.x, this.y - 10, 6, '#3a1030');
    game.audio.play('bat', { x: this.x });
    this.cape.inited = false;
  }

  update(dt, game) {
    super.update(dt, game);
    const p = game.player;
    if (this.bubble) {
      const b = this.bubble;
      b.t += dt;
      if (b.wait && b.t > 1.2 && !game.dialogue.active && (game.input.pressed('attack') || game.input.pressed('confirm'))) {
        b.wait = false;
        b.dur = b.t + 0.35;   // kurz ausblenden
      }
      if (b.t > b.dur) this.bubble = null;
    }

    if (this.form === 'boy') {
      // Steht still (Zwischensequenz); Pose atmet
      this.pose = makePose('idle', this.age);
      this.rig = solveRig(this.pose, BOY_SZ * CHAR_SCALE);
      const ax = this.x + this.facing * (this.rig.neck.x - 1.2), ay = this.y + this.rig.neck.y + 1;
      this.cape.update(dt, ax, ay, this.y, -30 * this.facing);
      return;
    }

    // Fledermaus: folgt schräg hinter dem Kopf des Vaters
    const tx = p.x - p.facing * 22;
    const ty = p.y - 44 + Math.sin(this.age * 3.2) * 4;
    this.x = damp(this.x, tx, 0.18, dt);
    this.y = damp(this.y, ty, 0.14, dt);
    this.facing = p.x > this.x ? 1 : -1;
    this.flap += dt * 16;

    // Blutpfeile auf nahe Gegner
    this.shootCd -= dt;
    if (this.shootCd <= 0 && p.state !== 'dead' && !game.cutscene) {
      let best = null, bd = 130;
      for (const e of game.enemies) {
        if (e.dead || !e.hurtable || e.state === 'drained') continue;
        const d = dist(this.x, this.y, e.x, e.y - e.h / 2);
        if (d < bd && game.world.lineOfSight(this.x, this.y, e.x, e.y - e.h / 2)) { bd = d; best = e; }
      }
      if (best) {
        const a = Math.atan2(best.y - best.h / 2 - this.y, best.x - this.x);
        game.spawnProjectile(new Projectile({ kind: 'lance', x: this.x, y: this.y, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380, w: 9, h: 4, team: 'player', damage: 4, life: 0.7 }));
        game.audio.play('bat', { x: this.x, gain: 0.4 });
        this.shootCd = 2.4;
      } else this.shootCd = 0.4;
    }
  }

  draw(ctx, game) {
    if (!this.visible) return;
    if (this.form === 'boy') {
      this.rig = drawHumanoid(ctx, this.x, this.y, this.facing, this.pose, COSTUMES.henry, { sz: BOY_SZ, cape: this.cape });
      return;
    }
    // Kleine Fledermaus mit rotem Halstuch – Henry
    const x = this.x, y = this.y;
    const f = Math.sin(this.flap);
    outlined(ctx, x, y + 8, 1, (c) => {
      c.save();
      c.translate(x, y);
      c.scale(this.facing, 1);
      for (const s of [-1, 1]) {
        c.save();
        c.scale(s, 1);
        const wing = smoothPath([P(1, -1), P(5, -5 - f * 4), P(11, -3 - f * 5, true), P(9, 0 - f * 2), P(7, 2, true), P(5, 1), P(3, 3, true)]);
        cel(c, wing, '#3a2448', '#1e1228', 0.4, -0.6, '#6a4a88');
        c.restore();
      }
      const body = new Path2D(); body.ellipse(0, 0, 3.4, 4, 0, 0, TAU);
      cel(c, body, '#2e1e3a', '#170f20', 0.5, -0.5, '#5a4470');
      // Ohren
      const ears = smoothPath([P(-2.4, -2.5), P(-2, -6.5, true), P(-0.6, -3), P(0.6, -3), P(2, -6.5, true), P(2.4, -2.5)]);
      cel(c, ears, '#2e1e3a', '#170f20', 0.3, -0.3);
      // Rotes Halstuch
      c.fillStyle = '#c01830';
      c.fillRect(-3, 0.5, 6, 1.4);
      c.beginPath(); c.moveTo(-2.4, 1.5); c.lineTo(-4.5, 4.5); c.lineTo(-1.2, 1.9); c.fill();
      c.restore();
    }, { box: 40, footAt: 0.7 });
  }

  drawEmissive(ctx, game, isGlow) {
    if (!this.visible) return;
    if (this.form === 'boy') {
      if (this.rig) drawEyesGlow(ctx, this.x, this.y, this.facing, this.rig, '#ff3a4a', isGlow);
      return;
    }
    ctx.fillStyle = '#ff3a4a';
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.arc(this.x + this.facing * 1 + s * 1.2, this.y - 1, isGlow ? 2.2 : 0.7, 0, TAU); ctx.fill();
    }
  }
}

