// Basis für alles, was sich bewegt, getroffen wird oder gezeichnet wird.
// Anker: x = Mitte, y = Füße.

import { PHYS } from '../data/config.js';

let nextId = 1;

export class Entity {
  constructor(x, y, w, h) {
    this.id = nextId++;
    this.x = x; this.y = y;
    this.w = w; this.h = h;
    this.vx = 0; this.vy = 0;
    this.facing = 1;
    this.onGround = false;
    this.gravity = PHYS.gravity;
    this.maxFall = PHYS.maxFallSpeed;
    this.hp = 1; this.maxHp = 1;
    this.dead = false;
    this.remove = false;       // true = aus der Welt entfernen
    this.flash = 0;            // Trefferblitz (0..1)
    this.solid = true;         // kollidiert mit Kacheln
    this.team = 'neutral';     // 'player' | 'enemy' | 'neutral'
    this.hurtable = false;
    this.age = 0;
  }

  get left() { return this.x - this.w / 2; }
  get right() { return this.x + this.w / 2; }
  get top() { return this.y - this.h; }
  get cx() { return this.x; }
  get cy() { return this.y - this.h / 2; }

  /** Hitbox als Rechteck. */
  rect() { return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h }; }

  /** Schwerkraft + Kollision. Gibt das Ergebnis von world.move zurück. */
  physics(dt, world, opts = {}) {
    if (!opts.noGravity) {
      this.vy += this.gravity * (opts.gravityScale ?? 1) * dt;
      if (this.vy > this.maxFall) this.vy = this.maxFall;
    }
    if (!this.solid) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      return { onGround: false };
    }
    const res = world.move(this, dt, opts);
    this.onGround = res.onGround;
    return res;
  }

  update(dt, game) { this.age += dt; }
  draw(ctx, game) {}
  drawEmissive(ctx, game, isGlow) {}
  /** Licht, das diese Figur abgibt (oder null). */
  light(game) { return null; }
}
