// Misst Pegel (Spitze, RMS) und Länge aller Klangdateien im Browser.
// Hilft beim Abgleich der Lautstärken in src/core/audio.js.
//
//   node tools/audio-levels.mjs [filter]

import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import fs from 'node:fs';

const PORT = 8093;
const filter = process.argv[2] || '';
const manifest = JSON.parse(fs.readFileSync('assets/audio/manifest.json', 'utf8'));
const files = [];
for (const [k, v] of Object.entries(manifest)) {
  for (const [name, p] of Object.entries(v)) for (const f of [].concat(p)) files.push({ kind: k, name, f });
}
const todo = files.filter((x) => (x.kind + '/' + x.f).includes(filter));

const srv = spawn(process.execPath, ['tools/serve.mjs', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 400));
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`http://localhost:${PORT}/index.html`);
const out = await page.evaluate(async (list) => {
  const ctx = new OfflineAudioContext(2, 44100, 44100);
  const res = [];
  for (const x of list) {
    const ab = await (await fetch('assets/audio/' + x.f)).arrayBuffer();
    const b = await ctx.decodeAudioData(ab);
    let peak = 0, sum = 0, n = 0;
    for (let c = 0; c < b.numberOfChannels; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; sum += v * v; n++; }
    }
    const db = (v) => (20 * Math.log10(Math.max(v, 1e-9))).toFixed(1);
    res.push({ ...x, dur: b.duration.toFixed(2), ch: b.numberOfChannels, peak: db(peak), rms: db(Math.sqrt(sum / n)) });
  }
  return res;
}, todo);
for (const r of out) console.log(`${r.kind.padEnd(6)} ${r.f.padEnd(34)} ${r.dur.padStart(7)}s ch${r.ch} peak ${r.peak.padStart(6)} dB  rms ${r.rms.padStart(6)} dB`);
await browser.close();
srv.kill();
