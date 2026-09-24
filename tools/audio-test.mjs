// Tontest: lädt das Spiel, prüft, dass die aufgenommenen Klänge (Musik,
// Umgebung, Effekte, Stimmen) wirklich gespielt werden, und vergleicht ihre
// Lautstärke mit den selbst erzeugten Klängen.
//
//   node tools/audio-test.mjs          – Prüfung + Pegelvergleich
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = 8131;
const srv = spawn(process.execPath, ['tools/serve.mjs', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 500));
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_CERT/.test(m.text())) errors.push(m.text()); });

let ok = 0, fail = 0;
const check = (name, cond, extra = '') => { if (cond) { ok++; console.log('  ✓ ' + name + (extra ? ' – ' + extra : '')); } else { fail++; console.log('  ✗ ' + name + (extra ? ' – ' + extra : '')); } };

try {
  await page.goto(`http://localhost:${PORT}/index.html`);
  await page.waitForFunction(() => window.__ready === true);
  const r = await page.evaluate(async () => {
    const { TRACKS } = await import('./src/core/audio.js');
    const { voiceId } = await import('./src/core/voice-id.js');
    const { PROLOGUE } = await import('./src/data/story.js');
    const app = window.__app, au = app.audio;
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    au.unlock();
    await au.ctx.resume();
    for (let i = 0; i < 50 && !au.samples.manifest; i++) await sleep(50);
    // Pegelmesser im Audio-Thread – sonst verpasst man kurze Effekte, wenn der
    // Haupt-Thread mit dem Zeichnen beschäftigt ist.
    const code = `class Meter extends AudioWorkletProcessor {
      constructor() { super(); this.reset(); this.port.onmessage = (e) => {
        if (e.data === 'get') this.port.postMessage({ sum: this.sum, n: this.n, win: this.win });
        this.reset(); }; }
      reset() { this.sum = 0; this.n = 0; this.win = 0; this.ws = 0; this.wn = 0; }
      process(inputs) {
        const ch = inputs[0];
        if (ch && ch.length) {
          const L = ch[0], R = ch[1] || ch[0];
          for (let i = 0; i < L.length; i++) {
            const e = (L[i] * L[i] + R[i] * R[i]) / 2;
            this.sum += e; this.n++; this.ws += e; this.wn++;
            if (this.wn >= 2205) { this.win = Math.max(this.win, this.ws / this.wn); this.ws = 0; this.wn = 0; }
          }
        }
        return true;
      }
    }
    registerProcessor('meter', Meter);`;
    await au.ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
    const meter = new AudioWorkletNode(au.ctx, 'meter', { numberOfOutputs: 0 });
    au.master.connect(meter);
    const ask = () => new Promise((res) => { meter.port.onmessage = (e) => res(e.data); meter.port.postMessage('get'); });
    // Pegel messen: Durchschnitt (rms) und lautestes 50-ms-Fenster (win), in dB.
    const measure = async (ms) => {
      await ask();   // zurücksetzen
      await sleep(ms);
      const d = await ask();
      const db = (v) => Math.round(10 * Math.log10(Math.max(v, 1e-12)) * 10) / 10;
      return { rms: db(d.sum / Math.max(1, d.n)), win: db(d.win) };
    };
    const quiet = async () => { au.stopMusic(0.05); au.setAmbience(null, 0.05); au.stopVoice(0.01); await sleep(400); };
    const setMode = (rec) => { app.settings.recordedAudio = rec; au.applySettings(app.settings); };

    const out = { manifest: !!au.samples.manifest, music: {}, amb: {}, sfx: {}, voice: {} };
    for (const rec of [true, false]) {
      const tag = rec ? 'rec' : 'syn';
      setMode(rec);
      await quiet();
      for (const id of ['krypta', 'hof', 'uhrturm', 'boss']) {
        au.playTrack(TRACKS[id], 0.2);
        for (let i = 0; i < 80 && rec && !au._music; i++) await sleep(50);
        await sleep(1800);
        (out.music[id] ||= {})[tag] = await measure(3000);
        if (rec) out.music[id].sample = !!au._music && au._sampleTrack;
        await quiet();
      }
      for (const kind of ['crypt', 'water', 'storm', 'library', 'clockwork']) {
        au.setAmbience(kind, 0.2);
        await sleep(1500);
        (out.amb[kind] ||= {})[tag] = await measure(2500);
        await quiet();
      }
      for (const name of ['swing', 'hit', 'hitHeavy', 'crit', 'jump', 'land', 'step', 'dash', 'hurt', 'parry', 'pickup', 'enemyDeath', 'bossRoar', 'drain', 'wolf', 'mist', 'lance', 'thunder', 'cloak']) {
        const before = au._lastVariant.size;
        await ask();
        au.play(name, name === 'step' ? { surface: 'stone' } : {});
        (out.sfx[name] ||= {})[tag] = await (async () => { await sleep(name === 'thunder' ? 2000 : 900); const d = await ask();
          const db = (v) => Math.round(10 * Math.log10(Math.max(v, 1e-12)) * 10) / 10; return { rms: db(d.sum / Math.max(1, d.n)), win: db(d.win) }; })();
        if (rec) out.sfx[name].sample = au._lastVariant.has(name === 'step' ? 'step_stone' : name) || au._lastVariant.size > before;
        await sleep(150);
      }
    }
    // Stimme
    setMode(true);
    await quiet();
    const vid = voiceId('narrator', PROLOGUE[1]);
    const has = au.playVoice(vid);
    for (let i = 0; i < 60 && au.voiceRemaining() === Infinity; i++) await sleep(50);
    out.voice = { id: vid, has, remaining: au.voiceRemaining(), level: await measure(2500), active: au.voiceActive() };
    au.stopVoice(0.05);
    await sleep(300);
    out.voice.after = au.voiceActive();
    // Rückfall: unbekannte Stimme
    out.voice.unknown = au.playVoice('niemand-0');
    return out;
  });

  console.log('Aufgenommene Klänge');
  check('Verzeichnis (manifest.json) geladen', r.manifest);
  for (const [id, m] of Object.entries(r.music)) check(`Musik ${id} als Aufnahme`, m.sample, `aufgenommen ${m.rec.rms} dB / erzeugt ${m.syn.rms} dB`);
  for (const [k, m] of Object.entries(r.amb)) check(`Umgebung ${k} hörbar`, m.rec.rms > -60, `aufgenommen ${m.rec.rms} dB / erzeugt ${m.syn.rms} dB`);
  for (const [k, m] of Object.entries(r.sfx)) check(`Effekt ${k} als Aufnahme`, m.sample && m.rec.win > -50, `Spitze aufgenommen ${m.rec.win} dB / erzeugt ${m.syn.win} dB`);
  check('Stimme wird gespielt', r.voice.has && r.voice.level.rms > -50 && r.voice.remaining > 0, `${r.voice.id}, ${r.voice.level.rms} dB, noch ${r.voice.remaining?.toFixed?.(1)} s`);
  check('Stimme lässt sich stoppen', !r.voice.after);
  check('Fehlende Stimme meldet false', r.voice.unknown === false);
  const avg = (o, k, f) => { const v = Object.values(o).map((m) => m.rec[f] - m.syn[f]); return (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1); };
  console.log(`\nPegel aufgenommen minus erzeugt: Musik ${avg(r.music, 0, 'rms')} dB, Umgebung ${avg(r.amb, 0, 'rms')} dB, Effekte ${avg(r.sfx, 0, 'win')} dB`);
} catch (e) {
  fail++;
  console.log('  ✗ Ausnahme: ' + e.message);
}
check('Keine JavaScript-Fehler', errors.length === 0, errors.join('\n'));
console.log(`\n${ok} bestanden, ${fail} fehlgeschlagen`);
await browser.close();
srv.kill();
process.exit(fail ? 1 : 0);
