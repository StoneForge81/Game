// Levelgenerator: baut aus der Beat-Liste einer Zone eine spielbare Karte.
//
// Prinzip: Alles beginnt als massiver Fels. Jeder Beat meißelt einen Abschnitt
// heraus (Gang, Turm, Grube ...) und setzt Gegner, Lichter und Dekoration.
// Ein Cursor (cx = Spalte, fy = Bodenzeile) wandert von links nach rechts.
//
// Garantie der Erreichbarkeit: Ohne Fähigkeiten reicht ein Sprung sicher
// 3 Kacheln hoch und 4 Kacheln weit. Alles Pflichtige bleibt darunter.
// Nur ausdrücklich gesperrte Stellen (Gitter, Mauer, hohe Kante) verlangen
// eine bestimmte Kraft – und die hat man an dieser Stelle der Geschichte bereits.

import { TILE } from '../data/config.js';
import { ZONES, ZONE_ORDER } from '../data/zones.js';
import { makeRng, clamp } from '../core/math.js';
import { T } from './tiles.js';

const MAX_W = 1400;

class Builder {
  constructor(zoneId) {
    this.zoneId = zoneId;
    this.zone = ZONES[zoneId];
    this.H = this.zone.height;
    this.rng = makeRng(this.zone.seed);
    this.tiles = new Uint8Array(MAX_W * this.H).fill(T.SOLID);
    this.cx = 2;
    this.fy = this.H - 10;
    this.outdoor = !!this.zone.sky;

    this.entities = [];
    this.deco = [];
    this.lights = [];
    this.holy = [];
    this.arenas = [];
    this.checkpoints = [];
    this.triggers = [];
    this.water = [];
    this.spawn = null;
    this.bossArena = null;

    this._cp = 0;
    this._item = 0;
    this._prisoner = 0;
    this._lore = 0;
    this._arena = 0;
    this.maxX = 0;
  }

  // --- Kachel-Grundoperationen --------------------------------------------
  inBounds(x, y) { return x >= 0 && y >= 0 && x < MAX_W && y < this.H; }
  get(x, y) { return this.inBounds(x, y) ? this.tiles[y * MAX_W + x] : T.SOLID; }
  set(x, y, t) {
    if (!this.inBounds(x, y)) return;
    // Rand der Welt bleibt immer fest, damit nichts hinausfällt.
    if (y === 0 && !this.outdoor && t === T.EMPTY) return;
    if (y >= this.H - 1) return;
    this.tiles[y * MAX_W + x] = t;
    if (x > this.maxX) this.maxX = x;
  }
  fill(x0, y0, x1, y1, t) {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) this.set(x, y, t);
  }
  carve(x0, y0, x1, y1) { this.fill(x0, Math.max(this.outdoor ? 0 : 1, y0), x1, y1, T.EMPTY); }

  /** Boden auf Höhe fy im Bereich [x0,x1) sicherstellen (fest ab fy abwärts). */
  floor(x0, x1, fy) { this.fill(x0, fy, x1, this.H, T.SOLID); }

  // --- Welt-Einheiten -----------------------------------------------------
  wx(tx) { return tx * TILE; }
  wy(ty) { return ty * TILE; }

  // --- Platzieren ---------------------------------------------------------
  enemy(tx, kind = null, extra = {}) {
    const k = kind || this.rng.weighted(this.zone.enemies);
    // Füße auf dem Boden der Spalte suchen.
    const fy = this.groundAt(tx);
    this.entities.push({ type: 'enemy', kind: k, x: this.wx(tx) + TILE / 2, y: this.wy(fy), ...extra });
  }

  /** Oberste feste Zeile unterhalb eines freien Raums in Spalte tx (ab der Deckenseite gesucht). */
  groundAt(tx, fromY = null) {
    let y = fromY ?? Math.max(1, this.fy - 12);
    // Erst aus eventuellem Fels heraus, dann bis zum nächsten Boden.
    while (y < this.H - 1 && this.get(tx, y) !== T.EMPTY && this.get(tx, y) !== T.WATER) y++;
    while (y < this.H - 1 && (this.get(tx, y) === T.EMPTY || this.get(tx, y) === T.WATER)) y++;
    return y;
  }

  /** `requires` = Kraft, die das Versteck öffnet (für Tests und Kartenanzeige). */
  item(tx, ty, kind, requires = null) {
    const id = `${this.zoneId}.item${this._item++}`;
    this.entities.push({ type: 'item', kind, id, requires, x: this.wx(tx) + TILE / 2, y: this.wy(ty) + TILE / 2 });
    this.lights.push({ x: this.wx(tx) + TILE / 2, y: this.wy(ty), radius: 70, color: kind === 'chalice' ? 'rgb(255,60,90)' : 'rgb(255,80,70)', intensity: 0.9, flicker: 0.1 });
  }

  torch(tx, ty, color = null) {
    const x = this.wx(tx) + TILE / 2, y = this.wy(ty) + 6;
    // Draußen gibt es keine Rückwand – dann steht die Fackel auf einem Eisenpfahl.
    this.deco.push({ type: 'torch', x, y, pole: this.outdoor, groundY: this.outdoor ? this.wy(this.groundAt(tx)) : null });
    this.lights.push({ x, y: y - 4, radius: 200, color: color || this.zone.torchColor, intensity: 1.45, flicker: 0.22, shadows: true });
  }

  candle(tx, ty) {
    const x = this.wx(tx) + TILE / 2 + this.rng.range(-5, 5), y = this.wy(ty);
    this.deco.push({ type: 'candles', x, y, n: this.rng.int(2, 4) });
    this.lights.push({ x, y: y - 10, radius: 105, color: this.zone.torchColor, intensity: 0.95, flicker: 0.3 });
  }

  /** Fenster in der Rückwand – Mondlicht fällt schräg herein. */
  window(tx, ty) {
    const x = this.wx(tx), y = this.wy(ty);
    this.deco.push({ type: 'window', x, y, w: TILE * 2, h: TILE * 4 });
    this.lights.push({ x: x + TILE, y: y + TILE * 3, radius: 180, color: this.zone.lightColor, intensity: 0.85, flicker: 0 });
  }

  lorePoint(tx, key) {
    const fy = this.groundAt(tx);
    this.entities.push({ type: 'lore', id: `${this.zoneId}.lore${this._lore}`, key: key || `${this.zoneId}.${this._lore}`, x: this.wx(tx) + TILE / 2, y: this.wy(fy) });
    this._lore++;
    this.lights.push({ x: this.wx(tx) + TILE / 2, y: this.wy(fy) - 26, radius: 90, color: this.zone.torchColor, intensity: 0.9, flicker: 0.2 });
  }

  // --- Räume --------------------------------------------------------------

  /**
   * Standardraum: Spalten [cx, cx+len), Höhe `h` über dem Boden fy.
   * Gibt die Startspalte zurück und schiebt den Cursor weiter.
   */
  room(len, h = 9) {
    const x0 = this.cx;
    const top = this.outdoor ? 0 : this.fy - h;
    this.carve(x0, top, x0 + len, this.fy);
    this.floor(x0, x0 + len, this.fy);
    this.cx += len;
    return x0;
  }

  /** Boden um dy Kacheln verschieben, sicher innerhalb der Weltgrenzen. */
  shiftFloor(dy) {
    this.fy = clamp(this.fy + dy, 14, this.H - 5);
  }

  /** Gleichmäßig Deko und Licht an der Rückwand verteilen. */
  dressWalls(x0, x1, opts = {}) {
    const r = this.rng;
    const style = this.zone.bg;
    let x = x0 + r.int(2, 4);
    while (x < x1 - 2) {
      const fy = this.groundAt(x);
      const choice = r.next();
      if (this.outdoor) {
        // Im Freien gibt es keine Rückwand: Fackeln auf Pfählen, Gräber, Galgen.
        if (choice < 0.4) this.torch(x, fy - 4);
        else if (choice < 0.7) this.deco.push({ type: 'grave', x: this.wx(x) + TILE / 2, y: this.wy(fy), v: r.int(0, 2) });
        else if (choice < 0.85) this.deco.push({ type: 'gallows', x: this.wx(x) + TILE / 2, y: this.wy(fy) });
        else this.candle(x, fy);
        x += r.int(opts.spacing?.[0] ?? 6, opts.spacing?.[1] ?? 10);
        continue;
      }
      if (choice < 0.34) this.torch(x, fy - 4);
      else if (choice < 0.5) this.window(x, fy - 8);
      else if (choice < 0.68) this.candle(x, fy);
      else this.deco.push({ type: this.bannerFor(style), x: this.wx(x) + TILE / 2, y: this.wy(fy - 7) });
      // Säulen dazwischen geben dem Raum Tiefe.
      if (r.chance(0.45)) this.deco.push({ type: 'pillar', x: this.wx(x + 2), y: this.wy(fy), h: r.int(6, 9) * TILE });
      if (r.chance(0.3) && style === 'library') this.deco.push({ type: 'shelf', x: this.wx(x - 1), y: this.wy(fy), w: TILE * 3, h: TILE * 5 });
      if (r.chance(0.3) && style === 'clock') this.deco.push({ type: 'gear', x: this.wx(x + 1), y: this.wy(fy - 6), r: r.range(24, 56), speed: r.range(-0.8, 0.8) });
      if (r.chance(0.25) && style === 'crypt') this.deco.push({ type: 'bones', x: this.wx(x + 1), y: this.wy(fy) });
      if (r.chance(0.25) && style === 'catacomb') this.deco.push({ type: 'skulls', x: this.wx(x + 1), y: this.wy(fy - 5), w: TILE * 3 });
      if (r.chance(0.2)) this.deco.push({ type: 'cobweb', x: this.wx(x), y: this.wy(this.fy - (opts.h || 9)), flip: r.chance(0.5) });
      x += r.int(opts.spacing?.[0] ?? 6, opts.spacing?.[1] ?? 10);
    }
  }

  bannerFor(style) {
    return style === 'cathedral' ? 'glass' : 'banner';
  }

  sprinkleEnemies(x0, x1, count) {
    if (count <= 0) return;
    const span = x1 - x0;
    for (let i = 0; i < count; i++) {
      const tx = x0 + Math.floor(((i + 0.5) / count) * span) + this.rng.int(-1, 1);
      this.enemy(clamp(tx, x0 + 2, x1 - 2));
    }
  }

  /** Einbahnplattformen über einem Raum, als optionale Wege und Deckung. */
  sprinklePlatforms(x0, x1) {
    const r = this.rng;
    let x = x0 + r.int(3, 6);
    while (x < x1 - 5) {
      const w = r.int(3, 5);
      // Höhe am tatsächlichen Boden unter der Plattform ausrichten –
      // im Gang wechselt die Bodenhöhe.
      let floorY = this.H;
      for (let i = 0; i < w; i++) floorY = Math.min(floorY, this.groundAt(x + i));
      const y = floorY - r.int(3, 4);
      // Nur setzen, wenn Plattform und zwei Zeilen darunter frei sind
      // (sonst steckt sie in der Wand oder man kann nicht darunter laufen).
      let free = true;
      for (let i = 0; i < w && free; i++) {
        for (let dy = 0; dy <= 2; dy++) {
          if (this.get(x + i, y + dy) !== T.EMPTY) { free = false; break; }
        }
        // Auch darüber muss Kopffreiheit sein, damit man darauf stehen kann.
        if (this.get(x + i, y - 1) !== T.EMPTY || this.get(x + i, y - 2) !== T.EMPTY) free = false;
      }
      if (free) this.fill(x, y, x + w, y + 1, T.PLATFORM);
      x += w + r.int(4, 8);
    }
  }

  holyShaft(tx, w, topY, bottomY, opts = {}) {
    this.holy.push({
      x: this.wx(tx), y: this.wy(topY), w: this.wx(w), h: this.wy(bottomY - topY),
      period: opts.period ?? 3.2,
      on: opts.on ?? 1.6,
      offset: opts.offset ?? 0,
      always: !!opts.always,
    });
  }

  /**
   * Mauerblock mit versteckter Kammer. `door` ist die Kachel, die den Eingang
   * links verschließt (BREAKABLE oder GRATE).
   */
  secretChamber(itemKind, door) {
    const x0 = this.room(24, 9);
    const fy = this.fy;
    const bx = x0 + 8;
    const bw = 10;
    // Block: Zeilen fy-3 .. fy-1, also oben begehbar und mit einem Sprung erreichbar.
    this.fill(bx, fy - 3, bx + bw, fy, T.SOLID);
    // Kammer darin: 2 Zeilen hoch (40 WE) – genug für den Spieler (30 WE).
    this.carve(bx + 1, fy - 2, bx + bw - 1, fy);
    // Eingang links vollständig verschließen – keine Lücke, durch die man schlüpft.
    this.fill(bx, fy - 2, bx + 1, fy, door);
    this.item(bx + bw - 3, fy - 2, itemKind, door === T.GRATE ? 'mist' : 'wolf');
    this.deco.push({ type: door === T.GRATE ? 'grateGlow' : 'crack', x: this.wx(bx) + TILE / 2, y: this.wy(fy - 1) });
    this.dressWalls(x0, x0 + 7);
    this.torch(bx + bw + 3, fy - 4);
  }

  checkpoint() {
    const x0 = this.room(12, 8);
    const cpx = x0 + 6;
    const id = `${this.zoneId}.cp${this._cp++}`;
    this.checkpoints.push({ id, x: this.wx(cpx), y: this.wy(this.fy) });
    this.entities.push({ type: 'checkpoint', id, x: this.wx(cpx), y: this.wy(this.fy) });
    this.lights.push({ x: this.wx(cpx), y: this.wy(this.fy - 3), radius: 170, color: 'rgb(255,60,70)', intensity: 1.1, flicker: 0.08, shadows: true });
    this.candle(x0 + 2, this.fy);
    this.candle(x0 + 10, this.fy);
    this.deco.push({ type: 'banner', x: this.wx(x0 + 3), y: this.wy(this.fy - 6) });
    return id;
  }
}

// === Beats ==================================================================
// Jeder Beat ist eine Funktion (b: Builder) => void.

const BEATS = {
  // Allererster Moment: Ingomar erwacht in seinem Sarg.
  awaken(b) {
    const x0 = b.room(22, 9);
    const sx = x0 + 5;
    b.spawn = { x: b.wx(sx), y: b.wy(b.fy) };
    b.entities.push({ type: 'coffin', x: b.wx(sx), y: b.wy(b.fy), open: true });
    b.triggers.push({ kind: 'story', id: 'intro.awaken', x: b.wx(x0), y: b.wy(b.fy - 9), w: b.wx(8), h: b.wy(9), once: true, auto: true });
    b.candle(x0 + 2, b.fy); b.candle(x0 + 8, b.fy);
    b.torch(x0 + 14, b.fy - 4);
    b.deco.push({ type: 'statue', x: b.wx(x0 + 12), y: b.wy(b.fy) });
    b.deco.push({ type: 'bones', x: b.wx(x0 + 17), y: b.wy(b.fy) });
    b.triggers.push({ kind: 'hint', id: 'hint.move', x: b.wx(x0 + 7), y: b.wy(b.fy - 9), w: b.wx(6), h: b.wy(9), once: true });
    b.triggers.push({ kind: 'hint', id: 'hint.attack', x: b.wx(x0 + 15), y: b.wy(b.fy - 9), w: b.wx(6), h: b.wy(9), once: true });
    b.enemy(x0 + 19, 'skeleton', { passive: true });
  },

  arrive(b) {
    const x0 = b.room(18, 9);
    b.spawn = { x: b.wx(x0 + 3), y: b.wy(b.fy) };
    b.entities.push({ type: 'door', x: b.wx(x0 + 1), y: b.wy(b.fy), sealed: true });
    b.triggers.push({ kind: 'zoneTitle', id: `${b.zoneId}.title`, x: b.wx(x0), y: b.wy(b.fy - 9), w: b.wx(6), h: b.wy(9), once: true, auto: true });
    b.triggers.push({ kind: 'story', id: `${b.zoneId}.arrive`, x: b.wx(x0 + 6), y: b.wy(b.fy - 9), w: b.wx(4), h: b.wy(9), once: true });
    b.dressWalls(x0 + 2, x0 + 18);
  },

  corridor(b) {
    const r = b.rng;
    const len = r.int(26, 36);
    const start = b.cx;
    // In Abschnitte mit leicht wechselnder Bodenhöhe teilen.
    let remaining = len;
    while (remaining > 0) {
      const seg = Math.min(remaining, r.int(7, 12));
      b.room(seg, r.int(8, 11));
      remaining -= seg;
      if (remaining > 0) b.shiftFloor(r.int(-2, 2));
    }
    b.sprinklePlatforms(start, b.cx);
    b.dressWalls(start, b.cx);
    b.sprinkleEnemies(start + 6, b.cx - 2, r.int(2, 4));
  },

  tutorialJump(b) {
    const x0 = b.room(30, 9);
    // Zwei niedrige Mauern und ein kleiner Graben.
    b.fill(x0 + 6, b.fy - 2, x0 + 8, b.fy, T.SOLID);
    b.carve(x0 + 13, b.fy, x0 + 16, b.fy + 3);
    b.fill(x0 + 13, b.fy + 2, x0 + 16, b.fy + 3, T.SPIKES);
    b.fill(x0 + 21, b.fy - 3, x0 + 23, b.fy, T.SOLID);
    b.triggers.push({ kind: 'hint', id: 'hint.jump', x: b.wx(x0), y: b.wy(b.fy - 9), w: b.wx(5), h: b.wy(9), once: true });
    b.triggers.push({ kind: 'hint', id: 'hint.drain', x: b.wx(x0 + 24), y: b.wy(b.fy - 9), w: b.wx(4), h: b.wy(9), once: true });
    b.torch(x0 + 3, b.fy - 4);
    b.torch(x0 + 18, b.fy - 4);
    b.enemy(x0 + 27, 'novice');
  },

  // Plattformen über einer Grube mit Silberdornen.
  pit(b) {
    const r = b.rng;
    const x0 = b.cx;
    b.room(4, 10);
    const baseFy = b.fy;
    const pitBottom = Math.min(b.H - 2, baseFy + 5);
    let x = b.cx;
    const n = r.int(4, 6);
    let py = baseFy;
    for (let i = 0; i < n; i++) {
      // Erst die Höhe der nächsten Plattform, dann eine dazu passende Lücke:
      // Aufwärts trägt der Sprung weniger weit (siehe Physik in config.js).
      const ny = clamp(py + r.int(-2, 2), baseFy - 3, baseFy + 1);
      const gap = ny < py ? r.int(2, 3) : r.int(2, 4);
      py = ny;
      // Grube aushöhlen
      b.carve(x, baseFy - 10, x + gap, pitBottom);
      b.fill(x, pitBottom - 1, x + gap, pitBottom, T.SPIKES);
      x += gap;
      const w = r.int(3, 5);
      b.carve(x, baseFy - 10, x + w, py);
      b.fill(x, py, x + w, pitBottom, T.SOLID);
      if (r.chance(0.3)) b.enemy(x + Math.floor(w / 2), r.chance(0.5) ? 'skeleton' : null);
      x += w;
    }
    b.cx = x;
    b.fy = py;
    b.room(5, 10);
    // Fledermausschwarm über der Grube als Atmosphäre.
    b.deco.push({ type: 'batSwarm', x: b.wx(x0 + 8), y: b.wy(baseFy - 8) });
    b.torch(x0 + 1, baseFy - 4);
    b.torch(b.cx - 2, b.fy - 4);
    b.triggers.push({ kind: 'pit', x: b.wx(x0), y: b.wy(pitBottom - 2), w: b.wx(b.cx - x0), h: b.wy(2) });
  },

  stairsUp(b) {
    const r = b.rng;
    const steps = r.int(5, 8);
    const start = b.cx;
    b.room(4, 10);
    for (let i = 0; i < steps; i++) {
      b.shiftFloor(-1);
      b.room(2, 10);
    }
    b.room(5, 10);
    b.dressWalls(start, b.cx, { spacing: [5, 7] });
    b.enemy(b.cx - 3);
  },

  stairsDown(b) {
    const r = b.rng;
    const steps = r.int(5, 8);
    const start = b.cx;
    b.room(4, 10);
    for (let i = 0; i < steps; i++) {
      b.shiftFloor(1);
      b.room(2, 10);
    }
    b.room(5, 10);
    b.dressWalls(start, b.cx, { spacing: [5, 7] });
    b.enemy(b.cx - 3);
  },

  /**
   * Vertikaler Schacht mit Einbahnplattformen im Zickzack.
   * Steigt, wenn oben Platz ist, sonst fällt er.
   */
  tower(b) {
    const r = b.rng;
    const width = 14;
    const rise = r.int(14, 20);
    const up = b.fy - rise >= 14;
    const x0 = b.cx;
    const bottom = up ? b.fy : clamp(b.fy + rise, 0, b.H - 5);
    const top = up ? b.fy - rise : b.fy;
    const shaftTop = Math.max(b.outdoor ? 0 : 1, top - 9);

    b.carve(x0, shaftTop, x0 + width, bottom);
    b.floor(x0, x0 + width, bottom);

    if (up) {
      // Plattformen alle 3 Kacheln – ein normaler Sprung reicht sicher.
      let y = bottom - 3;
      let left = true;
      while (y > top) {
        const px = left ? x0 + 1 : x0 + width - 6;
        b.fill(px, y, px + 5, y + 1, T.PLATFORM);
        if (r.chance(0.35)) b.candle(px + 2, y);
        left = !left;
        y -= 3;
      }
      // Oberer Ausgang
      b.fill(x0 + width - 6, top, x0 + width, top + 1, T.PLATFORM);
    } else {
      // Abwärts: ein paar Plattformen zum Abbremsen.
      let y = top + 3;
      let left = false;
      while (y < bottom - 2) {
        const px = left ? x0 + 1 : x0 + width - 6;
        b.fill(px, y, px + 5, y + 1, T.PLATFORM);
        left = !left;
        y += 4;
      }
      // Einstiegskante am oberen Rand
      b.floor(x0, x0 + 3, top);
      b.carve(x0, shaftTop, x0 + 3, top);
    }

    b.torch(x0 + 3, bottom - 5);
    b.torch(x0 + width - 4, top + 2);
    b.window(x0 + 6, Math.floor((top + bottom) / 2) - 2);
    b.deco.push({ type: 'chains', x: b.wx(x0 + 4), y: b.wy(shaftTop), h: b.wy(bottom - shaftTop) * 0.6 });
    b.deco.push({ type: 'chains', x: b.wx(x0 + 10), y: b.wy(shaftTop), h: b.wy(bottom - shaftTop) * 0.4 });
    if (r.chance(0.6)) b.enemy(x0 + 7);

    b.cx = x0 + width;
    b.fy = up ? top : bottom;
    b.room(3, 9);
  },

  water(b) {
    const r = b.rng;
    const len = r.int(26, 32);
    const x0 = b.room(len, 10);
    const depth = 3;
    // Becken: zwei Kacheln tiefer, mit Wasser gefüllt, Trittsteine dazwischen.
    const px0 = x0 + 4, px1 = x0 + len - 4;
    b.carve(px0, b.fy, px1, b.fy + depth);
    b.fill(px0, b.fy, px1, b.fy + depth, T.WATER);
    b.floor(px0, px1, b.fy + depth);
    // Trittsteine bündig mit dem Boden, Lücken von 3 Kacheln.
    // Wer ins Becken fällt, kommt an jedem Stein (3 Kacheln hoch) wieder heraus.
    for (let x = px0 + 3; x < px1 - 3; x += 5) {
      b.fill(x, b.fy, x + 2, b.fy + depth, T.SOLID);
    }
    b.water.push({ x: b.wx(px0), y: b.wy(b.fy) + 4, w: b.wx(px1 - px0), h: b.wy(depth) - 4 });
    b.dressWalls(x0, x0 + len);
    b.sprinkleEnemies(x0 + 6, x0 + len - 3, r.int(1, 3));
  },

  holyIntro(b) {
    const x0 = b.room(30, 10);
    b.triggers.push({ kind: 'story', id: 'intro.holy', x: b.wx(x0 + 2), y: b.wy(b.fy - 10), w: b.wx(4), h: b.wy(10), once: true });
    // Drei Lichtschächte mit Pause dazwischen – Zeitgefühl lernen.
    b.holyShaft(x0 + 9, 3, b.fy - 10, b.fy, { period: 3.0, on: 1.3, offset: 0 });
    b.holyShaft(x0 + 16, 3, b.fy - 10, b.fy, { period: 3.0, on: 1.3, offset: 1.0 });
    b.holyShaft(x0 + 23, 3, b.fy - 10, b.fy, { period: 3.0, on: 1.3, offset: 2.0 });
    b.torch(x0 + 3, b.fy - 4);
    b.torch(x0 + 28, b.fy - 4);
    b.deco.push({ type: 'banner', x: b.wx(x0 + 13), y: b.wy(b.fy - 8) });
    b.deco.push({ type: 'banner', x: b.wx(x0 + 20), y: b.wy(b.fy - 8) });
  },

  holyCorridor(b) {
    const r = b.rng;
    const len = r.int(30, 40);
    const x0 = b.room(len, 11);
    let x = x0 + 6;
    let i = 0;
    while (x < x0 + len - 5) {
      const w = r.int(2, 4);
      b.holyShaft(x, w, b.fy - 11, b.fy, { period: r.range(2.6, 3.6), on: r.range(1.1, 1.6), offset: i * 0.9 });
      // Plattform über manchen Schächten – ein Ausweg nach oben.
      if (r.chance(0.4)) b.fill(x - 2, b.fy - 4, x + w + 2, b.fy - 3, T.PLATFORM);
      x += w + r.int(5, 8);
      i++;
    }
    b.dressWalls(x0, x0 + len);
    b.sprinkleEnemies(x0 + 5, x0 + len - 3, r.int(1, 3));
    // Ein Akolyth mit Weihrauchfass hält hier Wache.
    b.enemy(x0 + Math.floor(len / 2), 'acolyte');
  },

  prisoner(b) {
    const x0 = b.room(16, 8);
    const id = `${b.zoneId}.prisoner${b._prisoner++}`;
    b.entities.push({ type: 'prisoner', id, x: b.wx(x0 + 8), y: b.wy(b.fy), variant: b._prisoner });
    b.candle(x0 + 3, b.fy);
    b.candle(x0 + 13, b.fy);
    b.deco.push({ type: 'chains', x: b.wx(x0 + 6), y: b.wy(b.fy - 8), h: 70 });
    b.deco.push({ type: 'chains', x: b.wx(x0 + 10), y: b.wy(b.fy - 8), h: 90 });
  },

  // Ines und Matthias an ihrem Schreibpult zwischen den Regalen.
  archivists(b) {
    const x0 = b.room(20, 9);
    const fy = b.groundAt(x0 + 10);
    b.entities.push({ type: 'archivists', x: b.wx(x0 + 10), y: b.wy(fy) });
    b.triggers.push({ kind: 'hint', id: 'hint.archivists', x: b.wx(x0), y: b.wy(b.fy - 9), w: b.wx(5), h: b.wy(9), once: true });
    b.deco.push({ type: 'shelf', x: b.wx(x0 + 2), y: b.wy(fy), w: TILE * 3, h: TILE * 5 });
    b.deco.push({ type: 'shelf', x: b.wx(x0 + 15), y: b.wy(fy), w: TILE * 3, h: TILE * 5 });
    b.candle(x0 + 8, fy);
    b.candle(x0 + 13, fy);
    b.lights.push({ x: b.wx(x0 + 10), y: b.wy(fy) - 30, radius: 130, color: 'rgb(255,200,130)', intensity: 1.1, flicker: 0.2 });
  },

  lore(b) {
    const x0 = b.room(14, 9);
    b.lorePoint(x0 + 7);
    b.dressWalls(x0, x0 + 14);
  },

  checkpoint(b) { b.checkpoint(); },

  // Kampfarena: Tore schließen sich, zwei Wellen, danach eine Belohnung.
  arena(b) {
    const r = b.rng;
    const len = 30;
    const x0 = b.room(len, 11);
    const id = `${b.zoneId}.arena${b._arena++}`;
    const waves = [
      [r.weighted(b.zone.enemies), r.weighted(b.zone.enemies), r.weighted(b.zone.enemies)],
      [r.weighted(b.zone.enemies), r.weighted(b.zone.enemies), r.weighted(b.zone.enemies), r.weighted(b.zone.enemies)],
    ];
    b.arenas.push({
      id, x: b.wx(x0), y: b.wy(b.fy - 11), w: b.wx(len), h: b.wy(11),
      gateL: { tx: x0, ty0: b.fy - 11, ty1: b.fy },
      gateR: { tx: x0 + len - 1, ty0: b.fy - 11, ty1: b.fy },
      waves, floorY: b.wy(b.fy),
      reward: { x: b.wx(x0 + len / 2), y: b.wy(b.fy - 2) },
    });
    b.fill(x0 + 5, b.fy - 4, x0 + 10, b.fy - 3, T.PLATFORM);
    b.fill(x0 + len - 10, b.fy - 4, x0 + len - 5, b.fy - 3, T.PLATFORM);
    b.fill(x0 + 12, b.fy - 7, x0 + 18, b.fy - 6, T.PLATFORM);
    b.torch(x0 + 2, b.fy - 5);
    b.torch(x0 + len - 3, b.fy - 5);
    b.torch(x0 + 15, b.fy - 9);
  },

  // --- Geheimnisse: nur mit späteren Kräften erreichbar -------------------

  // Alle Geheimkammern folgen demselben Muster: ein Mauerblock im Gang,
  // 3 Kacheln hoch (also normal überspringbar), darin eine Kammer.
  // Der Zugang von links ist verschlossen – mit morschem Mauerwerk oder
  // einem Gitter. Waagerecht, weil Wolfsklaue und Nebelschritt waagerecht wirken.
  secretBreakable(b) { b.secretChamber('heartShard', T.BREAKABLE); },
  secretMist(b) { b.secretChamber('heartShard', T.GRATE); },

  secretBat(b) {
    const x0 = b.room(22, 14);
    // Hohe Kante: 6 Kacheln – ohne Doppelsprung unerreichbar
    // (Sprung schafft ~3,9 Kacheln, der Luft-Dash bringt keine Höhe).
    b.fill(x0 + 13, b.fy - 6, x0 + 18, b.fy - 5, T.SOLID);
    b.item(x0 + 15, b.fy - 7, 'chalice', 'bat');
    // Raum seitlich abschließen: nur ein niedriger Durchgang am Boden.
    // Sonst springt man von hohen Plattformen im Nachbargang hinüber.
    b.fill(x0, b.fy - 14, x0 + 1, b.fy - 3, T.SOLID);
    b.fill(x0 + 21, b.fy - 14, x0 + 22, b.fy - 3, T.SOLID);
    b.dressWalls(x0, x0 + 11);
    // Rechts genug Abstand zum nächsten Abschnitt, damit man nicht von dort hinüberspringt.
    b.deco.push({ type: 'batSwarm', x: b.wx(x0 + 15), y: b.wy(b.fy - 10) });
  },

  // --- Pflichtsperren -------------------------------------------------------

  mistGate(b) {
    const x0 = b.room(22, 9);
    b.fill(x0 + 11, b.fy - 9, x0 + 12, b.fy, T.GRATE);
    b.triggers.push({ kind: 'hint', id: 'hint.mistGate', x: b.wx(x0 + 5), y: b.wy(b.fy - 9), w: b.wx(5), h: b.wy(9), once: true });
    b.torch(x0 + 8, b.fy - 4);
    b.torch(x0 + 15, b.fy - 4);
    b.enemy(x0 + 18);
  },

  wolfGate(b) {
    const x0 = b.room(22, 9);
    b.fill(x0 + 11, b.fy - 9, x0 + 13, b.fy, T.BREAKABLE);
    b.triggers.push({ kind: 'hint', id: 'hint.wolfGate', x: b.wx(x0 + 5), y: b.wy(b.fy - 9), w: b.wx(5), h: b.wy(9), once: true });
    b.torch(x0 + 8, b.fy - 4);
    b.torch(x0 + 16, b.fy - 4);
    b.enemy(x0 + 18);
  },

  batGap(b) {
    const x0 = b.room(6, 12);
    const baseFy = b.fy;
    // Breite Kluft mit Dornen. Ohne Fledermaus schafft man höchstens
    // Sprung (~5,6 Kacheln) + Luft-Dash (~4,4) = 10 Kacheln – also 12.
    // Mit Doppelsprung und Gleiten sind es über 16.
    const gap = 12;
    const bottom = Math.min(b.H - 2, baseFy + 6);
    b.carve(b.cx, baseFy - 12, b.cx + gap, bottom);
    b.fill(b.cx, bottom - 1, b.cx + gap, bottom, T.SPIKES);
    b.triggers.push({ kind: 'pit', x: b.wx(b.cx), y: b.wy(bottom - 2), w: b.wx(gap), h: b.wy(2) });
    b.triggers.push({ kind: 'hint', id: 'hint.batGap', x: b.wx(x0), y: b.wy(baseFy - 12), w: b.wx(5), h: b.wy(12), once: true });
    b.cx += gap;
    b.room(8, 12);
    b.torch(x0 + 2, baseFy - 5);
    b.torch(b.cx - 3, b.fy - 5);
    b.deco.push({ type: 'batSwarm', x: b.wx(x0 + 10), y: b.wy(baseFy - 8) });
  },

  // Dächer unter freiem Himmel (nur im Hof sinnvoll, geht aber überall).
  rooftops(b) {
    const r = b.rng;
    const x0 = b.cx;
    const baseFy = b.fy;
    b.room(3, 12);
    let x = b.cx;
    let fy = baseFy;
    const n = r.int(4, 6);
    for (let i = 0; i < n; i++) {
      const nfy = clamp(fy + r.int(-2, 2), baseFy - 4, baseFy + 2);
      const gap = nfy < fy ? r.int(2, 3) : r.int(2, 4);
      const bottom = Math.min(b.H - 2, Math.max(fy, nfy, baseFy) + 6);
      b.carve(x, 0, x + gap, bottom);
      b.fill(x, bottom - 1, x + gap, bottom, T.SPIKES);
      x += gap;
      fy = nfy;
      const w = r.int(5, 8);
      b.carve(x, 0, x + w, fy);
      b.fill(x, fy, x + w, b.H, T.SOLID);
      // Dachgiebel als Deko.
      b.deco.push({ type: 'roof', x: b.wx(x), y: b.wy(fy), w: b.wx(w) });
      if (r.chance(0.5)) b.enemy(x + Math.floor(w / 2));
      x += w;
    }
    b.cx = x;
    b.fy = fy;
    b.triggers.push({ kind: 'pit', x: b.wx(x0), y: b.wy(Math.min(b.H - 2, baseFy + 6) - 2), w: b.wx(x - x0), h: b.wy(2) });
    b.room(4, 12);
  },

  // --- Boss -----------------------------------------------------------------

  bossGate(b) {
    const x0 = b.room(16, 10);
    b.checkpointNearBoss = b.checkpoint();
    b.entities.push({ type: 'bossDoor', x: b.wx(b.cx - 1), y: b.wy(b.fy) });
    b.torch(x0 + 3, b.fy - 5, 'rgb(255,80,60)');
    b.torch(x0 + 13, b.fy - 5, 'rgb(255,80,60)');
  },

  boss(b) {
    const len = 32;
    const h = 14;
    const x0 = b.room(len, h);
    b.bossArena = {
      id: `${b.zoneId}.boss`,
      boss: b.zone.boss,
      x: b.wx(x0), y: b.wy(b.fy - h), w: b.wx(len), h: b.wy(h),
      floorY: b.wy(b.fy),
      gateL: { tx: x0, ty0: b.fy - h, ty1: b.fy },
      gateR: { tx: x0 + len - 1, ty0: b.fy - h, ty1: b.fy },
    };
    b.triggers.push({ kind: 'boss', id: `${b.zoneId}.boss`, x: b.wx(x0 + 4), y: b.wy(b.fy - h), w: b.wx(3), h: b.wy(h), once: true });
    // Zwei Emporen für Ausweichmanöver.
    b.fill(x0 + 4, b.fy - 5, x0 + 9, b.fy - 4, T.PLATFORM);
    b.fill(x0 + len - 9, b.fy - 5, x0 + len - 4, b.fy - 4, T.PLATFORM);
    b.torch(x0 + 2, b.fy - 6, 'rgb(255,90,70)');
    b.torch(x0 + len - 3, b.fy - 6, 'rgb(255,90,70)');
    b.torch(x0 + 12, b.fy - 11);
    b.torch(x0 + 20, b.fy - 11);
    if (!b.outdoor) b.window(x0 + 15, b.fy - 13);
  },

  exit(b) {
    const x0 = b.room(14, 9);
    const idx = ZONE_ORDER.indexOf(b.zoneId);
    const next = ZONE_ORDER[idx + 1] || null;
    b.entities.push({ type: 'exit', to: next, x: b.wx(x0 + 10), y: b.wy(b.fy) });
    b.torch(x0 + 7, b.fy - 4);
    b.torch(x0 + 12, b.fy - 4);
  },

  throne(b) {
    const x0 = b.room(26, 14);
    b.entities.push({ type: 'throne', x: b.wx(x0 + 18), y: b.wy(b.fy) });
    b.triggers.push({ kind: 'story', id: 'ending.throne', x: b.wx(x0 + 14), y: b.wy(b.fy - 14), w: b.wx(4), h: b.wy(14), once: true });
    b.torch(x0 + 4, b.fy - 6, 'rgb(255,60,60)');
    b.torch(x0 + 22, b.fy - 6, 'rgb(255,60,60)');
    b.window(x0 + 11, b.fy - 12);
    b.deco.push({ type: 'banner', x: b.wx(x0 + 15), y: b.wy(b.fy - 10) });
  },
};

/**
 * Baut eine Zone. Das Ergebnis ist reines Datenobjekt ohne Methoden – so kann
 * die Welt es direkt verwenden und Tests können es prüfen.
 */
export function generateZone(zoneId) {
  const zone = ZONES[zoneId];
  if (!zone) throw new Error('Unbekannte Zone: ' + zoneId);
  const b = new Builder(zoneId);

  for (const beat of zone.beats) {
    const fn = BEATS[beat];
    if (!fn) throw new Error(`Unbekannter Beat "${beat}" in Zone ${zoneId}`);
    fn(b);
  }
  // Abschlussmauer rechts.
  b.cx += 2;

  const W = Math.min(MAX_W, b.cx + 2);
  const H = b.H;
  // Auf die tatsächliche Breite zuschneiden.
  const tiles = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) tiles[y * W + x] = b.tiles[y * MAX_W + x];
  }
  // Rechter und linker Rand immer fest.
  for (let y = 0; y < H; y++) {
    tiles[y * W] = T.SOLID;
    tiles[y * W + W - 1] = T.SOLID;
  }

  return {
    zoneId, w: W, h: H, tiles,
    entities: b.entities,
    deco: b.deco,
    lights: b.lights,
    holy: b.holy,
    arenas: b.arenas,
    checkpoints: b.checkpoints,
    triggers: b.triggers,
    water: b.water,
    spawn: b.spawn,
    bossArena: b.bossArena,
  };
}

export { BEATS };
