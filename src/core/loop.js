// Fester Zeitschritt für die Physik, freier Zeitschritt fürs Zeichnen.
// So verhält sich das Spiel auf einem 60-Hz-Fernseher genauso wie auf einem
// 120-Hz-Monitor, und ein kurzer Ruckler lässt niemanden durch den Boden fallen.

import { FIXED_DT, MAX_FRAME } from '../data/config.js';

export class Loop {
  /**
   * @param {(dt:number)=>void} update  Logik, immer mit dt = FIXED_DT
   * @param {(alpha:number, frameDt:number)=>void} render  alpha = Interpolation 0..1
   */
  constructor(update, render) {
    this.update = update;
    this.render = render;
    this.running = false;
    this.accumulator = 0;
    this.lastTime = 0;
    this.rafId = null;

    // Zeitlupe/Zeitraffer – für Treffer-Feedback und Zwischensequenzen.
    this.timeScale = 1;
    // Hitstop friert die Logik für Sekundenbruchteile ein; das Bild läuft weiter.
    this.hitstop = 0;

    this.fps = 60;
    this._fpsAccum = 0;
    this._fpsFrames = 0;

    this._tick = this._tick.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  /** Logik kurz einfrieren, damit Treffer Wucht bekommen. */
  freeze(seconds) {
    this.hitstop = Math.max(this.hitstop, seconds);
  }

  _tick(now) {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this._tick);

    let frameDt = (now - this.lastTime) / 1000;
    this.lastTime = now;

    // Nach einem Tab-Wechsel oder Ladevorgang kann frameDt riesig sein.
    // Deckeln, statt hunderte Schritte nachzuholen.
    if (frameDt > MAX_FRAME) frameDt = MAX_FRAME;
    if (frameDt < 0) frameDt = 0;

    this._fpsAccum += frameDt;
    this._fpsFrames++;
    if (this._fpsAccum >= 0.5) {
      this.fps = this._fpsFrames / this._fpsAccum;
      this._fpsAccum = 0;
      this._fpsFrames = 0;
    }

    if (this.hitstop > 0) {
      this.hitstop -= frameDt;
      // Während des Hitstops wird nur gezeichnet – die Welt steht still.
      this.render(this.accumulator / FIXED_DT, frameDt);
      return;
    }

    this.accumulator += frameDt * this.timeScale;

    let steps = 0;
    while (this.accumulator >= FIXED_DT) {
      this.update(FIXED_DT);
      this.accumulator -= FIXED_DT;
      // Notbremse: lieber Zeitlupe als eine einfrierende Seite.
      if (++steps >= 8) { this.accumulator = 0; break; }
      if (this.hitstop > 0) { this.accumulator = 0; break; }
    }

    this.render(this.accumulator / FIXED_DT, frameDt);
  }
}
