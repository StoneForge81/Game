// Schrift und Textumbruch für die Oberfläche (virtuelle 1920×1080-Fläche).

import { glyph } from '../core/input.js';

export const FONT_TITLE = "'Cinzel Decorative', 'Cinzel', Georgia, serif";
export const FONT_HEAD = "'Cinzel', Georgia, serif";
export const FONT_BODY = "'EB Garamond', 'Cormorant Garamond', Georgia, serif";

/** {jump} usw. durch die passenden Tastensymbole ersetzen. */
export function formatGlyphs(text, input) {
  return text.replace(/\{(\w+)\}/g, (_, a) => `[${glyph(input, a)}]`);
}

/** Text in Zeilen umbrechen, die in maxWidth passen. */
export function wrap(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/** Text mit dunklem Rand – auf dem Fernseher vor jedem Hintergrund lesbar. */
export function strokeText(ctx, text, x, y, fill = '#f4ecf0', stroke = 'rgba(8,4,10,0.9)', lw = 6) {
  ctx.lineJoin = 'round';
  ctx.lineWidth = lw;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/** Tastensymbol als kleine Plakette: [A] im Kreis, [LB] als Pille usw. */
export function drawGlyph(ctx, label, x, y, size = 40) {
  const txt = label.replace(/[[\]]/g, '');
  ctx.save();
  ctx.font = `700 ${Math.round(size * 0.55)}px ${FONT_HEAD}`;
  const w = Math.max(size, ctx.measureText(txt).width + size * 0.5);
  const colors = { A: '#3aa050', B: '#c83a3a', X: '#3a6ac8', Y: '#d0a020', '✕': '#6a8ae0', '○': '#e05a6a', '□': '#d070c0', '△': '#40c0a0' };
  ctx.fillStyle = 'rgba(10,6,14,0.85)';
  roundRect(ctx, x - w / 2, y - size / 2, w, size, size / 2);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = colors[txt] || '#c9b48a';
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(txt, x, y + 1);
  ctx.restore();
  return w;
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Gotischer Zierrahmen: dunkles Feld, goldene Doppellinie, Eckornamente.
 * Wird für Dialoge, Menüs und Tafeln benutzt.
 */
export function gothicPanel(ctx, x, y, w, h, opts = {}) {
  const gold = opts.gold || '#c9a048';
  ctx.save();
  // Schatten
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  roundRect(ctx, x + 8, y + 10, w, h, 14);
  ctx.fill();
  // Feld
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, opts.top || 'rgba(26,14,26,0.94)');
  g.addColorStop(1, opts.bottom || 'rgba(12,6,14,0.96)');
  ctx.fillStyle = g;
  roundRect(ctx, x, y, w, h, 14);
  ctx.fill();
  // Rahmenlinien
  ctx.strokeStyle = gold;
  ctx.lineWidth = 3;
  roundRect(ctx, x + 6, y + 6, w - 12, h - 12, 10);
  ctx.stroke();
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 1.5;
  roundRect(ctx, x + 14, y + 14, w - 28, h - 28, 6);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // Eckornamente: kleine Rauten
  ctx.fillStyle = gold;
  for (const [cx, cy] of [[x + 6, y + 6], [x + w - 6, y + 6], [x + 6, y + h - 6], [x + w - 6, y + h - 6]]) {
    ctx.beginPath(); ctx.moveTo(cx, cy - 12); ctx.lineTo(cx + 9, cy); ctx.lineTo(cx, cy + 12); ctx.lineTo(cx - 9, cy); ctx.closePath(); ctx.fill();
  }
  if (opts.accent) {
    // Blutrote Raute oben in der Mitte
    ctx.fillStyle = '#b01330';
    const cx = x + w / 2;
    ctx.beginPath(); ctx.moveTo(cx, y - 12); ctx.lineTo(cx + 14, y + 6); ctx.lineTo(cx, y + 24); ctx.lineTo(cx - 14, y + 6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = gold; ctx.lineWidth = 2; ctx.stroke();
  }
  ctx.restore();
}
