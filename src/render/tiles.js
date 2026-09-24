// Kachel-Renderer: zeichnet die Architektur stückweise vor (Chunks) und
// hält sie im Speicher. Nur geänderte Stücke (eingestürzte Mauern, Arenatore)
// werden neu gezeichnet.
//
// Zwei Ebenen pro Stück:
//   back  – Rückwand hinter begehbaren Räumen (nur drinnen). Blendet nach oben
//           aus, damit man die Parallax-Gewölbe dahinter im Nebel sieht.
//   front – Mauern, Plattformen, Dornen, Gitter, Tore.
//
// Die Mauern bekommen Tiefe über ihre "Tiefe": Abstand zur nächsten offenen
// Kachel. Randsteine sind detailliert und hell, das Innere versinkt im Dunkel.

import { TILE } from '../data/config.js';
import { T } from '../game/tiles.js';
import { makeCanvas } from './renderer.js';
import { clamp } from '../core/math.js';

const CHUNK = 12;              // Kacheln pro Stückkante (klein halten: bei 4x-Auflösung zählt jedes MB)
const CS = CHUNK * TILE;       // Stückkante in WE

// Kleines, schnelles Hash für stabile Zufallsvariation pro Kachel/Ziegel.
function hash(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Farbe in [r,g,b] zerlegen – versteht '#rrggbb' und 'rgb(...)'. */
function rgbOf(col) {
  if (col[0] === '#') {
    const n = parseInt(col.slice(1, 7), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = col.match(/rgba?\(([^)]+)\)/);
  return m ? m[1].split(',').slice(0, 3).map((v) => parseFloat(v)) : [255, 0, 255];
}

export function shade(col, f) {
  // Farbe um Faktor f aufhellen (>1) oder abdunkeln (<1).
  const [r, g, b] = rgbOf(col);
  return `rgb(${clamp(Math.round(r * f), 0, 255)},${clamp(Math.round(g * f), 0, 255)},${clamp(Math.round(b * f), 0, 255)})`;
}

export function mix(a, b, t) {
  const A = rgbOf(a), B = rgbOf(b);
  return `rgb(${Math.round(A[0] * (1 - t) + B[0] * t)},${Math.round(A[1] * (1 - t) + B[1] * t)},${Math.round(A[2] * (1 - t) + B[2] * t)})`;
}

// Bei krummen Pixelskalen entstehen zwischen zwei Kachelflächen feine
// Kantenglättungs-Fugen. Deckende Flächen deshalb minimal überlappen lassen.
const SEAM = 0.35;

// Stil pro Kulisse: Größe der Steine und Besonderheiten.
const STYLES = {
  crypt:      { bw: 20, bh: 10, moss: true,  wet: false, rivets: false, marble: false, backStyle: 'stone' },
  catacomb:   { bw: 20, bh: 10, moss: true,  wet: true,  rivets: false, marble: false, backStyle: 'skulls' },
  courtyard:  { bw: 40, bh: 20, moss: true,  wet: true,  rivets: false, marble: false, backStyle: 'none' },
  library:    { bw: 20, bh: 10, moss: false, wet: false, rivets: false, marble: false, backStyle: 'wood' },
  clock:      { bw: 40, bh: 20, moss: false, wet: false, rivets: true,  marble: false, backStyle: 'metal' },
  cathedral:  { bw: 40, bh: 20, moss: false, wet: false, rivets: false, marble: true,  backStyle: 'marble' },
};

export class TileRenderer {
  constructor(world, zone, scale) {
    this.world = world;
    this.zone = zone;
    this.pal = zone.tiles;
    this.style = STYLES[zone.bg] || STYLES.crypt;
    this.outdoor = !!zone.sky;
    this.scale = scale;
    this.cache = new Map();       // key -> { back, front, dirty, used }
    this.maxCache = 14;
    this._frame = 0;
    this._depth = this._computeDepth();

    world.onTileChange = (tx, ty) => this.invalidate(tx, ty);
  }

  setScale(s) {
    if (s === this.scale) return;
    this.scale = s;
    this.cache.clear();
  }

  /**
   * Tiefe jeder Kachel = Chebyshev-Abstand zur nächsten offenen Kachel (max 4).
   * Einmal pro Level berechnet (zwei Durchläufe, wie eine Distanztransformation).
   */
  _computeDepth() {
    const { w, h } = this.world;
    const d = new Uint8Array(w * h);
    const open = (x, y) => {
      const t = this.world.tile(x, y);
      return t === T.EMPTY || t === T.WATER || t === T.PLATFORM;
    };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[y * w + x] = open(x, y) ? 0 : 4;
    for (let pass = 0; pass < 4; pass++) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (d[i] === 0) continue;
          let m = 4;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx, ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
              m = Math.min(m, d[ny * w + nx] + 1);
            }
          }
          d[i] = Math.min(d[i], m);
        }
      }
    }
    return d;
  }

  depth(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.world.w || ty >= this.world.h) return 4;
    return this._depth[ty * this.world.w + tx];
  }

  invalidate(tx, ty) {
    // Tiefe in der Nachbarschaft neu berechnen (eingestürzte Mauer = neue Kanten).
    const { w, h } = this.world;
    for (let y = Math.max(0, ty - 5); y <= Math.min(h - 1, ty + 5); y++) {
      for (let x = Math.max(0, tx - 5); x <= Math.min(w - 1, tx + 5); x++) {
        const t = this.world.tile(x, y);
        const open = t === T.EMPTY || t === T.WATER || t === T.PLATFORM;
        let m = 4;
        if (open) m = 0;
        else {
          for (let r = 1; r <= 4 && m === 4; r++) {
            for (let dy = -r; dy <= r && m === 4; dy++) {
              for (let dx = -r; dx <= r; dx++) {
                const tt = this.world.tile(x + dx, y + dy);
                if (tt === T.EMPTY || tt === T.WATER || tt === T.PLATFORM) { m = r; break; }
              }
            }
          }
        }
        this._depth[y * w + x] = m;
      }
    }
    // Betroffene Stücke (auch Nachbarn, wegen der Tiefe) als veraltet markieren.
    const cx0 = Math.floor((tx - 5) / CHUNK), cx1 = Math.floor((tx + 5) / CHUNK);
    const cy0 = Math.floor((ty - 5) / CHUNK), cy1 = Math.floor((ty + 5) / CHUNK);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = this.cache.get(cx + ',' + cy);
        if (c) c.dirty = true;
      }
    }
  }

  _getChunk(cx, cy) {
    const key = cx + ',' + cy;
    let c = this.cache.get(key);
    if (!c) {
      const px = Math.ceil(CS * this.scale);
      c = { back: this.outdoor ? null : makeCanvas(px, px), front: makeCanvas(px, px), dirty: true, used: 0 };
      this.cache.set(key, c);
      this._evict();
    }
    if (c.dirty) {
      this._renderChunk(c, cx, cy);
      c.dirty = false;
    }
    c.used = this._frame;
    return c;
  }

  _evict() {
    if (this.cache.size <= this.maxCache) return;
    // Das am längsten ungenutzte Stück verwerfen.
    let oldKey = null, oldUsed = Infinity;
    for (const [k, v] of this.cache) {
      if (v.used < oldUsed) { oldUsed = v.used; oldKey = k; }
    }
    if (oldKey) this.cache.delete(oldKey);
  }

  /** Sichtbare Stücke der Rückwand zeichnen (Hintergrund-Durchgang). */
  drawBack(ctx, view) {
    if (this.outdoor) return;
    this._frame++;
    this._each(view, (c, x, y) => { if (c.back) ctx.drawImage(c.back, x, y, CS, CS); });
  }

  /** Sichtbare Stücke der Mauern zeichnen (Welt-Durchgang). */
  drawFront(ctx, view) {
    if (this.outdoor) this._frame++;
    this._each(view, (c, x, y) => ctx.drawImage(c.front, x, y, CS, CS));
  }

  _each(view, fn) {
    const cx0 = Math.floor(view.x / CS), cx1 = Math.floor((view.x + view.w) / CS);
    const cy0 = Math.floor(view.y / CS), cy1 = Math.floor((view.y + view.h) / CS);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        if (cx < 0 || cy < 0 || cx * CHUNK >= this.world.w || cy * CHUNK >= this.world.h) continue;
        fn(this._getChunk(cx, cy), cx * CS, cy * CS);
      }
    }
  }

  /** Stücke rund um einen Punkt vorab zeichnen (nach dem Laden, gegen Ruckler). */
  prewarm(x, y) {
    this._each({ x: x - 360, y: y - 220, w: 720, h: 440 }, () => {});
  }

  // === Zeichnen eines Stücks =================================================

  _renderChunk(c, cx, cy) {
    const s = this.scale;
    const tx0 = cx * CHUNK, ty0 = cy * CHUNK;

    if (c.back) {
      const b = c.back.getContext('2d');
      b.setTransform(1, 0, 0, 1, 0, 0);
      b.clearRect(0, 0, c.back.width, c.back.height);
      b.setTransform(s, 0, 0, s, -tx0 * TILE * s, -ty0 * TILE * s);
      for (let ty = ty0; ty < ty0 + CHUNK; ty++) {
        for (let tx = tx0; tx < tx0 + CHUNK; tx++) {
          const t = this.world.tile(tx, ty);
          if (t === T.EMPTY || t === T.WATER || t === T.PLATFORM || t === T.GRATE || t === T.GATE || t === T.SPIKES) {
            this._drawBackTile(b, tx, ty);
          }
        }
      }
    }

    const f = c.front.getContext('2d');
    f.setTransform(1, 0, 0, 1, 0, 0);
    f.clearRect(0, 0, c.front.width, c.front.height);
    f.setTransform(s, 0, 0, s, -tx0 * TILE * s, -ty0 * TILE * s);
    for (let ty = ty0; ty < ty0 + CHUNK; ty++) {
      for (let tx = tx0; tx < tx0 + CHUNK; tx++) {
        const t = this.world.tile(tx, ty);
        switch (t) {
          case T.SOLID: this._drawSolid(f, tx, ty, false); break;
          case T.BREAKABLE: this._drawSolid(f, tx, ty, true); break;
          case T.PLATFORM: this._drawPlatform(f, tx, ty); break;
          case T.SPIKES: this._drawSpikes(f, tx, ty); break;
          case T.GRATE: this._drawGrate(f, tx, ty); break;
          case T.GATE: this._drawGate(f, tx, ty); break;
          default: break;
        }
      }
    }
    // Zweiter Durchgang: Oberkanten (Moos, Goldkante) über die Nachbarkacheln hinaus.
    for (let ty = ty0; ty < ty0 + CHUNK; ty++) {
      for (let tx = tx0; tx < tx0 + CHUNK; tx++) {
        const t = this.world.tile(tx, ty);
        if ((t === T.SOLID || t === T.BREAKABLE) && this._open(tx, ty - 1)) this._drawTopTrim(f, tx, ty);
      }
    }
  }

  _open(tx, ty) {
    const t = this.world.tile(tx, ty);
    return t === T.EMPTY || t === T.WATER || t === T.PLATFORM || t === T.GRATE || t === T.GATE;
  }

  /** Abstand nach unten bis zum Boden (für die Ausblendung der Rückwand). */
  _floorDist(tx, ty) {
    for (let d = 0; d < 14; d++) {
      const t = this.world.tile(tx, ty + d);
      if (t === T.SOLID || t === T.BREAKABLE || t === T.SPIKES) return d;
    }
    return 14;
  }

  _drawBackTile(ctx, tx, ty) {
    const p = this.pal;
    const x = tx * TILE, y = ty * TILE;
    const fd = this._floorDist(tx, ty);
    // Unten dicht (Sockel), nach oben ausblendend – dahinter liegen die Gewölbe.
    // Nur ein niedriger Sockel an der Rückwand – darüber sieht man die gemalte
    // Kulisse (Gegenlicht-Stil: heller Hintergrund, dunkle Silhouetten davor).
    const a = fd <= 1 ? 0.9 : fd === 2 ? 0.3 : 0;
    if (a <= 0) return;
    ctx.globalAlpha = a;
    const st = this.style.backStyle;
    const baseDark = shade(p.dark, 0.85);

    if (st === 'wood') {
      // Holzvertäfelung in der Bibliothek
      ctx.fillStyle = shade(p.platform, 0.55);
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = shade(p.platform, 0.4);
      ctx.fillRect(x + 9, y, 2, TILE);
      if (fd === 3) { ctx.fillStyle = shade(p.platformTop, 0.7); ctx.fillRect(x, y + 2, TILE, 2); }
    } else if (st === 'metal') {
      ctx.fillStyle = shade(p.dark, 1.1);
      ctx.fillRect(x, y, TILE, TILE);
      ctx.strokeStyle = shade(p.dark, 0.6);
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
      if ((tx + ty) % 2 === 0) { ctx.fillStyle = shade(p.light, 0.6); ctx.fillRect(x + 3, y + 3, 1.5, 1.5); ctx.fillRect(x + TILE - 4.5, y + 3, 1.5, 1.5); }
    } else if (st === 'marble') {
      ctx.fillStyle = shade(p.base, 0.62);
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = shade(p.base, 0.52);
      if (ty % 2 === 0) ctx.fillRect(x, y, TILE, 1);
      if ((tx + (ty % 2) * 1) % 2 === 0) ctx.fillRect(x, y, 1, TILE);
      if (fd === 3) { ctx.fillStyle = shade(p.top, 0.7); ctx.fillRect(x, y + 1, TILE, 2); }
    } else {
      // Stein (Gruft, Katakomben): große, vertiefte Quader
      const row = Math.floor(ty);
      const off = row % 2 ? TILE / 2 : 0;
      ctx.fillStyle = baseDark;
      ctx.fillRect(x, y, TILE, TILE);
      const v = hash(Math.floor((x + off) / TILE), row, 3);
      ctx.fillStyle = shade(p.base, 0.5 + v * 0.12);
      ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
      ctx.fillStyle = shade(p.mortar, 1);
      ctx.fillRect(x, y, TILE, 1);
      ctx.fillRect(x + ((off + TILE) % TILE), y, 1, TILE);
      // Schädelnischen in den Katakomben
      if (st === 'skulls' && fd >= 4 && fd <= 6 && hash(tx, ty, 9) < 0.18) {
        ctx.fillStyle = '#07080c';
        ctx.beginPath(); ctx.ellipse(x + 10, y + 11, 7, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#b9b09a';
        ctx.beginPath(); ctx.arc(x + 10, y + 10, 3.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#07080c';
        ctx.fillRect(x + 8, y + 9, 1.4, 1.4); ctx.fillRect(x + 10.8, y + 9, 1.4, 1.4);
      }
    }
    // Sockelleiste knapp über dem Boden
    if (fd === 1) {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = shade(p.dark, 0.6);
      ctx.fillRect(x, y + TILE - 5, TILE, 5);
    }
    ctx.globalAlpha = 1;
  }

  _drawSolid(ctx, tx, ty, breakable) {
    const p = this.pal;
    const st = this.style;
    const x = tx * TILE, y = ty * TILE;
    const d = this.depth(tx, ty);

    // Tiefes Inneres: fast schwarz, nur ein Hauch Struktur.
    if (d >= 3 && !breakable) {
      ctx.fillStyle = shade(p.dark, 0.72);
      ctx.fillRect(x, y, TILE + SEAM, TILE + SEAM);
      if (hash(tx, ty, 1) < 0.2) {
        ctx.fillStyle = shade(p.dark, 0.7);
        ctx.fillRect(x + hash(tx, ty, 2) * 14, y + hash(tx, ty, 3) * 14, 5, 3);
      }
      return;
    }

    const depthDark = [1, 0.82, 0.66][Math.min(2, d)];
    const base = breakable ? mix(p.base, '#8a6a4a', 0.35) : p.base;

    // Grundfläche (Mörtelfarbe), darauf einzelne Steine.
    ctx.fillStyle = shade(p.mortar, 1.2);
    ctx.fillRect(x, y, TILE + SEAM, TILE + SEAM);

    const bw = st.bw, bh = st.bh;
    for (let yy = 0; yy < TILE; yy += Math.min(bh, TILE)) {
      const wy = y + yy;
      const row = Math.floor(wy / bh);
      const off = (row % 2) * (bw / 2);
      // Steine, die diese Kachel schneiden
      let bx = Math.floor((x + off) / bw) * bw - off;
      for (; bx < x + TILE; bx += bw) {
        const col = Math.floor((bx + off) / bw);
        const v = hash(col, row, breakable ? 7 : 1);
        const cx0 = Math.max(bx, x), cx1 = Math.min(bx + bw, x + TILE);
        const cy0 = wy, cy1 = Math.min(wy + bh, y + TILE);
        let col0;
        if (st.marble) col0 = shade(mix(base, p.light, 0.25 + v * 0.15), depthDark);
        else col0 = shade(mix(base, v > 0.5 ? p.light : p.dark, Math.abs(v - 0.5) * 0.5), depthDark);
        ctx.fillStyle = col0;
        // Fugen: 1 WE Abstand links und oben
        const gl = cx0 === bx ? 1 : 0;
        const gt = cy0 === wy && (wy % bh === 0) ? 1 : 0;
        ctx.fillRect(cx0 + gl, cy0 + gt, cx1 - cx0 - gl, cy1 - cy0 - gt);
        // Lichtkante oben links auf jedem Stein – gibt Volumen
        if (d === 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.07)';
          if (gt) ctx.fillRect(cx0 + gl, cy0 + gt, cx1 - cx0 - gl, 1);
        }
        if (st.marble && v > 0.7 && d === 0) {
          // Marmoradern
          ctx.strokeStyle = 'rgba(255,255,255,0.07)';
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(cx0 + 2, cy0 + v * (cy1 - cy0));
          ctx.quadraticCurveTo((cx0 + cx1) / 2, cy0 + (1 - v) * (cy1 - cy0), cx1 - 2, cy0 + v * 0.6 * (cy1 - cy0));
          ctx.stroke();
        }
        if (st.rivets && gt) {
          ctx.fillStyle = shade(p.light, depthDark * 0.9);
          ctx.fillRect(cx0 + 3, cy0 + 3, 1.6, 1.6);
          if (cx1 - cx0 > 10) ctx.fillRect(cx1 - 5, cy0 + 3, 1.6, 1.6);
        }
      }
    }

    // Risse im morschen Mauerwerk – deutlich sichtbar, damit man es erkennt.
    if (breakable) {
      ctx.strokeStyle = 'rgba(10,6,4,0.85)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      const h1 = hash(tx, ty, 11), h2 = hash(tx, ty, 12);
      ctx.moveTo(x + 2 + h1 * 6, y);
      ctx.lineTo(x + 8 + h2 * 5, y + 7);
      ctx.lineTo(x + 5 + h1 * 6, y + 12);
      ctx.lineTo(x + 12 + h2 * 6, y + TILE);
      ctx.moveTo(x + 8 + h2 * 5, y + 7);
      ctx.lineTo(x + TILE, y + 5 + h1 * 6);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,190,140,0.18)';
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }

    // Kanten zu offenen Nachbarn: Licht oben/links, Schatten unten/rechts.
    const openL = this._open(tx - 1, ty), openR = this._open(tx + 1, ty);
    const openD = this._open(tx, ty + 1);
    if (openL) { ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(x, y, 2, TILE); }
    if (openR) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + TILE - 2, y, 2, TILE); }
    if (openD) {
      // Unterseite: dunkle Kante plus gelegentliche Tropfsteine
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(x, y + TILE - 3, TILE, 3);
      if (hash(tx, ty, 5) < 0.25) {
        ctx.fillStyle = shade(p.dark, 0.9);
        const sx = x + 4 + hash(tx, ty, 6) * 10;
        ctx.beginPath();
        ctx.moveTo(sx - 2.5, y + TILE);
        ctx.lineTo(sx + 2.5, y + TILE);
        ctx.lineTo(sx, y + TILE + 4 + hash(tx, ty, 8) * 5);
        ctx.fill();
      }
    }
    // Umgebungsverdeckung in Richtung Inneres
    if (d >= 1) {
      ctx.fillStyle = `rgba(0,0,0,${0.08 * d})`;
      ctx.fillRect(x, y, TILE, TILE);
    }
  }

  /** Moos, nasser Glanz oder Blattgold auf begehbaren Oberkanten. */
  _drawTopTrim(ctx, tx, ty) {
    const p = this.pal;
    const st = this.style;
    const x = tx * TILE, y = ty * TILE;
    // Heller Grat – hier landet das Licht zuerst.
    ctx.fillStyle = p.topLight;
    ctx.fillRect(x, y, TILE, 1.5);
    ctx.fillStyle = p.top;
    ctx.fillRect(x, y + 1.5, TILE, 2.5);

    if (st.moss) {
      // Moosbüschel und herabhängende Fäden
      for (let i = 0; i < 4; i++) {
        const hx = x + hash(tx, ty, 20 + i) * TILE;
        const hh = 1 + hash(tx, ty, 30 + i) * 3;
        ctx.fillStyle = i % 2 ? p.topLight : p.top;
        ctx.beginPath();
        ctx.ellipse(hx, y + 0.5, 2.2, hh * 0.7, 0, Math.PI, 0);
        ctx.fill();
        if (hash(tx, ty, 40 + i) < 0.35) {
          ctx.fillStyle = p.top;
          ctx.fillRect(hx, y + 3, 0.8, 2 + hash(tx, ty, 50 + i) * 5);
        }
      }
    }
    if (st.wet) {
      // Nasser Glanz: kurze helle Striche
      ctx.fillStyle = 'rgba(200,220,255,0.25)';
      ctx.fillRect(x + hash(tx, ty, 60) * 12, y + 0.5, 5, 0.8);
    }
    if (st.marble) {
      // Goldene Zierleiste mit Punktmuster
      ctx.fillStyle = shade(p.top, 0.7);
      ctx.fillRect(x, y + 4, TILE, 1);
      ctx.fillStyle = p.topLight;
      for (let i = 2; i < TILE; i += 5) ctx.fillRect(x + i, y + 2, 1, 1);
    }
    if (st.rivets) {
      ctx.fillStyle = shade(p.topLight, 1.1);
      ctx.fillRect(x + 4, y + 2, 1.5, 1.5);
      ctx.fillRect(x + 14, y + 2, 1.5, 1.5);
    }
  }

  _drawPlatform(ctx, tx, ty) {
    const p = this.pal;
    const x = tx * TILE, y = ty * TILE;
    const left = this.world.tile(tx - 1, ty) !== T.PLATFORM;
    const right = this.world.tile(tx + 1, ty) !== T.PLATFORM;
    // Brett
    ctx.fillStyle = shade(p.platform, 0.6);
    ctx.fillRect(x, y + 2, TILE, 6);
    ctx.fillStyle = p.platform;
    ctx.fillRect(x, y, TILE, 5);
    ctx.fillStyle = p.platformTop;
    ctx.fillRect(x, y, TILE, 1.5);
    // Maserung / Fugen
    ctx.fillStyle = shade(p.platform, 0.75);
    ctx.fillRect(x + (hash(tx, ty, 70) * 14), y + 2.5, 5, 0.8);
    if (tx % 2 === 0) { ctx.fillStyle = shade(p.platform, 0.45); ctx.fillRect(x, y, 1, 7); }
    // Konsolen unter den Enden
    if (left || right) {
      const bx = left ? x + 2 : x + TILE - 6;
      ctx.fillStyle = shade(p.platform, 0.5);
      ctx.beginPath();
      ctx.moveTo(bx, y + 7);
      ctx.lineTo(bx + 4, y + 7);
      ctx.lineTo(bx + (left ? 0 : 4), y + 14);
      ctx.closePath();
      ctx.fill();
    }
    // Weicher Schatten darunter
    const g = ctx.createLinearGradient(0, y + 8, 0, y + 16);
    g.addColorStop(0, 'rgba(0,0,0,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y + 8, TILE, 8);
  }

  _drawSpikes(ctx, tx, ty) {
    const x = tx * TILE, y = ty * TILE;
    // Sockel
    ctx.fillStyle = '#1b1a22';
    ctx.fillRect(x, y + TILE - 5, TILE, 5);
    // Silberdornen: vier Spitzen mit Glanzlinie
    for (let i = 0; i < 4; i++) {
      const sx = x + i * 5;
      const h = 11 + hash(tx, i, 80) * 5;
      const g = ctx.createLinearGradient(sx, 0, sx + 5, 0);
      g.addColorStop(0, '#6d7384');
      g.addColorStop(0.5, '#e8ecf6');
      g.addColorStop(1, '#4a4f5e');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(sx, y + TILE - 5);
      ctx.lineTo(sx + 2.5, y + TILE - 5 - h);
      ctx.lineTo(sx + 5, y + TILE - 5);
      ctx.closePath();
      ctx.fill();
    }
  }

  _drawGrate(ctx, tx, ty) {
    const x = tx * TILE, y = ty * TILE;
    ctx.fillStyle = '#15141a';
    // Senkrechte Stäbe
    for (let i = 0; i < 3; i++) {
      const bx = x + 3 + i * 6;
      ctx.fillStyle = '#1a1920';
      ctx.fillRect(bx, y, 2.6, TILE);
      ctx.fillStyle = 'rgba(180,190,220,0.35)';
      ctx.fillRect(bx, y, 0.7, TILE);
    }
    // Querstrebe
    if (ty % 2 === 0) {
      ctx.fillStyle = '#23222b';
      ctx.fillRect(x, y + 8, TILE, 3);
      ctx.fillStyle = 'rgba(180,190,220,0.25)';
      ctx.fillRect(x, y + 8, TILE, 0.7);
    }
  }

  _drawGate(ctx, tx, ty) {
    const x = tx * TILE, y = ty * TILE;
    // Fallgitter: dicke Stäbe, unten Spitzen
    ctx.fillStyle = '#16141a';
    ctx.fillRect(x + 2, y, TILE - 4, TILE);
    for (let i = 0; i < 3; i++) {
      const bx = x + 3 + i * 5.5;
      const g = ctx.createLinearGradient(bx, 0, bx + 3.5, 0);
      g.addColorStop(0, '#2c2a34');
      g.addColorStop(0.4, '#8a8698');
      g.addColorStop(1, '#1e1c24');
      ctx.fillStyle = g;
      ctx.fillRect(bx, y, 3.5, TILE);
    }
    ctx.fillStyle = '#3a3642';
    ctx.fillRect(x, y + 6, TILE, 3);
    if (this.world.tile(tx, ty + 1) !== T.GATE) {
      ctx.fillStyle = '#9a96a8';
      for (let i = 0; i < 3; i++) {
        const bx = x + 3 + i * 5.5;
        ctx.beginPath();
        ctx.moveTo(bx, y + TILE);
        ctx.lineTo(bx + 1.75, y + TILE + 5);
        ctx.lineTo(bx + 3.5, y + TILE);
        ctx.fill();
      }
    }
  }
}

export { CHUNK, CS };
