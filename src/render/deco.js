// Dekoration der Welt: Fackeln, Kerzen, Fenster, Banner, Ketten, Zahnräder ...
// Zwei Durchgänge: der Körper (beleuchtet) und das Leuchten (emissiv, Bloom).

import { TAU, noise1 } from '../core/math.js';
import { drawTinyBat } from './particles.js';
import { drawGearShape, gothicArch } from './backgrounds.js';

/** Flackerfaktor 0.6..1.1 für Flammen – glattes Rauschen statt Zufall. */
export const flicker = (t, seed) => 0.78 + noise1(t * 9 + seed, seed) * 0.32;

export function drawDeco(ctx, d, t, zone) {
  switch (d.type) {
    case 'torch': return torch(ctx, d, t);
    case 'candles': return candles(ctx, d);
    case 'window': return windowFrame(ctx, d, zone);
    case 'glass': return stainedGlass(ctx, d);
    case 'banner': return banner(ctx, d, t, zone);
    case 'pillar': return pillar(ctx, d, zone);
    case 'shelf': return shelf(ctx, d);
    case 'gear': return gear(ctx, d, t, zone);
    case 'bones': return bones(ctx, d);
    case 'skulls': return skulls(ctx, d);
    case 'cobweb': return cobweb(ctx, d);
    case 'statue': return statue(ctx, d);
    case 'chains': return chains(ctx, d, t);
    case 'crack': return crack(ctx, d);
    case 'grateGlow': return null;
    case 'roof': return roof(ctx, d, zone);
    case 'batSwarm': return batSwarm(ctx, d, t);
    case 'grave': return grave(ctx, d);
    case 'gallows': return gallows(ctx, d, t);
    default: return null;
  }
}

/** Leuchtende Teile (Flammen, Fensterschein). isGlow = Bloom-Puffer. */
export function drawDecoEmissive(ctx, d, t, isGlow) {
  if (d.type === 'torch') {
    const f = flicker(t, d.x * 0.01);
    const fx = d.x, fy = d.y - (d.pole ? 0 : 8);
    flame(ctx, fx, fy, 5.5 * f, 13 * f, t, d.x, isGlow);
  } else if (d.type === 'candles') {
    for (let i = 0; i < d.n; i++) {
      const cx = d.x + (i - (d.n - 1) / 2) * 5;
      const h = 8 + ((i * 7) % 5);
      const f = flicker(t, d.x + i * 13);
      flame(ctx, cx, d.y - h - 1, 1.8 * f, 4.5 * f, t, d.x + i, isGlow);
    }
  } else if (d.type === 'window') {
    // Mondlicht fällt schräg durch das Fenster auf den Boden.
    ctx.globalAlpha = isGlow ? 0.16 : 0.07;
    const g = ctx.createLinearGradient(d.x, d.y, d.x + 50, d.y + 180);
    g.addColorStop(0, 'rgba(170,200,255,1)');
    g.addColorStop(1, 'rgba(170,200,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(d.x + 4, d.y + 10);
    ctx.lineTo(d.x + d.w - 4, d.y + 10);
    ctx.lineTo(d.x + d.w + 60, d.y + 190);
    ctx.lineTo(d.x + 30, d.y + 190);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  } else if (d.type === 'grateGlow') {
    // Ein kaum sichtbares Schimmern hinter dem Gitter verrät das Geheimnis.
    const a = 0.25 + Math.sin(t * 2) * 0.1;
    ctx.globalAlpha = a;
    ctx.fillStyle = '#ff3050';
    ctx.beginPath(); ctx.arc(d.x + 30, d.y, isGlow ? 16 : 5, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  } else if (d.type === 'glass') {
    ctx.globalAlpha = isGlow ? 0.35 : 0.2;
    stainedGlass(ctx, d, true);
    ctx.globalAlpha = 1;
  }
}

function flame(ctx, x, y, w, h, t, seed, isGlow) {
  const sway = Math.sin(t * 7 + seed) * 1.2;
  if (isGlow) {
    ctx.fillStyle = 'rgba(255,140,50,0.9)';
    ctx.beginPath(); ctx.arc(x, y - h * 0.4, w * 2.2, 0, TAU); ctx.fill();
    return;
  }
  // Außen orange, innen gelb-weiß
  ctx.fillStyle = 'rgba(255,110,30,0.95)';
  ctx.beginPath();
  ctx.moveTo(x - w, y);
  ctx.quadraticCurveTo(x - w, y - h * 0.6, x + sway, y - h);
  ctx.quadraticCurveTo(x + w, y - h * 0.6, x + w, y);
  ctx.quadraticCurveTo(x, y + w * 0.6, x - w, y);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,230,160,0.95)';
  ctx.beginPath();
  ctx.moveTo(x - w * 0.45, y);
  ctx.quadraticCurveTo(x - w * 0.4, y - h * 0.45, x + sway * 0.6, y - h * 0.62);
  ctx.quadraticCurveTo(x + w * 0.4, y - h * 0.45, x + w * 0.45, y);
  ctx.closePath();
  ctx.fill();
}

function torch(ctx, d) {
  if (d.pole) {
    // Eisenpfahl mit Feuerschale (im Freien)
    const gy = d.groundY ?? d.y + 60;
    ctx.fillStyle = '#141016';
    ctx.fillRect(d.x - 1.5, d.y, 3, gy - d.y);
    ctx.fillRect(d.x - 5, gy - 3, 10, 3);
    ctx.fillStyle = '#2a2228';
    ctx.beginPath();
    ctx.moveTo(d.x - 8, d.y - 2); ctx.lineTo(d.x + 8, d.y - 2); ctx.lineTo(d.x + 4, d.y + 5); ctx.lineTo(d.x - 4, d.y + 5);
    ctx.fill();
    return;
  }
  // Wandhalter
  ctx.fillStyle = '#1b161a';
  ctx.fillRect(d.x - 4, d.y - 2, 8, 5);
  ctx.fillStyle = '#2d2429';
  ctx.beginPath();
  ctx.moveTo(d.x - 3, d.y - 8); ctx.lineTo(d.x + 3, d.y - 8); ctx.lineTo(d.x + 1.5, d.y + 2); ctx.lineTo(d.x - 1.5, d.y + 2);
  ctx.fill();
  // Rußfleck an der Wand über der Flamme
  const g = ctx.createRadialGradient(d.x, d.y - 26, 0, d.x, d.y - 26, 16);
  g.addColorStop(0, 'rgba(0,0,0,0.35)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(d.x - 16, d.y - 42, 32, 32);
}

function candles(ctx, d) {
  for (let i = 0; i < d.n; i++) {
    const cx = d.x + (i - (d.n - 1) / 2) * 5;
    const h = 8 + ((i * 7) % 5);
    ctx.fillStyle = '#d8ccb0';
    ctx.fillRect(cx - 1.4, d.y - h, 2.8, h);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(cx - 1.4, d.y - h, 0.8, h);
    // Wachstropfen
    ctx.fillStyle = '#e8dcc0';
    ctx.fillRect(cx + 1, d.y - h + 2, 0.9, 3);
    ctx.fillStyle = '#222';
    ctx.fillRect(cx - 0.3, d.y - h - 1.2, 0.6, 1.4);
  }
  // Wachslache am Boden
  ctx.fillStyle = 'rgba(216,204,176,0.6)';
  ctx.beginPath(); ctx.ellipse(d.x, d.y, d.n * 3.5, 1.4, 0, 0, TAU); ctx.fill();
}

function windowFrame(ctx, d, zone) {
  // Offener Spitzbogen: nur Rahmen und Maßwerk – dahinter liegt die gemalte Kulisse.
  const { x, y, w, h } = d;
  const col = zone.tiles.dark;
  ctx.strokeStyle = col;
  ctx.lineWidth = 3;
  ctx.beginPath(); gothicArch(ctx, x - 1.5, y + 6.5, w + 3, h - 5); ctx.stroke();
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y + 2); ctx.lineTo(x + w / 2, y + h);
  ctx.moveTo(x, y + h * 0.45); ctx.lineTo(x + w, y + h * 0.45);
  ctx.stroke();
  // Kleiner Vierpass oben im Bogen
  ctx.beginPath(); ctx.arc(x + w / 2, y + 12, 4, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = col;
  ctx.fillRect(x - 5, y + h, w + 10, 4);
}

function stainedGlass(ctx, d, glowOnly = false) {
  const x = d.x - 16, y = d.y - 20, w = 32, h = 70;
  const cols = ['#e8c050', '#4a70e0', '#c03050', '#50b080', '#e8c050', '#8050c0'];
  if (!glowOnly) {
    ctx.fillStyle = '#12101a';
    ctx.beginPath(); gothicArch(ctx, x - 3, y + 3, w + 6, h); ctx.fill();
  }
  let i = 0;
  for (let yy = y + 10; yy < y + h; yy += 12) {
    for (let xx = x; xx < x + w; xx += 16) {
      ctx.fillStyle = cols[(i++ * 7 + Math.floor(yy)) % cols.length];
      ctx.fillRect(xx + 1, yy + 1, 14, 10);
    }
  }
  if (!glowOnly) {
    ctx.fillStyle = cols[0];
    ctx.beginPath(); ctx.arc(x + w / 2, y + 6, 7, 0, TAU); ctx.fill();
  }
}

function banner(ctx, d, t, zone) {
  // Banner des Ordens: weißes Tuch, goldene Sonne – zerrissen am unteren Rand.
  const sway = Math.sin(t * 1.3 + d.x * 0.05) * 1.5;
  const x = d.x, y = d.y, w = 20, h = 52;
  ctx.fillStyle = '#2a2026';
  ctx.fillRect(x - w / 2 - 3, y - 2, w + 6, 3);
  const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  g.addColorStop(0, '#9c96a4');
  g.addColorStop(0.5, '#d8d2dc');
  g.addColorStop(1, '#8a8492');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.lineTo(x + w / 2, y);
  ctx.lineTo(x + w / 2 + sway, y + h);
  ctx.lineTo(x + w / 4 + sway, y + h - 6);
  ctx.lineTo(x + sway, y + h + 2);
  ctx.lineTo(x - w / 4 + sway, y + h - 7);
  ctx.lineTo(x - w / 2 + sway, y + h);
  ctx.closePath();
  ctx.fill();
  // Goldene Sonne
  const cy = y + 20;
  ctx.fillStyle = '#c9a040';
  ctx.beginPath(); ctx.arc(x + sway * 0.4, cy, 5, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#c9a040';
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    ctx.beginPath();
    ctx.moveTo(x + sway * 0.4 + Math.cos(a) * 6.5, cy + Math.sin(a) * 6.5);
    ctx.lineTo(x + sway * 0.4 + Math.cos(a) * 9, cy + Math.sin(a) * 9);
    ctx.stroke();
  }
  // Blutspritzer – der Fürst war schon hier.
  if ((Math.floor(d.x) % 3) === 0) {
    ctx.fillStyle = 'rgba(120,0,10,0.75)';
    ctx.beginPath(); ctx.ellipse(x - 3 + sway * 0.7, y + 36, 4, 6, 0.4, 0, TAU); ctx.fill();
  }
}

function pillar(ctx, d, zone) {
  const w = 18, x = d.x - w / 2, y = d.y - d.h;
  const base = zone.tiles.base;
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.3, base);
  g.addColorStop(1, 'rgba(0,0,0,0.7)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, d.h);
  // Kannelierung
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let i = 3; i < w; i += 5) ctx.fillRect(x + i, y + 6, 1, d.h - 12);
  ctx.fillStyle = zone.tiles.dark;
  ctx.fillRect(x - 4, y, w + 8, 6);
  ctx.fillRect(x - 5, d.y - 7, w + 10, 7);
}

function shelf(ctx, d) {
  ctx.fillStyle = '#1e120a';
  ctx.fillRect(d.x, d.y - d.h, d.w, d.h);
  let seed = Math.floor(d.x);
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = d.y - d.h + 6; y < d.y - 8; y += 20) {
    let bx = d.x + 3;
    while (bx < d.x + d.w - 5) {
      const bw = 2.5 + rnd() * 3, bh = 11 + rnd() * 6;
      ctx.fillStyle = ['#5a1e16', '#1e2e44', '#4a3614', '#2e1c36', '#16382a'][Math.floor(rnd() * 5)];
      ctx.fillRect(bx, y + 17 - bh, bw, bh);
      bx += bw + 0.5;
    }
    ctx.fillStyle = '#120a05';
    ctx.fillRect(d.x, y + 17, d.w, 3);
  }
}

function gear(ctx, d, t, zone) {
  ctx.save();
  ctx.translate(d.x, d.y);
  ctx.rotate(t * d.speed);
  drawGearShape(ctx, 0, 0, d.r, 'rgba(40,30,14,0.95)', Math.max(8, Math.round(d.r / 5)));
  ctx.strokeStyle = zone.tiles.top;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, d.r * 0.7, 0, TAU); ctx.stroke();
  for (let i = 0; i < 4; i++) {
    ctx.rotate(TAU / 4);
    ctx.fillStyle = 'rgba(60,44,20,0.95)';
    ctx.fillRect(d.r * 0.35, -2, d.r * 0.35, 4);
  }
  ctx.restore();
}

function bones(ctx, d) {
  ctx.fillStyle = '#b8ae98';
  // Knochenhaufen mit Schädel obenauf
  for (let i = 0; i < 5; i++) {
    const a = i * 0.9;
    ctx.save();
    ctx.translate(d.x + (i - 2) * 4, d.y - 2);
    ctx.rotate(a);
    ctx.fillRect(-5, -0.8, 10, 1.6);
    ctx.beginPath(); ctx.arc(-5, 0, 1.3, 0, TAU); ctx.arc(5, 0, 1.3, 0, TAU); ctx.fill();
    ctx.restore();
  }
  ctx.beginPath(); ctx.arc(d.x + 1, d.y - 6, 3.6, 0, TAU); ctx.fill();
  ctx.fillRect(d.x - 1, d.y - 4, 4, 2.5);
  ctx.fillStyle = '#1a1612';
  ctx.fillRect(d.x - 1, d.y - 7, 1.4, 1.4);
  ctx.fillRect(d.x + 1.6, d.y - 7, 1.4, 1.4);
}

function skulls(ctx, d) {
  // Nische voller Schädel
  ctx.fillStyle = '#07090e';
  ctx.fillRect(d.x, d.y, d.w, 26);
  for (let i = 0; i < Math.floor(d.w / 8); i++) {
    for (let j = 0; j < 3; j++) {
      const sx = d.x + 4 + i * 8 + (j % 2) * 3, sy = d.y + 6 + j * 8;
      ctx.fillStyle = '#9a9282';
      ctx.beginPath(); ctx.arc(sx, sy, 3.2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#07090e';
      ctx.fillRect(sx - 1.8, sy - 0.8, 1.2, 1.2);
      ctx.fillRect(sx + 0.6, sy - 0.8, 1.2, 1.2);
    }
  }
}

function cobweb(ctx, d) {
  ctx.strokeStyle = 'rgba(200,200,210,0.22)';
  ctx.lineWidth = 0.5;
  const s = d.flip ? -1 : 1;
  const x = d.x, y = d.y + 20;
  ctx.beginPath();
  for (let i = 0; i <= 4; i++) {
    const a = (i / 4) * (Math.PI / 2);
    ctx.moveTo(x, y);
    ctx.lineTo(x + s * Math.cos(a) * 26, y + Math.sin(a) * 26);
  }
  for (let r = 7; r <= 26; r += 6) {
    ctx.moveTo(x + s * r, y);
    for (let i = 1; i <= 4; i++) {
      const a = (i / 4) * (Math.PI / 2);
      ctx.lineTo(x + s * Math.cos(a) * r, y + Math.sin(a) * r);
    }
  }
  ctx.stroke();
}

function statue(ctx, d) {
  // Steinerne Gargoyle-Statue auf einem Sockel
  const x = d.x, y = d.y;
  ctx.fillStyle = '#2a2e30';
  ctx.fillRect(x - 10, y - 12, 20, 12);
  ctx.fillStyle = '#3a3f42';
  ctx.beginPath();
  ctx.moveTo(x - 8, y - 12);
  ctx.quadraticCurveTo(x - 10, y - 30, x - 3, y - 36);
  ctx.lineTo(x - 6, y - 44);
  ctx.lineTo(x, y - 38);
  ctx.lineTo(x + 6, y - 44);
  ctx.lineTo(x + 3, y - 36);
  ctx.quadraticCurveTo(x + 10, y - 30, x + 8, y - 12);
  ctx.fill();
  // Flügel
  ctx.beginPath();
  ctx.moveTo(x - 6, y - 30); ctx.lineTo(x - 20, y - 40); ctx.lineTo(x - 16, y - 24); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + 6, y - 30); ctx.lineTo(x + 20, y - 40); ctx.lineTo(x + 16, y - 24); ctx.fill();
}

function chains(ctx, d, t) {
  const sway = Math.sin(t * 0.8 + d.x) * 2;
  ctx.strokeStyle = '#2a2830';
  ctx.lineWidth = 1.4;
  const links = Math.floor(d.h / 5);
  for (let i = 0; i < links; i++) {
    const k = i / links;
    const x = d.x + sway * k * k;
    const y = d.y + i * 5;
    ctx.beginPath();
    if (i % 2) ctx.ellipse(x, y, 1, 2.6, 0, 0, TAU);
    else ctx.ellipse(x, y, 2, 2.6, 0, 0, TAU);
    ctx.stroke();
  }
  // Haken am Ende
  const ex = d.x + sway, ey = d.y + links * 5;
  ctx.beginPath(); ctx.arc(ex, ey + 3, 3, -Math.PI * 0.2, Math.PI * 1.1); ctx.stroke();
}

function crack(ctx, d) {
  // Deutlicher Hinweis: hier ist die Mauer schwach.
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(d.x - 8, d.y - 14);
  ctx.lineTo(d.x - 2, d.y - 6);
  ctx.lineTo(d.x - 6, d.y);
  ctx.lineTo(d.x + 2, d.y + 8);
  ctx.moveTo(d.x - 2, d.y - 6);
  ctx.lineTo(d.x + 7, d.y - 10);
  ctx.stroke();
}

function roof(ctx, d, zone) {
  // Schieferdach auf den Zinnen im Hof
  const { x, y, w } = d;
  ctx.fillStyle = '#1c1420';
  ctx.beginPath();
  ctx.moveTo(x - 4, y + 2);
  ctx.lineTo(x + w / 2, y - 18);
  ctx.lineTo(x + w + 4, y + 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,80,80,0.12)';
  ctx.lineWidth = 0.8;
  for (let i = 1; i < 5; i++) {
    const yy = y + 2 - i * 4;
    const inset = (i * 4 * (w / 2 + 4)) / 20;
    ctx.beginPath(); ctx.moveTo(x - 4 + inset, yy); ctx.lineTo(x + w + 4 - inset, yy); ctx.stroke();
  }
}

function grave(ctx, d) {
  const x = d.x, y = d.y;
  ctx.fillStyle = '#3a3440';
  if (d.v === 0) {
    // Rundbogen-Grabstein
    ctx.beginPath();
    ctx.moveTo(x - 7, y); ctx.lineTo(x - 7, y - 14); ctx.arc(x, y - 14, 7, Math.PI, 0); ctx.lineTo(x + 7, y);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x - 3, y - 15, 6, 1.2); ctx.fillRect(x - 3, y - 12, 6, 1.2);
  } else if (d.v === 1) {
    // Schiefes Kreuz
    ctx.save(); ctx.translate(x, y); ctx.rotate(0.12);
    ctx.fillRect(-1.8, -24, 3.6, 24); ctx.fillRect(-8, -18, 16, 3.4);
    ctx.restore();
  } else {
    // Flacher, gebrochener Stein
    ctx.beginPath();
    ctx.moveTo(x - 9, y); ctx.lineTo(x - 8, y - 9); ctx.lineTo(x + 1, y - 12); ctx.lineTo(x + 3, y - 7); ctx.lineTo(x + 9, y - 8); ctx.lineTo(x + 9, y);
    ctx.fill();
  }
  // Gras am Fuß
  ctx.fillStyle = '#2a2a1c';
  for (let i = -8; i < 9; i += 3) ctx.fillRect(x + i, y - 2 - ((i * 7) & 3), 1, 2 + ((i * 7) & 3));
}

function gallows(ctx, d, t) {
  // Galgen mit einem Käfig – der Orden stellt hier "Ketzer" zur Schau.
  const x = d.x, y = d.y;
  ctx.fillStyle = '#1e1418';
  ctx.fillRect(x - 2, y - 70, 4, 70);
  ctx.fillRect(x - 2, y - 70, 30, 4);
  ctx.beginPath(); ctx.moveTo(x + 2, y - 52); ctx.lineTo(x + 16, y - 66); ctx.lineTo(x + 14, y - 68); ctx.lineTo(x, y - 54); ctx.fill();
  const sway = Math.sin(t * 0.9 + x) * 0.08;
  ctx.save();
  ctx.translate(x + 24, y - 66);
  ctx.rotate(sway);
  ctx.strokeStyle = '#2a2026';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 10); ctx.stroke();
  // Käfig
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = '#2e262c';
  ctx.beginPath(); ctx.ellipse(0, 12, 7, 2.5, 0, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, 34, 7, 2.5, 0, 0, TAU); ctx.stroke();
  for (let i = -6; i <= 6; i += 3) { ctx.beginPath(); ctx.moveTo(i, 12); ctx.lineTo(i, 34); ctx.stroke(); }
  ctx.restore();
}

function batSwarm(ctx, d, t) {
  for (let i = 0; i < 7; i++) {
    const a = t * (0.6 + i * 0.07) + i * 1.7;
    const x = d.x + Math.cos(a) * (30 + i * 6) + Math.sin(a * 2.3) * 8;
    const y = d.y + Math.sin(a * 1.3) * (14 + i * 2);
    drawTinyBat(ctx, x, y, 3.2, t * 18 + i * 2, '#0e070c', Math.cos(a + Math.PI / 2) * -1);
  }
}

/** Heiliger Lichtschacht: Vorwarnung als feiner Schimmer, dann gleißend. */
export function drawHolyShaft(ctx, z, state, t, isGlow) {
  const { x, y, w, h } = z;
  const k = state.active ? state.glow : state.glow * 0.6;
  if (k <= 0.02) return;
  const cx = x + w / 2;
  // Strahl breiter oben (Fenster), schmaler unten
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, `rgba(255,244,210,${0.85 * k})`);
  g.addColorStop(0.7, `rgba(255,226,150,${0.55 * k})`);
  g.addColorStop(1, `rgba(255,210,120,${0.25 * k})`);
  ctx.fillStyle = g;
  const spread = isGlow ? 8 : 0;
  ctx.beginPath();
  ctx.moveTo(x - 6 - spread, y);
  ctx.lineTo(x + w + 6 + spread, y);
  ctx.lineTo(x + w + spread, y + h);
  ctx.lineTo(x - spread, y + h);
  ctx.closePath();
  ctx.fill();
  if (!state.active || isGlow) return;
  // Kern und aufsteigende Lichtfunken
  ctx.fillStyle = `rgba(255,255,240,${0.6 * k})`;
  ctx.fillRect(cx - w * 0.15, y, w * 0.3, h);
  for (let i = 0; i < 6; i++) {
    const py = y + h - ((t * 60 + i * (h / 6)) % h);
    const px = x + ((i * 37 + Math.floor(t * 3)) % Math.max(1, w));
    ctx.fillStyle = 'rgba(255,250,220,0.9)';
    ctx.fillRect(px, py, 1.4, 1.4);
  }
  // Bodenglut, wo das Licht aufschlägt
  const gg = ctx.createRadialGradient(cx, y + h, 0, cx, y + h, w + 14);
  gg.addColorStop(0, `rgba(255,236,170,${0.7 * k})`);
  gg.addColorStop(1, 'rgba(255,236,170,0)');
  ctx.fillStyle = gg;
  ctx.fillRect(cx - w - 14, y + h - 14, (w + 14) * 2, 20);
}

/** Wasseroberfläche: durchscheinend, mit Wellen und Glanz. */
export function drawWater(ctx, z, t) {
  const g = ctx.createLinearGradient(0, z.y, 0, z.y + z.h);
  g.addColorStop(0, 'rgba(40,80,140,0.55)');
  g.addColorStop(1, 'rgba(10,20,50,0.85)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(z.x, z.y + z.h);
  for (let x = z.x; x <= z.x + z.w; x += 6) {
    ctx.lineTo(x, z.y + Math.sin(x * 0.08 + t * 2.2) * 1.4 + Math.sin(x * 0.03 - t * 1.3) * 1.2);
  }
  ctx.lineTo(z.x + z.w, z.y + z.h);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(160,200,255,0.45)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let x = z.x; x <= z.x + z.w; x += 6) {
    const yy = z.y + Math.sin(x * 0.08 + t * 2.2) * 1.4 + Math.sin(x * 0.03 - t * 1.3) * 1.2;
    if (x === z.x) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
  }
  ctx.stroke();
}
