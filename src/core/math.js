// Mathe-Grundlagen, deterministischer Zufall, Kollisionshelfer.

export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

/** Frame-ratenunabhängige Annäherung: nähert `a` an `b` mit Halbwertszeit `hl`. */
export const damp = (a, b, hl, dt) => lerp(a, b, 1 - Math.pow(2, -dt / hl));

/** Bewegt `a` um höchstens `maxDelta` Richtung `b`. */
export function approach(a, b, maxDelta) {
  if (a < b) return Math.min(a + maxDelta, b);
  if (a > b) return Math.max(a - maxDelta, b);
  return b;
}

// --- Easing -----------------------------------------------------------------
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t) => t * t * t;
export const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const easeOutElastic = (t) => {
  if (t === 0 || t === 1) return t;
  const c4 = TAU / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};

/**
 * Deterministischer PRNG (mulberry32). Gleicher Seed => gleiche Welt.
 * Wichtig, damit Level reproduzierbar sind und Speicherstände passen.
 */
export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    /** Gleitkommazahl in [lo, hi). */
    range: (lo, hi) => lo + next() * (hi - lo),
    /** Ganzzahl in [lo, hi] (inklusive). */
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    /** Wahr mit Wahrscheinlichkeit p. */
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length) % arr.length],
    /** Gewichtete Auswahl: entries = [[wert, gewicht], ...]. */
    weighted(entries) {
      let total = 0;
      for (const e of entries) total += e[1];
      let r = next() * total;
      for (const e of entries) {
        r -= e[1];
        if (r <= 0) return e[0];
      }
      return entries[entries.length - 1][0];
    },
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
  };
}

/** Wert-Rauschen in 1D, glatt interpoliert. Für Flackern, Wind, Kamerazittern. */
export function noise1(x, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const h = (n) => {
    let t = (n + seed * 374761393) >>> 0;
    t = Math.imul(t ^ (t >>> 13), 1274126177);
    return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
  };
  const u = f * f * (3 - 2 * f);
  return lerp(h(i), h(i + 1), u);
}

/** Mehrere Oktaven Rauschen, Ergebnis in [0,1]. */
export function fbm1(x, octaves = 3, seed = 0) {
  let sum = 0, amp = 0.5, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += noise1(x, seed + o * 17) * amp;
    norm += amp;
    x *= 2;
    amp *= 0.5;
  }
  return sum / norm;
}

// --- Rechtecke --------------------------------------------------------------
export const rect = (x, y, w, h) => ({ x, y, w, h });

export const rectsOverlap = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export const pointInRect = (px, py, r) =>
  px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;

/** Kleinste Distanz zwischen zwei Rechtecken (0 bei Überlappung). */
export function rectDistance(a, b) {
  const dx = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)));
  const dy = Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)));
  return Math.hypot(dx, dy);
}

/** Strecke gegen Achsen-Rechteck (Slab-Test). Gibt t in [0,1] oder null. */
export function raycastRect(x0, y0, x1, y1, r) {
  const dx = x1 - x0, dy = y1 - y0;
  let tmin = 0, tmax = 1;
  for (const [o, d, lo, hi] of [
    [x0, dx, r.x, r.x + r.w],
    [y0, dy, r.y, r.y + r.h],
  ]) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
    } else {
      let t1 = (lo - o) / d, t2 = (hi - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);

/** Kürzeste Winkeldifferenz von a nach b, in (-PI, PI]. */
export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
