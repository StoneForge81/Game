// Die Laufzeit-Welt: Kacheln, Kollision, Schattenwerfer, heiliges Licht, Wasser.
//
// Koordinaten: Figuren werden über ihre Füße verankert – x = Mitte, y = Sohle.
// Die Hitbox ist also (x - w/2, y - h, w, h). Das macht Bodenkontakt eindeutig.

import { TILE } from '../data/config.js';
import { T, isOccluder } from './tiles.js';
import { rectsOverlap } from '../core/math.js';

const BUCKET = 16; // Kacheln pro Eimer im Schattenwerfer-Raster

export class World {
  constructor(level) {
    this.level = level;
    this.zoneId = level.zoneId;
    this.w = level.w;
    this.h = level.h;
    this.tiles = level.tiles.slice(); // eigene Kopie: Mauern können einstürzen
    this.pxW = this.w * TILE;
    this.pxH = this.h * TILE;
    this.holy = level.holy.map((z) => ({ ...z }));
    this.water = level.water;
    this.time = 0;
    this.onTileChange = null;     // (tx, ty) => void – der Kachel-Renderer hört mit
    this._buildOccluders();
  }

  // --- Kacheln ------------------------------------------------------------
  tile(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return T.SOLID;
    return this.tiles[ty * this.w + tx];
  }

  tileAt(wx, wy) { return this.tile(Math.floor(wx / TILE), Math.floor(wy / TILE)); }

  setTile(tx, ty, t) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return;
    const i = ty * this.w + tx;
    if (this.tiles[i] === t) return;
    this.tiles[i] = t;
    this._occDirty = true;
    this.onTileChange && this.onTileChange(tx, ty);
  }

  /** Für Partikel: bleibt ein Blutstropfen hier liegen? */
  isSolidAt(wx, wy) {
    const t = this.tileAt(wx, wy);
    return t === T.SOLID || t === T.PLATFORM || t === T.BREAKABLE || t === T.GRATE || t === T.SPIKES || t === T.GATE;
  }

  // --- Kollision ----------------------------------------------------------

  /** Blockiert diese Kachel waagerecht/nach oben? */
  _blocks(t, mist) {
    if (t === T.SOLID || t === T.BREAKABLE || t === T.GATE || t === T.SPIKES) return true;
    if (t === T.GRATE) return !mist;
    return false;
  }

  /**
   * Bewegt einen Körper mit Kollision. Achsen getrennt, erst x dann y.
   * body: { x, y, w, h, vx, vy }  – wird verändert.
   * opts: { mist, dropThrough }
   * Rückgabe: Flags, was berührt wurde.
   */
  move(body, dt, opts = {}) {
    const res = { hitWall: 0, hitCeiling: false, landed: false, onGround: false, groundTile: T.EMPTY };
    const hw = body.w / 2;
    const eps = 0.001;

    // --- waagerecht ---
    if (body.vx !== 0) {
      let nx = body.x + body.vx * dt;
      const top = body.y - body.h + eps;
      const bottom = body.y - eps;
      const ty0 = Math.floor(top / TILE), ty1 = Math.floor(bottom / TILE);
      if (body.vx > 0) {
        const col = Math.floor((nx + hw - eps) / TILE);
        for (let r = ty0; r <= ty1; r++) {
          if (this._blocks(this.tile(col, r), opts.mist)) {
            nx = col * TILE - hw;
            res.hitWall = 1;
            break;
          }
        }
      } else {
        const col = Math.floor((nx - hw) / TILE);
        for (let r = ty0; r <= ty1; r++) {
          if (this._blocks(this.tile(col, r), opts.mist)) {
            nx = (col + 1) * TILE + hw;
            res.hitWall = -1;
            break;
          }
        }
      }
      if (res.hitWall) body.vx = 0;
      body.x = nx;
    }

    // --- senkrecht ---
    let ny = body.y + body.vy * dt;
    const left = body.x - hw + eps;
    const right = body.x + hw - eps;
    const tx0 = Math.floor(left / TILE), tx1 = Math.floor(right / TILE);

    if (body.vy >= 0) {
      const r = Math.floor(ny / TILE);
      // Nur landen, wenn die Füße vorher oberhalb dieser Zeile waren.
      if (body.y <= r * TILE + 0.5) {
        for (let c = tx0; c <= tx1; c++) {
          const t = this.tile(c, r);
          const solid = this._blocks(t, false) || t === T.GRATE;
          const platform = t === T.PLATFORM && !opts.dropThrough;
          if (solid || platform) {
            ny = r * TILE;
            body.vy = 0;
            res.landed = true;
            res.onGround = true;
            res.groundTile = t;
            break;
          }
        }
      }
    } else {
      const top = ny - body.h;
      const r = Math.floor(top / TILE);
      if (body.y - body.h >= (r + 1) * TILE - 0.5) {
        for (let c = tx0; c <= tx1; c++) {
          if (this._blocks(this.tile(c, r), opts.mist)) {
            ny = (r + 1) * TILE + body.h;
            body.vy = 0;
            res.hitCeiling = true;
            break;
          }
        }
      }
    }
    body.y = ny;
    return res;
  }

  /** Steht direkt unter den Füßen Boden? (Für KI: "gibt es vor mir eine Kante?") */
  groundBelow(x, y, halfW = 0) {
    const r = Math.floor((y + 1) / TILE);
    for (const px of [x - halfW, x + halfW]) {
      const t = this.tile(Math.floor(px / TILE), r);
      if (t === T.SOLID || t === T.PLATFORM || t === T.BREAKABLE || t === T.GRATE) return true;
    }
    return false;
  }

  /** Überlappt das Rechteck feste Kacheln? */
  rectSolid(x, y, w, h, mist = false) {
    const tx0 = Math.floor(x / TILE), tx1 = Math.floor((x + w - 0.001) / TILE);
    const ty0 = Math.floor(y / TILE), ty1 = Math.floor((y + h - 0.001) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (this._blocks(this.tile(tx, ty), mist)) return true;
      }
    }
    return false;
  }

  /** Alle Kacheln eines Typs innerhalb eines Rechtecks (für Dornen, Wasser, Mauern). */
  tilesInRect(x, y, w, h, type) {
    const out = [];
    const tx0 = Math.floor(x / TILE), tx1 = Math.floor((x + w - 0.001) / TILE);
    const ty0 = Math.floor(y / TILE), ty1 = Math.floor((y + h - 0.001) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (this.tile(tx, ty) === type) out.push([tx, ty]);
      }
    }
    return out;
  }

  /** Sichtlinie für Gegner: blockieren nur massive Kacheln. Schrittweise Abtastung. */
  lineOfSight(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.ceil(d / (TILE * 0.5));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const tt = this.tileAt(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
      if (tt === T.SOLID || tt === T.BREAKABLE || tt === T.GATE) return false;
    }
    return true;
  }

  // --- Wasser und heiliges Licht -----------------------------------------

  inWater(x, y, w, h) {
    for (const z of this.water) {
      if (x < z.x + z.w && x + w > z.x && y < z.y + z.h && y + h > z.y) return true;
    }
    return false;
  }

  update(dt) { this.time += dt; }

  /**
   * Zustand eines Lichtschachts: 0 = aus, 0..1 = Vorwarnung (keine Wirkung),
   * 1 = aktiv (brennt). `warn` ist die Vorwarnzeit in Sekunden.
   */
  holyState(z, warn = 0.7) {
    if (z.always) return { active: true, glow: 1 };
    const t = ((this.time + z.offset) % z.period + z.period) % z.period;
    if (t < z.on) {
      // Kurzes Aufflammen am Anfang, dann ruhiges Leuchten.
      const flare = t < 0.12 ? 1.4 - t * 3.3 : 1;
      return { active: true, glow: flare };
    }
    const untilOn = z.period - t;
    if (untilOn < warn) return { active: false, glow: 0.12 + 0.28 * (1 - untilOn / warn) };
    return { active: false, glow: 0.05 };
  }

  /** Wie stark brennt heiliges Licht auf diesem Rechteck? (0 = gar nicht) */
  holyExposure(x, y, w, h) {
    let exp = 0;
    for (const z of this.holy) {
      if (x < z.x + z.w && x + w > z.x && y < z.y + z.h && y + h > z.y) {
        const s = this.holyState(z);
        if (s.active) exp = Math.max(exp, 1);
      }
    }
    return exp;
  }

  // --- Arenatore ----------------------------------------------------------

  setGate(gate, closed) {
    for (let ty = gate.ty0; ty < gate.ty1; ty++) {
      this.setTile(gate.tx, ty, closed ? T.GATE : T.EMPTY);
    }
  }

  /** Morsches Mauerwerk in einem Rechteck einreißen. Liefert die zerstörten Kacheln. */
  breakWalls(x, y, w, h) {
    const hit = this.tilesInRect(x, y, w, h, T.BREAKABLE);
    // Zusammenhängende Wand komplett einstürzen lassen – einzelne Reste wirken kaputt.
    const out = [];
    const seen = new Set();
    const stack = [...hit];
    while (stack.length) {
      const [tx, ty] = stack.pop();
      const k = ty * this.w + tx;
      if (seen.has(k) || this.tile(tx, ty) !== T.BREAKABLE) continue;
      seen.add(k);
      this.setTile(tx, ty, T.EMPTY);
      out.push([tx, ty]);
      stack.push([tx + 1, ty], [tx - 1, ty], [tx, ty + 1], [tx, ty - 1]);
    }
    return out;
  }

  // --- Schattenwerfer -----------------------------------------------------

  /**
   * Feste Kacheln zu möglichst großen Rechtecken zusammenfassen (erst Zeilen,
   * dann gleich breite Streifen übereinander). Aus ~20.000 Kacheln werden so
   * einige hundert Rechtecke – das hält den Schattenwurf schnell.
   */
  _buildOccluders() {
    const rects = [];
    const open = new Map(); // "x0,x1" -> offenes Rechteck
    for (let ty = 0; ty < this.h; ty++) {
      const runs = [];
      let tx = 0;
      while (tx < this.w) {
        if (isOccluder(this.tile(tx, ty))) {
          const s = tx;
          while (tx < this.w && isOccluder(this.tile(tx, ty))) tx++;
          runs.push([s, tx]);
        } else tx++;
      }
      const next = new Map();
      for (const [a, b] of runs) {
        const key = a + ',' + b;
        const r = open.get(key);
        if (r) { r.h += TILE; next.set(key, r); open.delete(key); }
        else {
          const nr = { x: a * TILE, y: ty * TILE, w: (b - a) * TILE, h: TILE };
          rects.push(nr);
          next.set(key, nr);
        }
      }
      open.clear();
      for (const [k, v] of next) open.set(k, v);
    }
    this.occluders = rects;

    // In Eimer einsortieren, damit Lichter nur ihre Nachbarschaft abfragen.
    const bw = Math.ceil(this.w / BUCKET), bh = Math.ceil(this.h / BUCKET);
    this._bw = bw; this._bh = bh;
    this._buckets = Array.from({ length: bw * bh }, () => []);
    rects.forEach((r, i) => {
      const bx0 = Math.floor(r.x / TILE / BUCKET), bx1 = Math.floor((r.x + r.w - 1) / TILE / BUCKET);
      const by0 = Math.floor(r.y / TILE / BUCKET), by1 = Math.floor((r.y + r.h - 1) / TILE / BUCKET);
      for (let by = by0; by <= by1; by++) for (let bx = bx0; bx <= bx1; bx++) this._buckets[by * bw + bx].push(i);
    });
    this._occDirty = false;
    this._stamp = new Uint32Array(rects.length);
    this._query = 0;
  }

  queryOccluders(x, y, w, h) {
    if (this._occDirty) this._buildOccluders();
    const bx0 = Math.max(0, Math.floor(x / TILE / BUCKET));
    const bx1 = Math.min(this._bw - 1, Math.floor((x + w) / TILE / BUCKET));
    const by0 = Math.max(0, Math.floor(y / TILE / BUCKET));
    const by1 = Math.min(this._bh - 1, Math.floor((y + h) / TILE / BUCKET));
    const out = [];
    const q = ++this._query;
    const area = { x, y, w, h };
    for (let by = by0; by <= by1; by++) {
      for (let bx = bx0; bx <= bx1; bx++) {
        for (const i of this._buckets[by * this._bw + bx]) {
          if (this._stamp[i] === q) continue; // schon gesehen (liegt in mehreren Eimern)
          this._stamp[i] = q;
          const r = this.occluders[i];
          if (rectsOverlap(r, area)) out.push(r);
        }
      }
    }
    return out;
  }
}
