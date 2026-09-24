// Erzeugt assets/audio/manifest.json aus den vorhandenen Klangdateien.
//
//   node tools/audio-manifest.mjs
//
// Aufbau:
//   music: { trackId: 'music/krypta.mp3' }        – Dateiname = TRACKS-id
//   amb:   { crypt: 'amb/crypt.mp3' }              – Dateiname = Umgebungsart
//   sfx:   { swing: ['sfx/swing_1.mp3', ...] }     – name_<n>.mp3 = Varianten
//   voice: { 'ingomar-1x2y3z': 'voice/….mp3' }     – id aus src/core/voice-id.js
//
// Fehlende Dateien sind kein Problem: die Audio-Engine erzeugt dann ihre
// Klänge wie bisher selbst.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'audio');

function list(dir) {
  const d = path.join(root, dir);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((f) => f.endsWith('.mp3')).sort();
}

const manifest = { music: {}, amb: {}, sfx: {}, voice: {} };
for (const f of list('music')) manifest.music[f.slice(0, -4)] = 'music/' + f;
for (const f of list('amb')) manifest.amb[f.slice(0, -4)] = 'amb/' + f;
for (const f of list('sfx')) {
  const m = f.match(/^(.+)_(\d+)\.mp3$/);
  const name = m ? m[1] : f.slice(0, -4);
  (manifest.sfx[name] ||= []).push('sfx/' + f);
}
for (const f of list('voice')) manifest.voice[f.slice(0, -4)] = 'voice/' + f;

fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
const n = (o) => Object.keys(o).length;
console.log(`manifest.json: ${n(manifest.music)} Musik, ${n(manifest.amb)} Umgebung, ` +
  `${n(manifest.sfx)} Effekte, ${n(manifest.voice)} Stimmen`);
