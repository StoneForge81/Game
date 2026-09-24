// Kompletter Klang des Spiels mit der Web Audio API.
//
// Zwei Quellen:
//  1. Aufgenommene Klänge (mit ElevenLabs erzeugt, siehe assets/audio/):
//     Orchestermusik, Umgebungsgeräusche, Effekte und die Sprecher.
//  2. Selbst erzeugte Klänge: Orgel, Cembalo, Chor, Pauken und alle Effekte
//     werden zur Laufzeit synthetisiert. Das lädt sofort und springt immer
//     ein, wenn eine Datei fehlt, noch lädt oder nicht abspielbar ist.
//
// Signalweg:  Musik     -> [Hall] -> Musik-Bus -> Filter -> Ducking -\
//             Umgebung  -----------> Umgebungs-Bus -------------------\
//             Effekte   -> [Hall] -> SFX-Bus ---------------------------> Master -> Limiter -> Boxen
//             Stimmen   -----------> Stimmen-Bus ---------------------/

import { clamp, makeRng } from './math.js';
import { SampleBank, MusicLoop } from './samples.js';

// Zielpegel der aufgenommenen Klänge (dB, siehe SampleBank.gainFor) –
// so abgestimmt, dass sie so laut sind wie die erzeugten Klänge.
const LEVEL = { music: -19, amb: -29, sfx: -22, voice: -14 };

// Lautstärke einzelner Effekte relativ zueinander (1 = normal).
const SFX_MIX = {
  step: 0.22, cloak: 0.3, land: 0.6, jump: 0.55, pickup: 0.7, bat: 0.7, arrow: 0.8,
  swing: 0.75, dash: 0.7, mist: 0.75, drain: 0.8, gear: 0.7, chain: 0.8, heartShard: 0.9,
  bossRoar: 1.15, thunder: 1.2, explosion: 1.1, death: 1.05, levelUp: 0.9,
};

const A4 = 440;
const midiToFreq = (m) => A4 * Math.pow(2, (m - 69) / 12);

// Tonleitern in Halbtonschritten. Das harmonische Moll mit seiner übermäßigen
// Sekunde ist der Klang, den man als "Gruft" im Ohr hat.
const SCALES = {
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  naturalMinor: [0, 2, 3, 5, 7, 8, 10],
  phrygianDominant: [0, 1, 4, 5, 7, 8, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
};

/** Stufe (kann negativ oder >6 sein) auf einen MIDI-Ton abbilden. */
function degreeToMidi(root, scale, degree) {
  const n = scale.length;
  const octave = Math.floor(degree / n);
  let idx = degree % n;
  if (idx < 0) idx += n;
  return root + octave * 12 + scale[idx];
}

export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.ready = false;
    this.unlocked = false;

    this.master = null;
    this.musicBus = null;
    this.sfxBus = null;
    this.reverb = null;
    this.noiseBuffer = null;

    this.track = null;           // aktuelle Musikdefinition
    this.nextNoteTime = 0;
    this.step = 0;
    this.intensity = 0;          // 0 = ruhig, 1 = Kampf
    this._targetIntensity = 0;
    this._schedulerId = null;
    this._rng = makeRng(1337);
    this._muted = false;
    this._duckUntil = 0;

    this._dest = null;           // aktuelles Ziel für Effekte (Panner) während play()
    this.ambience = null;        // laufende Umgebungsgeräusche
    this._ambienceKind = null;
    this._heartRate = 0;         // 0 = aus, 1 = rasendes Herz (fast tot)
    this._nextBeat = 0;
    this._listenerX = 0;         // Kameramitte, für Stereo-Position
    this._halfView = 320;

    // Aufgenommene Klänge: das Verzeichnis wird sofort geladen (klein),
    // die Dateien selbst erst, wenn der Ton entsperrt ist.
    this.samples = new SampleBank();
    this._music = null;          // { path, loop, trim } – laufende aufgenommene Musik
    this._sampleTrack = false;   // true: Sequenzer schweigt, die Aufnahme spielt
    this._musicToken = 0;
    this._musicTimer = null;
    this._musicStopping = false;
    this._pendingTrack = null;
    this._lastVariant = new Map();
    this._voice = null;          // { src, g } – laufende Sprachausgabe
    this._voiceToken = 0;
    this._voicePending = false;
    this.samples.loadManifest().then(() => this._onManifest());
  }

  /** Aufgenommene Klänge verwenden? (Einstellung „Klang“) */
  get _useSamples() { return this.settings.recordedAudio !== false; }

  _path(kind, key) { return this._useSamples ? this.samples.paths(kind, key) : null; }

  /** Verzeichnis kam an – laufende Musik/Umgebung auf Aufnahmen umstellen. */
  _onManifest() {
    if (!this.ready || !this.samples.manifest) return;
    this.samples.attach(this.ctx);
    this._refreshSources();
  }

  /** Nach Wechsel zwischen aufgenommenem und erzeugtem Klang neu aufbauen. */
  _refreshSources() {
    if (!this.ready) return;
    if (this.track && !this._musicStopping) this._swap(this.track, 2);
    if (this._ambienceKind) {
      const k = this._ambienceKind;
      this._ambienceKind = null;
      this.setAmbience(k, 1.5);
    }
  }

  /**
   * Muss aus einer Nutzeraktion heraus aufgerufen werden (Tastendruck/Klick).
   * Browser starten AudioContext sonst nicht.
   */
  unlock() {
    if (this.unlocked) return;
    try {
      const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx({ latencyHint: 'interactive' });
      this._build();
      this.unlocked = true;
      this.ready = true;
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      this.samples.attach(this.ctx);
      this._startScheduler();
      // Vor dem Entsperren gewählte Musik/Umgebung jetzt starten.
      if (this.track) this._swap(this.track, 1.4);
      if (this._ambienceKind) {
        const k = this._ambienceKind;
        this._ambienceKind = null;
        this.setAmbience(k);
      }
    } catch {
      // Ohne Audio läuft das Spiel trotzdem – nur still.
      this.ready = false;
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  _build() {
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.settings.masterVolume;
    // Ein Limiter verhindert, dass zwanzig gleichzeitige Treffer übersteuern.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.18;
    this.master.connect(limiter);
    limiter.connect(ctx.destination);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.settings.musicVolume;
    // Tiefpass hinter der Musik: bei wenig Leben oder im Pausenmenü wird sie
    // dumpf, als hörtest du sie durch Wasser. Normal steht er weit offen.
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 20000;
    this.musicFilter.Q.value = 0.7;
    this.musicBus.connect(this.musicFilter);
    // Ducking: Musik wird leiser, solange jemand spricht.
    this.musicDuck = ctx.createGain();
    this.musicFilter.connect(this.musicDuck);
    this.musicDuck.connect(this.master);

    this.ambienceBus = ctx.createGain();
    this.ambienceBus.gain.value = 0.9;
    this.ambienceBus.connect(this.master);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.settings.sfxVolume;
    this.sfxBus.connect(this.master);

    this.voiceBus = ctx.createGain();
    this.voiceBus.gain.value = this.settings.voiceVolume ?? 1;
    this.voiceBus.connect(this.master);

    // Kathedralenhall als synthetische Impulsantwort.
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._makeImpulse(3.4, 2.6);
    const reverbGain = ctx.createGain();
    reverbGain.gain.value = 0.9;
    this.reverb.connect(reverbGain);
    reverbGain.connect(this.master);

    this.musicSend = ctx.createGain();
    this.musicSend.gain.value = 0.34;
    this.musicSend.connect(this.reverb);

    this.sfxSend = ctx.createGain();
    this.sfxSend.gain.value = 0.16;
    this.sfxSend.connect(this.reverb);

    this.noiseBuffer = this._makeNoise(2);
  }

  /** Exponentiell abklingendes Rauschen ergibt einen brauchbaren Raumhall. */
  _makeImpulse(seconds, decay) {
    const ctx = this.ctx;
    const rate = ctx.sampleRate;
    const len = Math.max(1, Math.floor(rate * seconds));
    const buf = ctx.createBuffer(2, len, rate);
    const rng = makeRng(20240);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // Kleine Vorverzögerung: der Raum antwortet nicht sofort.
        const pre = t < 0.012 ? t / 0.012 : 1;
        data[i] = (rng.next() * 2 - 1) * Math.pow(1 - t, decay) * pre;
      }
    }
    return buf;
  }

  _makeNoise(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    const rng = makeRng(777);
    for (let i = 0; i < len; i++) data[i] = rng.next() * 2 - 1;
    return buf;
  }

  applySettings(s) {
    const wasRecorded = this._useSamples;
    this.settings = s;
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this._muted ? 0 : s.masterVolume, t, 0.05);
    this.musicBus.gain.setTargetAtTime(s.musicVolume, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(s.sfxVolume, t, 0.05);
    this.voiceBus.gain.setTargetAtTime(s.voiceVolume ?? 1, t, 0.05);
    if (wasRecorded !== this._useSamples) this._refreshSources();
  }

  setMuted(m) {
    this._muted = m;
    if (!this.ready) return;
    this.master.gain.setTargetAtTime(m ? 0 : this.settings.masterVolume, this.ctx.currentTime, 0.08);
  }

  // === Musik ================================================================

  /** Musikstück wechseln. `fade` in Sekunden. */
  playTrack(def, fade = 1.4) {
    if (!def) return;
    if (!this.ready) { this.track = def; return; }
    const cur = this._pendingTrack || this.track;
    if (cur && cur.id === def.id && !this._musicStopping) return;
    this._musicStopping = false;
    clearTimeout(this._musicTimer);
    const t = this.ctx.currentTime;
    if (this.track) {
      // Alte Spur ausblenden, dann wechseln.
      this.musicBus.gain.cancelScheduledValues(t);
      this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, t);
      this.musicBus.gain.linearRampToValueAtTime(0.0001, t + fade * 0.5);
      this._pendingTrack = def;   // die alte Spur klingt noch aus
      this._musicTimer = setTimeout(() => this._swap(def, fade), fade * 500);
    } else {
      this._swap(def, fade);
    }
  }

  _swap(def, fade) {
    this.track = def;
    this._pendingTrack = null;
    this.step = 0;
    this.nextNoteTime = this.ctx ? this.ctx.currentTime + 0.08 : 0;
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setValueAtTime(0.0001, t);
    this.musicBus.gain.linearRampToValueAtTime(this.settings.musicVolume, t + fade * 0.5);
    this._startSampleMusic(def, fade);
  }

  /**
   * Aufgenommene Fassung des Stücks starten, falls vorhanden. Solange sie lädt,
   * schweigt der Sequenzer; schlägt das Laden fehl, spielt er doch.
   */
  _startSampleMusic(def, fade) {
    const token = ++this._musicToken;
    const path = this._path('music', def.id);
    if (this._music && this._music.path !== path) this._stopSampleMusic(0.3);
    if (this._music && this._music.path === path && !this._music.loop.stopped) {
      this._sampleTrack = true;   // läuft schon (z. B. nach dem Einstellungs-Wechsel)
      return;
    }
    this._sampleTrack = !!path;
    if (!path) return;
    this.samples.load(path).then((buf) => {
      if (token !== this._musicToken || this.track !== def) return;
      if (!buf) {
        // Datei kaputt oder offline: erzeugte Musik übernimmt.
        this._sampleTrack = false;
        this.nextNoteTime = this.ctx.currentTime + 0.08;
        return;
      }
      const trim = this.ctx.createGain();
      trim.gain.value = this.samples.gainFor(path, LEVEL.music, 'rms', 12);
      trim.connect(this.musicBus);
      trim.connect(this.musicSend);
      const loop = new MusicLoop(this.ctx, buf, trim, { fadeIn: Math.max(0.6, fade * 0.8), crossfade: 5 });
      this._music = { path, loop, trim };
    });
  }

  _stopSampleMusic(fade = 1) {
    const m = this._music;
    if (!m) return;
    this._music = null;
    m.loop.stop(fade);
    setTimeout(() => {
      try { m.trim.disconnect(); } catch { /* schon weg */ }
      // Nur freigeben, wenn nicht gleich wieder dieselbe Datei läuft.
      if (!this._music || this._music.path !== m.path) this.samples.release(m.path);
    }, fade * 1000 + 200);
  }

  stopMusic(fade = 1.0) {
    if (!this.ready) { this.track = null; return; }
    const t = this.ctx.currentTime;
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, t);
    this.musicBus.gain.linearRampToValueAtTime(0.0001, t + fade);
    this._musicStopping = true;
    this._pendingTrack = null;
    clearTimeout(this._musicTimer);
    this._musicTimer = setTimeout(() => {
      this._musicStopping = false;
      this.track = null;
      this._musicToken++;
      this._sampleTrack = false;
      this._stopSampleMusic(0.05);
    }, fade * 1000);
  }

  /** 0 = Erkundung, 1 = voller Kampf. Blendet Schlagzeug und Chor ein. */
  setIntensity(v) { this._targetIntensity = clamp(v, 0, 1); }

  _startScheduler() {
    const LOOKAHEAD = 0.14;     // so weit im Voraus wird geplant
    const TICK = 25;            // ms zwischen zwei Planungsläufen
    this._schedulerId = setInterval(() => {
      if (!this.ready) return;
      if (this.ctx.state === 'suspended') return;
      this._scheduleHeart();
      if (!this.track || this._sampleTrack) return;

      // Intensität sanft nachziehen, sonst springt die Musik.
      this.intensity += (this._targetIntensity - this.intensity) * 0.06;

      const spb = 60 / this.track.bpm;
      const stepDur = spb / 4;   // Sechzehntel

      while (this.nextNoteTime < this.ctx.currentTime + LOOKAHEAD) {
        this._scheduleStep(this.step, this.nextNoteTime, stepDur);
        this.nextNoteTime += stepDur;
        this.step++;
      }
    }, TICK);
  }

  _scheduleStep(step, time, stepDur) {
    const tr = this.track;
    const scale = SCALES[tr.scale] || SCALES.harmonicMinor;
    const barLen = 16;
    const bar = Math.floor(step / barLen);
    const inBar = step % barLen;
    const chordIdx = bar % tr.progression.length;
    const chordRoot = tr.progression[chordIdx];
    const intensity = this.intensity;

    // --- Orgelakkord: einmal pro Takt, lang gehalten ---
    if (inBar === 0) {
      const dur = stepDur * barLen * 0.98;
      const voicing = [0, 2, 4];            // Grundton, Terz, Quinte
      if (intensity > 0.5) voicing.push(6); // Septime, wenn es ernst wird
      for (const v of voicing) {
        const midi = degreeToMidi(tr.root, scale, chordRoot + v);
        this._organ(midiToFreq(midi - 12), time, dur, 0.055 * tr.organ);
      }
    }

    // --- Bass: Grundton auf 1 und 3 ---
    if (inBar === 0 || inBar === 8) {
      const midi = degreeToMidi(tr.root, scale, chordRoot) - 24;
      this._bass(midiToFreq(midi), time, stepDur * 6, 0.16 * tr.bass);
    }

    // --- Cembalo-Arpeggio: das nervöse Herz des Stücks ---
    if (tr.arp > 0 && tr.arpPattern[inBar % tr.arpPattern.length]) {
      const shape = [0, 2, 4, 6, 4, 2];
      const v = shape[(step + chordIdx) % shape.length];
      const midi = degreeToMidi(tr.root, scale, chordRoot + v) + 12;
      this._pluck(midiToFreq(midi), time, 0.34, 0.075 * tr.arp * (0.6 + intensity * 0.4));
    }

    // --- Melodie: sparsam, damit sie wirkt ---
    if (tr.lead > 0 && tr.leadPattern) {
      const note = tr.leadPattern[step % tr.leadPattern.length];
      if (note !== null && note !== undefined) {
        const midi = degreeToMidi(tr.root, scale, chordRoot + note) + 12;
        this._choir(midiToFreq(midi), time, stepDur * 4, 0.05 * tr.lead * (0.45 + intensity * 0.55));
      }
    }

    // --- Schlagwerk: blendet mit der Intensität ein ---
    if (intensity > 0.12) {
      const p = tr.drums || {};
      if (p.kick && p.kick[inBar]) this._kick(time, 0.5 * intensity);
      if (p.taiko && p.taiko[inBar]) this._taiko(time, 0.34 * intensity);
      if (p.bell && p.bell[inBar] && intensity > 0.55) this._bell(time, 0.18 * intensity);
    }

    // --- Glocke zum Taktbeginn in ruhigen Stücken ---
    if (tr.tollEvery && bar % tr.tollEvery === 0 && inBar === 0) {
      this._bell(time, 0.22, degreeToMidi(tr.root, scale, chordRoot) - 12);
    }
  }

  // === Instrumente ==========================================================

  /** Additive Pfeifenorgel: Grundton plus Obertöne, weicher Ein- und Ausschwung. */
  _organ(freq, time, dur, gain) {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, time);
    out.gain.linearRampToValueAtTime(gain, time + 0.09);
    out.gain.setValueAtTime(gain, time + dur - 0.35);
    out.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    out.connect(this.musicBus);
    out.connect(this.musicSend);

    // Registerzüge einer echten Orgel: 16', 8', 5 1/3', 4', 2 2/3', 2'
    const partials = [[1, 1], [2, 0.5], [3, 0.26], [4, 0.2], [6, 0.11], [8, 0.08]];
    const nodes = [];
    for (const [mult, amp] of partials) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * mult;
      // Minimale Verstimmung: sonst klingt es wie ein Synthesizer, nicht wie Pfeifen.
      o.detune.value = (this._rng.next() - 0.5) * 7;
      const g = ctx.createGain();
      g.gain.value = amp;
      o.connect(g); g.connect(out);
      o.start(time); o.stop(time + dur + 0.05);
      nodes.push(o);
    }
    return nodes;
  }

  _bass(freq, time, dur, gain) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = freq * 0.5;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(700, time);
    f.frequency.exponentialRampToValueAtTime(180, time + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(gain, time + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    o.connect(f); sub.connect(f); f.connect(g); g.connect(this.musicBus);
    o.start(time); o.stop(time + dur);
    sub.start(time); sub.stop(time + dur);
  }

  /** Cembalo/Zupfton: Sägezahn durch ein schnell schließendes Filter. */
  _pluck(freq, time, dur, gain) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 3;
    f.frequency.setValueAtTime(freq * 7, time);
    f.frequency.exponentialRampToValueAtTime(Math.max(220, freq * 1.2), time + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(gain, time + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    o.connect(f); f.connect(g);
    g.connect(this.musicBus); g.connect(this.musicSend);
    o.start(time); o.stop(time + dur + 0.02);
  }

  /** Chor: verstimmte Sägezähne, sehr langsamer Einschwung, leichtes Vibrato. */
  _choir(freq, time, dur, gain) {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, time);
    out.gain.linearRampToValueAtTime(gain, time + dur * 0.35);
    out.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1900;
    f.Q.value = 0.8;
    f.connect(out);
    out.connect(this.musicBus);
    out.connect(this.musicSend);

    const vib = ctx.createOscillator();
    vib.type = 'sine';
    vib.frequency.value = 4.6;
    const vibGain = ctx.createGain();
    vibGain.gain.value = 5;
    vib.connect(vibGain);
    vib.start(time); vib.stop(time + dur);

    for (const det of [-9, 0, 9]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = det;
      vibGain.connect(o.detune);
      const g = ctx.createGain();
      g.gain.value = 0.33;
      o.connect(g); g.connect(f);
      o.start(time); o.stop(time + dur);
    }
  }

  _kick(time, gain) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, time);
    o.frequency.exponentialRampToValueAtTime(38, time + 0.13);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);
    o.connect(g); g.connect(this.musicBus);
    o.start(time); o.stop(time + 0.24);
  }

  /** Pauke: tiefer Ton plus Rauschanteil für das Fell. */
  _taiko(time, gain) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(190, time);
    o.frequency.exponentialRampToValueAtTime(72, time + 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.36);
    o.connect(g); g.connect(this.musicBus); g.connect(this.musicSend);
    o.start(time); o.stop(time + 0.38);

    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuffer;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 320;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(gain * 0.5, time);
    ng.gain.exponentialRampToValueAtTime(0.0001, time + 0.1);
    n.connect(nf); nf.connect(ng); ng.connect(this.musicBus);
    n.start(time); n.stop(time + 0.12);
  }

  _bell(time, gain, midi = 62) {
    const ctx = this.ctx;
    const base = midiToFreq(midi);
    // Glocken sind unharmonisch – genau das macht den Klang.
    const partials = [[1, 1], [2.0, 0.5], [2.76, 0.35], [5.4, 0.18], [8.9, 0.09]];
    for (const [mult, amp] of partials) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = base * mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, time);
      g.gain.linearRampToValueAtTime(gain * amp, time + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 2.6 / Math.sqrt(mult));
      o.connect(g); g.connect(this.musicBus); g.connect(this.musicSend);
      o.start(time); o.stop(time + 3.0);
    }
  }

  // === Effekte ==============================================================

  /**
   * Zentrale Effektausgabe. `name` siehe SFX-Liste unten.
   * opts.x   – Weltposition; wird relativ zur Kamera nach links/rechts gelegt
   * opts.gain – Lautstärkefaktor
   */
  play(name, opts = {}) {
    if (!this.ready) return;
    const fn = SFX[name];
    if (!fn) return;
    // Stimmen haben Vorrang: das Tipp-Geräusch der Textbox entfällt, wenn gesprochen wird.
    if (name === 'textBlip' && this.voiceActive()) return;
    // Bei vielen gleichzeitigen Effekten Lautstärke leicht absenken,
    // damit ein Gegnerpulk nicht alles zumatscht.
    const now = this.ctx.currentTime;
    if (now < this._duckUntil) opts = { ...opts, gain: (opts.gain ?? 1) * 0.7 };
    this._duckUntil = now + 0.03;

    let panner = null;
    if (opts.x != null && this.ctx.createStereoPanner) {
      const rel = (opts.x - this._listenerX) / this._halfView;
      // Nicht ganz hart auf eine Seite: auf Fernsehern mit weit auseinander
      // stehenden Boxen klingt 100 % links unnatürlich.
      const pan = clamp(rel * 0.75, -0.85, 0.85);
      // Was weit außerhalb des Bildes passiert, wird leiser.
      const falloff = clamp(1.6 - Math.abs(rel) * 0.6, 0.25, 1);
      opts = { ...opts, gain: (opts.gain ?? 1) * falloff };
      panner = this.ctx.createStereoPanner();
      panner.pan.value = pan;
      panner.connect(this.sfxBus);
    }
    let dur = 1.6;
    const sample = this._sampleFor(name, opts);
    if (sample) {
      dur = this._playSample(sample.path, sample.buf, name, opts, panner);
    } else {
      this._dest = panner;
      try { fn(this, this.ctx.currentTime, opts); } catch { /* nie wegen Sound abstürzen */ }
      this._dest = null;
    }
    if (panner) {
      // Panner nach dem Effekt wieder abbauen.
      setTimeout(() => { try { panner.disconnect(); } catch { /* schon weg */ } }, Math.max(2500, dur * 1000 + 300));
    }
  }

  /** Geladene Aufnahme für einen Effekt – zufällige Variante, nie zweimal dieselbe. */
  _sampleFor(name, opts) {
    const key = name === 'step' ? 'step_' + (opts.surface || 'stone') : name;
    const list = this._path('sfx', key);
    if (!list || !list.length) return null;
    const last = this._lastVariant.get(key);
    let i = Math.floor(this._rng.next() * list.length);
    if (list.length > 1 && i === last) i = (i + 1) % list.length;
    // Noch nicht geladen? Dann irgendeine geladene Variante, sonst Synthese.
    for (let k = 0; k < list.length; k++) {
      const j = (i + k) % list.length;
      const buf = this.samples.now(list[j]);
      if (buf) { this._lastVariant.set(key, j); return { path: list[j], buf }; }
    }
    return null;
  }

  _playSample(path, buf, name, opts, panner) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    // Leicht andere Tonhöhe bei jedem Mal – zehn gleiche Schwerthiebe klingen sonst künstlich.
    const rate = 0.96 + this._rng.next() * 0.08;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = (opts.gain ?? 1) * (SFX_MIX[name] ?? 1) * this.samples.gainFor(path, LEVEL.sfx, 'win', 18);
    src.connect(g);
    g.connect(panner || this.sfxBus);
    g.connect(this.sfxSend);
    src.start(t);
    src.onended = () => { try { g.disconnect(); } catch { /* egal */ } };
    return buf.duration / rate;
  }

  // === Stimmen ==============================================================

  /**
   * Sprachaufnahme abspielen (id aus src/core/voice-id.js).
   * Liefert true, wenn es eine Aufnahme gibt – sie kann aber noch laden.
   */
  playVoice(id) {
    this.stopVoice(0.08);
    if (!this.ready || !id) return false;
    const path = this._path('voice', id);
    if (!path) return false;
    const token = ++this._voiceToken;
    this._voicePending = true;
    this.samples.load(path).then((buf) => {
      if (token !== this._voiceToken) return;
      this._voicePending = false;
      if (!buf) return;
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = this.samples.gainFor(path, LEVEL.voice, 'win', 12);
      src.connect(g);
      g.connect(this.voiceBus);
      src.start(ctx.currentTime + 0.02);
      const v = { src, g, path, end: ctx.currentTime + 0.02 + buf.duration };
      this._voice = v;
      this._duck(true);
      src.onended = () => {
        try { g.disconnect(); } catch { /* egal */ }
        this.samples.release(path);
        if (this._voice === v) { this._voice = null; this._duck(false); }
      };
    });
    return true;
  }

  stopVoice(fade = 0.15) {
    this._voiceToken++;
    this._voicePending = false;
    const v = this._voice;
    if (!v) return;
    this._voice = null;
    const t = this.ctx.currentTime;
    try {
      v.g.gain.cancelScheduledValues(t);
      v.g.gain.setValueAtTime(v.g.gain.value, t);
      v.g.gain.linearRampToValueAtTime(0.0001, t + fade);
      v.src.stop(t + fade + 0.02);
    } catch { /* schon vorbei */ }
    this._duck(false);
  }

  /** Spricht gerade jemand (oder lädt die Aufnahme noch)? */
  voiceActive() { return this._voicePending || !!this._voice; }

  /** Restdauer der laufenden Aufnahme in Sekunden; null = keine, Infinity = lädt noch. */
  voiceRemaining() {
    if (this._voice) return Math.max(0, this._voice.end - this.ctx.currentTime);
    return this._voicePending ? Infinity : null;
  }

  _duck(on) {
    if (!this.ready) return;
    this.musicDuck.gain.setTargetAtTime(on ? 0.5 : 1, this.ctx.currentTime, on ? 0.08 : 0.4);
  }

  /** Kameraposition für die Stereo-Verteilung. Jeden Frame setzen. */
  setListener(x, halfViewWidth) {
    this._listenerX = x;
    if (halfViewWidth) this._halfView = halfViewWidth;
  }

  // === Herzschlag ===========================================================

  /**
   * 0 = aus. Ab ~0.3 hört man ein Pochen, bei 1 rast es.
   * Gleichzeitig wird die Musik dumpfer – du hörst nur noch dein Herz.
   */
  setHeartbeat(v) {
    this._heartRate = clamp(v, 0, 1);
    if (!this.ready) return;
    const cutoff = this._heartRate > 0 ? 20000 - this._heartRate * 18600 : 20000;
    this.musicFilter.frequency.setTargetAtTime(cutoff, this.ctx.currentTime, 0.25);
  }

  /** Musik abdämpfen (Pausenmenü, Dialoge). 0 = offen, 1 = stark gedämpft. */
  setMuffle(v) {
    if (!this.ready) return;
    const cutoff = v > 0 ? 20000 - clamp(v, 0, 1) * 18800 : 20000;
    this.musicFilter.frequency.setTargetAtTime(cutoff, this.ctx.currentTime, 0.12);
  }

  _scheduleHeart() {
    if (this._heartRate <= 0.02) return;
    const t = this.ctx.currentTime;
    if (this._nextBeat < t) this._nextBeat = t + 0.05;
    if (this._nextBeat > t + 0.2) return;
    const bpm = 58 + this._heartRate * 80;
    const g = 0.12 + this._heartRate * 0.3;
    // "Lub-dub": zwei Schläge dicht hintereinander.
    this._thump(this._nextBeat, g);
    this._thump(this._nextBeat + 0.16, g * 0.65);
    this._nextBeat += 60 / bpm;
  }

  _thump(time, gain) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(70, time);
    o.frequency.exponentialRampToValueAtTime(38, time + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(gain, time + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.2);
    o.connect(g); g.connect(this.master);
    o.start(time); o.stop(time + 0.22);
  }

  // === Umgebungsgeräusche ===================================================

  /**
   * Durchgehende Klangkulisse pro Zone: Wind, Regen, Tropfen, Uhrwerk ...
   * Läuft unabhängig von der Musik und wird überblendet.
   */
  setAmbience(kind, fade = 2) {
    if (this._ambienceKind === kind) return;
    this._ambienceKind = kind;
    if (!this.ready) return;
    const old = this.ambience;
    if (old) {
      const t = this.ctx.currentTime;
      old.out.gain.cancelScheduledValues(t);
      old.out.gain.setValueAtTime(old.out.gain.value, t);
      old.out.gain.linearRampToValueAtTime(0.0001, t + fade);
      setTimeout(() => old.stop(), fade * 1000 + 100);
    }
    this.ambience = kind ? this._buildAmbience(kind, fade) : null;
  }

  _loopNoise(filterType, freq, q, gain, dest) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    // Zufälliger Startpunkt, damit zwei Schichten nicht gleich klingen.
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(ctx.currentTime, this._rng.next() * 1.5);
    return { src, f, g };
  }

  _lfo(param, rate, depth) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = rate;
    const g = ctx.createGain();
    g.gain.value = depth;
    o.connect(g); g.connect(param);
    o.start();
    return o;
  }

  _buildAmbience(kind, fade) {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, ctx.currentTime);
    out.connect(this.ambienceBus);
    const sources = [];
    const timers = [];
    const def = AMBIENCE[kind] || {};

    let stopped = false;
    const synthBed = () => {
      // Grundrauschen: Wind, Regen, fließendes Wasser – jeweils anders gefiltert.
      for (const layer of def.layers || []) {
        const n = this._loopNoise(layer.type, layer.freq, layer.q ?? 1, layer.gain, out);
        sources.push(n.src);
        if (layer.sweep) {
          // Langsames Auf und Ab, damit der Wind "atmet".
          sources.push(this._lfo(n.f.frequency, layer.sweep, layer.freq * 0.45));
          sources.push(this._lfo(n.g.gain, layer.sweep * 0.7, layer.gain * 0.5));
        }
      }

      // Tiefer Grundton, den man mehr spürt als hört.
      if (def.drone) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = def.drone;
        const g = ctx.createGain();
        g.gain.value = 0.05;
        o.connect(g); g.connect(out);
        o.start();
        sources.push(o);
        sources.push(this._lfo(g.gain, 0.07, 0.025));
      }
    };

    // Aufgenommene Kulisse als nahtlose Schleife; die einzelnen Ereignisse
    // (Tropfen, Donner, Ticken) kommen weiterhin obendrauf.
    const path = this._path('amb', kind);
    if (path) {
      this.samples.load(path).then((buf) => {
        if (stopped) return;
        if (!buf) { synthBed(); return; }
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const g = ctx.createGain();
        g.gain.value = this.samples.gainFor(path, LEVEL.amb, 'rms', 14);
        src.connect(g); g.connect(out);
        src.start(ctx.currentTime, this._rng.next() * buf.duration);
        sources.push(src);
      });
    } else {
      synthBed();
    }

    // Einzelne Ereignisse in zufälligen Abständen: Tropfen, Donner, Ticken ...
    for (const ev of def.events || []) {
      const schedule = () => {
        if (!this.ready) return;
        try { AMBIENT_EVENTS[ev.kind](this, ctx.currentTime + 0.02, out, ev); } catch { /* egal */ }
        const next = ev.min + this._rng.next() * (ev.max - ev.min);
        timers.push(setTimeout(schedule, next * 1000));
      };
      timers.push(setTimeout(schedule, (ev.min + this._rng.next() * ev.min) * 1000));
    }

    out.gain.linearRampToValueAtTime(def.volume ?? 1, ctx.currentTime + fade);

    return {
      out,
      stop: () => {
        stopped = true;
        for (const t of timers) clearTimeout(t);
        for (const s of sources) { try { s.stop(); } catch { /* schon gestoppt */ } }
        try { out.disconnect(); } catch { /* egal */ }
      },
    };
  }

  /** Kurzer Rauschimpuls durch ein Filter – Basis vieler Effekte. */
  _noiseBurst(time, dur, gain, type, freq, q = 1, sweepTo = null) {
    const ctx = this.ctx;
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuffer;
    n.playbackRate.value = 0.8 + this._rng.next() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, time);
    if (sweepTo != null) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), time + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    n.connect(f); f.connect(g); g.connect(this._dest || this.sfxBus); g.connect(this.sfxSend);
    n.start(time); n.stop(time + dur + 0.02);
    return g;
  }

  _tone(time, dur, gain, type, f0, f1, dest = null) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, time);
    if (f1 != null) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), time + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(gain, time + Math.min(0.012, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    o.connect(g);
    g.connect(dest || this._dest || this.sfxBus);
    g.connect(this.sfxSend);
    o.start(time); o.stop(time + dur + 0.02);
    return g;
  }

  dispose() {
    if (this.ambience) this.ambience.stop();
    this.stopVoice(0.01);
    this._stopSampleMusic(0.01);
    if (this._schedulerId) clearInterval(this._schedulerId);
    this._schedulerId = null;
    if (this.ctx) this.ctx.close().catch(() => {});
    this.ready = false;
  }
}

// === Effektbibliothek =======================================================
// Jeder Eintrag baut seinen Klang aus Rauschen und Oszillatoren zusammen.

const SFX = {
  // Schritte klingen je nach Untergrund anders: Stein, Holz, Wasser, Metall.
  step: (a, t, o) => {
    const g = (o.gain ?? 1) * 0.5;
    const surf = o.surface || 'stone';
    if (surf === 'water') {
      a._noiseBurst(t, 0.16, 0.13 * g, 'bandpass', 900 + a._rng.next() * 400, 2.5, 400);
    } else if (surf === 'wood') {
      a._tone(t, 0.06, 0.1 * g, 'triangle', 180 + a._rng.next() * 40, 110);
      a._noiseBurst(t, 0.05, 0.06 * g, 'bandpass', 1200, 2);
    } else if (surf === 'metal') {
      a._tone(t, 0.1, 0.06 * g, 'square', 520 + a._rng.next() * 120, 300);
      a._noiseBurst(t, 0.06, 0.06 * g, 'highpass', 3000, 3);
    } else {
      a._noiseBurst(t, 0.06, 0.1 * g, 'lowpass', 700 + a._rng.next() * 300, 1.2);
    }
  },
  // Umhang: leises Flattern bei Richtungswechseln und in der Luft.
  cloak: (a, t, o) => {
    const g = (o.gain ?? 1) * 0.6;
    a._noiseBurst(t, 0.22, 0.07 * g, 'bandpass', 700, 0.9, 1500);
  },
  thunder: (a, t, o) => {
    const g = o.gain ?? 1;
    a._noiseBurst(t, 2.6, 0.4 * g, 'lowpass', 420, 0.8, 60);
    a._noiseBurst(t, 0.3, 0.3 * g, 'lowpass', 1600, 1, 300);
  },
  // Ein Gegner bemerkt dich – kurzer, scharfer Hinweis.
  alert: (a, t, o) => {
    const g = o.gain ?? 1;
    a._tone(t, 0.12, 0.1 * g, 'square', 700, 900);
    a._tone(t + 0.1, 0.16, 0.08 * g, 'square', 900, 1100);
  },
  // Heiliges Geschoss: silbrig, hell, mit Nachhall.
  holyShot: (a, t, o) => {
    const g = o.gain ?? 1;
    a._tone(t, 0.35, 0.1 * g, 'sine', 1560, 2340);
    a._tone(t, 0.35, 0.06 * g, 'sine', 2080, 3120);
  },
  arrow: (a, t, o) => {
    const g = o.gain ?? 1;
    a._noiseBurst(t, 0.2, 0.14 * g, 'bandpass', 3000, 5, 1200);
  },
  chain: (a, t, o) => {
    const g = o.gain ?? 1;
    for (let i = 0; i < 5; i++) {
      a._tone(t + i * 0.035, 0.08, 0.05 * g, 'square', 900 + a._rng.next() * 900, 500);
    }
  },
  explosion: (a, t, o) => {
    const g = o.gain ?? 1;
    a._noiseBurst(t, 0.9, 0.42 * g, 'lowpass', 1400, 1, 80);
    a._tone(t, 0.6, 0.3 * g, 'sine', 110, 30);
  },
  gear: (a, t, o) => {
    const g = o.gain ?? 1;
    a._tone(t, 0.05, 0.08 * g, 'square', 240, 200);
    a._noiseBurst(t, 0.04, 0.06 * g, 'highpass', 4000, 2);
  },
  // Gefangener fleht – ein kurzes, menschliches Wimmern.
  plead: (a, t, o) => {
    const g = o.gain ?? 1;
    a._tone(t, 0.5, 0.06 * g, 'triangle', 480, 360);
    a._tone(t + 0.3, 0.5, 0.05 * g, 'triangle', 440, 300);
  },
  // Ein verschonter Gefangener flieht – Schritte, die leiser werden.
  spare: (a, t, o) => {
    const g = o.gain ?? 1;
    for (let i = 0; i < 6; i++) {
      a._noiseBurst(t + i * 0.13, 0.05, 0.1 * g * (1 - i / 7), 'lowpass', 800, 1);
    }
    a._tone(t, 0.8, 0.07 * g, 'sine', 523, 659);
  },
  swing: (a, t, o) => {
    const g = o.gain ?? 1;
    // Luftzug der Klinge: Bandpass fährt von hoch nach tief.
    a._noiseBurst(t, 0.16, 0.16 * g, 'bandpass', 2600, 2.2, 700);
  },
  hit: (a, t, o) => {
    const g = o.gain ?? 1;
    a._noiseBurst(t, 0.1, 0.3 * g, 'bandpass', 1400, 1.4, 320);
    a._tone(t, 0.11, 0.2 * g, 'square', 220, 70);
  },
  hitHeavy: (a, t, o) => {
    const g = o.gain ?? 1;
    a._noiseBurst(t, 0.2, 0.36 * g, 'lowpass', 1800, 1, 220);
    a._tone(t, 0.26, 0.3 * g, 'triangle', 150, 44);
  },
  // Kritischer Treffer: knackt heller und hat einen metallischen Nachklang.
  crit: (a, t, o) => {
    const g = o.gain ?? 1;
    a._noiseBurst(t, 0.14, 0.34 * g, 'highpass', 2400, 1, 1200);
    a._tone(t, 0.3, 0.16 * g, 'square', 880, 330);
  },
  parry: (a, t, o) => {
    const g = o.gain ?? 1;
    a._noiseBurst(t, 0.09, 0.3 * g, 'bandpass', 4200, 6, 2600);
    a._tone(t, 0.38, 0.14 * g, 'sine', 1760, 880);
  },
  jump: (a, t, o) => {
    const g = o.gain ?? 1;
    a._tone(t, 0.14, 0.12 * g, 'sine', 320, 620);
    a._noiseBurst(t, 0.07, 0.06 * g, 'highpass', 1800, 1);
  },
  land: (a, t, o) => {
    const g = o.gain ?? 1;
    a._noiseBurst(t, 0.13, 0.16 * g, 'lowpass', 900, 1, 180);
    a._tone(t, 0.1, 0.12 * g, 'sine', 120, 55);
  },
  dash: (a, t, o) => {
    const g = o.gain ?? 1;
    a._noiseBurst(t, 0.26, 0.2 * g, 'bandpass', 900, 1.6, 2600);
  },
  // Nebelschritt: Rauschen, das sich auflöst statt zuschlägt.
  mist: (a, t, o) => {
    const g = o.gain ?? 1;
    a._noiseBurst(t, 0.5, 0.15 * g, 'lowpass', 2200, 0.6, 320);
    a._tone(t, 0.45, 0.06 * g, 'sine', 520, 160);
  },
  bat: (a, t, o) => {
    const g = o.gain ?? 1;
    // Flügelschlag: drei kurze Impulse dicht hintereinander.
    for (let i = 0; i < 3; i++) {
      a._noiseBurst(t + i * 0.07, 0.06, 0.12 * g, 'bandpass', 1200 - i * 180, 3);
    }
    a._tone(t, 0.2, 0.07 * g, 'sine', 900, 1500);
  },
  lance: (a, t, o) => {
    const g = o.gain ?? 1;
    a._tone(t, 0.3, 0.16 * g, 'sawtooth', 620, 150);
    a._noiseBurst(t, 0.22, 0.14 * g, 'bandpass', 800, 3, 260);
  },
  wolf: (a, t, o) => {
    const g = o.gain ?? 1;
    a._tone(t, 0.55, 0.2 * g, 'sawtooth', 320, 90);
    a._noiseBurst(t, 0.5, 0.24 * g, 'lowpass', 1400, 1, 260);
  },
  // Blut trinken: das wichtigste Geräusch im Spiel. Tiefes Saugen mit Aufschwung.
  drain: (a, t, o) => {
    const g = o.gain ?? 1;
    a._noiseBurst(t, 0.7, 0.2 * g, 'lowpass', 500, 2, 1500);
    a._tone(t, 0.7, 0.13 * g, 'sine', 90, 260);
  },
  drainFinish: (a, t, o) => {
    const g = o.gain ?? 1;
    a._tone(t, 0.5, 0.2 * g, 'sine', 320, 640);
    a._noiseBurst(t, 0.3, 0.18 * g, 'bandpass', 1800, 2, 600);
  },
  // Heiliges Licht verbrennt dich: heller, schneidender Dauerton.
  holyBurn: (a, t, o) => {
    const g = o.gain ?? 1;
    a._tone(t, 0.4, 0.12 * g, 'sine', 2400, 1800);
    a._noiseBurst(t, 0.35, 0.1 * g, 'highpass', 3600, 1);
  },
  hurt: (a, t, o) => {
    const g = o.gain ?? 1;
    a._tone(t, 0.3, 0.2 * g, 'sawtooth', 300, 90);
    a._noiseBurst(t, 0.2, 0.2 * g, 'lowpass', 1200, 1, 300);
  },
  death: (a, t, o) => {
    const g = o.gain ?? 1;
    a._tone(t, 1.6, 0.26 * g, 'sawtooth', 220, 40);
    a._tone(t + 0.1, 1.4, 0.16 * g, 'sine', 110, 30);
    a._noiseBurst(t, 1.2, 0.18 * g, 'lowpass', 900, 1, 120);
  },
  enemyDeath: (a, t, o) => {
    const g = o.gain ?? 1;
    a._noiseBurst(t, 0.42, 0.24 * g, 'bandpass', 900, 1.2, 180);
    a._tone(t, 0.32, 0.12 * g, 'square', 180, 60);
  },
  bossRoar: (a, t, o) => {
    const g = o.gain ?? 1;
    a._tone(t, 1.5, 0.3 * g, 'sawtooth', 130, 58);
    a._tone(t + 0.05, 1.4, 0.2 * g, 'square', 65, 34);
    a._noiseBurst(t, 1.2, 0.22 * g, 'lowpass', 700, 1.4, 160);
  },
  pickup: (a, t, o) => {
    const g = o.gain ?? 1;
    a._tone(t, 0.12, 0.13 * g, 'sine', 880, 1320);
    a._tone(t + 0.09, 0.22, 0.13 * g, 'sine', 1320, 1760);
  },
  // Goldmünze: hell klirrend, leicht verstimmt, damit ein Münzregen nicht monoton ist.
  coin: (a, t, o) => {
    const g = o.gain ?? 1;
    const f = 1900 + a._rng.next() * 500;
    a._tone(t, 0.08, 0.07 * g, 'triangle', f, f * 1.02);
    a._tone(t + 0.05, 0.18, 0.06 * g, 'sine', f * 1.5, null);
  },
  // Kaufen beim Händler: Münzen auf den Tresen
  buy: (a, t, o) => {
    const g = o.gain ?? 1;
    for (let i = 0; i < 4; i++) {
      const f = 1600 + a._rng.next() * 900;
      a._tone(t + i * 0.05, 0.12, 0.06 * g, 'triangle', f, f * 1.01);
    }
    a._tone(t + 0.22, 0.3, 0.08 * g, 'sine', 880, 1320);
  },
  // Trank trinken: Korken, zwei Schlucke, Aufatmen
  drink: (a, t, o) => {
    const g = o.gain ?? 1;
    a._tone(t, 0.05, 0.12 * g, 'sine', 900, 400);
    a._noiseBurst(t + 0.1, 0.12, 0.08 * g, 'bandpass', 500, 3, 300);
    a._noiseBurst(t + 0.26, 0.12, 0.08 * g, 'bandpass', 480, 3, 280);
    a._tone(t + 0.4, 0.4, 0.07 * g, 'sine', 520, 780);
  },
  heartShard: (a, t, o) => {
    const g = o.gain ?? 1;
    for (let i = 0; i < 4; i++) {
      a._tone(t + i * 0.1, 0.4, 0.1 * g, 'sine', 523 * Math.pow(2, i / 6), null);
    }
  },
  levelUp: (a, t, o) => {
    const g = o.gain ?? 1;
    const notes = [261.6, 311.1, 392.0, 523.3];
    notes.forEach((f, i) => a._tone(t + i * 0.08, 0.6, 0.12 * g, 'triangle', f, null));
    a._bell(t + 0.3, 0.12 * g, 74);
  },
  uiMove: (a, t, o) => {
    const g = o.gain ?? 1;
    a._tone(t, 0.06, 0.09 * g, 'square', 620, 760);
  },
  uiConfirm: (a, t, o) => {
    const g = o.gain ?? 1;
    a._tone(t, 0.1, 0.11 * g, 'square', 520, 880);
    a._tone(t + 0.06, 0.14, 0.09 * g, 'square', 880, 1040);
  },
  uiCancel: (a, t, o) => {
    const g = o.gain ?? 1;
    a._tone(t, 0.14, 0.1 * g, 'square', 440, 240);
  },
  uiDeny: (a, t, o) => {
    const g = o.gain ?? 1;
    a._tone(t, 0.2, 0.12 * g, 'sawtooth', 180, 120);
  },
  // Textblip in Dialogen – leicht zufällig, damit es nicht monoton wird.
  textBlip: (a, t, o) => {
    const g = o.gain ?? 1;
    const f = 380 + a._rng.next() * 240;
    a._tone(t, 0.045, 0.05 * g, 'square', f, f * 1.2);
  },
  door: (a, t, o) => {
    const g = o.gain ?? 1;
    a._noiseBurst(t, 1.1, 0.2 * g, 'lowpass', 400, 2, 120);
    a._tone(t, 0.9, 0.1 * g, 'sawtooth', 70, 45);
  },
  checkpoint: (a, t, o) => {
    const g = o.gain ?? 1;
    a._bell(t, 0.16 * g, 69);
    a._bell(t + 0.45, 0.12 * g, 76);
  },
  glassBreak: (a, t, o) => {
    const g = o.gain ?? 1;
    for (let i = 0; i < 7; i++) {
      a._noiseBurst(t + i * 0.025, 0.2, 0.08 * g, 'highpass', 2800 + i * 400, 4);
    }
  },
  stoneBreak: (a, t, o) => {
    const g = o.gain ?? 1;
    a._noiseBurst(t, 0.5, 0.26 * g, 'lowpass', 1100, 1, 160);
    a._tone(t, 0.25, 0.14 * g, 'square', 130, 50);
  },
};

// === Musikstücke ============================================================
// Jede Zone hat ihr eigenes Thema. `progression` sind Stufen der Tonleiter,
// `root` ist der MIDI-Grundton (50 = D3).

const P = (s) => s.split('').map((c) => c !== '.');

export const TRACKS = {
  title: {
    id: 'title', bpm: 62, root: 50, scale: 'harmonicMinor',
    progression: [0, 5, 3, 4],
    organ: 1.0, bass: 0.7, arp: 0.35, lead: 0.8,
    arpPattern: P('#...#...#...#...'),
    leadPattern: [4, null, null, null, 3, null, null, null, 2, null, null, null, null, null, null, null],
    tollEvery: 8,
    drums: { kick: P('................'), taiko: P('#...............'), bell: P('................') },
  },
  krypta: {
    id: 'krypta', bpm: 74, root: 48, scale: 'harmonicMinor',
    progression: [0, 0, 5, 4],
    organ: 0.9, bass: 0.8, arp: 0.5, lead: 0.5,
    arpPattern: P('#..#..#..#..#..#'),
    leadPattern: [0, null, null, null, null, null, 2, null, null, null, null, null, 1, null, null, null],
    tollEvery: 4,
    drums: { kick: P('#.......#.......'), taiko: P('....#.......#..#'), bell: P('........#.......') },
  },
  katakomben: {
    id: 'katakomben', bpm: 80, root: 46, scale: 'phrygianDominant',
    progression: [0, 1, 0, 4],
    organ: 0.75, bass: 0.9, arp: 0.7, lead: 0.55,
    arpPattern: P('#.#.#.#.#.#.#.#.'),
    leadPattern: [1, null, null, 0, null, null, null, null, 4, null, null, 3, null, null, null, null],
    drums: { kick: P('#...#...#...#...'), taiko: P('..#...#...#...#.'), bell: P('............#...') },
  },
  hof: {
    id: 'hof', bpm: 96, root: 50, scale: 'naturalMinor',
    progression: [0, 6, 5, 4],
    organ: 0.6, bass: 1.0, arp: 0.85, lead: 0.7,
    arpPattern: P('#.##.#.##.#.##.#'),
    leadPattern: [4, null, 5, null, 4, null, 2, null, 0, null, null, null, null, null, null, null],
    drums: { kick: P('#..#..#.#..#..#.'), taiko: P('....#.......#...'), bell: P('#.......#.......') },
  },
  bibliothek: {
    id: 'bibliothek', bpm: 68, root: 53, scale: 'harmonicMinor',
    progression: [0, 3, 4, 0],
    organ: 1.0, bass: 0.55, arp: 0.95, lead: 0.6,
    arpPattern: P('##.###.###.###.#'),
    leadPattern: [6, null, null, null, 4, null, null, null, 2, null, null, null, 4, null, null, null],
    tollEvery: 8,
    drums: { kick: P('#.......#.......'), taiko: P('........#.......'), bell: P('#...#...#...#...') },
  },
  uhrturm: {
    id: 'uhrturm', bpm: 112, root: 49, scale: 'locrian',
    progression: [0, 0, 3, 3],
    organ: 0.5, bass: 0.95, arp: 1.0, lead: 0.5,
    // Gleichmäßige Sechzehntel wie ein Uhrwerk, das nie stehenbleibt.
    arpPattern: P('################'),
    leadPattern: [0, null, null, null, null, null, null, null, 4, null, null, null, null, null, null, null],
    drums: { kick: P('#...#...#...#...'), taiko: P('..#...#...#...#.'), bell: P('#.......#.......') },
  },
  kathedrale: {
    id: 'kathedrale', bpm: 88, root: 47, scale: 'harmonicMinor',
    progression: [0, 5, 6, 4],
    organ: 1.0, bass: 1.0, arp: 0.8, lead: 1.0,
    arpPattern: P('#.#.#.#.#.#.#.#.'),
    leadPattern: [0, null, null, 2, null, null, 4, null, null, 6, null, null, 4, null, null, null],
    tollEvery: 4,
    drums: { kick: P('#...#...#...#...'), taiko: P('#.#...#.#.#...#.'), bell: P('#.......#.......') },
  },
  boss: {
    id: 'boss', bpm: 132, root: 45, scale: 'phrygianDominant',
    progression: [0, 0, 1, 0],
    organ: 0.85, bass: 1.0, arp: 1.0, lead: 0.9,
    arpPattern: P('################'),
    leadPattern: [0, null, 1, null, 0, null, 4, null, 3, null, 1, null, 0, null, null, null],
    drums: { kick: P('#.#.#.#.#.#.#.#.'), taiko: P('..#...#...#...#.'), bell: P('#...#...#...#...') },
  },
  finale: {
    id: 'finale', bpm: 146, root: 43, scale: 'phrygianDominant',
    progression: [0, 1, 0, 6],
    organ: 1.0, bass: 1.0, arp: 1.0, lead: 1.0,
    arpPattern: P('################'),
    leadPattern: [0, 1, null, 0, 4, null, 3, null, 1, null, 0, null, 6, null, 0, null],
    tollEvery: 2,
    drums: { kick: P('#.#.#.#.#.#.#.#.'), taiko: P('#.#.#.#.#.#.#.#.'), bell: P('#...#...#...#...') },
  },
  // Ruhe am Sarg: nur Orgel und ferne Glocke.
  sanctuary: {
    id: 'sanctuary', bpm: 54, root: 50, scale: 'naturalMinor',
    progression: [0, 3, 4, 0],
    organ: 0.8, bass: 0.4, arp: 0, lead: 0.4,
    arpPattern: P('................'),
    leadPattern: [4, null, null, null, null, null, null, null, 2, null, null, null, null, null, null, null],
    tollEvery: 4,
    drums: {},
  },
};

// === Umgebungsgeräusche =====================================================

const AMBIENCE = {
  // Gruft: fast Stille. Ein tiefes Brummen und ab und zu ein Tropfen.
  crypt: {
    volume: 0.9,
    drone: 41,
    layers: [{ type: 'lowpass', freq: 260, q: 0.7, gain: 0.05, sweep: 0.05 }],
    events: [{ kind: 'drip', min: 1.2, max: 4.5 }, { kind: 'creak', min: 9, max: 22 }],
  },
  // Katakomben: fließendes Wasser, viele Tropfen.
  water: {
    volume: 1,
    drone: 44,
    layers: [
      { type: 'bandpass', freq: 900, q: 0.6, gain: 0.05, sweep: 0.11 },
      { type: 'lowpass', freq: 380, q: 0.5, gain: 0.06 },
    ],
    events: [{ kind: 'drip', min: 0.4, max: 1.8 }, { kind: 'drip', min: 0.7, max: 2.4 }],
  },
  // Hof: Regen, Wind und Gewitter unter dem Blutmond.
  storm: {
    volume: 1,
    layers: [
      { type: 'highpass', freq: 2600, q: 0.4, gain: 0.07 },                 // Regen
      { type: 'bandpass', freq: 520, q: 0.8, gain: 0.06, sweep: 0.08 },     // Wind
    ],
    events: [{ kind: 'thunder', min: 9, max: 22 }, { kind: 'crow', min: 12, max: 30 }],
  },
  // Bibliothek: Kaminfeuer und raschelnde Seiten.
  library: {
    volume: 0.85,
    drone: 49,
    layers: [{ type: 'lowpass', freq: 340, q: 0.6, gain: 0.035 }],
    events: [{ kind: 'crackle', min: 0.08, max: 0.5 }, { kind: 'pages', min: 5, max: 14 }],
  },
  // Uhrturm: Das Uhrwerk tickt unablässig.
  clockwork: {
    volume: 0.9,
    layers: [{ type: 'bandpass', freq: 700, q: 0.6, gain: 0.03, sweep: 0.06 }],
    events: [{ kind: 'tick', min: 0.5, max: 0.5 }, { kind: 'gearGrind', min: 4, max: 10 }],
  },
  // Kathedrale: weiter Raum, Wind durch zerbrochene Fenster, ferner Chor.
  cathedral: {
    volume: 1,
    drone: 36,
    layers: [{ type: 'bandpass', freq: 440, q: 0.9, gain: 0.05, sweep: 0.04 }],
    events: [{ kind: 'distantChoir', min: 7, max: 16 }, { kind: 'creak', min: 10, max: 20 }],
  },
};

const AMBIENT_EVENTS = {
  drip(a, t, out) {
    const ctx = a.ctx;
    const f0 = 900 + a._rng.next() * 1400;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 2.2, t + 0.06);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    o.connect(g);
    if (pan) { pan.pan.value = a._rng.next() * 1.6 - 0.8; g.connect(pan); pan.connect(out); } else g.connect(out);
    g.connect(a.sfxSend);
    o.start(t); o.stop(t + 0.14);
  },
  creak(a, t, out) {
    const ctx = a.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(60 + a._rng.next() * 30, t);
    o.frequency.linearRampToValueAtTime(90 + a._rng.next() * 40, t + 0.9);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.03, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    o.connect(f); f.connect(g); g.connect(out); g.connect(a.sfxSend);
    o.start(t); o.stop(t + 1.2);
  },
  thunder(a, t, out) {
    // Erst der Knall, dann das lange Grollen.
    const g1 = a._noiseBurst(t, 0.4, 0.22, 'lowpass', 2200, 1, 400);
    const g2 = a._noiseBurst(t + 0.15, 3.2, 0.3, 'lowpass', 380, 0.8, 50);
    for (const g of [g1, g2]) { try { g.disconnect(a.sfxBus); } catch { /* egal */ } g.connect(out); }
    a._onThunder && a._onThunder();
  },
  crow(a, t, out) {
    for (let i = 0; i < 2; i++) {
      const g = a._tone(t + i * 0.28, 0.2, 0.04, 'sawtooth', 900, 620);
      try { g.disconnect(a.sfxBus); } catch { /* egal */ } g.connect(out);
    }
  },
  crackle(a, t, out) {
    const g = a._noiseBurst(t, 0.03, 0.04 + a._rng.next() * 0.05, 'highpass', 2200 + a._rng.next() * 2000, 1.5);
    try { g.disconnect(a.sfxBus); } catch { /* egal */ } g.connect(out);
  },
  pages(a, t, out) {
    for (let i = 0; i < 4; i++) {
      const g = a._noiseBurst(t + i * 0.06, 0.08, 0.03, 'bandpass', 3000 + i * 300, 1.5);
      try { g.disconnect(a.sfxBus); } catch { /* egal */ } g.connect(out);
    }
  },
  tick(a, t, out) {
    // Tick und Tack abwechselnd, leicht unterschiedlich hoch.
    a._tickToggle = !a._tickToggle;
    const f = a._tickToggle ? 2400 : 1900;
    const g = a._tone(t, 0.03, 0.07, 'square', f, f * 0.8);
    try { g.disconnect(a.sfxBus); } catch { /* egal */ } g.connect(out);
  },
  gearGrind(a, t, out) {
    const g = a._noiseBurst(t, 1.3, 0.05, 'bandpass', 420, 4, 280);
    try { g.disconnect(a.sfxBus); } catch { /* egal */ } g.connect(out);
  },
  distantChoir(a, t, out) {
    // Ferner, gedämpfter Chorakkord – als sänge jemand in einem anderen Flügel.
    const root = 50 + Math.floor(a._rng.next() * 3) * 2;
    for (const iv of [0, 3, 7]) {
      const ctx = a.ctx;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midiToFreq(root + iv);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 700;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.012, t + 1.8);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
      o.connect(f); f.connect(g); g.connect(out); g.connect(a.musicSend);
      o.start(t); o.stop(t + 4.6);
    }
  },
};
