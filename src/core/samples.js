// Aufgenommene Klänge (mit ElevenLabs erzeugt): Musik, Umgebung, Effekte, Stimmen.
//
// Alles ist optional. Fehlt eine Datei oder lässt sie sich nicht laden, spielt
// die Audio-Engine wie bisher ihre selbst erzeugten Klänge – das Spiel bleibt
// also auch offline, auf alten Geräten und ohne die Dateien vollständig.
//
// Welche Dateien es gibt, steht in assets/audio/manifest.json
// (erzeugt von tools/audio-manifest.mjs).

const BASE = 'assets/audio/';

export class SampleBank {
  constructor() {
    this.manifest = null;
    this.buffers = new Map();     // Pfad → AudioBuffer
    this.loading = new Map();     // Pfad → Promise
    this.levels = new Map();      // Pfad → { rms, peak, win } (linear)
    this.ctx = null;
    this.ready = false;
  }

  /** Manifest laden (ohne Audiokontext möglich, also schon beim Start). */
  async loadManifest() {
    try {
      const r = await fetch(BASE + 'manifest.json', { cache: 'no-cache' });
      if (!r.ok) return;
      this.manifest = await r.json();
    } catch { /* keine Dateien – Synthese übernimmt */ }
  }

  /** Nach dem Entsperren des Tons: Effekte vorladen (klein, werden sofort gebraucht). */
  attach(ctx) {
    this.ctx = ctx;
    this.ready = true;
    const m = this.manifest;
    if (!m) return;
    for (const list of Object.values(m.sfx || {})) for (const p of list) this.load(p);
  }

  has(kind, key) { return !!(this.manifest && this.manifest[kind] && this.manifest[kind][key]); }

  /** Pfad(e) einer Kategorie. */
  paths(kind, key) { return this.manifest?.[kind]?.[key] || null; }

  /** Datei laden und dekodieren; liefert den Puffer (oder null bei Fehler). */
  load(path) {
    if (!this.ctx) return Promise.resolve(null);
    if (this.buffers.has(path)) return Promise.resolve(this.buffers.get(path));
    if (this.loading.has(path)) return this.loading.get(path);
    const p = fetch(BASE + path)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
      .then((ab) => new Promise((res, rej) => this.ctx.decodeAudioData(ab, res, rej)))
      .then((buf) => {
        this.levels.set(path, measure(buf));
        this.buffers.set(path, buf);
        this.loading.delete(path);
        return buf;
      })
      .catch(() => { this.loading.delete(path); this.buffers.set(path, null); return null; });
    this.loading.set(path, p);
    return p;
  }

  /** Schon geladener Puffer oder null (für Effekte, die sofort klingen müssen). */
  now(path) { return this.buffers.get(path) || null; }

  /** Große Puffer (Musik) wieder freigeben, damit der Speicher nicht vollläuft. */
  release(path) { this.buffers.delete(path); }

  /**
   * Verstärkung, mit der eine Datei auf einen Zielpegel kommt (in dB).
   * Die erzeugten Dateien sind sehr unterschiedlich laut – ohne Angleich
   * wäre ein Schritt lauter als ein Bosschrei.
   * mode 'win': lautestes 50-ms-Fenster (für kurze Effekte und Stimmen),
   * mode 'rms': Durchschnitt über die ganze Datei (für Musik und Umgebung).
   */
  gainFor(path, targetDb, mode = 'win', maxBoostDb = 12) {
    const lv = this.levels.get(path);
    if (!lv) return 1;
    const cur = mode === 'rms' ? lv.rms : lv.win;
    let g = Math.pow(10, targetDb / 20) / Math.max(cur, 1e-6);
    g = Math.min(g, Math.pow(10, maxBoostDb / 20));
    // Nicht über die Vollaussteuerung hinaus (der Limiter fängt den Rest).
    return Math.min(g, 1.2 / Math.max(lv.peak, 1e-6));
  }
}

/** Pegel eines Puffers: Spitze, Durchschnitt und lautestes 50-ms-Fenster. */
function measure(buf) {
  const ch = buf.numberOfChannels;
  const len = buf.length;
  // Lange Dateien nur stichprobenartig lesen – das genügt und geht schnell.
  const stride = len > 200000 ? 8 : 1;
  const win = Math.max(1, Math.floor(buf.sampleRate * 0.05 / stride));
  const data = [];
  for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
  let peak = 0, sum = 0, n = 0, wSum = 0, wN = 0, wMax = 0;
  for (let i = 0; i < len; i += stride) {
    let e = 0;
    for (let c = 0; c < ch; c++) {
      const v = data[c][i];
      const a = v < 0 ? -v : v;
      if (a > peak) peak = a;
      e += v * v;
    }
    e /= ch;
    sum += e; n++;
    wSum += e; wN++;
    if (wN >= win) { if (wSum / wN > wMax) wMax = wSum / wN; wSum = 0; wN = 0; }
  }
  if (wN > 0 && wSum / wN > wMax) wMax = wSum / wN;
  return { peak, rms: Math.sqrt(sum / Math.max(1, n)), win: Math.sqrt(wMax) };
}

/**
 * Musikstück als Endlosschleife mit weicher Überblendung am Ende.
 * Die erzeugten Stücke haben kein perfekt passendes Loop-Ende – deshalb
 * startet kurz vor Schluss die nächste Runde und die beiden werden überblendet.
 */
export class MusicLoop {
  constructor(ctx, buffer, dest, { fadeIn = 1.2, crossfade = 4 } = {}) {
    this.ctx = ctx;
    this.buffer = buffer;
    this.dest = dest;
    this.xf = Math.min(crossfade, buffer.duration / 4);
    this.voices = [];
    this.stopped = false;
    this._next(ctx.currentTime + 0.05, fadeIn);
  }

  _next(when, fadeIn) {
    if (this.stopped) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(1, when + Math.max(0.05, fadeIn));
    const end = when + this.buffer.duration;
    g.gain.setValueAtTime(1, end - this.xf);
    g.gain.linearRampToValueAtTime(0.0001, end);
    src.connect(g); g.connect(this.dest);
    src.start(when);
    src.stop(end + 0.05);
    const v = { src, g };
    this.voices.push(v);
    src.onended = () => { this.voices = this.voices.filter((x) => x !== v); try { g.disconnect(); } catch { /* egal */ } };
    // Nächste Runde rechtzeitig einplanen (Timer läuft in Echtzeit, Planung exakt über ctx-Zeit).
    const nextAt = end - this.xf;
    const delay = Math.max(0, (nextAt - ctx.currentTime - 1) * 1000);
    this._timer = setTimeout(() => this._next(nextAt, this.xf), delay);
  }

  stop(fade = 1) {
    this.stopped = true;
    clearTimeout(this._timer);
    const t = this.ctx.currentTime;
    for (const v of this.voices) {
      try {
        v.g.gain.cancelScheduledValues(t);
        v.g.gain.setValueAtTime(v.g.gain.value, t);
        v.g.gain.linearRampToValueAtTime(0.0001, t + fade);
        v.src.stop(t + fade + 0.05);
      } catch { /* schon vorbei */ }
    }
  }
}
