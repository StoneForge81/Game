// Gemalte Kulissen im Gegenlicht-Stil.
//
// Leitidee (wie bei modernen 2D-Actionspielen): Der Hintergrund ist HELL und
// farbstark, mit einer dominanten Farbe pro Gebiet. Große, fließende Formen
// (Nebel-, Rauch-, Flammenbänder) mit leuchtenden Kanten. Davor stehen Welt
// und Figuren als dunkle, kontrastreiche Silhouetten.
//
// Aufbau von hinten nach vorn:
//   Himmel (Verlauf) → Scheibe (Mond/Sonne/Rosette) → ferne Silhouette →
//   Bänder (animiert) → mittlere Silhouette → Bänder → nahe Silhouette

import { VIEW_W, VIEW_H } from '../data/config.js';
import { makeCanvas } from './renderer.js';
import { makeRng, TAU } from '../core/math.js';

const LAYER_W = 960; // WE, Wiederholungsbreite statischer Ebenen

export class Backgrounds {
  constructor(zone, scale) {
    this.zone = zone;
    this.scale = scale;
    this.time = 0;
    this.theme = THEMES[zone.bg] || THEMES.crypt;
    this._build();
  }

  setScale(s) {
    if (s === this.scale) return;
    this.scale = s;
    this._build();
  }

  /** Farbe der Schwebeteilchen (Glut, Staub, Geisterlicht) – für das Spiel. */
  get motes() { return this.theme.motes; }

  _build() {
    const rng = makeRng(this.zone.seed * 7 + 3);
    this.layers = this.theme.layers.map((L) => {
      const c = makeCanvas(LAYER_W * this.scale, L.h * this.scale);
      const ctx = c.getContext('2d');
      ctx.scale(this.scale, this.scale);
      L.paint(ctx, LAYER_W, L.h, rng);
      return { canvas: c, par: L.par, h: L.h, lift: L.lift ?? 0 };
    });
  }

  draw(r, camX, camY, levelH, dt) {
    this.time += dt;
    const th = this.theme;
    const t = this.time;
    const progress = levelH > VIEW_H ? Math.min(1, Math.max(0, camY / (levelH - VIEW_H))) : 0.5;

    r.backgroundScreen((ctx) => {
      // Himmel
      const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
      for (const [o, c] of th.sky) g.addColorStop(o, c);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      if (th.rays) drawRays(ctx, th.rays, t);
      if (th.disk) drawDisk(ctx, th.disk, t, camX, progress);
    });

    // Ebenen und Bänder nach Parallaxe sortiert abwechselnd zeichnen.
    const items = [
      ...this.layers.map((L) => ({ kind: 'layer', par: L.par, L })),
      ...th.ribbons.map((R) => ({ kind: 'ribbon', par: R.par, R })),
    ].sort((a, b) => a.par - b.par);

    for (const it of items) {
      if (it.kind === 'layer') {
        const L = it.L;
        const ox = -(((camX * L.par) % LAYER_W) + LAYER_W) % LAYER_W;
        // Senkrecht: tiefer im Level = Ebene rutscht hoch, verankert am Bildrand.
        const oy = VIEW_H - L.h + (1 - progress) * (L.h - VIEW_H) * Math.min(1, L.par * 1.2) * 0.5 + L.lift;
        r.backgroundScreen((ctx) => {
          for (let x = ox; x < VIEW_W; x += LAYER_W) ctx.drawImage(L.canvas, x, oy, LAYER_W, L.h);
        });
      } else {
        r.backgroundScreen((ctx) => drawRibbon(ctx, it.R, t, camX, progress));
      }
    }
  }

  /** Dunst am Boden in der Zonenfarbe – nach dem Teillicht gezeichnet. */
  drawFog(r, camX) {
    const th = this.theme;
    r.backgroundScreen((ctx) => {
      const g = ctx.createLinearGradient(0, VIEW_H * 0.45, 0, VIEW_H);
      g.addColorStop(0, hexA(th.haze, 0));
      g.addColorStop(1, hexA(th.haze, 0.5));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    });
  }
}

// === Malwerkzeuge ============================================================

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Großes, fließendes Band (Nebel, Rauch, Flamme) mit Leuchtkante und Fließlinien. */
function drawRibbon(ctx, R, t, camX, progress) {
  const ox = camX * R.par;
  const baseY = VIEW_H * R.y + (1 - progress) * 30 * R.par;
  const top = [], bot = [];
  const step = 8;
  for (let x = -40; x <= VIEW_W + 40; x += step) {
    const wx = x + ox;
    const ph = wx * R.freq + R.phase;
    const y = baseY
      + Math.sin(ph + t * R.speed) * R.amp
      + Math.sin(ph * 2.3 - t * R.speed * 0.7) * R.amp * 0.35
      + (x - VIEW_W / 2) * (R.tilt || 0);
    const w = R.width * (0.55 + 0.45 * Math.sin(wx * R.freq * 0.6 + R.phase * 1.7 + t * R.speed * 0.4));
    top.push([x, y - w / 2]);
    bot.push([x, y + w / 2]);
  }
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(top[0][0], top[0][1]);
    for (let i = 1; i < top.length; i++) ctx.lineTo(top[i][0], top[i][1]);
    for (let i = bot.length - 1; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]);
    ctx.closePath();
  };
  // Schattenkörper
  path();
  ctx.fillStyle = R.shade;
  ctx.fill();
  // Heller Kern, nach oben versetzt (Licht von oben)
  ctx.save();
  path();
  ctx.clip();
  ctx.translate(0, -R.width * 0.18);
  ctx.beginPath();
  ctx.moveTo(top[0][0], top[0][1]);
  for (let i = 1; i < top.length; i++) ctx.lineTo(top[i][0], top[i][1]);
  for (let i = bot.length - 1; i >= 0; i--) ctx.lineTo(bot[i][0], (bot[i][1] + top[i][1]) / 2 + R.width * 0.1);
  ctx.closePath();
  ctx.fillStyle = R.color;
  ctx.fill();
  ctx.restore();
  // Fließlinien – geben dem Band die gemalte Struktur
  ctx.strokeStyle = R.edge;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 0.8;
  for (let k = 1; k <= 2; k++) {
    ctx.beginPath();
    for (let i = 0; i < top.length; i++) {
      const y = top[i][1] + (bot[i][1] - top[i][1]) * (k * 0.28) + Math.sin(i * 0.5 + t * 0.6 + k) * 1.2;
      if (i === 0) ctx.moveTo(top[i][0], y); else ctx.lineTo(top[i][0], y);
    }
    ctx.stroke();
  }
  // Leuchtende Oberkante
  ctx.globalAlpha = 1;
  ctx.strokeStyle = R.edge;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(top[0][0], top[0][1]);
  for (let i = 1; i < top.length; i++) ctx.lineTo(top[i][0], top[i][1]);
  ctx.stroke();
}

/** Lichtstrahlen von oben (Risse in der Decke, Fenster). */
function drawRays(ctx, rays, t) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < rays.count; i++) {
    const x = (i + 0.5) * (VIEW_W / rays.count) + Math.sin(t * 0.2 + i * 2) * 20;
    const a = rays.alpha * (0.6 + 0.4 * Math.sin(t * 0.5 + i * 1.7));
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, hexA(rays.color, a));
    g.addColorStop(1, hexA(rays.color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - 10, 0); ctx.lineTo(x + 14, 0); ctx.lineTo(x + 70, VIEW_H); ctx.lineTo(x + 20, VIEW_H);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Große leuchtende Scheibe: Mond, Sonnenrad, Rosette, Rundfenster, Geisterlicht. */
function drawDisk(ctx, d, t, camX, progress) {
  const x = VIEW_W * d.x - camX * 0.012;
  const y = VIEW_H * d.y + (1 - progress) * 16;
  const r = d.r;
  // Hof
  const halo = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 3);
  halo.addColorStop(0, d.glow);
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);

  ctx.save();
  ctx.translate(x, y);
  if (d.kind === 'gear') {
    // Das Sonnenwerk: eine Sonne mit Zahnkranz, die sich langsam dreht
    ctx.rotate(t * 0.05);
    ctx.fillStyle = d.rim;
    ctx.beginPath();
    const teeth = 24;
    for (let i = 0; i < teeth * 2; i++) {
      const a = (i / (teeth * 2)) * TAU;
      const rr = i % 2 ? r * 1.0 : r * 1.12;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      ctx.lineTo(Math.cos(a + TAU / (teeth * 4)) * rr, Math.sin(a + TAU / (teeth * 4)) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }
  const g = ctx.createRadialGradient(-r * 0.25, -r * 0.25, r * 0.1, 0, 0, r);
  g.addColorStop(0, d.core);
  g.addColorStop(0.7, d.core);
  g.addColorStop(1, d.rim);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, r * (d.kind === 'gear' ? 0.9 : 1), 0, TAU); ctx.fill();

  if (d.kind === 'moon') {
    ctx.fillStyle = d.crater || 'rgba(160,30,20,0.28)';
    for (const [dx, dy, cr] of [[-0.3, -0.2, 0.18], [0.25, 0.28, 0.14], [0.35, -0.35, 0.1], [-0.12, 0.4, 0.12], [0.05, -0.05, 0.07]]) {
      ctx.beginPath(); ctx.arc(dx * r, dy * r, cr * r, 0, TAU); ctx.fill();
    }
  } else if (d.kind === 'rose' || d.kind === 'oculus') {
    // Maßwerk eines Rosettenfensters
    ctx.strokeStyle = d.tracery;
    ctx.lineWidth = 2.2;
    const petals = d.kind === 'rose' ? 12 : 8;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.32, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.98, 0, TAU); ctx.stroke();
    for (let i = 0; i < petals; i++) {
      const a = (i / petals) * TAU;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.32, Math.sin(a) * r * 0.32); ctx.lineTo(Math.cos(a) * r * 0.98, Math.sin(a) * r * 0.98); ctx.stroke();
      if (d.kind === 'rose') {
        ctx.fillStyle = d.petals[i % d.petals.length];
        ctx.globalAlpha = 0.55;
        ctx.beginPath(); ctx.arc(Math.cos(a + TAU / petals / 2) * r * 0.66, Math.sin(a + TAU / petals / 2) * r * 0.66, r * 0.16, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(Math.cos(a + TAU / petals / 2) * r * 0.66, Math.sin(a + TAU / petals / 2) * r * 0.66, r * 0.16, 0, TAU); ctx.stroke();
      }
    }
  } else if (d.kind === 'wisp') {
    // Geisterlicht: pulsierende Ringe
    ctx.strokeStyle = d.rim;
    for (let i = 0; i < 3; i++) {
      const k = ((t * 0.25 + i / 3) % 1);
      ctx.globalAlpha = 1 - k;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, r * (1 + k * 0.9), 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // Wolkenfetzen vor der Scheibe
  if (d.clouds) {
    ctx.fillStyle = d.clouds;
    const drift = (t * 3) % 240;
    for (let i = 0; i < 3; i++) {
      const cx = x - 120 + ((drift + i * 80) % 240);
      ctx.beginPath(); ctx.ellipse(cx, y + r * 0.3 + i * 9, 60, 5, 0, 0, TAU); ctx.fill();
    }
  }
}

/** Gotischer Spitzbogen als Pfad. */
export function gothicArch(ctx, x, y, w, h) {
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + w * 0.5);
  ctx.quadraticCurveTo(x, y, x + w / 2, y - w * 0.25);
  ctx.quadraticCurveTo(x + w, y, x + w, y + w * 0.5);
  ctx.lineTo(x + w, y + h);
}

/** Zahnrad-Form (auch für Deko). */
export function drawGearShape(ctx, x, y, r, color, teeth) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i / (teeth * 2)) * TAU;
    const rr = i % 2 ? r * 0.86 : r;
    const a2 = a + TAU / (teeth * 4);
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    ctx.lineTo(x + Math.cos(a2) * rr, y + Math.sin(a2) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath(); ctx.arc(x, y, r * 0.35, 0, TAU); ctx.fill();
  ctx.restore();
}

/** Gotische Stadt-/Burgsilhouette mit Türmen, Spitzdächern und Fenstern. */
function skyline(ctx, W, H, rng, o) {
  const base = H - o.baseH;
  ctx.fillStyle = o.color;
  ctx.fillRect(0, base, W, H - base);
  let x = 0;
  while (x < W) {
    const bw = rng.range(o.minW, o.maxW);
    const bh = rng.range(o.minH, o.maxH);
    const top = base - bh;
    ctx.fillStyle = o.color;
    ctx.fillRect(x, top, bw, bh + 1);
    // Spitzdach oder Zinnen
    if (rng.chance(o.spire ?? 0.6)) {
      ctx.beginPath();
      ctx.moveTo(x - 3, top + 1);
      ctx.lineTo(x + bw / 2, top - rng.range(bw * 0.8, bw * 1.8));
      ctx.lineTo(x + bw + 3, top + 1);
      ctx.fill();
      // Kreuzblume
      if (o.finial) ctx.fillRect(x + bw / 2 - 0.8, top - bw * 1.9 - 4, 1.6, 6);
    } else {
      for (let cx = x; cx < x + bw - 3; cx += 6) ctx.fillRect(cx, top - 4, 3.5, 4);
    }
    // Kantenlicht auf der Lichtseite
    if (o.edge) {
      ctx.fillStyle = o.edge;
      ctx.fillRect(x + bw - 1.4, top, 1.4, bh);
    }
    // Fenster
    if (o.windows) {
      for (let wy = top + 8; wy < base - 6; wy += rng.range(10, 16)) {
        if (!rng.chance(o.windowChance ?? 0.35)) continue;
        ctx.fillStyle = o.windows;
        const wx = x + rng.range(3, Math.max(4, bw - 6));
        ctx.beginPath(); gothicArch(ctx, wx, wy, 3, 6); ctx.fill();
      }
    }
    x += bw + rng.range(-2, o.gap ?? 6);
  }
}

/** Reihe gotischer Bögen auf Säulen (Kirchenschiff, Gewölbe). */
function arcade(ctx, W, H, rng, o) {
  ctx.fillStyle = o.color;
  const top = o.top ?? 0;
  for (let x = 0; x < W + o.spacing; x += o.spacing) {
    ctx.fillRect(x, top, o.pillar, H - top);
    ctx.fillRect(x - 4, H - 10, o.pillar + 8, 10);
  }
  // Bögen: Fläche oberhalb der Bogenlinie füllen
  ctx.beginPath();
  ctx.moveTo(0, top);
  for (let x = 0; x < W + o.spacing; x += o.spacing) {
    const x0 = x + o.pillar, x1 = x + o.spacing;
    ctx.lineTo(x0, top + o.archY);
    ctx.quadraticCurveTo(x0, top + o.archY - (x1 - x0) * 0.2, (x0 + x1) / 2, top + o.archY - (x1 - x0) * 0.55);
    ctx.quadraticCurveTo(x1, top + o.archY - (x1 - x0) * 0.2, x1, top + o.archY);
  }
  ctx.lineTo(W + o.spacing, top);
  ctx.closePath();
  ctx.fill();
  if (o.edge) {
    ctx.strokeStyle = o.edge;
    ctx.lineWidth = 1.2;
    for (let x = 0; x < W + o.spacing; x += o.spacing) {
      const x0 = x + o.pillar, x1 = x + o.spacing;
      ctx.beginPath();
      ctx.moveTo(x0, H);
      ctx.lineTo(x0, top + o.archY);
      ctx.quadraticCurveTo(x0, top + o.archY - (x1 - x0) * 0.2, (x0 + x1) / 2, top + o.archY - (x1 - x0) * 0.55);
      ctx.stroke();
    }
  }
}

// === Themen pro Zone ========================================================

const THEMES = {
  // Die Gruft: eine unterirdische Nekropole in Geister-Türkis.
  crypt: {
    sky: [[0, '#051416'], [0.5, '#0d3f3c'], [1, '#2a8a74']],
    disk: { kind: 'wisp', x: 0.66, y: 0.58, r: 42, core: '#e8fff4', rim: '#7affcc', glow: 'rgba(90,255,190,0.42)' },
    haze: '#3aa88a',
    motes: '#9affd8',
    ribbons: [
      { par: 0.14, y: 0.42, amp: 14, width: 26, freq: 0.012, phase: 0, speed: 0.25, color: 'rgba(120,255,210,0.22)', shade: 'rgba(40,150,130,0.25)', edge: 'rgba(210,255,240,0.55)' },
      { par: 0.32, y: 0.7, amp: 18, width: 34, freq: 0.009, phase: 2, speed: 0.18, color: 'rgba(100,230,200,0.28)', shade: 'rgba(30,120,110,0.3)', edge: 'rgba(200,255,235,0.6)' },
    ],
    layers: [
      { par: 0.08, h: 300, paint(ctx, W, H, rng) {
        // Ferne Grabbögen und Obelisken
        skyline(ctx, W, H, rng, { color: '#1c6a5c', baseH: 70, minW: 14, maxW: 34, minH: 30, maxH: 110, spire: 0.5, windows: 'rgba(170,255,225,0.8)', windowChance: 0.25, edge: 'rgba(160,255,220,0.3)', gap: 18 });
      } },
      { par: 0.26, h: 320, paint(ctx, W, H, rng) {
        arcade(ctx, W, H, rng, { color: '#0f3c36', spacing: 150, pillar: 20, archY: 120, top: 0, edge: 'rgba(90,220,180,0.45)' });
        // Verhüllte Statuen zwischen den Säulen
        for (let x = 60; x < W; x += 150) {
          ctx.fillStyle = '#0c302b';
          ctx.beginPath();
          ctx.moveTo(x - 16, H - 10); ctx.quadraticCurveTo(x - 18, H - 80, x, H - 96); ctx.quadraticCurveTo(x + 18, H - 80, x + 16, H - 10);
          ctx.fill();
          ctx.fillStyle = 'rgba(120,255,210,0.35)';
          ctx.fillRect(x + 12, H - 86, 1.2, 70);
        }
      } },
      { par: 0.55, h: 300, paint(ctx, W, H, rng) {
        ctx.fillStyle = '#061715';
        for (let x = 0; x < W; x += rng.range(220, 320)) {
          ctx.fillRect(x, 0, rng.range(22, 34), H);
          ctx.fillRect(x + 80, 0, 1.5, rng.range(60, 160)); // Kette
        }
      } },
    ],
  },

  // Die Reliquienkammern: ein unterirdischer See in tiefem Blau.
  catacomb: {
    sky: [[0, '#030814'], [0.55, '#0e2a5c'], [1, '#3a72c0']],
    rays: { count: 4, color: '#9ad0ff', alpha: 0.12 },
    haze: '#4a80d0',
    motes: '#a8d8ff',
    ribbons: [
      { par: 0.16, y: 0.5, amp: 10, width: 22, freq: 0.014, phase: 1, speed: 0.3, color: 'rgba(140,200,255,0.25)', shade: 'rgba(40,90,170,0.28)', edge: 'rgba(210,235,255,0.6)' },
      { par: 0.36, y: 0.8, amp: 12, width: 30, freq: 0.01, phase: 3, speed: 0.22, color: 'rgba(120,180,255,0.3)', shade: 'rgba(30,70,150,0.35)', edge: 'rgba(200,230,255,0.65)' },
    ],
    layers: [
      { par: 0.08, h: 300, paint(ctx, W, H, rng) {
        arcade(ctx, W, H, rng, { color: '#1c3c78', spacing: 120, pillar: 14, archY: 150, top: 0, edge: 'rgba(160,210,255,0.35)' });
      } },
      { par: 0.28, h: 320, paint(ctx, W, H, rng) {
        // Knochenwände
        ctx.fillStyle = '#10244e';
        ctx.fillRect(0, H - 150, W, 150);
        for (let i = 0; i < 220; i++) {
          const x = rng.range(0, W), y = rng.range(H - 145, H - 8);
          ctx.fillStyle = `rgba(170,200,240,${rng.range(0.08, 0.2)})`;
          ctx.beginPath(); ctx.arc(x, y, rng.range(3, 5.5), 0, TAU); ctx.fill();
          ctx.fillStyle = 'rgba(0,0,20,0.4)';
          ctx.fillRect(x - 2, y - 1, 1.5, 1.5); ctx.fillRect(x + 0.5, y - 1, 1.5, 1.5);
        }
        arcade(ctx, W, H, rng, { color: '#0c1c40', spacing: 200, pillar: 18, archY: 140, top: 0, edge: 'rgba(140,190,255,0.4)' });
      } },
      { par: 0.58, h: 300, paint(ctx, W, H, rng) {
        // Tropfsteine oben und unten
        ctx.fillStyle = '#040a1a';
        for (let x = 0; x < W; x += rng.range(20, 50)) {
          const h = rng.range(20, 90);
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + rng.range(8, 18), 0); ctx.lineTo(x + 6, h); ctx.fill();
        }
        for (let x = 0; x < W; x += rng.range(260, 380)) ctx.fillRect(x, 0, 24, H);
      } },
    ],
  },

  // Die Zwinger: freier Himmel unter dem Blutmond.
  courtyard: {
    sky: [[0, '#1a0410'], [0.5, '#7a0e24'], [1, '#e8483a']],
    disk: { kind: 'moon', x: 0.68, y: 0.24, r: 46, core: '#ffe4cc', rim: '#ff5a40', glow: 'rgba(255,70,50,0.5)', crater: 'rgba(190,40,30,0.3)', clouds: 'rgba(60,6,20,0.6)' },
    haze: '#c0303a',
    motes: '#ff9a70',
    ribbons: [
      { par: 0.1, y: 0.22, amp: 10, width: 18, freq: 0.01, phase: 0, speed: 0.12, tilt: -0.04, color: 'rgba(255,120,130,0.4)', shade: 'rgba(150,20,50,0.5)', edge: 'rgba(255,200,180,0.8)' },
      { par: 0.2, y: 0.55, amp: 16, width: 28, freq: 0.008, phase: 2.2, speed: 0.1, color: 'rgba(255,90,110,0.45)', shade: 'rgba(120,10,40,0.55)', edge: 'rgba(255,190,170,0.8)' },
    ],
    layers: [
      { par: 0.06, h: 280, paint(ctx, W, H, rng) {
        ctx.fillStyle = '#a02a3c';
        ctx.beginPath();
        ctx.moveTo(0, H);
        for (let x = 0; x <= W; x += 30) ctx.lineTo(x, H - 90 - Math.sin(x * 0.008) * 40 - rng.range(0, 24));
        ctx.lineTo(W, H);
        ctx.fill();
      } },
      { par: 0.2, h: 320, paint(ctx, W, H, rng) {
        skyline(ctx, W, H, rng, { color: '#5a0c1e', baseH: 56, minW: 14, maxW: 30, minH: 26, maxH: 96, spire: 0.75, finial: true, windows: 'rgba(255,180,110,0.9)', windowChance: 0.45, edge: 'rgba(255,120,110,0.4)', gap: 26 });
      } },
      { par: 0.5, h: 300, paint(ctx, W, H, rng) {
        // Tote Bäume
        ctx.strokeStyle = '#1e0610';
        ctx.lineCap = 'round';
        for (let i = 0; i < 4; i++) {
          const x = rng.range(0, W);
          const tree = (x0, y0, len, ang, depth) => {
            if (depth === 0) return;
            const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
            ctx.lineWidth = depth * 1.7;
            ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
            tree(x1, y1, len * 0.72, ang - rng.range(0.2, 0.6), depth - 1);
            tree(x1, y1, len * 0.68, ang + rng.range(0.2, 0.6), depth - 1);
          };
          tree(x, H, rng.range(50, 75), -Math.PI / 2 + rng.range(-0.15, 0.15), 6);
        }
        ctx.fillStyle = '#1e0610';
        ctx.fillRect(0, H - 20, W, 20);
      } },
    ],
  },

  // Die Bibliothek: warmer Bernstein, ein riesiges Rundfenster.
  library: {
    sky: [[0, '#1a0c04'], [0.5, '#6e3610'], [1, '#e0943e']],
    disk: { kind: 'oculus', x: 0.5, y: 0.26, r: 50, core: '#fff2cc', rim: '#ffbe5a', glow: 'rgba(255,190,90,0.5)', tracery: 'rgba(90,40,10,0.85)' },
    haze: '#d08a40',
    motes: '#ffe0a0',
    ribbons: [
      { par: 0.18, y: 0.6, amp: 12, width: 24, freq: 0.011, phase: 0.5, speed: 0.15, color: 'rgba(255,200,120,0.3)', shade: 'rgba(170,90,30,0.3)', edge: 'rgba(255,235,190,0.65)' },
    ],
    layers: [
      { par: 0.08, h: 320, paint(ctx, W, H, rng) {
        // Turmhohe Regale im Dunst
        for (let x = 0; x < W; x += 120) {
          ctx.fillStyle = '#9a5220';
          ctx.fillRect(x + 8, 40, 100, H - 40);
          ctx.fillStyle = '#b8682a';
          for (let y = 60; y < H; y += 26) ctx.fillRect(x + 8, y, 100, 3);
          ctx.fillStyle = 'rgba(255,220,160,0.35)';
          ctx.fillRect(x + 106, 40, 2, H - 40);
        }
      } },
      { par: 0.3, h: 340, paint(ctx, W, H, rng) {
        for (let x = 0; x < W; x += 180) {
          ctx.fillStyle = '#4a2208';
          ctx.fillRect(x, 30, 130, H - 30);
          for (let y = 46; y < H - 16; y += 32) {
            let bx = x + 5;
            while (bx < x + 125) {
              const bw = rng.range(3, 7), bh = rng.range(18, 27);
              ctx.fillStyle = rng.pick(['#6a2a14', '#2a3a4a', '#5a4a1a', '#3a2a3e', '#2a4a34', '#7a5024']);
              ctx.fillRect(bx, y + 28 - bh, bw, bh);
              bx += bw + 0.5;
            }
            ctx.fillStyle = '#2a1204';
            ctx.fillRect(x, y + 28, 130, 4);
          }
          ctx.fillStyle = 'rgba(255,200,120,0.4)';
          ctx.fillRect(x + 128, 30, 2, H - 30);
          // Leiter
          ctx.strokeStyle = '#2a1204'; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.moveTo(x + 140, H); ctx.lineTo(x + 118, 60); ctx.moveTo(x + 154, H); ctx.lineTo(x + 132, 60); ctx.stroke();
          for (let y = 80; y < H; y += 16) {
            const k = (y - 60) / (H - 60);
            ctx.beginPath(); ctx.moveTo(x + 118 + 22 * k, y); ctx.lineTo(x + 132 + 22 * k, y); ctx.stroke();
          }
        }
      } },
      { par: 0.58, h: 300, paint(ctx, W, H, rng) {
        ctx.fillStyle = '#1a0a02';
        for (let x = 0; x < W; x += rng.range(260, 340)) {
          ctx.fillRect(x, 0, 30, H);
          // Kandelaber
          ctx.fillRect(x + 90, H - 70, 3, 70);
          ctx.fillRect(x + 80, H - 72, 23, 3);
        }
      } },
    ],
  },

  // Das Sonnenwerk: Gold und Feuer, eine Zahnrad-Sonne über der Stadt.
  clock: {
    sky: [[0, '#1c0a02'], [0.45, '#8a3808'], [1, '#f4a232']],
    disk: { kind: 'gear', x: 0.72, y: 0.3, r: 58, core: '#fff6c8', rim: '#ffae2e', glow: 'rgba(255,170,50,0.55)' },
    haze: '#e08a28',
    motes: '#ffd060',
    ribbons: [
      { par: 0.1, y: 0.25, amp: 22, width: 30, freq: 0.009, phase: 0, speed: 0.35, tilt: -0.12, color: 'rgba(255,190,70,0.75)', shade: 'rgba(210,110,20,0.75)', edge: 'rgba(255,245,180,0.95)' },
      { par: 0.22, y: 0.62, amp: 26, width: 40, freq: 0.007, phase: 2.5, speed: 0.28, tilt: 0.08, color: 'rgba(255,170,50,0.7)', shade: 'rgba(190,90,10,0.75)', edge: 'rgba(255,240,170,0.95)' },
      { par: 0.42, y: 0.9, amp: 18, width: 34, freq: 0.011, phase: 4, speed: 0.4, color: 'rgba(255,150,40,0.6)', shade: 'rgba(160,70,10,0.7)', edge: 'rgba(255,230,150,0.9)' },
    ],
    layers: [
      { par: 0.14, h: 300, paint(ctx, W, H, rng) {
        // Dächer der Stadt unter dem Turm
        skyline(ctx, W, H, rng, { color: '#b0621c', baseH: 60, minW: 22, maxW: 44, minH: 30, maxH: 90, spire: 0.8, windows: 'rgba(255,240,180,0.8)', windowChance: 0.3, edge: 'rgba(255,220,140,0.45)', gap: 4 });
      } },
      { par: 0.32, h: 340, paint(ctx, W, H, rng) {
        for (let i = 0; i < 6; i++) drawGearShape(ctx, rng.range(0, W), rng.range(60, H - 40), rng.range(30, 70), '#5a2a08', rng.int(8, 14));
        ctx.fillStyle = '#4a2206';
        for (let x = 0; x < W; x += 170) { ctx.fillRect(x, 0, 12, H); ctx.fillStyle = 'rgba(255,200,110,0.4)'; ctx.fillRect(x + 11, 0, 1.4, H); ctx.fillStyle = '#4a2206'; }
      } },
      { par: 0.6, h: 300, paint(ctx, W, H, rng) {
        for (let i = 0; i < 4; i++) drawGearShape(ctx, rng.range(0, W), rng.range(20, H), rng.range(40, 80), '#1e0c02', rng.int(10, 16));
        ctx.fillStyle = '#1e0c02';
        for (let x = 0; x < W; x += rng.range(240, 320)) ctx.fillRect(x, 0, 20, H);
      } },
    ],
  },

  // Die Kathedrale: Weißgold und Blau – der hellste, gefährlichste Ort.
  cathedral: {
    sky: [[0, '#2a2a58'], [0.45, '#9c96cc'], [1, '#fff0d4']],
    disk: { kind: 'rose', x: 0.5, y: 0.28, r: 58, core: '#fffbe8', rim: '#ffd070', glow: 'rgba(255,240,190,0.6)', tracery: 'rgba(40,36,80,0.85)', petals: ['#3a60e0', '#e03a5a', '#e8b040', '#40a070'] },
    haze: '#f0e0c0',
    motes: '#fff4d0',
    ribbons: [
      { par: 0.14, y: 0.5, amp: 14, width: 26, freq: 0.01, phase: 1, speed: 0.12, color: 'rgba(255,248,230,0.45)', shade: 'rgba(190,180,220,0.4)', edge: 'rgba(255,255,255,0.9)' },
      { par: 0.34, y: 0.78, amp: 12, width: 30, freq: 0.012, phase: 3.3, speed: 0.1, color: 'rgba(255,240,210,0.4)', shade: 'rgba(170,160,210,0.4)', edge: 'rgba(255,255,255,0.85)' },
    ],
    layers: [
      { par: 0.1, h: 340, paint(ctx, W, H, rng) {
        arcade(ctx, W, H, rng, { color: '#8a86bc', spacing: 160, pillar: 18, archY: 170, top: 0, edge: 'rgba(255,250,230,0.55)' });
      } },
      { par: 0.3, h: 340, paint(ctx, W, H, rng) {
        arcade(ctx, W, H, rng, { color: '#4a4680', spacing: 200, pillar: 24, archY: 140, top: 0, edge: 'rgba(255,240,200,0.5)' });
        // Blaue Ordensbanner mit goldenen Lilien
        for (let x = 100; x < W; x += 200) {
          ctx.fillStyle = '#243a9a';
          ctx.beginPath();
          ctx.moveTo(x - 14, 40); ctx.lineTo(x + 14, 40); ctx.lineTo(x + 14, 150); ctx.lineTo(x, 138); ctx.lineTo(x - 14, 150);
          ctx.fill();
          ctx.fillStyle = '#e8c050';
          for (let y = 60; y < 130; y += 22) { ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fill(); }
          ctx.fillRect(x - 14, 40, 28, 3);
        }
      } },
      { par: 0.6, h: 300, paint(ctx, W, H, rng) {
        ctx.fillStyle = '#1c1a34';
        for (let x = 0; x < W; x += rng.range(260, 340)) {
          ctx.fillRect(x, 0, 32, H);
          ctx.fillStyle = 'rgba(255,240,200,0.35)'; ctx.fillRect(x + 31, 0, 1.5, H); ctx.fillStyle = '#1c1a34';
        }
      } },
    ],
  },
};

export { THEMES };
