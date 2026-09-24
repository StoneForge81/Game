// Figuren-Rig: ein Skelett mit Gelenken, das alle menschlichen Figuren teilen.
// Animation = Gelenkwinkel über die Zeit. Aussehen = Kostüm.
//
// Umhang und Haare sind Verlet-Ketten (echte kleine Stoffsimulation):
// sie hängen, wehen beim Laufen und flattern beim Sprung – ganz ohne
// handgemalte Animationsbilder.

import { TAU, clamp, lerp } from '../core/math.js';
import { CHAR_SCALE } from '../data/config.js';

// === Stoffsimulation ========================================================

export class Cloth {
  /**
   * @param n        Anzahl Kettenglieder
   * @param seg      Länge eines Glieds (WE)
   * @param gravity  Schwerkraft auf den Stoff
   */
  constructor(n, seg, gravity = 520, drag = 0.08) {
    this.n = n;
    this.seg = seg;
    this.gravity = gravity;
    this.drag = drag;
    this.pts = [];
    for (let i = 0; i < n; i++) this.pts.push({ x: 0, y: i * seg, px: 0, py: i * seg });
    this.inited = false;
    this.wind = 0;
  }

  reset(x, y) {
    for (let i = 0; i < this.n; i++) {
      const p = this.pts[i];
      p.x = p.px = x;
      p.y = p.py = y + i * this.seg;
    }
    this.inited = true;
  }

  /** anchor = Befestigungspunkt, floorY = Boden (Stoff schleift nicht durch). */
  update(dt, ax, ay, floorY = Infinity, extraForceX = 0) {
    if (!this.inited) this.reset(ax, ay);
    const p0 = this.pts[0];
    p0.x = p0.px = ax;
    p0.y = p0.py = ay;
    const dt2 = dt * dt;
    for (let i = 1; i < this.n; i++) {
      const p = this.pts[i];
      const vx = (p.x - p.px) * (1 - this.drag);
      const vy = (p.y - p.py) * (1 - this.drag);
      p.px = p.x; p.py = p.y;
      // Etwas Wind/Flattern, zum Ende hin stärker.
      const k = i / this.n;
      p.x += vx + (this.wind + extraForceX) * k * dt2;
      p.y += vy + this.gravity * dt2;
    }
    // Längen einhalten – mehrere Durchläufe für Steifigkeit.
    for (let it = 0; it < 4; it++) {
      for (let i = 1; i < this.n; i++) {
        const a = this.pts[i - 1], b = this.pts[i];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.0001;
        const diff = (d - this.seg) / d;
        if (i === 1) {
          b.x -= dx * diff; b.y -= dy * diff;
        } else {
          a.x += dx * diff * 0.5; a.y += dy * diff * 0.5;
          b.x -= dx * diff * 0.5; b.y -= dy * diff * 0.5;
        }
      }
      for (let i = 1; i < this.n; i++) {
        const p = this.pts[i];
        if (p.y > floorY) p.y = floorY;
      }
    }
  }
}

// === Posen ==================================================================

/**
 * Pose aus Animationszustand berechnen. Alle Winkel in Bogenmaß.
 * Vorzeichen: positiv = nach vorn (in Blickrichtung).
 */
export function makePose(anim, t, opts = {}) {
  const p = {
    lean: 0, bob: 0, crouch: 0,
    hipF: 0, kneeF: 0, hipB: 0, kneeB: 0,
    shF: 0.1, elF: 0.3, shB: -0.1, elB: 0.3,
    head: 0, weapon: 0, weaponAngle: 0,
  };
  const speed = opts.speed ?? 0;
  switch (anim) {
    case 'idle': {
      // Ruhiges Atmen, der Fürst wartet.
      const b = Math.sin(t * 2.2);
      p.bob = b * 0.5;
      p.shF = 0.12 + b * 0.03; p.elF = 0.5;
      p.shB = -0.08 - b * 0.03; p.elB = 0.35;
      p.hipF = 0.06; p.hipB = -0.06;
      p.head = -0.03 + b * 0.02;
      break;
    }
    case 'walk':
    case 'run': {
      const run = anim === 'run';
      const ph = opts.phase ?? t * (run ? 11 : 6);
      const amp = run ? 0.85 : 0.45;
      const s = Math.sin(ph), c = Math.cos(ph);
      p.hipF = s * amp;
      p.hipB = -s * amp;
      // Knie beugt sich, wenn das Bein nach hinten schwingt.
      p.kneeF = Math.max(0, -c) * (run ? 1.3 : 0.6) + 0.1;
      p.kneeB = Math.max(0, c) * (run ? 1.3 : 0.6) + 0.1;
      p.shF = -s * (run ? 0.9 : 0.4);
      p.shB = s * (run ? 0.9 : 0.4);
      p.elF = run ? 1.2 : 0.4; p.elB = run ? 1.2 : 0.4;
      p.lean = run ? 0.2 + Math.min(0.15, speed / 1500) : 0.04;
      p.bob = -Math.abs(Math.sin(ph)) * (run ? 2 : 0.8);
      p.head = run ? -0.12 : 0;
      break;
    }
    case 'jump': {
      p.hipF = 0.9; p.kneeF = 1.5; p.hipB = -0.2; p.kneeB = 0.9;
      p.shF = -2.2; p.elF = 0.4; p.shB = -1.6; p.elB = 0.3;
      p.lean = 0.1; p.head = -0.1;
      break;
    }
    case 'fall': {
      p.hipF = 0.35; p.kneeF = 0.6; p.hipB = -0.25; p.kneeB = 0.35;
      p.shF = -1.3; p.elF = 0.4; p.shB = -1.9; p.elB = 0.2;
      p.lean = -0.05; p.head = 0.05;
      break;
    }
    case 'crouch':
    case 'land': {
      p.crouch = anim === 'land' ? 0.5 : 0.7;
      p.hipF = 1.1; p.kneeF = 2.0; p.hipB = 0.5; p.kneeB = 1.9;
      p.shF = 0.5; p.elF = 0.8; p.shB = 0.3; p.elB = 0.6;
      p.lean = 0.35;
      break;
    }
    case 'dash': {
      p.lean = 0.55;
      p.hipF = 0.9; p.kneeF = 1.3; p.hipB = -0.9; p.kneeB = 0.4;
      p.shF = -1.6; p.elF = 0.1; p.shB = -2.6; p.elB = 0.0;
      p.head = -0.2;
      break;
    }
    case 'backdash': {
      p.lean = -0.3;
      p.hipF = 0.5; p.kneeF = 0.9; p.hipB = -0.4; p.kneeB = 0.4;
      p.shF = 0.9; p.elF = 0.5; p.shB = 1.2; p.elB = 0.5;
      break;
    }
    case 'attack1':
    case 'attack2':
    case 'attack3':
    case 'airAttack': {
      // k: 0 = Ausholen, 1 = Durchziehen
      const k = clamp(opts.progress ?? 0, 0, 1);
      const windup = k < 0.25 ? k / 0.25 : 1;
      const swing = k < 0.25 ? 0 : clamp((k - 0.25) / 0.35, 0, 1);
      if (anim === 'attack1') {
        // Waagerechter Schnitt
        p.shF = lerp(lerp(0.3, -2.4, windup), 1.5, swing);
        p.elF = lerp(0.6, 0.1, swing);
        p.lean = lerp(-0.1, 0.35, swing);
        p.hipF = 0.5; p.kneeF = 0.5; p.hipB = -0.5; p.kneeB = 0.3;
        p.weaponAngle = lerp(-2.2, 1.6, swing);
      } else if (anim === 'attack2') {
        // Aufwärtsschnitt
        p.shF = lerp(lerp(0.3, 1.2, windup), -2.6, swing);
        p.elF = 0.2;
        p.lean = lerp(0.3, -0.15, swing);
        p.hipF = 0.4; p.kneeF = 0.7; p.hipB = -0.4; p.kneeB = 0.3;
        p.crouch = lerp(0.25, 0, swing);
        p.weaponAngle = lerp(1.4, -2.4, swing);
      } else if (anim === 'attack3') {
        // Schwerer Stoß nach vorn
        p.shF = lerp(lerp(0.2, -0.3, windup), -1.55, swing);
        p.elF = lerp(1.6, 0, swing);
        p.lean = lerp(-0.2, 0.55, swing);
        p.hipF = lerp(0.2, 1.0, swing); p.kneeF = lerp(0.3, 0.7, swing);
        p.hipB = lerp(-0.2, -0.8, swing); p.kneeB = 0.2;
        p.weaponAngle = -1.57;
      } else {
        // Luftangriff: Rundumschlag nach unten
        p.shF = lerp(lerp(0, -2.8, windup), 1.2, swing);
        p.elF = 0.2;
        p.hipF = 0.8; p.kneeF = 1.4; p.hipB = -0.1; p.kneeB = 0.9;
        p.weaponAngle = lerp(-2.6, 1.8, swing);
      }
      p.shB = -0.6; p.elB = 0.9;
      p.weapon = k < 0.85 ? 1 : (1 - k) / 0.15;
      break;
    }
    case 'cast': {
      // Blutlanze werfen: Arm schnellt nach vorn
      const k = clamp(opts.progress ?? 0, 0, 1);
      p.shF = lerp(-2.6, -1.4, clamp(k * 2, 0, 1));
      p.elF = lerp(1.2, 0, clamp(k * 2, 0, 1));
      p.shB = 0.6; p.elB = 1.0;
      p.lean = lerp(-0.15, 0.3, k);
      p.hipF = 0.5; p.kneeF = 0.4; p.hipB = -0.4; p.kneeB = 0.2;
      break;
    }
    case 'claw': {
      // Wolfsklaue: weit ausholender Hieb mit beiden Armen
      const k = clamp(opts.progress ?? 0, 0, 1);
      const swing = clamp((k - 0.2) / 0.4, 0, 1);
      p.shF = lerp(-2.8, 1.2, swing); p.elF = 0.3;
      p.shB = lerp(-2.4, 0.9, swing); p.elB = 0.4;
      p.lean = lerp(-0.25, 0.6, swing);
      p.hipF = lerp(0.2, 1.1, swing); p.kneeF = 0.9; p.hipB = -0.7; p.kneeB = 0.3;
      p.crouch = swing * 0.3;
      break;
    }
    case 'drain': {
      // Beugt sich über das Opfer, beide Hände packen zu.
      const b = Math.sin(t * 5) * 0.04;
      p.lean = 0.75 + b;
      p.shF = -1.1; p.elF = 0.9; p.shB = -0.8; p.elB = 1.0;
      p.hipF = 0.5; p.kneeF = 0.7; p.hipB = -0.3; p.kneeB = 0.6;
      p.crouch = 0.25;
      p.head = 0.45;
      break;
    }
    case 'hurt': {
      p.lean = -0.45;
      p.shF = 0.9; p.elF = 1.0; p.shB = 1.4; p.elB = 0.8;
      p.hipF = 0.3; p.kneeF = 0.6; p.hipB = -0.2; p.kneeB = 0.3;
      p.head = -0.35;
      break;
    }
    case 'dead': {
      p.lean = -1.35; p.crouch = 0.9;
      p.shF = 1.8; p.elF = 0.4; p.shB = 2.2; p.elB = 0.3;
      p.hipF = -0.4; p.kneeF = 0.3; p.hipB = -0.6; p.kneeB = 0.2;
      p.head = -0.5;
      break;
    }
    case 'kneel': {
      // Gefangene knien, Gegner vor dem Aussaugen.
      p.crouch = 0.85;
      p.hipF = 1.4; p.kneeF = 2.6; p.hipB = 0.1; p.kneeB = 2.4;
      p.shF = 0.6; p.elF = 1.2; p.shB = 0.4; p.elB = 1.3;
      p.lean = 0.25; p.head = 0.3 + Math.sin(t * 3) * 0.04;
      break;
    }
    case 'aim': {
      p.shF = -1.5; p.elF = 0; p.shB = -1.3; p.elB = 0.4;
      p.hipF = 0.3; p.kneeF = 0.2; p.hipB = -0.3; p.kneeB = 0.1;
      p.lean = 0.05;
      break;
    }
    case 'block': {
      p.shF = -1.0; p.elF = 1.4; p.shB = 0.2; p.elB = 0.5;
      p.hipF = 0.4; p.kneeF = 0.5; p.hipB = -0.5; p.kneeB = 0.3;
      p.crouch = 0.2; p.lean = 0.1;
      break;
    }
    case 'pray': {
      const b = Math.sin(t * 2.5) * 0.05;
      p.shF = -0.9 + b; p.elF = 1.9; p.shB = -0.8 + b; p.elB = 1.9;
      p.head = 0.25;
      break;
    }
    case 'swingOverhead': {
      const k = clamp(opts.progress ?? 0, 0, 1);
      const swing = clamp((k - 0.35) / 0.3, 0, 1);
      p.shF = lerp(-2.9, 0.9, swing); p.elF = 0.3;
      p.shB = lerp(-2.7, 0.7, swing); p.elB = 0.3;
      p.lean = lerp(-0.2, 0.45, swing);
      p.hipF = 0.5; p.kneeF = 0.5; p.hipB = -0.5; p.kneeB = 0.3;
      p.weaponAngle = lerp(-2.8, 1.2, swing);
      break;
    }
    default: break;
  }
  return p;
}

/** Zwei Posen mischen (für weiche Übergänge). */
export function blendPose(a, b, t) {
  const out = {};
  for (const k in a) out[k] = lerp(a[k], b[k] ?? a[k], t);
  return out;
}

// === Skelett ================================================================

/**
 * Gelenkpositionen im lokalen Raum (Füße bei y=0, Blickrichtung +x).
 * `sz` skaliert die ganze Figur (Bosse sind größer).
 */
export function solveRig(p, sz = CHAR_SCALE) {
  // Heroische Proportionen: Kopf ≈ 1/6 der Körperhöhe, lange Beine.
  const thigh = 7.8 * sz, shin = 7.9 * sz, torso = 11.4 * sz, upper = 5.7 * sz, fore = 5.5 * sz;
  const legLen = thigh + shin;
  // Beugung senkt die Hüfte ab.
  const hipY = -legLen * (1 - p.crouch * 0.42) + p.bob;
  const hip = { x: 0, y: hipY };
  const leg = (hipA, kneeA) => {
    const knee = { x: hip.x + Math.sin(hipA) * thigh, y: hip.y + Math.cos(hipA) * thigh };
    const a2 = hipA - kneeA;
    const foot = { x: knee.x + Math.sin(a2) * shin, y: knee.y + Math.cos(a2) * shin };
    return { knee, foot };
  };
  const legF = leg(p.hipF, p.kneeF);
  const legB = leg(p.hipB, p.kneeB);
  // Füße nicht unter den Boden (einfaches IK: Hüfte anheben).
  const lowest = Math.max(legF.foot.y, legB.foot.y);
  const lift = p.crouch > 0.05 ? lowest : 0;
  for (const pt of [hip, legF.knee, legF.foot, legB.knee, legB.foot]) pt.y -= lift;

  const shoulder = { x: hip.x + Math.sin(p.lean) * torso, y: hip.y - Math.cos(p.lean) * torso };
  const neck = { x: shoulder.x + Math.sin(p.lean) * 1.6 * sz, y: shoulder.y - Math.cos(p.lean) * 1.6 * sz };
  const hr = 3.0 * sz;
  const headA = p.lean + p.head;
  const head = { x: neck.x + Math.sin(headA) * hr, y: neck.y - Math.cos(headA) * hr };
  const arm = (shA, elA, offs) => {
    const sh = { x: shoulder.x + offs, y: shoulder.y + 0.6 * sz };
    const elbow = { x: sh.x + Math.sin(shA) * upper, y: sh.y + Math.cos(shA) * upper };
    const a2 = shA + elA;
    const hand = { x: elbow.x + Math.sin(a2) * fore, y: elbow.y + Math.cos(a2) * fore };
    return { sh, elbow, hand, angle: a2 };
  };
  const armF = arm(p.shF, p.elF, 0.8 * sz);
  const armB = arm(p.shB, p.elB, -0.8 * sz);
  return { hip, legF, legB, shoulder, neck, head, hr, armF, armB, sz, headA };
}

// === Zeichenhilfen ==========================================================
//
// Der Look: Tuschekontur um die ganze Figur, Cel-Shading (harte Licht- und
// Schattenkante statt Verlauf), feine Innenlinien. Jede Figur wird erst in
// eine Zwischenleinwand gezeichnet, dort bekommt sie ihren Umriss, dann
// kommt sie in die Welt.

const INK = '#0b0710';
const INNER = 'rgba(11,7,16,0.72)';

/** Glied als sich verjüngende Kapsel (Path2D, wiederverwendbar). */
function limbPath(a, b, w0, w1) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1e-4;
  const nx = -dy / len, ny = dx / len;
  const ang = Math.atan2(ny, nx);
  const p = new Path2D();
  p.moveTo(a.x + nx * w0 / 2, a.y + ny * w0 / 2);
  p.lineTo(b.x + nx * w1 / 2, b.y + ny * w1 / 2);
  // Endkappen: gegen den Uhrzeigersinn, damit sie nach AUSSEN gewölbt sind.
  p.arc(b.x, b.y, w1 / 2, ang, ang + Math.PI, true);
  p.lineTo(a.x - nx * w0 / 2, a.y - ny * w0 / 2);
  p.arc(a.x, a.y, w0 / 2, ang + Math.PI, ang, true);
  p.closePath();
  return p;
}

/** Glied (alte API, für Effekte). */
export function limb(ctx, a, b, w0, w1, color) {
  ctx.fillStyle = color;
  ctx.fill(limbPath(a, b, w0, w1));
}

/**
 * Cel-Shading einer Form: erst komplett im Schattenton, dann – auf die Form
 * beschnitten – die zur Lichtquelle verschobene Kopie im Grundton.
 * Das ergibt eine harte Schattenkante auf der lichtabgewandten Seite.
 * Licht kommt von vorn oben (in Blickrichtung).
 */
export function cel(ctx, path, base, shade, sx = 1.1, sy = -0.8, light = null, stroke = true) {
  // 1) alles im Schattenton
  ctx.fillStyle = shade;
  ctx.fill(path);
  ctx.save();
  ctx.clip(path);
  // 2) Kopie zur Lichtquelle verschoben: bleibt nur hinten ein Schattenstreifen
  const lit = new Path2D();
  lit.addPath(path, new DOMMatrix([1, 0, 0, 1, sx, sy]));
  if (light) {
    ctx.fillStyle = light;
    ctx.fill(lit);
    // 3) Grundton, leicht vom Licht weg: vorn bleibt ein schmaler Glanzstreifen
    ctx.clip(lit);
    const len = Math.hypot(sx, sy) || 1;
    const h = 0.55;
    ctx.translate(-sx / len * h, -sy / len * h);
    ctx.fillStyle = base;
    ctx.fill(path);
  } else {
    ctx.fillStyle = base;
    ctx.fill(lit);
  }
  ctx.restore();
  if (stroke) {
    ctx.strokeStyle = INNER;
    ctx.lineWidth = 0.34;
    ctx.stroke(path);
  }
}

/** Glied mit Cel-Shading. */
export function celLimb(ctx, a, b, w0, w1, base, shade, light = null) {
  const p = limbPath(a, b, w0, w1);
  cel(ctx, p, base, shade, w0 * 0.22, -w0 * 0.12, light);
  return p;
}

/** Polygon/Kurvenzug aus Punkten als Path2D (glatt über Mittelpunkte). */
export function smoothPath(pts, closed = true) {
  const p = new Path2D();
  if (pts.length < 3) return p;
  const n = pts.length;
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  let start = closed ? mid(pts[n - 1], pts[0]) : pts[0];
  p.moveTo(start.x, start.y);
  for (let i = 0; i < n; i++) {
    const cur = pts[i], nxt = pts[(i + 1) % n];
    if (!closed && i === n - 1) { p.lineTo(cur.x, cur.y); break; }
    const m = mid(cur, nxt);
    if (cur.sharp) { p.lineTo(cur.x, cur.y); p.lineTo(m.x, m.y); }
    else p.quadraticCurveTo(cur.x, cur.y, m.x, m.y);
  }
  if (closed) p.closePath();
  return p;
}

export const P = (x, y, sharp = false) => ({ x, y, sharp });

// Achsen des Rumpfs: u = hoch, r = nach vorn (aus der Neigung).
function torsoAxes(lean) {
  return { ux: Math.sin(lean), uy: -Math.cos(lean), rx: Math.cos(lean), ry: Math.sin(lean) };
}
function along(o, ax, r, u) {
  return { x: o.x + ax.rx * r + ax.ux * u, y: o.y + ax.ry * r + ax.uy * u };
}

// === Kostüme ================================================================
// Jede Farbe hat Grundton, Schatten und Glanz (…L).

export const COSTUMES = {
  ingomar: {
    skin: '#f3e6ea', skinShade: '#c3a9b8', skinL: '#ffffff',
    coat: '#33254a', coatShade: '#1a1128', coatL: '#6b58a0',
    trim: '#e2bd62', trimShade: '#8f6a26',
    lining: '#b01330', liningShade: '#6c0719',
    pants: '#231a30', pantsShade: '#140e1c',
    boots: '#1c1424', bootsShade: '#0e0a14', bootsL: '#5a4a70',
    hair: '#f4f1fb', hairShade: '#aea8c8', hairL: '#ffffff',
    lace: '#f6f2f4', laceShade: '#bdb4c4',
    eyes: '#ff1f35', body: 'lord', headwear: 'none', hairStyle: 'lord',
    cape: true, collar: true, ears: true, claws: true, width: 1,
  },
  novice: {
    skin: '#e2c0a4', skinShade: '#a8876f',
    coat: '#d3cabb', coatShade: '#958b7b', coatL: '#f4efe6', trim: '#7a5c40', trimShade: '#4a3624',
    pants: '#5a5046', pantsShade: '#3a322a', boots: '#3a2c22', bootsShade: '#221810',
    eyes: null, body: 'robe', headwear: 'hood', width: 1, weapon: 'stake',
  },
  acolyte: {
    skin: '#ecc8ac', skinShade: '#ae9078',
    coat: '#f4efe4', coatShade: '#b8ae9c', coatL: '#ffffff', trim: '#e4b848', trimShade: '#9a7422',
    pants: '#8a8274', pantsShade: '#5a5448', boots: '#4a3a2c', bootsShade: '#2a2018',
    eyes: null, body: 'robe', headwear: 'tonsure', width: 1.1, weapon: 'censer',
  },
  crossbow: {
    skin: '#d6ae90', skinShade: '#977460',
    coat: '#5a3c2a', coatShade: '#33201a', coatL: '#8a6448', trim: '#c09a5a', trimShade: '#7a5a30',
    pants: '#3a2c26', pantsShade: '#221814', boots: '#261a14', bootsShade: '#140c08',
    eyes: null, body: 'longcoat', headwear: 'hat', width: 1, weapon: 'crossbow',
  },
  knight: {
    skin: '#d6b098', skinShade: '#987662',
    coat: '#c4cadb', coatShade: '#737a90', coatL: '#ffffff', trim: '#f0cc6a', trimShade: '#9a7a2a',
    pants: '#5e6478', pantsShade: '#3c4052', boots: '#8a90a4', bootsShade: '#50566a',
    eyes: null, body: 'armor', headwear: 'helmet', width: 1.25, weapon: 'sword', shield: true,
  },
  inquisitor: {
    skin: '#e0bca4', skinShade: '#a8876f',
    coat: '#8e1424', coatShade: '#4a0810', coatL: '#d0384a', trim: '#f0c050', trimShade: '#9a7020',
    pants: '#2a0a0e', pantsShade: '#180406', boots: '#1a0608', bootsShade: '#0c0204',
    eyes: '#fff0b0', body: 'robe', headwear: 'mask', width: 1.1, weapon: 'staff',
  },
  skeleton: {
    skin: '#e8dfc6', skinShade: '#9e9480', skinL: '#ffffff',
    coat: '#d8ccb0', coatShade: '#958c78', trim: '#b89a50', trimShade: '#7a6430',
    pants: '#cfc6b0', pantsShade: '#958c78', boots: '#958c78', bootsShade: '#6a6250',
    eyes: '#ffd870', body: 'bones', headwear: 'skull', width: 0.8, weapon: 'bone',
  },
  automaton: {
    skin: '#a07a3a', skinShade: '#5a4422',
    coat: '#c09848', coatShade: '#6e5426', coatL: '#ffe08a', trim: '#ffd070', trimShade: '#a07a30',
    pants: '#7a6030', pantsShade: '#4a3a1c', boots: '#4a3a20', bootsShade: '#2a2010',
    eyes: '#ffe070', body: 'armor', headwear: 'visor', width: 1.15, weapon: 'sword', core: true,
  },
  prisoner: {
    skin: '#dcb49c', skinShade: '#a07e68',
    coat: '#7a6650', coatShade: '#4a3c2e', trim: '#3a3028', trimShade: '#221a14',
    pants: '#5a4a3a', pantsShade: '#3a2e22', boots: '#3a2c20', bootsShade: '#221810',
    eyes: null, body: 'rags', headwear: 'messy', width: 0.95,
  },
  // Die Familie des Fürsten
  henry: {
    skin: '#f0e2e6', skinShade: '#c0a6b4', skinL: '#ffffff',
    coat: '#2c2040', coatShade: '#170f24', coatL: '#5c4c88',
    trim: '#d8b45a', trimShade: '#8a6a26',
    lining: '#b01330', liningShade: '#6c0719',
    pants: '#231a30', pantsShade: '#140e1c', boots: '#1c1424', bootsShade: '#0e0a14', bootsL: '#4a3a60',
    hair: '#2a1e2e', hairShade: '#140c16', hairL: '#5a4462',
    lace: '#f6f2f4', laceShade: '#bdb4c4',
    eyes: '#ff3a4a', body: 'lord', headwear: 'none', hairStyle: 'lord',
    cape: true, collar: true, ears: true, width: 0.95,
  },
  renate: {
    skin: '#ecd2c8', skinShade: '#b8988e', skinL: '#ffffff',
    coat: '#3a2a3e', coatShade: '#20152a', coatL: '#6a5270', trim: '#b8a0c8', trimShade: '#6a5878',
    pants: '#2a1e2e', pantsShade: '#180f1a', boots: '#1e141e', bootsShade: '#0e080e',
    hair: '#dcd8e2', hairShade: '#a09aac', hairL: '#ffffff',
    eyes: '#ff6070', body: 'robe', headwear: 'bun', width: 1.05, shawl: '#6a2a44', shawlShade: '#3e1428',
  },
  egon: {
    skin: '#e6ccc0', skinShade: '#b09080', skinL: '#ffffff',
    coat: '#2a2a34', coatShade: '#16161e', coatL: '#58586a', trim: '#b89a50', trimShade: '#7a6430',
    pants: '#24222a', pantsShade: '#141218', boots: '#1a1616', bootsShade: '#0c0a0a',
    hair: '#e8e6ee', hairShade: '#a8a4b4',
    eyes: '#ff6070', body: 'longcoat', headwear: 'none', hairStyle: 'bald', mustache: true, width: 1.05,
    weapon: 'lantern',
  },
  yvonne: {
    skin: '#f4e4ea', skinShade: '#c4a6b8', skinL: '#ffffff',
    coat: '#8e0e24', coatShade: '#4e0612', coatL: '#e0304c', trim: '#e8c060', trimShade: '#9a7422',
    pants: '#4e0612', pantsShade: '#2a030a', boots: '#2a030a', bootsShade: '#140104',
    hair: '#1e1422', hairShade: '#0c0810', hairL: '#4e3a58',
    eyes: '#ff1f35', body: 'robe', headwear: 'circlet', hairStyle: 'lord', ears: true, width: 1.0,
    cape: true, capeColor: '#2a0a14', capeShade: '#14040a', liningColor: '#b01330', liningShade: '#6c0719',
  },
  // Die Chronisten von Ingopolis
  matthias: {
    skin: '#ecc8b0', skinShade: '#b8927c', skinL: '#fff0e4',
    coat: '#c2aa8a', coatShade: '#8a7458', coatL: '#e8d8bc', trim: '#d0b030', trimShade: '#8a7418',
    pants: '#4a4038', pantsShade: '#2e2822', boots: '#3a2e24', bootsShade: '#221a12',
    hair: '#6a4a34', hairShade: '#3e2a1c', hairL: '#9a7a60',
    eyes: null, body: 'longcoat', headwear: 'none', hairStyle: 'short', brows: 'raised',
    shirtCollar: '#d4b830', width: 1.0, weapon: 'pencil',
  },
  ines: {
    skin: '#f2d4c4', skinShade: '#c0a092', skinL: '#fff4ee',
    coat: '#26222c', coatShade: '#121016', coatL: '#4a4454', trim: '#5a5264', trimShade: '#2e2a36',
    pants: '#1e1a22', pantsShade: '#100e12', boots: '#1a161c', bootsShade: '#0c0a0e',
    hair: '#8a6a50', hairShade: '#5a4430', hairL: '#b8987a',
    eyes: null, body: 'robe', headwear: 'bun', glasses: '#8a6e6a', earrings: true, lace: true, width: 1.0,
    weapon: 'papers',
  },
  // Bosse
  ambrosius: {
    skin: '#dcae90', skinShade: '#a07a62',
    coat: '#5c4636', coatShade: '#30221a', coatL: '#8a6c54', trim: '#e8b848', trimShade: '#9a7020',
    pants: '#3a2a22', pantsShade: '#20160f', boots: '#1e140e', bootsShade: '#0e0806',
    eyes: '#ffe08a', body: 'robe', headwear: 'hood', width: 1.5, weapon: 'censer',
  },
  mirella: {
    skin: '#f0dace', skinShade: '#b4988a',
    coat: '#26386a', coatShade: '#121c3a', coatL: '#5a78c8', trim: '#f4f2fa', trimShade: '#a8a4bc',
    pants: '#26386a', pantsShade: '#121c3a', boots: '#121c3a', bootsShade: '#080e1e',
    eyes: '#a0e0ff', body: 'robe', headwear: 'veil', width: 1.05, weapon: 'staff',
  },
  isolde: {
    skin: '#e2bca0', skinShade: '#a6826a',
    coat: '#5e4630', coatShade: '#33241a', coatL: '#8e7050', trim: '#c8d0e0', trimShade: '#7a8296',
    pants: '#3a2c20', pantsShade: '#221810', boots: '#261a10', bootsShade: '#140c06',
    hair: '#d05c26', hairShade: '#8a3414', hairL: '#ff9a5a',
    eyes: null, body: 'longcoat', headwear: 'none', hairStyle: 'braid', width: 1.05, weapon: 'spear',
  },
  malachias: {
    skin: '#e2c8b0', skinShade: '#a68e76',
    coat: '#342c58', coatShade: '#1a1432', coatL: '#6a5ca8', trim: '#f0cc60', trimShade: '#a07a28',
    pants: '#2a2440', pantsShade: '#16122a', boots: '#16122a', bootsShade: '#0a0816',
    hair: '#e4e0ea', hairShade: '#a09ca8',
    eyes: '#ffe8a0', body: 'robe', headwear: 'none', hairStyle: 'bald', beard: true, width: 1.1, weapon: 'book',
  },
  cogliostro: {
    skin: '#d4b090', skinShade: '#967658',
    coat: '#7a5628', coatShade: '#402a10', coatL: '#c89448', trim: '#ffc850', trimShade: '#a07420',
    pants: '#3a2a14', pantsShade: '#20160a', boots: '#20160a', bootsShade: '#100a04',
    eyes: '#ffc860', body: 'armor', headwear: 'goggles', width: 1.3, weapon: 'wrench', core: true,
  },
  serafine: {
    skin: '#f4dccc', skinShade: '#baa090', skinL: '#ffffff',
    coat: '#f0eef8', coatShade: '#a8a4c0', coatL: '#ffffff', trim: '#f4c858', trimShade: '#a88020',
    pants: '#cfcadc', pantsShade: '#8a86a0', boots: '#b8b4cc', bootsShade: '#6e6a84',
    hair: '#f8e090', hairShade: '#c8a050', hairL: '#fff6c8',
    eyes: '#fff4c0', body: 'armor', headwear: 'circlet', hairStyle: 'lord', width: 1.15,
    weapon: 'greatsword', cape: true, capeColor: '#f0eef8', capeShade: '#a8a4c0', liningColor: '#e4b848', liningShade: '#9a7422',
  },
};

// === Zwischenleinwände für die Kontur =======================================

const scratch = { a: null, b: null, ac: null, bc: null, size: 0 };
function getScratch(px) {
  if (scratch.size < px) {
    const size = Math.ceil(px / 64) * 64;
    for (const k of ['a', 'b']) {
      const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(size, size) : Object.assign(document.createElement('canvas'), { width: size, height: size });
      scratch[k] = c;
      scratch[k + 'c'] = c.getContext('2d');
    }
    scratch.size = size;
  }
  return scratch;
}

/**
 * Zeichnet eine menschliche Figur mit Tuschekontur und Cel-Shading.
 * @param ctx  Kontext in Weltkoordinaten
 * @param x,y  Fußpunkt (Weltkoordinaten)
 * @param facing  1 = rechts, -1 = links
 * @param pose  aus makePose()
 * @param costume  aus COSTUMES
 * @param extra { sz, cape: Cloth, hair: Cloth, t, alpha, flash, flashColor, noOutline, outline }
 */
export function drawHumanoid(ctx, x, y, facing, pose, costume, extra = {}) {
  const sz = (extra.sz ?? 1) * CHAR_SCALE;
  const rig = solveRig(pose, sz);
  const paint = (c) => paintFigure(c, x, y, facing, pose, rig, costume, sz, extra);
  if (extra.noOutline) {
    ctx.save();
    if (extra.alpha != null) ctx.globalAlpha = extra.alpha;
    paint(ctx);
    ctx.restore();
  } else {
    outlined(ctx, x, y, sz, paint, extra);
  }
  return rig;
}

/**
 * Zeichnet beliebiges mit Tuschekontur: `paint(ctx)` malt in Weltkoordinaten,
 * das Ergebnis bekommt einen dunklen Umriss und landet in `ctx`.
 * (x, y) ist der Fußpunkt, `sz` die Größe (bestimmt die Leinwand um die Figur).
 * extra: { alpha, flash, flashColor, outline, inkColor, box }
 */
export function outlined(ctx, x, y, sz, paint, extra = {}) {
  // Pixel pro Welteinheit aus der aktuellen Transformation ablesen.
  const m = ctx.getTransform();
  const ppu = Math.max(0.5, Math.hypot(m.a, m.b));
  const box = (extra.box ?? 84) * sz;     // Welt-Einheiten um die Figur (Umhang inklusive)
  const px = Math.ceil(box * ppu);
  const s = getScratch(px);
  const A = s.ac, B = s.bc;
  const ox = box / 2, oy = box * (extra.footAt ?? 0.72);

  // 1) Motiv in Leinwand A
  A.setTransform(1, 0, 0, 1, 0, 0);
  A.globalCompositeOperation = 'source-over';
  A.globalAlpha = 1;
  A.clearRect(0, 0, px, px);
  A.setTransform(ppu, 0, 0, ppu, 0, 0);
  A.translate(ox - x, oy - y);           // Weltkoordinaten -> Box
  paint(A);
  if (extra.flash > 0) {
    A.setTransform(1, 0, 0, 1, 0, 0);
    A.globalCompositeOperation = 'source-atop';
    A.fillStyle = extra.flashColor || `rgba(255,255,255,${extra.flash})`;
    A.fillRect(0, 0, px, px);
    A.globalCompositeOperation = 'source-over';
  }

  // 2) Kontur: Silhouette rundum versetzt, dann in Tuschefarbe getaucht
  const o = Math.max(1, (extra.outline ?? 0.62) * ppu);
  B.setTransform(1, 0, 0, 1, 0, 0);
  B.globalCompositeOperation = 'source-over';
  B.globalAlpha = 1;
  B.clearRect(0, 0, px, px);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    B.drawImage(s.a, 0, 0, px, px, Math.cos(a) * o, Math.sin(a) * o, px, px);
  }
  B.globalCompositeOperation = 'source-in';
  B.fillStyle = extra.inkColor || INK;
  B.fillRect(0, 0, px, px);
  B.globalCompositeOperation = 'source-over';
  B.drawImage(s.a, 0, 0);

  // 3) In die Welt
  ctx.save();
  if (extra.alpha != null) ctx.globalAlpha *= extra.alpha;
  ctx.drawImage(s.b, 0, 0, px, px, x - ox, y - oy, px / ppu, px / ppu);
  ctx.restore();
}

/** Die eigentliche Figur (Weltkoordinaten), ohne Kontur. */
function paintFigure(ctx, x, y, facing, pose, rig, c, sz, extra) {
  if (extra.cape) drawCape(ctx, extra.cape, c, facing, sz);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing, 1);

  if (extra.hair && (c.hairStyle === 'lord' || c.hairStyle === 'braid')) drawHairChain(ctx, extra.hair, x, y, facing, c, sz);

  const w = c.width ?? 1;
  if (c.body === 'lord') drawCoatBack(ctx, rig, pose, c, sz);
  drawArm(ctx, rig.armB, c, sz * w, true, rig, pose);
  drawLeg(ctx, rig.hip, rig.legB, c, sz * w, true);
  drawBody(ctx, rig, pose, c, sz, w, extra);
  if (c.body !== 'robe') drawLeg(ctx, rig.hip, rig.legF, c, sz * w, false);
  else drawRobeFront(ctx, rig, c, sz, w);
  if (c.body === 'lord') drawCoatFront(ctx, rig, pose, c, sz);
  drawHead(ctx, rig, c, sz, extra);
  drawArm(ctx, rig.armF, c, sz * w, false, rig, pose);
  if (c.weapon && !extra.noWeapon) drawWeapon(ctx, rig.armF, c, pose, sz, extra);
  if (c.shield) drawShield(ctx, rig, c, sz, extra);
  ctx.restore();
}

// --- Beine ------------------------------------------------------------------

function drawLeg(ctx, hip, leg, c, sz, back) {
  const dk = back ? 0.72 : 1;
  if (c.body === 'bones') {
    const b = back ? c.skinShade : c.skin, sh = back ? shadeColor(c.skinShade, 0.8) : c.skinShade;
    celLimb(ctx, hip, leg.knee, 1.7 * sz, 1.5 * sz, b, sh);
    celLimb(ctx, leg.knee, leg.foot, 1.5 * sz, 1.2 * sz, b, sh);
    ctx.fillStyle = b;
    ctx.beginPath(); ctx.arc(leg.knee.x, leg.knee.y, 1.4 * sz, 0, TAU); ctx.fill();
    drawFoot(ctx, leg.knee, leg.foot, b, sh, sz * 0.8, false);
    return;
  }
  const pb = shadeColor(c.pants, dk), ps = shadeColor(c.pantsShade || c.pants, dk * 0.85);
  // Oberschenkel kräftig, zum Knie schmaler
  celLimb(ctx, hip, leg.knee, 5.0 * sz, 3.5 * sz, pb, ps);
  // Stiefel: Schaft bis übers Knie mit umgeschlagener Stulpe
  const bb = shadeColor(c.boots, dk), bs = shadeColor(c.bootsShade || c.boots, dk * 0.85);
  const shin = celLimb(ctx, leg.knee, leg.foot, 3.7 * sz, 2.8 * sz, bb, bs, back ? null : c.bootsL);
  void shin;
  if (c.body === 'lord' || c.body === 'longcoat') {
    // Stulpe
    const k = leg.knee, f = leg.foot;
    const t0 = 0.02, t1 = 0.3;
    const a = { x: k.x + (f.x - k.x) * t0, y: k.y + (f.y - k.y) * t0 };
    const b = { x: k.x + (f.x - k.x) * t1, y: k.y + (f.y - k.y) * t1 };
    celLimb(ctx, a, b, 4.8 * sz, 4.2 * sz, shadeColor(c.boots, dk * 1.25), bs);
  }
  if (c.body === 'armor') {
    const kp = new Path2D();
    kp.ellipse(leg.knee.x + 0.6 * sz, leg.knee.y, 2.3 * sz, 2.1 * sz, 0, 0, TAU);
    cel(ctx, kp, shadeColor(c.coat, dk), shadeColor(c.coatShade, dk), 0.6, -0.5);
  }
  drawFoot(ctx, leg.knee, leg.foot, bb, bs, sz, c.body === 'lord');
}

function drawFoot(ctx, knee, footPt, base, shade, sz, heel) {
  const a = Math.atan2(footPt.y - knee.y, footPt.x - knee.x) - Math.PI / 2;
  ctx.save();
  ctx.translate(footPt.x, footPt.y);
  ctx.rotate(a * 0.35);
  const p = new Path2D();
  p.moveTo(-2.0 * sz, -2.6 * sz);
  p.lineTo(1.4 * sz, -2.6 * sz);
  p.quadraticCurveTo(4.6 * sz, -1.8 * sz, 5.4 * sz, 0.2 * sz);
  p.lineTo(5.4 * sz, 0.6 * sz);
  p.lineTo(-2.4 * sz, 0.6 * sz);
  if (heel) { p.lineTo(-2.4 * sz, 1.2 * sz); p.lineTo(-0.9 * sz, 1.2 * sz); p.lineTo(-0.9 * sz, 0.6 * sz); }
  p.closePath();
  cel(ctx, p, base, shade, 0.5, -0.6);
  ctx.restore();
}

// --- Arme -------------------------------------------------------------------

function drawArm(ctx, arm, c, sz, back, rig, pose) {
  const dk = back ? 0.72 : 1;
  if (c.body === 'bones') {
    const b = back ? c.skinShade : c.skin, sh = back ? shadeColor(c.skinShade, 0.8) : c.skinShade;
    celLimb(ctx, arm.sh, arm.elbow, 1.5 * sz, 1.3 * sz, b, sh);
    celLimb(ctx, arm.elbow, arm.hand, 1.3 * sz, 1.1 * sz, b, sh);
    drawHand(ctx, arm, c, sz, back, true);
    return;
  }
  const sb = shadeColor(c.coat, dk), ss = shadeColor(c.coatShade, dk);
  if (c.body === 'lord') {
    // Puffärmel oben, eng am Unterarm
    celLimb(ctx, arm.sh, arm.elbow, 4.6 * sz, 3.2 * sz, sb, ss, back ? null : c.coatL);
    celLimb(ctx, arm.elbow, arm.hand, 3.0 * sz, 2.5 * sz, sb, ss);
    // Goldene Schulterpasse
    if (!back) {
      const pp = new Path2D();
      pp.ellipse(arm.sh.x + 0.4 * sz, arm.sh.y + 0.6 * sz, 3.0 * sz, 2.1 * sz, 0.3, 0, TAU);
      cel(ctx, pp, c.coat, c.coatShade, 0.6, -0.6);
      ctx.strokeStyle = c.trim; ctx.lineWidth = 0.6 * sz;
      ctx.beginPath(); ctx.ellipse(arm.sh.x + 0.4 * sz, arm.sh.y + 0.6 * sz, 2.4 * sz, 1.5 * sz, 0.3, Math.PI * 0.1, Math.PI * 1.1); ctx.stroke();
    }
    // Spitzenmanschette
    const t = 0.8;
    const mx = arm.elbow.x + (arm.hand.x - arm.elbow.x) * t, my = arm.elbow.y + (arm.hand.y - arm.elbow.y) * t;
    const lace = new Path2D();
    const ang = Math.atan2(arm.hand.y - arm.elbow.y, arm.hand.x - arm.elbow.x);
    for (let i = -2; i <= 2; i++) {
      const aa = ang + Math.PI / 2;
      const cx = mx + Math.cos(aa) * i * 0.75 * sz, cy = my + Math.sin(aa) * i * 0.75 * sz;
      lace.moveTo(cx + 1.1 * sz, cy);
      lace.arc(cx, cy, 1.1 * sz, 0, TAU);
    }
    cel(ctx, lace, shadeColor(c.lace, dk), shadeColor(c.laceShade, dk), 0.3, -0.3, null, false);
  } else {
    celLimb(ctx, arm.sh, arm.elbow, 3.6 * sz, 3.0 * sz, sb, ss, back ? null : c.coatL);
    celLimb(ctx, arm.elbow, arm.hand, 3.0 * sz, 2.5 * sz, sb, ss);
    if (c.trim && c.body !== 'rags') {
      const t = 0.8;
      const mx = arm.elbow.x + (arm.hand.x - arm.elbow.x) * t, my = arm.elbow.y + (arm.hand.y - arm.elbow.y) * t;
      const cuff = new Path2D(); cuff.arc(mx, my, 1.7 * sz, 0, TAU);
      cel(ctx, cuff, shadeColor(c.trim, dk), shadeColor(c.trimShade || c.trim, dk), 0.4, -0.4, null, false);
    }
    if (c.body === 'armor') {
      const pp = new Path2D();
      pp.ellipse(arm.sh.x + 0.8 * sz, arm.sh.y, 3.4 * sz, 2.6 * sz, 0.2, 0, TAU);
      cel(ctx, pp, sb, ss, 0.8, -0.8, back ? null : c.coatL);
    }
  }
  drawHand(ctx, arm, c, sz, back, false);
}

function drawHand(ctx, arm, c, sz, back, bony) {
  const b = back ? c.skinShade : c.skin, sh = back ? shadeColor(c.skinShade, 0.8) : c.skinShade;
  const h = arm.hand;
  const p = new Path2D(); p.arc(h.x, h.y, (bony ? 1.0 : 1.2) * sz, 0, TAU);
  cel(ctx, p, b, sh, 0.35, -0.3, null, false);
  if (c.claws && !back) {
    // Lange Krallen
    ctx.strokeStyle = '#3a2434';
    ctx.lineWidth = 0.4 * sz;
    ctx.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
      const a = arm.angle + i * 0.38;
      const x1 = h.x + Math.sin(a) * 1.3 * sz, y1 = h.y + Math.cos(a) * 1.3 * sz;
      const x2 = h.x + Math.sin(a + 0.25) * 3.6 * sz, y2 = h.y + Math.cos(a + 0.25) * 3.6 * sz;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(h.x + Math.sin(a) * 3 * sz, h.y + Math.cos(a) * 3 * sz, x2, y2); ctx.stroke();
    }
  }
}

// --- Rumpf ------------------------------------------------------------------

function drawBody(ctx, rig, pose, c, sz, w, extra) {
  const { hip, shoulder } = rig;
  const ax = torsoAxes(pose.lean);

  if (c.body === 'bones') {
    ctx.strokeStyle = c.skin;
    ctx.lineWidth = 1.5 * sz;
    ctx.beginPath(); ctx.moveTo(hip.x, hip.y); ctx.lineTo(shoulder.x, shoulder.y); ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const t = 0.35 + i * 0.16;
      const px = hip.x + (shoulder.x - hip.x) * t, py = hip.y + (shoulder.y - hip.y) * t;
      const rib = new Path2D();
      rib.ellipse(px + 0.6 * sz, py, 3.6 * sz, 1.2 * sz, pose.lean, 0, TAU);
      ctx.lineWidth = 1.0 * sz;
      ctx.strokeStyle = c.skinShade; ctx.stroke(rib);
      ctx.lineWidth = 0.6 * sz;
      ctx.strokeStyle = c.skin;
      ctx.save(); ctx.translate(0.4, -0.3); ctx.stroke(rib); ctx.restore();
    }
    const pel = new Path2D(); pel.ellipse(hip.x, hip.y, 3.1 * sz, 1.9 * sz, 0, 0, TAU);
    cel(ctx, pel, c.skin, c.skinShade, 0.5, -0.4);
    // Zerlumpter Wappenrock des Ordens – sie haben deine Diener eingekleidet.
    const tab = smoothPath([
      along(shoulder, ax, -2.2 * sz, -1.5 * sz), along(shoulder, ax, 2.2 * sz, -1.5 * sz),
      P(hip.x + 3 * sz, hip.y + 6 * sz, true), P(hip.x + 0.5 * sz, hip.y + 3.5 * sz, true), P(hip.x - 2.6 * sz, hip.y + 6.5 * sz, true),
    ]);
    cel(ctx, tab, 'rgba(216,204,176,0.85)', 'rgba(150,140,120,0.85)', 0.5, -0.4);
    ctx.fillStyle = c.trim;
    ctx.beginPath(); ctx.arc((shoulder.x + hip.x) / 2 + 0.5 * sz, (shoulder.y + hip.y) / 2, 1.1 * sz, 0, TAU); ctx.fill();
    return;
  }

  const sw = 4.7 * sz * w, hw = 3.6 * sz * w;
  // Rumpf mit Brust, schmaler Taille, Hüfte
  const pts = [
    along(shoulder, ax, -sw, 0.4 * sz),
    along(shoulder, ax, sw * 0.9, 0.3 * sz),
    along(shoulder, ax, sw * (c.body === 'lord' ? 1.02 : 0.95), -3.8 * sz),
    along(hip, ax, hw * 0.78, 4.2 * sz),
    along(hip, ax, hw, 0),
    along(hip, ax, -hw, 0),
    along(hip, ax, -hw * 0.82, 4.2 * sz),
    along(shoulder, ax, -sw * 0.98, -4.2 * sz),
  ];
  const torso = smoothPath(pts);
  cel(ctx, torso, c.coat, c.coatShade, 1.4 * sz, -0.9 * sz, c.coatL);

  if (c.body === 'lord') {
    // Goldene Borte an der Mantelöffnung, Knöpfe, rote Schärpe
    ctx.strokeStyle = c.trim;
    ctx.lineWidth = 0.7 * sz;
    const a0 = along(shoulder, ax, sw * 0.45, -0.5 * sz), a1 = along(hip, ax, hw * 0.55, 0);
    ctx.beginPath(); ctx.moveTo(a0.x, a0.y); ctx.lineTo(a1.x, a1.y); ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const b = along(shoulder, ax, sw * 0.2, -(2.4 + i * 2.6) * sz);
      ctx.fillStyle = c.trim;
      ctx.beginPath(); ctx.arc(b.x, b.y, 0.55 * sz, 0, TAU); ctx.fill();
    }
    const sash = smoothPath([
      along(hip, ax, -hw * 1.02, 2.2 * sz), along(hip, ax, hw * 1.02, 2.3 * sz),
      along(hip, ax, hw * 1.0, -0.2 * sz), along(hip, ax, -hw * 1.0, -0.2 * sz),
    ]);
    cel(ctx, sash, c.lining, c.liningShade, 0.5, -0.5);
    // Herabhängendes Schärpenende
    const e0 = along(hip, ax, -hw * 0.6, 0);
    const swing = (pose.hipB - pose.hipF) * 1.4;
    const tail = smoothPath([P(e0.x, e0.y), P(e0.x - 1.6 * sz + swing, e0.y + 5 * sz), P(e0.x - 0.6 * sz + swing, e0.y + 7.5 * sz, true), P(e0.x + 1.2 * sz, e0.y + 0.4 * sz)]);
    cel(ctx, tail, c.lining, c.liningShade, 0.4, -0.4);
    // Gürtelschnalle
    const bk = along(hip, ax, hw * 0.35, 1.0 * sz);
    ctx.fillStyle = c.trim;
    ctx.fillRect(bk.x - 0.9 * sz, bk.y - 1.0 * sz, 1.8 * sz, 2.0 * sz);
  } else if (c.body === 'longcoat') {
    const swing = (pose.hipF - pose.hipB) * 0.5;
    const len = 10 * sz;
    const skirt = smoothPath([
      P(hip.x + hw, hip.y - 1 * sz),
      P(hip.x + hw + swing * 4 * sz, hip.y + len * 0.6),
      P(hip.x + hw * 0.7 + swing * 6 * sz, hip.y + len, true),
      P(hip.x - hw * 0.1, hip.y + len * 0.8, true),
      P(hip.x - hw * 1.2 - swing * 5 * sz, hip.y + len, true),
      P(hip.x - hw - swing * 3 * sz, hip.y + len * 0.5),
      P(hip.x - hw, hip.y - 1 * sz),
    ]);
    cel(ctx, skirt, c.coat, c.coatShade, 1.0, -0.6, c.coatL);
    ctx.fillStyle = c.trimShade || c.trim;
    const b0 = along(hip, ax, -hw, 1.6 * sz);
    ctx.save(); ctx.translate(b0.x, b0.y); ctx.rotate(pose.lean);
    ctx.fillRect(0, -0.9 * sz, hw * 2, 1.9 * sz);
    ctx.fillStyle = c.trim; ctx.fillRect(hw * 1.1, -1.1 * sz, 1.6 * sz, 2.2 * sz);
    ctx.restore();
    // Patronengurt über die Brust – nur bei den Jägern
    if (c.weapon === 'crossbow' || c.weapon === 'spear') {
      const s0 = along(shoulder, ax, sw * 0.7, -0.5 * sz), s1 = along(hip, ax, -hw * 0.8, 3 * sz);
      ctx.strokeStyle = c.trimShade || '#3a2a18'; ctx.lineWidth = 1.2 * sz;
      ctx.beginPath(); ctx.moveTo(s0.x, s0.y); ctx.lineTo(s1.x, s1.y); ctx.stroke();
    }
  } else if (c.body === 'armor') {
    // Brustplatte: Glanzlicht, Mittelgrat, Emblem
    const ridge0 = along(shoulder, ax, sw * 0.35, -1 * sz), ridge1 = along(hip, ax, hw * 0.3, 3 * sz);
    ctx.strokeStyle = c.coatL || '#fff'; ctx.lineWidth = 0.6 * sz;
    ctx.beginPath(); ctx.moveTo(ridge0.x, ridge0.y); ctx.lineTo(ridge1.x, ridge1.y); ctx.stroke();
    const em = along(shoulder, ax, sw * 0.3, -4.3 * sz);
    const emb = new Path2D(); emb.arc(em.x, em.y, 1.7 * sz, 0, TAU);
    cel(ctx, emb, c.trim, c.trimShade, 0.4, -0.4);
    if (c.core) {
      const co = along(hip, ax, hw * 0.25, 5.2 * sz);
      ctx.fillStyle = c.eyes;
      ctx.beginPath(); ctx.arc(co.x, co.y, 1.9 * sz, 0, TAU); ctx.fill();
    }
    // Kettenhemd-Rock
    const skirt = smoothPath([
      P(hip.x - hw, hip.y - 1 * sz, true), P(hip.x + hw, hip.y - 1 * sz, true),
      P(hip.x + hw * 1.05, hip.y + 4.5 * sz, true), P(hip.x - hw * 1.05, hip.y + 4.5 * sz, true),
    ]);
    cel(ctx, skirt, c.coatShade, shadeColor(c.coatShade, 0.7), 0.6, -0.4);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    for (let i = -2; i <= 2; i++) ctx.fillRect(hip.x + i * 1.5 * sz, hip.y, 0.5 * sz, 4 * sz);
  } else if (c.body === 'robe') {
    const b0 = along(hip, ax, -hw, 1.6 * sz);
    ctx.save(); ctx.translate(b0.x, b0.y); ctx.rotate(pose.lean);
    ctx.fillStyle = c.trim; ctx.fillRect(0, -0.7 * sz, hw * 2, 1.4 * sz);
    ctx.restore();
    // Stola des Ordens mit Sonne
    const st0 = along(shoulder, ax, sw * 0.25, 0), st1 = along(hip, ax, hw * 0.3, -6 * sz);
    ctx.strokeStyle = c.trim; ctx.lineWidth = 1.5 * sz;
    ctx.beginPath(); ctx.moveTo(st0.x, st0.y); ctx.lineTo(st1.x, st1.y); ctx.stroke();
    ctx.fillStyle = c.trimShade || c.trim;
    const sun = along(shoulder, ax, sw * 0.28, -4 * sz);
    ctx.beginPath(); ctx.arc(sun.x, sun.y, 1.0 * sz, 0, TAU); ctx.fill();
  } else if (c.body === 'rags') {
    const r = smoothPath([
      P(hip.x - hw, hip.y, true), P(hip.x - hw + 1, hip.y + 5 * sz, true), P(hip.x - 1, hip.y + 3 * sz, true),
      P(hip.x + 1.5, hip.y + 6 * sz, true), P(hip.x + hw, hip.y + 2 * sz, true), P(hip.x + hw, hip.y, true),
    ]);
    cel(ctx, r, c.coatShade, shadeColor(c.coatShade, 0.7), 0.4, -0.3);
  }

  // Hemdkragen unter dem Mantel (Matthias: senfgelbes Polo unter beigem Strick)
  if (c.shirtCollar) {
    const n = rig.neck;
    const col = smoothPath([P(n.x - 1.8 * sz, n.y + 0.6 * sz), P(n.x + 2.4 * sz, n.y + 0.4 * sz, true), P(n.x + 1.2 * sz, n.y + 2.8 * sz, true), P(n.x - 0.4 * sz, n.y + 1.6 * sz)]);
    cel(ctx, col, c.shirtCollar, shadeColor(c.shirtCollar, 0.7), 0.3, -0.3);
    // Reißverschluss des Strickmantels
    const z0 = along(shoulder, ax, sw * 0.4, -0.5 * sz), z1 = along(hip, ax, hw * 0.4, 1 * sz);
    ctx.strokeStyle = '#8a7a64'; ctx.lineWidth = 0.35 * sz;
    ctx.beginPath(); ctx.moveTo(z0.x, z0.y); ctx.lineTo(z1.x, z1.y); ctx.stroke();
    ctx.fillStyle = '#d8d0c0'; ctx.fillRect(z0.x - 0.4 * sz, z0.y, 0.8 * sz, 1.4 * sz);
    // Strickstruktur
    ctx.strokeStyle = 'rgba(90,70,50,0.25)'; ctx.lineWidth = 0.25 * sz;
    for (let k = 1; k < 5; k++) {
      const a0 = along(shoulder, ax, -sw * 0.9, -k * 2.2 * sz), a1 = along(shoulder, ax, sw * 0.9, -k * 2.2 * sz);
      ctx.beginPath(); ctx.moveTo(a0.x, a0.y); ctx.lineTo(a1.x, a1.y); ctx.stroke();
    }
  }
  // Spitzenärmel-Andeutung am Kleid (Ines)
  if (c.lace && c.body === 'robe') {
    ctx.strokeStyle = 'rgba(120,110,130,0.55)'; ctx.lineWidth = 0.3 * sz;
    for (let k = 0; k < 4; k++) {
      const q = along(shoulder, ax, sw * (0.2 + k * 0.18), -1.2 * sz);
      ctx.beginPath(); ctx.arc(q.x, q.y, 0.7 * sz, 0, TAU); ctx.stroke();
    }
    // V-Ausschnitt
    const v0 = along(shoulder, ax, sw * 0.1, -0.2 * sz), v1 = along(shoulder, ax, sw * 0.55, -3.2 * sz), v2 = along(shoulder, ax, sw * 0.9, -0.2 * sz);
    ctx.fillStyle = c.skin;
    ctx.beginPath(); ctx.moveTo(v0.x, v0.y); ctx.lineTo(v1.x, v1.y); ctx.lineTo(v2.x, v2.y); ctx.closePath(); ctx.fill();
  }

  // Schultertuch (Oma Renate)
  if (c.shawl) {
    const sh0 = along(shoulder, ax, -sw * 1.05, 0.6 * sz), sh1 = along(shoulder, ax, sw * 1.05, 0.4 * sz);
    const tip = along(shoulder, ax, sw * 0.2, -6.5 * sz);
    const shawl = smoothPath([sh0, sh1, P(tip.x + 1.5 * sz, tip.y, true), P(tip.x - 1.5 * sz, tip.y + 0.5 * sz, true)]);
    cel(ctx, shawl, c.shawl, c.shawlShade, 0.6, -0.5);
  }

  // Hoher Vampirkragen mit Jabot
  if (c.collar) {
    const n = rig.neck;
    const col = smoothPath([
      P(n.x - 1.2 * sz, n.y + 2.4 * sz), P(n.x - 5.0 * sz, n.y - 5.8 * sz, true), P(n.x - 2.0 * sz, n.y - 3.6 * sz),
      P(n.x + 0.4 * sz, n.y + 0.2 * sz), P(n.x + 2.6 * sz, n.y + 2.4 * sz),
    ]);
    cel(ctx, col, c.coat, c.coatShade, 0.6, -0.4);
    const inner = smoothPath([
      P(n.x - 1.4 * sz, n.y + 1.6 * sz), P(n.x - 4.3 * sz, n.y - 4.6 * sz, true), P(n.x - 1.9 * sz, n.y - 2.6 * sz), P(n.x - 0.2 * sz, n.y + 0.6 * sz),
    ]);
    cel(ctx, inner, c.lining, c.liningShade, 0.4, -0.3, null, false);
    // Jabot (Spitzenkrawatte)
    const j = along(shoulder, ax, sw * 0.55, -0.8 * sz);
    const jab = smoothPath([P(j.x - 0.6 * sz, j.y - 1.6 * sz), P(j.x + 1.9 * sz, j.y - 0.6 * sz), P(j.x + 1.5 * sz, j.y + 1.4 * sz), P(j.x + 2.1 * sz, j.y + 3.2 * sz, true), P(j.x - 0.2 * sz, j.y + 2.4 * sz)]);
    cel(ctx, jab, c.lace, c.laceShade, 0.4, -0.3);
    // Rubinbrosche
    ctx.fillStyle = c.trim;
    ctx.beginPath(); ctx.arc(j.x + 0.6 * sz, j.y - 0.5 * sz, 0.95 * sz, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e0102c';
    ctx.beginPath(); ctx.arc(j.x + 0.6 * sz, j.y - 0.5 * sz, 0.55 * sz, 0, TAU); ctx.fill();
  }
}

/** Langer Mantel (hintere Schöße) – schwingt mit Schritt und Tempo. */
function drawCoatBack(ctx, rig, pose, c, sz) {
  const { hip, legF, legB } = rig;
  const swing = (pose.hipB - pose.hipF) * 0.5;
  const trail = pose.lean * 6;
  const hemY = Math.max(legF.foot.y, legB.foot.y) - 3.2 * sz;
  const back = Math.min(legF.foot.x, legB.foot.x) - 4.5 * sz - trail * sz - swing * 3 * sz;
  const p = smoothPath([
    P(hip.x + 2.4 * sz, hip.y - 1.5 * sz),
    P(hip.x - 3.8 * sz, hip.y - 1 * sz),
    P(hip.x - 4.8 * sz - trail * 0.5 * sz, (hip.y + hemY) / 2),
    P(back, hemY + 0.6 * sz, true),
    P(back + 3.0 * sz, hemY - 1.0 * sz, true),
    P(back + 5.5 * sz, hemY + 0.4 * sz, true),
    P(hip.x + 0.5 * sz, hemY - 2 * sz, true),
    P(hip.x + 2.0 * sz, (hip.y + hemY) / 2),
  ]);
  cel(ctx, p, shadeColor(c.coat, 0.85), c.coatShade, 1.0, -0.6);
  // Rotes Futter blitzt an der Innenkante auf
  const lin = smoothPath([
    P(hip.x - 0.4 * sz, hip.y + 1 * sz), P(hip.x - 2.2 * sz, (hip.y + hemY) / 2),
    P(back + 3.0 * sz, hemY - 1.0 * sz, true), P(back + 5.5 * sz, hemY + 0.4 * sz, true),
    P(hip.x + 0.3 * sz, hemY - 2.2 * sz, true), P(hip.x + 1.0 * sz, (hip.y + hemY) / 2),
  ]);
  cel(ctx, lin, c.lining, c.liningShade, 0.6, -0.4, null, false);
  ctx.strokeStyle = c.trim; ctx.lineWidth = 0.5 * sz;
  ctx.beginPath(); ctx.moveTo(back, hemY + 0.6 * sz); ctx.lineTo(back + 3.0 * sz, hemY - 1.0 * sz); ctx.lineTo(back + 5.5 * sz, hemY + 0.4 * sz); ctx.stroke();
}

/** Vordere Mantelschöße über dem Oberschenkel. */
function drawCoatFront(ctx, rig, pose, c, sz) {
  const { hip, legF } = rig;
  const k = legF.knee;
  const p = smoothPath([
    P(hip.x + 3.6 * sz, hip.y - 1 * sz),
    P(k.x + 3.0 * sz, k.y + 1.0 * sz),
    P(k.x + 1.6 * sz, k.y + 3.4 * sz, true),
    P(k.x - 1.2 * sz, k.y + 2.0 * sz, true),
    P(hip.x - 0.6 * sz, hip.y + 2 * sz),
  ]);
  cel(ctx, p, c.coat, c.coatShade, 0.9, -0.6, c.coatL);
  ctx.strokeStyle = c.trim; ctx.lineWidth = 0.5 * sz;
  ctx.beginPath(); ctx.moveTo(k.x + 1.6 * sz, k.y + 3.4 * sz); ctx.lineTo(k.x - 1.2 * sz, k.y + 2.0 * sz); ctx.stroke();
}

/** Robe verdeckt die Beine: Stoffbahn, die mit den Schritten schwingt. */
function drawRobeFront(ctx, rig, c, sz, w) {
  const { hip, legF, legB } = rig;
  const hw = 3.9 * sz * w;
  const fx = Math.max(legF.foot.x, legB.foot.x) + 1.8 * sz;
  const bx = Math.min(legF.foot.x, legB.foot.x) - 1.8 * sz;
  const fy = Math.max(legF.foot.y, legB.foot.y) - 0.6 * sz;
  const pts = [P(hip.x - hw, hip.y - 1 * sz), P(hip.x + hw, hip.y - 1 * sz), P(fx + 1.2 * sz, (hip.y + fy) / 2), P(fx + 1.8 * sz, fy, true)];
  const steps = 5;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    pts.push(P(fx + 1.8 * sz + (bx - fx - 3.6 * sz) * t, fy - (i % 2 ? 1.3 * sz : 0), true));
  }
  pts.push(P(bx - 1.2 * sz, (hip.y + fy) / 2));
  const robe = smoothPath(pts);
  cel(ctx, robe, c.coat, c.coatShade, 1.6 * sz, -0.4, c.coatL);
  // Faltenwurf
  ctx.strokeStyle = 'rgba(11,7,16,0.28)';
  ctx.lineWidth = 0.5 * sz;
  for (let i = 0; i < 3; i++) {
    const t = 0.25 + i * 0.25;
    ctx.beginPath();
    ctx.moveTo(hip.x - hw + hw * 2 * t, hip.y + 2 * sz);
    ctx.quadraticCurveTo(bx + (fx - bx) * t, (hip.y + fy) / 2, bx + (fx - bx) * t + 0.6 * sz, fy - 1.5 * sz);
    ctx.stroke();
  }
  ctx.strokeStyle = c.trim;
  ctx.lineWidth = 1.0 * sz;
  ctx.beginPath(); ctx.moveTo(fx + 1.8 * sz, fy - 0.9 * sz); ctx.lineTo(bx - 1.8 * sz, fy - 0.9 * sz); ctx.stroke();
  const fp = new Path2D(); fp.ellipse(legF.foot.x + 1.6 * sz, legF.foot.y - 0.8 * sz, 2.5 * sz, 1.1 * sz, 0, 0, TAU);
  cel(ctx, fp, c.boots, c.bootsShade || c.boots, 0.4, -0.3);
}

// --- Kopf -------------------------------------------------------------------

function drawHead(ctx, rig, c, sz, extra) {
  const { head, neck, hr, headA } = rig;
  // Hals
  if (c.body !== 'bones') celLimb(ctx, neck, { x: head.x - 0.3 * sz, y: head.y + hr * 0.45 }, 2.3 * sz, 2.2 * sz, c.skinShade, shadeColor(c.skinShade, 0.8));

  // Hinterhaar (Masse unter dem Kopf)
  if (c.hairStyle === 'lord' || c.hairStyle === 'braid') {
    const hb = smoothPath([
      P(head.x + hr * 0.2, head.y - hr * 1.05), P(head.x - hr * 1.3, head.y - hr * 0.6),
      P(head.x - hr * 1.5, head.y + hr * 0.9), P(head.x - hr * 1.9, head.y + hr * 2.6, true),
      P(head.x - hr * 0.6, head.y + hr * 1.3), P(head.x - hr * 0.2, head.y + hr * 0.2),
    ]);
    cel(ctx, hb, c.hairShade, shadeColor(c.hairShade, 0.75), 0.4, -0.4);
  }

  ctx.save();
  ctx.translate(head.x, head.y);
  ctx.rotate(headA * 0.35);
  ctx.translate(-head.x, -head.y);

  if (c.headwear === 'skull') {
    const sk = smoothPath([
      P(head.x - hr * 0.9, head.y), P(head.x - hr * 0.6, head.y - hr * 0.95), P(head.x + hr * 0.5, head.y - hr * 0.95),
      P(head.x + hr * 1.0, head.y - hr * 0.1), P(head.x + hr * 0.95, head.y + hr * 0.55, true), P(head.x + hr * 0.2, head.y + hr * 1.0, true),
      P(head.x - hr * 0.5, head.y + hr * 0.6),
    ]);
    cel(ctx, sk, c.skin, c.skinShade, 0.6, -0.5, c.skinL);
    ctx.fillStyle = '#140e0a';
    ctx.beginPath(); ctx.ellipse(head.x + hr * 0.42, head.y - hr * 0.1, hr * 0.3, hr * 0.34, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(head.x + hr * 0.85, head.y + hr * 0.2); ctx.lineTo(head.x + hr * 0.75, head.y + hr * 0.45); ctx.lineTo(head.x + hr * 0.95, head.y + hr * 0.45); ctx.fill();
    ctx.strokeStyle = '#140e0a'; ctx.lineWidth = 0.35 * sz;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(head.x + hr * (0.1 + i * 0.2), head.y + hr * 0.62); ctx.lineTo(head.x + hr * (0.1 + i * 0.2), head.y + hr * 0.9); ctx.stroke(); }
  } else {
    // Gesicht im Profil: Stirn, Brauenbogen, Nase, Lippen, Kinn, Kiefer
    const face = smoothPath([
      P(head.x - hr * 0.95, head.y - hr * 0.2),
      P(head.x - hr * 0.55, head.y - hr * 1.0),
      P(head.x + hr * 0.45, head.y - hr * 1.02),
      P(head.x + hr * 0.86, head.y - hr * 0.42),
      P(head.x + hr * 0.84, head.y - hr * 0.14, true),   // Brauenbogen
      P(head.x + hr * 1.22, head.y + hr * 0.3, true),    // Nasenspitze
      P(head.x + hr * 0.92, head.y + hr * 0.42, true),
      P(head.x + hr * 0.98, head.y + hr * 0.62),         // Lippen
      P(head.x + hr * 0.82, head.y + hr * 0.95, true),   // Kinn
      P(head.x + hr * 0.2, head.y + hr * 1.0),
      P(head.x - hr * 0.55, head.y + hr * 0.55),         // Kiefer
    ]);
    cel(ctx, face, c.skin, c.skinShade, 0.7 * sz, -0.3 * sz, c.skinL);
    // Augenhöhle / Brauenschatten
    ctx.fillStyle = 'rgba(40,20,40,0.28)';
    ctx.beginPath(); ctx.ellipse(head.x + hr * 0.5, head.y - hr * 0.08, hr * 0.34, hr * 0.2, 0, 0, TAU); ctx.fill();
    // Braue
    ctx.strokeStyle = c.hairShade || '#2a1a14'; ctx.lineWidth = 0.45 * sz;
    ctx.beginPath(); ctx.moveTo(head.x + hr * 0.28, head.y - hr * 0.36); ctx.lineTo(head.x + hr * 0.84, head.y - hr * 0.2); ctx.stroke();
    // Mund
    ctx.strokeStyle = 'rgba(90,30,40,0.7)'; ctx.lineWidth = 0.3 * sz;
    ctx.beginPath(); ctx.moveTo(head.x + hr * 0.95, head.y + hr * 0.6); ctx.lineTo(head.x + hr * 0.7, head.y + hr * 0.62); ctx.stroke();
    if (c.ears) {
      // Spitzes Vampirohr
      const ear = smoothPath([P(head.x - hr * 0.1, head.y - hr * 0.05), P(head.x - hr * 0.75, head.y - hr * 0.55, true), P(head.x - hr * 0.35, head.y + hr * 0.45)]);
      cel(ctx, ear, c.skin, c.skinShade, 0.3, -0.2);
      // Eckzahn
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(head.x + hr * 0.78, head.y + hr * 0.62); ctx.lineTo(head.x + hr * 0.86, head.y + hr * 0.62); ctx.lineTo(head.x + hr * 0.8, head.y + hr * 0.82); ctx.fill();
    }
  }

  drawHeadwear(ctx, head, hr, c, sz);

  // Frisur vorn
  if (c.hairStyle === 'lord' || c.hairStyle === 'braid') {
    // Oberkopf mit Scheitel, Pony-Strähnen, seitlich herabfallende Strähnen
    const top = smoothPath([
      P(head.x + hr * 1.0, head.y - hr * 0.3, true),
      P(head.x + hr * 0.7, head.y - hr * 1.25),
      P(head.x - hr * 0.4, head.y - hr * 1.35),
      P(head.x - hr * 1.3, head.y - hr * 0.7),
      P(head.x - hr * 1.2, head.y + hr * 0.4),
      P(head.x - hr * 0.35, head.y + hr * 0.1),
      P(head.x + hr * 0.15, head.y - hr * 0.55, true),
      P(head.x + hr * 0.45, head.y - hr * 0.15, true),   // Strähne
      P(head.x + hr * 0.62, head.y - hr * 0.62, true),
    ]);
    cel(ctx, top, c.hair, c.hairShade, 0.6 * sz, -0.5 * sz, c.hairL);
    // Stirnsträhne, die übers Auge fällt
    const lock = smoothPath([P(head.x + hr * 0.55, head.y - hr * 0.9), P(head.x + hr * 1.05, head.y - hr * 0.2), P(head.x + hr * 0.78, head.y + hr * 0.7, true), P(head.x + hr * 0.52, head.y - hr * 0.3)]);
    cel(ctx, lock, c.hair, c.hairShade, 0.3, -0.3);
    // Strähnenlinien
    ctx.strokeStyle = c.hairShade; ctx.lineWidth = 0.3 * sz;
    ctx.beginPath();
    ctx.moveTo(head.x + hr * 0.2, head.y - hr * 1.1); ctx.quadraticCurveTo(head.x - hr * 0.6, head.y - hr * 0.8, head.x - hr * 0.9, head.y + hr * 0.2);
    ctx.moveTo(head.x - hr * 0.2, head.y - hr * 1.25); ctx.quadraticCurveTo(head.x - hr * 1.0, head.y - hr * 0.9, head.x - hr * 1.15, head.y - hr * 0.1);
    ctx.stroke();
  } else if (c.hairStyle === 'short') {
    const top = smoothPath([
      P(head.x + hr * 0.95, head.y - hr * 0.45, true), P(head.x + hr * 0.7, head.y - hr * 1.2),
      P(head.x - hr * 0.3, head.y - hr * 1.32), P(head.x - hr * 1.12, head.y - hr * 0.6),
      P(head.x - hr * 1.0, head.y + hr * 0.3, true), P(head.x - hr * 0.55, head.y + hr * 0.05),
      P(head.x - hr * 0.2, head.y - hr * 0.55), P(head.x + hr * 0.4, head.y - hr * 0.72, true),
    ]);
    cel(ctx, top, c.hair, c.hairShade, 0.4 * sz, -0.4 * sz, c.hairL);
    // Graue Schläfe
    ctx.fillStyle = 'rgba(200,190,180,0.55)';
    ctx.beginPath(); ctx.ellipse(head.x - hr * 0.55, head.y - hr * 0.05, hr * 0.22, hr * 0.3, 0, 0, TAU); ctx.fill();
  } else if (c.hairStyle === 'bald' && c.mustache) {
    // Opa Egons weißer Schnurrbart und Haarkranz
    const ring = smoothPath([P(head.x - hr * 0.2, head.y - hr * 0.2), P(head.x - hr * 1.05, head.y - hr * 0.5), P(head.x - hr * 1.0, head.y + hr * 0.5), P(head.x - hr * 0.4, head.y + hr * 0.4)]);
    cel(ctx, ring, c.hair, c.hairShade, 0.3, -0.3);
    const m = smoothPath([P(head.x + hr * 0.7, head.y + hr * 0.42), P(head.x + hr * 1.3, head.y + hr * 0.5), P(head.x + hr * 1.35, head.y + hr * 0.9, true), P(head.x + hr * 0.9, head.y + hr * 0.62), P(head.x + hr * 0.5, head.y + hr * 0.75, true)]);
    cel(ctx, m, c.hair, c.hairShade, 0.3, -0.3);
    // Buschige Braue
    ctx.fillStyle = c.hair;
    ctx.fillRect(head.x + hr * 0.3, head.y - hr * 0.42, hr * 0.62, hr * 0.2);
  } else if (c.hairStyle === 'bald' && c.beard) {
    const beard = smoothPath([P(head.x + hr * 0.95, head.y + hr * 0.35), P(head.x + hr * 0.95, head.y + hr * 2.4), P(head.x + hr * 0.1, head.y + hr * 3.0, true), P(head.x - hr * 0.3, head.y + hr * 1.3), P(head.x - hr * 0.2, head.y + hr * 0.4)]);
    cel(ctx, beard, c.hair, c.hairShade, 0.5, -0.4);
  }

  // Hochgezogene Brauen (Matthias' skeptischer Blick)
  if (c.brows === 'raised') {
    ctx.strokeStyle = c.hairShade; ctx.lineWidth = 0.42 * sz; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(head.x + hr * 0.3, head.y - hr * 0.4); ctx.quadraticCurveTo(head.x + hr * 0.6, head.y - hr * 0.62, head.x + hr * 0.88, head.y - hr * 0.42); ctx.stroke();
  }
  // Augen
  if (c.eyes && c.headwear !== 'visor' && c.headwear !== 'goggles' && c.headwear !== 'skull') {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(head.x + hr * 0.56, head.y - hr * 0.06, hr * 0.24, hr * 0.15, -0.1, 0, TAU); ctx.fill();
    ctx.fillStyle = c.eyes;
    ctx.beginPath(); ctx.ellipse(head.x + hr * 0.62, head.y - hr * 0.06, hr * 0.14, hr * 0.14, 0, 0, TAU); ctx.fill();
  } else if (!['hood', 'helmet', 'visor', 'mask', 'skull', 'goggles'].includes(c.headwear)) {
    ctx.fillStyle = '#1a1210';
    ctx.beginPath(); ctx.ellipse(head.x + hr * 0.55, head.y - hr * 0.06, hr * 0.13, hr * 0.13, 0, 0, TAU); ctx.fill();
  }
  // Runde Brille (Ines)
  if (c.glasses) {
    ctx.strokeStyle = c.glasses; ctx.lineWidth = 0.38 * sz;
    ctx.fillStyle = 'rgba(220,235,255,0.22)';
    ctx.beginPath(); ctx.arc(head.x + hr * 0.6, head.y - hr * 0.06, hr * 0.33, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(head.x + hr * 0.27, head.y - hr * 0.1); ctx.lineTo(head.x - hr * 0.35, head.y - hr * 0.2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(head.x + hr * 0.62, head.y - hr * 0.26, hr * 0.12, hr * 0.08);
  }
  // Tropfenförmige Ohrringe
  if (c.earrings) {
    ctx.strokeStyle = '#c8c0d0'; ctx.lineWidth = 0.2 * sz;
    ctx.beginPath(); ctx.moveTo(head.x - hr * 0.3, head.y + hr * 0.35); ctx.lineTo(head.x - hr * 0.3, head.y + hr * 0.75); ctx.stroke();
    ctx.fillStyle = 'rgba(230,240,255,0.9)';
    ctx.beginPath(); ctx.moveTo(head.x - hr * 0.3, head.y + hr * 0.7); ctx.lineTo(head.x - hr * 0.16, head.y + hr * 1.0); ctx.lineTo(head.x - hr * 0.3, head.y + hr * 1.18); ctx.lineTo(head.x - hr * 0.44, head.y + hr * 1.0); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function drawHeadwear(ctx, head, hr, c, sz) {
  switch (c.headwear) {
    case 'hood': {
      const hood = smoothPath([
        P(head.x + hr * 1.0, head.y + hr * 1.0, true), P(head.x + hr * 1.35, head.y - hr * 0.4),
        P(head.x + hr * 0.6, head.y - hr * 1.5), P(head.x - hr * 0.7, head.y - hr * 1.5, true),
        P(head.x - hr * 1.7, head.y - hr * 0.2), P(head.x - hr * 1.5, head.y + hr * 1.6, true),
        P(head.x - hr * 0.2, head.y + hr * 0.7), P(head.x + hr * 0.2, head.y - hr * 0.5), P(head.x + hr * 0.75, head.y + hr * 0.5),
      ]);
      cel(ctx, hood, c.coat, c.coatShade, 0.8, -0.6, c.coatL);
      ctx.fillStyle = 'rgba(10,6,10,0.55)';
      ctx.beginPath(); ctx.ellipse(head.x + hr * 0.45, head.y - hr * 0.05, hr * 0.62, hr * 0.62, 0, 0, TAU); ctx.fill();
      if (c.eyes) {
        ctx.fillStyle = c.eyes;
        ctx.beginPath(); ctx.arc(head.x + hr * 0.62, head.y - hr * 0.08, hr * 0.13, 0, TAU); ctx.fill();
      }
      break;
    }
    case 'tonsure': {
      const t = new Path2D();
      t.arc(head.x - hr * 0.05, head.y - hr * 0.1, hr * 1.04, Math.PI * 0.85, Math.PI * 1.72);
      t.lineTo(head.x - hr * 0.05, head.y - hr * 0.1); t.closePath();
      cel(ctx, t, '#6a4a34', '#44301f', 0.3, -0.3);
      break;
    }
    case 'hat': {
      const crown = smoothPath([P(head.x - hr * 1.0, head.y - hr * 0.6, true), P(head.x - hr * 0.8, head.y - hr * 2.0, true), P(head.x + hr * 0.9, head.y - hr * 1.9, true), P(head.x + hr * 1.1, head.y - hr * 0.6, true)]);
      cel(ctx, crown, '#2e2218', '#18100a', 0.6, -0.4);
      const brim = new Path2D(); brim.ellipse(head.x + hr * 0.15, head.y - hr * 0.55, hr * 2.3, hr * 0.44, -0.08, 0, TAU);
      cel(ctx, brim, '#2e2218', '#18100a', 0.4, -0.5, '#5a4432');
      ctx.fillStyle = c.trim;
      ctx.fillRect(head.x - hr * 0.95, head.y - hr * 0.98, hr * 2.05, hr * 0.3);
      // Feder am Hut
      ctx.strokeStyle = '#e8e0d0'; ctx.lineWidth = 0.9 * sz;
      ctx.beginPath(); ctx.moveTo(head.x - hr * 0.6, head.y - hr * 1.0); ctx.quadraticCurveTo(head.x - hr * 2.2, head.y - hr * 2.2, head.x - hr * 2.6, head.y - hr * 1.2); ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.42)';
      ctx.fillRect(head.x - hr * 0.1, head.y - hr * 0.35, hr * 1.2, hr * 0.5);
      break;
    }
    case 'helmet':
    case 'visor': {
      const hp = smoothPath([
        P(head.x - hr * 1.1, head.y + hr * 1.05, true), P(head.x - hr * 1.2, head.y - hr * 0.3),
        P(head.x - hr * 0.3, head.y - hr * 1.35), P(head.x + hr * 0.9, head.y - hr * 0.9),
        P(head.x + hr * 1.25, head.y + hr * 0.2), P(head.x + hr * 1.1, head.y + hr * 1.05, true),
      ]);
      cel(ctx, hp, c.coat, c.coatShade, 0.8, -0.7, c.coatL);
      ctx.fillStyle = c.headwear === 'visor' ? c.eyes : '#0a0a10';
      ctx.fillRect(head.x + hr * 0.1, head.y - hr * 0.12, hr * 1.1, hr * 0.28);
      ctx.strokeStyle = c.trim; ctx.lineWidth = 0.5 * sz;
      ctx.beginPath(); ctx.moveTo(head.x - hr * 0.3, head.y - hr * 1.3); ctx.lineTo(head.x - hr * 0.1, head.y + hr * 1.0); ctx.stroke();
      if (c.headwear === 'helmet') {
        const plume = smoothPath([P(head.x - hr * 0.4, head.y - hr * 1.25), P(head.x - hr * 2.0, head.y - hr * 2.3), P(head.x - hr * 3.2, head.y + hr * 0.6, true), P(head.x - hr * 1.7, head.y - hr * 0.8), P(head.x + hr * 0.2, head.y - hr * 1.2)]);
        cel(ctx, plume, '#e8243a', '#9a1022', 0.5, -0.5);
      }
      break;
    }
    case 'mask': {
      const mk = new Path2D(); mk.ellipse(head.x + hr * 0.3, head.y, hr * 0.78, hr * 0.98, 0, 0, TAU);
      cel(ctx, mk, c.trim, c.trimShade, 0.5, -0.5, '#fff4c0');
      ctx.fillStyle = '#1a0a04';
      ctx.fillRect(head.x + hr * 0.4, head.y - hr * 0.18, hr * 0.5, hr * 0.14);
      const cowl = smoothPath([P(head.x + hr * 0.95, head.y + hr * 1.1, true), P(head.x + hr * 1.0, head.y - hr * 2.3, true), P(head.x - hr * 0.7, head.y - hr * 1.9), P(head.x - hr * 1.7, head.y - hr * 0.3), P(head.x - hr * 1.3, head.y + hr * 1.5, true), P(head.x - hr * 0.35, head.y + hr * 0.2), P(head.x + hr * 0.2, head.y - hr * 0.95)]);
      cel(ctx, cowl, c.coat, c.coatShade, 0.6, -0.6, c.coatL);
      break;
    }
    case 'veil': {
      const v = smoothPath([P(head.x + hr * 0.75, head.y - hr * 0.7), P(head.x, head.y - hr * 1.55), P(head.x - hr * 1.2, head.y - hr * 0.6), P(head.x - hr * 2.2, head.y + hr * 3.0, true), P(head.x - hr * 0.4, head.y + hr * 1.3)]);
      cel(ctx, v, c.coat, c.coatShade, 0.6, -0.5, c.coatL);
      ctx.fillStyle = c.trim;
      ctx.fillRect(head.x - hr * 0.7, head.y - hr * 1.0, hr * 1.5, hr * 0.3);
      break;
    }
    case 'goggles': {
      const cap = new Path2D(); cap.arc(head.x - hr * 0.1, head.y - hr * 0.55, hr * 1.02, Math.PI, 0); cap.closePath();
      cel(ctx, cap, '#8a8680', '#4a4640', 0.5, -0.5);
      ctx.fillStyle = '#3a2a14';
      ctx.fillRect(head.x - hr * 1.0, head.y - hr * 0.45, hr * 2.1, hr * 0.55);
      ctx.fillStyle = c.eyes;
      ctx.beginPath(); ctx.arc(head.x + hr * 0.55, head.y - hr * 0.18, hr * 0.42, 0, TAU); ctx.fill();
      ctx.strokeStyle = c.trim; ctx.lineWidth = 0.5 * sz;
      ctx.beginPath(); ctx.arc(head.x + hr * 0.55, head.y - hr * 0.18, hr * 0.46, 0, TAU); ctx.stroke();
      break;
    }
    case 'circlet': {
      ctx.fillStyle = c.trim;
      ctx.fillRect(head.x - hr * 0.8, head.y - hr * 0.8, hr * 1.75, hr * 0.26);
      ctx.beginPath(); ctx.moveTo(head.x + hr * 0.1, head.y - hr * 0.8); ctx.lineTo(head.x + hr * 0.35, head.y - hr * 1.5); ctx.lineTo(head.x + hr * 0.6, head.y - hr * 0.8); ctx.fill();
      break;
    }
    case 'bun': {
      // Grauer Dutt – Oma Renate
      const hairTop = smoothPath([P(head.x + hr * 0.9, head.y - hr * 0.3), P(head.x + hr * 0.4, head.y - hr * 1.15), P(head.x - hr * 0.8, head.y - hr * 1.0), P(head.x - hr * 1.1, head.y + hr * 0.3), P(head.x - hr * 0.3, head.y - hr * 0.1)]);
      cel(ctx, hairTop, c.hair, c.hairShade, 0.4, -0.4);
      const bun = new Path2D(); bun.arc(head.x - hr * 0.9, head.y - hr * 0.95, hr * 0.62, 0, TAU);
      cel(ctx, bun, c.hair, c.hairShade, 0.3, -0.3);
      break;
    }
    case 'messy': {
      const m = smoothPath([P(head.x + hr * 0.8, head.y - hr * 0.3, true), P(head.x + hr * 0.3, head.y - hr * 1.3), P(head.x - hr * 0.9, head.y - hr * 1.1, true), P(head.x - hr * 1.2, head.y + hr * 0.4, true), P(head.x - hr * 0.4, head.y - hr * 0.2), P(head.x + hr * 0.3, head.y - hr * 0.6, true)]);
      cel(ctx, m, '#5a3a24', '#3a2414', 0.4, -0.4);
      break;
    }
    default: break;
  }
}

function drawHairChain(ctx, hair, x, y, facing, c, sz) {
  // Kette liegt in Weltkoordinaten – zurückrechnen in lokale.
  ctx.save();
  ctx.scale(facing, 1);
  ctx.translate(-x * facing, -y);
  const pts = hair.pts;
  const n = pts.length;
  // Band aus der Kette: breit am Kopf, spitz auslaufend, zwei Strähnen
  for (const [off, col, wmul] of [[0, c.hairShade, 1.0], [-0.8, c.hair, 0.62]]) {
    const L = [], R = [];
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[Math.min(n - 1, i + 1)], o = pts[Math.max(0, i - 1)];
      let dx = q.x - o.x, dy = q.y - o.y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      const w = (3.4 - i * 0.62) * sz * wmul;
      L.push(P(p.x - dy * w + off * 0.3, p.y + dx * w + off));
      R.push(P(p.x + dy * w + off * 0.3, p.y - dx * w + off));
    }
    const tip = pts[n - 1];
    const path = smoothPath([...L, P(tip.x, tip.y + 1.5 * sz, true), ...R.reverse()]);
    cel(ctx, path, col, shadeColor(col, 0.78), 0.5, -0.4, null, off === 0);
  }
  ctx.restore();
}

/** Umhang: Kette von der Schulter; Außenseite dunkel, Futter blutrot. */
function drawCape(ctx, cape, c, facing, sz) {
  const pts = cape.pts;
  const n = pts.length;
  const outer = c.capeColor || c.coat;
  const outerS = c.capeShade || c.coatShade;
  const inner = c.liningColor || c.lining || '#8a0a1e';
  const innerS = c.liningShade || shadeColor(inner, 0.6);
  const left = [], right = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[Math.min(n - 1, i + 1)], o = pts[Math.max(0, i - 1)];
    let dx = q.x - o.x, dy = q.y - o.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    // Schmal an den Schultern, nach unten ausgestellt – aber kein Segel.
    const w = (2.8 + i * 0.72) * sz;
    left.push({ x: p.x - dy * w, y: p.y + dx * w });
    right.push({ x: p.x + dy * w, y: p.y - dx * w });
  }
  // Futter (innen)
  const lin = [];
  for (let i = 0; i < n; i++) lin.push(P(left[i].x, left[i].y));
  for (let i = n - 1; i >= 0; i--) lin.push(P(pts[i].x + (right[i].x - pts[i].x) * 0.15, pts[i].y + (right[i].y - pts[i].y) * 0.15));
  cel(ctx, smoothPath(lin), inner, innerS, 0.8 * facing, -0.6, '#ff5a70');
  // Außenseite mit gezacktem Saum
  const out = [];
  for (let i = 0; i < n; i++) out.push(P(right[i].x, right[i].y));
  const last = pts[n - 1];
  const lx = left[n - 1].x, ly = left[n - 1].y;
  out.push(P(last.x + (right[n - 1].x - last.x) * 0.35, last.y + 3.0 * sz, true));
  out.push(P(last.x, last.y - 0.5 * sz, true));
  out.push(P((lx + last.x) / 2, last.y + 2.4 * sz, true));
  out.push(P(lx * 0.8 + last.x * 0.2, ly - 1.2 * sz, true));
  for (let i = n - 1; i >= 0; i--) out.push(P(pts[i].x + (left[i].x - pts[i].x) * 0.55, pts[i].y + (left[i].y - pts[i].y) * 0.55));
  cel(ctx, smoothPath(out), outer, outerS, 1.0 * facing, -0.8, c.coatL);
  // Goldkante am Saum
  ctx.strokeStyle = c.trim || '#c9a040';
  ctx.lineWidth = 0.55 * sz;
  ctx.beginPath();
  ctx.moveTo(right[n - 1].x, right[n - 1].y);
  ctx.lineTo(last.x + (right[n - 1].x - last.x) * 0.35, last.y + 3.0 * sz);
  ctx.lineTo(last.x, last.y - 0.5 * sz);
  ctx.lineTo((lx + last.x) / 2, last.y + 2.4 * sz);
  ctx.stroke();
}

// --- Waffen -----------------------------------------------------------------

function drawWeapon(ctx, arm, c, pose, sz, extra) {
  const h = arm.hand;
  const a = arm.angle;
  ctx.save();
  ctx.translate(h.x, h.y);
  switch (c.weapon) {
    case 'stake': {
      ctx.rotate(-a + Math.PI * 0.55);
      const p = new Path2D(); p.rect(-1.0 * sz, -2 * sz, 2.0 * sz, 11 * sz); p.moveTo(-1.0 * sz, 9 * sz); p.lineTo(0, 12.5 * sz); p.lineTo(1.0 * sz, 9 * sz);
      cel(ctx, p, '#8a6238', '#5a3c1e', 0.4, 0);
      break;
    }
    case 'bone': {
      ctx.rotate(-a + Math.PI * 0.6);
      const p = new Path2D(); p.rect(-0.8 * sz, -1 * sz, 1.6 * sz, 10 * sz); p.arc(-0.9 * sz, 9 * sz, 1.4 * sz, 0, TAU); p.moveTo(2.2 * sz, 9 * sz); p.arc(0.9 * sz, 9 * sz, 1.4 * sz, 0, TAU);
      cel(ctx, p, c.skin, c.skinShade, 0.3, 0);
      break;
    }
    case 'censer': {
      const swing = Math.sin((extra.t || 0) * 3) * 0.6;
      ctx.rotate(swing);
      ctx.strokeStyle = '#8a7a50'; ctx.lineWidth = 0.6 * sz;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 8 * sz); ctx.stroke();
      const p = new Path2D(); p.arc(0, 10.5 * sz, 2.8 * sz, 0, TAU);
      cel(ctx, p, c.trim, c.trimShade, 0.6, -0.5, '#fff0b0');
      ctx.fillStyle = c.trimShade; ctx.fillRect(-2.8 * sz, 10 * sz, 5.6 * sz, 0.8 * sz);
      break;
    }
    case 'crossbow': {
      ctx.rotate(-a + Math.PI / 2);
      const st = new Path2D(); st.rect(-1 * sz, -1.1 * sz, 12 * sz, 2.2 * sz);
      cel(ctx, st, '#6a4428', '#3a2414', 0, 0.4);
      ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 1.3 * sz;
      ctx.beginPath(); ctx.arc(10 * sz, 0, 5 * sz, -1.2, 1.2); ctx.stroke();
      ctx.strokeStyle = '#e0d8c8'; ctx.lineWidth = 0.4 * sz;
      ctx.beginPath(); ctx.moveTo(10 * sz + Math.cos(-1.2) * 5 * sz, Math.sin(-1.2) * 5 * sz); ctx.lineTo(4 * sz, 0); ctx.lineTo(10 * sz + Math.cos(1.2) * 5 * sz, Math.sin(1.2) * 5 * sz); ctx.stroke();
      ctx.fillStyle = '#eef2ff'; ctx.fillRect(4 * sz, -0.45 * sz, 9 * sz, 0.9 * sz);
      break;
    }
    case 'sword':
    case 'greatsword': {
      const big = c.weapon === 'greatsword';
      ctx.rotate(-a + Math.PI / 2 + (pose.weaponAngle || 0) * 0.15);
      ctx.fillStyle = '#3a3040'; ctx.fillRect(-2.2 * sz, -1.6 * sz, 2.6 * sz, 3.2 * sz);
      const guard = new Path2D(); guard.rect(0, -3.4 * sz, 1.5 * sz, 6.8 * sz);
      cel(ctx, guard, c.trim, c.trimShade, 0.3, -0.3);
      const len = (big ? 24 : 14) * sz;
      const bl = new Path2D();
      bl.moveTo(1.5 * sz, -(big ? 1.9 : 1.3) * sz); bl.lineTo(len, -0.4 * sz); bl.lineTo(len + 2.2 * sz, 0); bl.lineTo(len, 0.4 * sz); bl.lineTo(1.5 * sz, (big ? 1.9 : 1.3) * sz); bl.closePath();
      cel(ctx, bl, '#e8ecf8', '#8a90a4', 0, -0.5, '#ffffff');
      ctx.strokeStyle = 'rgba(80,90,120,0.6)'; ctx.lineWidth = 0.3 * sz;
      ctx.beginPath(); ctx.moveTo(2 * sz, 0); ctx.lineTo(len - 1 * sz, 0); ctx.stroke();
      break;
    }
    case 'staff': {
      ctx.rotate(-a + Math.PI * 0.62);
      const sh = new Path2D(); sh.rect(-0.9 * sz, -12 * sz, 1.8 * sz, 26 * sz);
      cel(ctx, sh, '#6a5038', '#3a2a1c', 0.4, 0);
      const orb = new Path2D(); orb.arc(0, -13.4 * sz, 2.5 * sz, 0, TAU);
      cel(ctx, orb, c.trim, c.trimShade, 0.5, -0.5, '#fff4c0');
      ctx.strokeStyle = c.trim; ctx.lineWidth = 0.8 * sz;
      for (let i = 0; i < 8; i++) {
        const aa = (i / 8) * TAU;
        ctx.beginPath(); ctx.moveTo(Math.cos(aa) * 2.8 * sz, -13.4 * sz + Math.sin(aa) * 2.8 * sz); ctx.lineTo(Math.cos(aa) * 4.8 * sz, -13.4 * sz + Math.sin(aa) * 4.8 * sz); ctx.stroke();
      }
      break;
    }
    case 'spear': {
      ctx.rotate(-a + Math.PI / 2 + (pose.weaponAngle || 0) * 0.2);
      const sh = new Path2D(); sh.rect(-8 * sz, -0.75 * sz, 26 * sz, 1.5 * sz);
      cel(ctx, sh, '#7a5838', '#4a321c', 0, 0.4);
      const tip = new Path2D(); tip.moveTo(18 * sz, -2 * sz); tip.lineTo(25 * sz, 0); tip.lineTo(18 * sz, 2 * sz); tip.closePath();
      cel(ctx, tip, '#e8ecf8', '#8a90a4', 0, -0.4, '#ffffff');
      break;
    }
    case 'book': {
      ctx.rotate(0.2);
      const bk = new Path2D(); bk.rect(-1 * sz, -3 * sz, 7 * sz, 5 * sz);
      cel(ctx, bk, '#7a2218', '#4a120c', 0.4, -0.4);
      ctx.fillStyle = '#f0e4c8'; ctx.fillRect(-0.5 * sz, -2.6 * sz, 6 * sz, 1 * sz);
      ctx.fillStyle = c.trim; ctx.fillRect(2 * sz, -1.4 * sz, 2 * sz, 2 * sz);
      break;
    }
    case 'pencil': {
      // Gelb-schwarz gestreifter Bleistift – ein Gruß vom Küchentisch
      ctx.rotate(-a + Math.PI * 0.35);
      for (let k = 0; k < 5; k++) { ctx.fillStyle = k % 2 ? '#1a1a1a' : '#f0c820'; ctx.fillRect(-0.45 * sz, -1 * sz + k * 1.6 * sz, 0.9 * sz, 1.6 * sz); }
      ctx.fillStyle = '#e8c89a';
      ctx.beginPath(); ctx.moveTo(-0.45 * sz, 7 * sz); ctx.lineTo(0.45 * sz, 7 * sz); ctx.lineTo(0, 8.6 * sz); ctx.fill();
      ctx.fillStyle = '#333'; ctx.beginPath(); ctx.moveTo(-0.15 * sz, 8.1 * sz); ctx.lineTo(0.15 * sz, 8.1 * sz); ctx.lineTo(0, 8.6 * sz); ctx.fill();
      break;
    }
    case 'papers': {
      ctx.rotate(0.15);
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = k === 2 ? '#fbf6ea' : '#e8e0cc';
        ctx.fillRect(-1 * sz + k * 0.4 * sz, -4 * sz + k * 0.3 * sz, 6 * sz, 7.5 * sz);
      }
      ctx.fillStyle = 'rgba(60,50,40,0.6)';
      for (let k = 0; k < 5; k++) ctx.fillRect(0.2 * sz, -3 * sz + k * 1.3 * sz, 4.4 * sz, 0.35 * sz);
      break;
    }
    case 'lantern': {
      // Opa Egons Laterne – sein Licht führt durch die Sargreise
      ctx.strokeStyle = '#3a3030'; ctx.lineWidth = 0.5 * sz;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 3 * sz); ctx.stroke();
      const lb = new Path2D(); lb.rect(-2 * sz, 3 * sz, 4 * sz, 5 * sz);
      cel(ctx, lb, '#4a3a2a', '#2a2018', 0.3, -0.3);
      ctx.fillStyle = '#ffd070'; ctx.fillRect(-1.3 * sz, 3.8 * sz, 2.6 * sz, 3.4 * sz);
      ctx.fillStyle = '#3a3030'; ctx.fillRect(-2.6 * sz, 2.6 * sz, 5.2 * sz, 0.8 * sz);
      break;
    }
    case 'wrench': {
      ctx.rotate(-a + Math.PI * 0.6);
      const w = new Path2D(); w.rect(-1.1 * sz, -1 * sz, 2.2 * sz, 14 * sz); w.moveTo(3.2 * sz, 14 * sz); w.arc(0, 14 * sz, 3.2 * sz, 0, TAU);
      cel(ctx, w, '#a89a80', '#6a5e48', 0.4, -0.3);
      ctx.fillStyle = '#20160a'; ctx.fillRect(-1 * sz, 14 * sz, 2 * sz, 4 * sz);
      break;
    }
    default: break;
  }
  ctx.restore();
}

function drawShield(ctx, rig, c, sz, extra) {
  if (extra.shieldBroken) return;
  const x = rig.shoulder.x + 4.5 * sz, y = (rig.shoulder.y + rig.hip.y) / 2 + 1 * sz;
  const p = smoothPath([
    P(x - 3.6 * sz, y - 7.2 * sz, true), P(x + 3.6 * sz, y - 7.2 * sz, true), P(x + 3.6 * sz, y + 2 * sz),
    P(x, y + 9.4 * sz, true), P(x - 3.6 * sz, y + 2 * sz),
  ]);
  cel(ctx, p, '#dfe3f0', '#7e8498', 0.9, -0.7, '#ffffff');
  ctx.strokeStyle = c.trim; ctx.lineWidth = 0.7 * sz; ctx.stroke(p);
  ctx.fillStyle = c.trim;
  ctx.beginPath(); ctx.arc(x, y - 1 * sz, 1.9 * sz, 0, TAU); ctx.fill();
  ctx.strokeStyle = c.trim; ctx.lineWidth = 0.55 * sz;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 2.5 * sz, y - 1 * sz + Math.sin(a) * 2.5 * sz); ctx.lineTo(x + Math.cos(a) * 3.4 * sz, y - 1 * sz + Math.sin(a) * 3.4 * sz); ctx.stroke();
  }
}

/** Leuchtende Augen (Emissive-Durchgang). Nimmt das Rig aus drawHumanoid. */
export function drawEyesGlow(ctx, x, y, facing, rig, color, isGlow, sz = 1) {
  if (!rig) return;
  const hr = rig.hr;
  const ex = x + facing * (rig.head.x + hr * 0.62);
  const ey = y + rig.head.y - hr * 0.06;
  ctx.fillStyle = color;
  if (isGlow) {
    ctx.beginPath(); ctx.arc(ex, ey, 3.4 * sz, 0, TAU); ctx.fill();
  } else {
    ctx.beginPath(); ctx.ellipse(ex, ey, hr * 0.16, hr * 0.14, 0, 0, TAU); ctx.fill();
  }
}

/** Farbe (#rrggbb oder rgb()) aufhellen/abdunkeln. */
export function shadeColor(col, f) {
  if (!col) return col;
  let r, g, b;
  if (col[0] === '#') {
    const n = parseInt(col.slice(1, 7), 16);
    r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255;
  } else {
    const m = col.match(/rgba?\(([^)]+)\)/);
    if (!m) return col;
    [r, g, b] = m[1].split(',').map((v) => parseFloat(v));
  }
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}
