// Kamera: folgt dem Spieler mit Vorausschau in Blickrichtung, hat eine
// senkrechte Totzone (damit sie bei jedem Sprung nicht hüpft), kann in Arenen
// eingesperrt werden und bebt nach dem "Trauma"-Prinzip: Erschütterung klingt
// ab, der Ausschlag wächst quadratisch – kleine Treffer zittern, große beben.

import { VIEW_W, VIEW_H } from '../data/config.js';
import { clamp, damp, noise1 } from '../core/math.js';

export class Camera {
  constructor() {
    this.x = 0;               // linke obere Ecke der Sicht (WE)
    this.y = 0;
    this.lookX = 0;
    this.trauma = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.zoom = 1;
    this.targetZoom = 1;
    this.bounds = { x: 0, y: 0, w: VIEW_W, h: VIEW_H };
    this.lock = null;         // Arena-Rechteck, wenn eingesperrt
    this.focus = null;        // {x,y} – Zwischensequenzen schwenken hierhin
    this._t = 0;
    this.shakeScale = 1;
  }

  setBounds(w, h) { this.bounds = { x: 0, y: 0, w, h }; }

  /** Sofort auf ein Ziel springen (nach Szenenwechsel). */
  snap(tx, ty) {
    this.x = tx - VIEW_W / 2;
    this.y = ty - VIEW_H * 0.7;
    this.lookX = 0;
    this._clamp();
  }

  addTrauma(v) { this.trauma = clamp(this.trauma + v, 0, 1); }

  update(dt, target) {
    this._t += dt;
    this.zoom = damp(this.zoom, this.targetZoom, 0.18, dt);

    let tx, ty;
    if (this.focus) {
      tx = this.focus.x - VIEW_W / 2;
      ty = this.focus.y - VIEW_H / 2;
    } else if (target) {
      // Vorausschau: ein Stück in Blickrichtung und Laufgeschwindigkeit.
      const want = target.facing * 44 + clamp(target.vx * 0.14, -30, 30);
      this.lookX = damp(this.lookX, want, 0.35, dt);
      tx = target.x + this.lookX - VIEW_W / 2;
      // Die Füße sitzen im unteren Drittel – man sieht Raum über sich, wenig Fels darunter.
      const desiredY = target.y - VIEW_H * 0.7;
      // Senkrechte Totzone: nur nachziehen, wenn die Figur sie verlässt
      // oder auf dem Boden steht (dann sanft zentrieren).
      const dz = 34;
      if (target.onGround || desiredY < this.y - dz || desiredY > this.y + dz) ty = desiredY;
      else ty = this.y;
      // Beim schnellen Fallen nach unten vorausschauen.
      if (target.vy > 400) ty += (target.vy - 400) * 0.12;
    } else {
      tx = this.x; ty = this.y;
    }

    const hlX = this.focus ? 0.22 : 0.08;
    const hlY = this.focus ? 0.22 : (target && target.onGround ? 0.12 : 0.09);
    this.x = damp(this.x, tx, hlX, dt);
    this.y = damp(this.y, ty, hlY, dt);
    this._clamp();

    // Erschütterung
    this.trauma = Math.max(0, this.trauma - dt * 1.35);
    const s = this.trauma * this.trauma * this.shakeScale;
    this.shakeX = (noise1(this._t * 28, 1) * 2 - 1) * 14 * s;
    this.shakeY = (noise1(this._t * 28, 2) * 2 - 1) * 10 * s;
  }

  _clamp() {
    const b = this.lock || this.bounds;
    const vw = VIEW_W / this.zoom, vh = VIEW_H / this.zoom;
    // Zoom wirkt um die Bildmitte; die Grenzen gelten für den tatsächlich sichtbaren Bereich.
    const padX = (VIEW_W - vw) / 2, padY = (VIEW_H - vh) / 2;
    if (b.w <= vw) this.x = b.x + b.w / 2 - VIEW_W / 2;
    else this.x = clamp(this.x, b.x - padX, b.x + b.w - vw - padX);
    if (b.h <= vh) this.y = b.y + b.h / 2 - VIEW_H / 2;
    else this.y = clamp(this.y, b.y - padY, b.y + b.h - vh - padY);
  }
}
