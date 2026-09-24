// Der Renderer: macht aus einfachen Zeichenbefehlen den modernen 2.5D-Look.
//
// Pipeline pro Bild:
//   1. Licht        – eigener Puffer (halbe Auflösung): Umgebungsdunkel + Lichter
//                     mit Schattenwurf. Wird zuerst berechnet, gebraucht von 2 und 3.
//   2. Hintergrund  – Parallax-Kulisse direkt in die Szene; bekommt das Licht nur
//                     TEILWEISE ab, damit ferne Gewölbe im Nebel sichtbar bleiben
//   3. Welt         – Kacheln, Figuren, Partikel in einen transparenten Puffer,
//                     voll beleuchtet (multiply), Alpha wiederhergestellt, auf die Szene
//   4. Leuchten     – Emissive Dinge (Blutmagie, Augen, heiliges Licht) werden
//                     nach dem Licht additiv gezeichnet und zusätzlich in einen
//                     Glow-Puffer (Viertelauflösung), der weichgezeichnet wird = Bloom
//   5. Nachbearbeitung – Farbkorrektur pro Zone, Vignette, Filmkorn, Blitze
//   6. Ausgabe      – skaliert, im 16:9-Letterbox, mit Overscan-Ausgleich
//   7. HUD          – direkt in Bildschirmauflösung, damit Schrift auf dem TV scharf ist
//
// Welt-Einheiten (WE) sind von Pixeln entkoppelt: die Kamera zeigt immer
// 640x360 WE. `scale` bestimmt, wie viele Pixel eine WE hat.

import { VIEW_W, VIEW_H, QUALITY_HEIGHTS } from '../data/config.js';
import { clamp, makeRng } from '../core/math.js';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

const UI_W = 1920;
const UI_H = 1080;

export class Renderer {
  constructor(displayCanvas, settings) {
    this.display = displayCanvas;
    this.dctx = displayCanvas.getContext('2d', { alpha: false });
    this.settings = settings;

    this.scale = QUALITY_HEIGHTS[2] / VIEW_H;
    this.camX = 0;
    this.camY = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.zoom = 1;

    // Effektzustände, die das Spiel von außen anstößt.
    this.flash = { r: 255, g: 255, b: 255, a: 0 };
    this.fade = 0;               // 0 = sichtbar, 1 = schwarz
    this.chroma = 0;             // chromatische Aberration (nach harten Treffern)
    this.lightning = 0;          // Blitzschlag im Hof
    this.bloodTint = 0;          // Rotstich bei wenig Leben
    this.desaturate = 0;         // Graustufen beim Tod

    // Grading pro Zone (wird von der Welt gesetzt).
    this.grade = { tint: 'rgba(40,20,60,0.18)', mode: 'soft-light', ambient: [26, 22, 40] };

    this.letterbox = { x: 0, y: 0, w: 1, h: 1 };
    this._lightSprites = new Map();
    this._supportsFilter = false;
    this._grainOffset = 0;
    this.time = 0;

    this._buildBuffers();
    this._buildStatic();
    this.resize();
  }

  // --- Einrichtung ---------------------------------------------------------

  _buildBuffers() {
    const s = this.scale;
    this.scene = makeCanvas(VIEW_W * s, VIEW_H * s);
    this.sctx = this.scene.getContext('2d', { alpha: false });

    // Lichtpuffer in halber Auflösung: Licht ist ohnehin weich, das spart viel Rechenzeit.
    this.lightRes = s * 0.5;
    this.light = makeCanvas(VIEW_W * this.lightRes, VIEW_H * this.lightRes);
    this.lctx = this.light.getContext('2d');
    this.lightTmp = makeCanvas(this.light.width, this.light.height);
    this.ltctx = this.lightTmp.getContext('2d');

    // Glow-Puffer in Viertelauflösung – wird für Bloom weichgezeichnet.
    this.glowRes = Math.max(0.5, s * 0.25);
    this.glow = makeCanvas(VIEW_W * this.glowRes, VIEW_H * this.glowRes);
    this.gctx = this.glow.getContext('2d');
    this.glowBlur = makeCanvas(this.glow.width, this.glow.height);
    this.gbctx = this.glowBlur.getContext('2d');

    // Kulisse in halber Auflösung: sie ist weich gemalt, die leichte Unschärfe
    // wirkt wie Tiefenunschärfe – und spart auf schwachen TV-GPUs viel Zeit.
    this.bgRes = s * 0.5;
    this.bgBuf = makeCanvas(VIEW_W * this.bgRes, VIEW_H * this.bgRes);
    this.bctx = this.bgBuf.getContext('2d', { alpha: false });
    this.glowBlur2 = makeCanvas(this.glow.width, this.glow.height);
    this.gb2ctx = this.glowBlur2.getContext('2d');

    // Welt-Ebene mit Transparenz – wird separat beleuchtet.
    this.worldBuf = makeCanvas(this.scene.width, this.scene.height);
    this.wctx = this.worldBuf.getContext('2d');

    this.fx = makeCanvas(this.scene.width, this.scene.height);
    this.fxctx = this.fx.getContext('2d');

    this._supportsFilter = typeof this.gctx.filter === 'string';
    for (const c of [this.sctx, this.lctx, this.gctx, this.wctx, this.bctx]) {
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = 'high';
    }
  }

  _buildStatic() {
    // Filmkorn: kleine Rauschkachel, jedes Bild mit anderem Versatz gezeichnet.
    const g = makeCanvas(256, 256);
    const gc = g.getContext('2d');
    const img = gc.createImageData(256, 256);
    const rng = makeRng(99);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.floor(rng.next() * 255);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    gc.putImageData(img, 0, 0);
    this.grainTex = g;
  }

  _buildVignette(w, h) {
    const v = makeCanvas(w, h);
    const c = v.getContext('2d');
    const r = Math.hypot(w, h) * 0.5;
    const grad = c.createRadialGradient(w / 2, h * 0.46, r * 0.32, w / 2, h / 2, r * 1.02);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.16)');
    grad.addColorStop(1, 'rgba(0,0,0,0.8)');
    c.fillStyle = grad;
    c.fillRect(0, 0, w, h);
    this.vignette = v;
  }

  /** Grafikstufe (0–3) in Pixel pro Welteinheit umrechnen. */
  static scaleFor(quality) {
    const q = clamp(Math.round(quality ?? 2), 0, QUALITY_HEIGHTS.length - 1);
    return QUALITY_HEIGHTS[q] / VIEW_H;
  }

  setScale(s) {
    s = clamp(s, 1, 6);
    if (s === this.scale) return;
    this.scale = s;
    this._lightSprites.clear();
    this._grainPattern = null;
    this._buildBuffers();
    this._buildVignette(this.scene.width, this.scene.height);
    this.onScaleChange && this.onScaleChange(s);
  }

  applySettings(settings) {
    this.settings = settings;
    this.setScale(Renderer.scaleFor(settings.quality));
    this.resize();
  }

  /** An Fenstergröße anpassen: größtes 16:9-Rechteck, abzüglich Overscan. */
  resize() {
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const ww = globalThis.innerWidth || UI_W;
    const wh = globalThis.innerHeight || UI_H;
    // Anzeige-Canvas höchstens 4K, damit schwache TV-Browser nicht ersticken.
    const pw = Math.min(Math.round(ww * dpr), 3840);
    const ph = Math.min(Math.round(wh * dpr), 2160);
    if (this.display.width !== pw || this.display.height !== ph) {
      this.display.width = pw;
      this.display.height = ph;
    }
    this.display.style.width = ww + 'px';
    this.display.style.height = wh + 'px';

    const inset = clamp((this.settings.safeAreaInset || 0) / 100, 0, 0.1);
    const availW = pw * (1 - inset * 2);
    const availH = ph * (1 - inset * 2);
    const target = VIEW_W / VIEW_H;
    let w = availW, h = availW / target;
    if (h > availH) { h = availH; w = availH * target; }
    this.letterbox = {
      x: Math.round((pw - w) / 2),
      y: Math.round((ph - h) / 2),
      w: Math.round(w),
      h: Math.round(h),
    };
    if (!this.vignette || this.vignette.width !== this.scene.width) {
      this._buildVignette(this.scene.width, this.scene.height);
    }
  }

  // --- Kamera --------------------------------------------------------------

  setCamera(x, y, shakeX = 0, shakeY = 0, zoom = 1) {
    this.camX = x;
    this.camY = y;
    this.shakeX = shakeX;
    this.shakeY = shakeY;
    this.zoom = zoom;
  }

  /**
   * Weltkoordinaten -> Canvas-Transformation für einen Puffer mit Auflösung `res`.
   * Die Position wird auf ganze Pixel gerundet – sonst flimmern Kachelkanten.
   */
  _worldTransform(ctx, res, parallax = 1) {
    const z = this.zoom;
    const cx = (this.camX + this.shakeX) * parallax;
    const cy = (this.camY + this.shakeY) * parallax;
    const k = res * z;
    // Zoom um die Bildmitte.
    const ox = (VIEW_W * res) / 2 - (VIEW_W / 2) * k;
    const oy = (VIEW_H * res) / 2 - (VIEW_H / 2) * k;
    ctx.setTransform(k, 0, 0, k, Math.round(-cx * k + ox), Math.round(-cy * k + oy));
  }

  /** Weltkoordinate -> virtuelle UI-Koordinate (1920×1080), für Aufforderungen und Sprechblasen. */
  worldToUI(wx, wy) {
    const z = this.zoom;
    const sx = (wx - (this.camX + this.shakeX)) * z + (VIEW_W / 2) * (1 - z);
    const sy = (wy - (this.camY + this.shakeY)) * z + (VIEW_H / 2) * (1 - z);
    return { x: sx * (UI_W / VIEW_W), y: sy * (UI_H / VIEW_H) };
  }

  /** Sichtbarer Weltausschnitt (mit Rand), fürs Aussortieren. */
  viewRect(margin = 0) {
    const w = VIEW_W / this.zoom, h = VIEW_H / this.zoom;
    const x = this.camX + (VIEW_W - w) / 2;
    const y = this.camY + (VIEW_H - h) / 2;
    return { x: x - margin, y: y - margin, w: w + margin * 2, h: h + margin * 2 };
  }

  // --- Bildaufbau ----------------------------------------------------------

  beginFrame(dt) {
    this.time += dt;
    const c = this.sctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    const b = this.bctx;
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.globalCompositeOperation = 'source-over';
    b.globalAlpha = 1;
    b.fillStyle = '#05040a';
    b.fillRect(0, 0, this.bgBuf.width, this.bgBuf.height);

    const g = this.gctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, this.glow.width, this.glow.height);

    const w = this.wctx;
    w.setTransform(1, 0, 0, 1, 0, 0);
    w.globalCompositeOperation = 'source-over';
    w.globalAlpha = 1;
    w.clearRect(0, 0, this.worldBuf.width, this.worldBuf.height);
  }

  /** Kulisse in Weltkoordinaten (halbe Auflösung). parallax < 1 = weiter hinten. */
  background(fn, parallax = 1) {
    const c = this.bctx;
    c.save();
    this._worldTransform(c, this.bgRes, parallax);
    fn(c);
    c.restore();
  }

  /** Kulisse in Bildschirmkoordinaten (Himmel, Mond – bewegen sich nicht mit). */
  backgroundScreen(fn) {
    const c = this.bctx;
    c.save();
    c.setTransform(this.bgRes, 0, 0, this.bgRes, 0, 0);
    fn(c);
    c.restore();
  }

  /** Fertige Kulisse (mit Farbstimmung der Zone) in die Szene übernehmen. */
  flushBackground() {
    const b = this.bctx;
    if (this.grade.tint) {
      b.save();
      b.setTransform(1, 0, 0, 1, 0, 0);
      b.globalCompositeOperation = this.grade.mode || 'soft-light';
      b.fillStyle = this.grade.tint;
      b.fillRect(0, 0, this.bgBuf.width, this.bgBuf.height);
      b.restore();
    }
    const sc = this.sctx;
    sc.save();
    sc.setTransform(1, 0, 0, 1, 0, 0);
    sc.globalCompositeOperation = 'copy';
    sc.drawImage(this.bgBuf, 0, 0, this.scene.width, this.scene.height);
    sc.restore();
  }

  /** Unbeleuchtet über die fertige Szene zeichnen (Schadenszahlen u. Ä.). */
  overlay(fn) {
    const c = this.sctx;
    c.save();
    this._worldTransform(c, this.scale);
    fn(c);
    c.restore();
  }

  /**
   * Hintergrund teilweise beleuchten: `strength` 0 = gar nicht (bleibt wie
   * gemalt), 1 = voll (wird so dunkel wie die Welt).
   */
  lightBackground(strength = 0.6) {
    const sc = this.sctx;
    sc.save();
    sc.setTransform(1, 0, 0, 1, 0, 0);
    sc.globalCompositeOperation = 'multiply';
    sc.globalAlpha = clamp(strength, 0, 1);
    sc.drawImage(this.light, 0, 0, this.scene.width, this.scene.height);
    sc.restore();
  }

  /** Zeichnet mit Weltkoordinaten in die Welt-Ebene (Kacheln, Figuren ...). */
  world(fn) {
    const c = this.wctx;
    c.save();
    this._worldTransform(c, this.scale);
    fn(c);
    c.restore();
  }

  /**
   * Welt-Ebene beleuchten und auf die Szene legen.
   * "multiply" auf transparentem Grund würde die Lücken mit Lichtfarbe füllen –
   * deshalb Alpha vorher sichern und hinterher per "destination-in" zurücksetzen.
   */
  compositeWorld() {
    const w = this.wctx;
    const fc = this.fxctx;
    fc.setTransform(1, 0, 0, 1, 0, 0);
    fc.globalCompositeOperation = 'copy';
    fc.globalAlpha = 1;
    fc.drawImage(this.worldBuf, 0, 0);

    w.save();
    w.setTransform(1, 0, 0, 1, 0, 0);
    w.globalAlpha = 1;
    w.globalCompositeOperation = 'multiply';
    w.drawImage(this.light, 0, 0, this.worldBuf.width, this.worldBuf.height);
    w.globalCompositeOperation = 'destination-in';
    w.drawImage(this.fx, 0, 0);
    w.restore();

    const sc = this.sctx;
    sc.save();
    sc.setTransform(1, 0, 0, 1, 0, 0);
    sc.globalCompositeOperation = 'source-over';
    sc.globalAlpha = 1;
    sc.drawImage(this.worldBuf, 0, 0);
    sc.restore();
  }

  /** Zeichnet in Bildschirmkoordinaten (0..VIEW_W, 0..VIEW_H) in die Szene. */
  screen(fn) {
    const c = this.sctx;
    c.save();
    c.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    fn(c);
    c.restore();
  }

  /**
   * Leuchtende Objekte: Werden nach dem Licht additiv in die Szene gezeichnet
   * (also nicht vom Dunkel verschluckt) und zusätzlich in den Bloom-Puffer.
   */
  emissive(fn) {
    const c = this.sctx;
    c.save();
    this._worldTransform(c, this.scale);
    c.globalCompositeOperation = 'lighter';
    fn(c, false);
    c.restore();

    const g = this.gctx;
    g.save();
    this._worldTransform(g, this.glowRes);
    g.globalCompositeOperation = 'lighter';
    fn(g, true);
    g.restore();
  }

  /** Nur in den Bloom-Puffer – für reinen Schein ohne sichtbaren Kern. */
  glowOnly(fn) {
    const g = this.gctx;
    g.save();
    this._worldTransform(g, this.glowRes);
    g.globalCompositeOperation = 'lighter';
    fn(g);
    g.restore();
  }

  // --- Licht und Schatten --------------------------------------------------

  /** Weicher Lichtkegel als vorberechnetes Bild pro Farbe – schneller als ein Gradient pro Bild. */
  _lightSprite(color) {
    let spr = this._lightSprites.get(color);
    if (spr) return spr;
    const size = 128;
    spr = makeCanvas(size, size);
    const c = spr.getContext('2d');
    const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    // Heller Kern, breites Plateau, weicher Auslauf. Kräftig genug, dass
    // angestrahlte Mauern auch auf einem Fernseher mit tiefem Schwarz lesbar sind.
    g.addColorStop(0, color);
    g.addColorStop(0.25, withAlpha(color, 0.86));
    g.addColorStop(0.5, withAlpha(color, 0.52));
    g.addColorStop(0.75, withAlpha(color, 0.2));
    g.addColorStop(1, withAlpha(color, 0));
    c.fillStyle = g;
    c.fillRect(0, 0, size, size);
    this._lightSprites.set(color, spr);
    return spr;
  }

  /**
   * Lichtpuffer berechnen (noch nicht anwenden – das machen lightBackground
   * und compositeWorld).
   * @param lights    [{x,y,radius,color,intensity,shadows}]
   * @param queryOccluders (x,y,w,h) => [{x,y,w,h}]  undurchsichtige Rechtecke
   */
  computeLights(lights, queryOccluders) {
    const lc = this.lctx;
    const res = this.lightRes;
    // Helligkeit aus den Einstellungen: hebt das Umgebungslicht an, damit
    // dunkle Ecken auf Fernsehern mit "verschlucktem" Schwarz lesbar bleiben.
    const bright = clamp(this.settings.brightness ?? 1, 0.6, 1.8);
    const lift = (bright - 1) * 40;
    const amb = this.grade.ambient.map((v) => clamp(v * bright + lift, 0, 255));

    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalCompositeOperation = 'source-over';
    lc.globalAlpha = 1;
    // Blitze hellen die ganze Welt kurz auf.
    const lb = this.lightning * 190;
    lc.fillStyle = `rgb(${Math.min(255, amb[0] + lb)},${Math.min(255, amb[1] + lb)},${Math.min(255, amb[2] + lb * 1.1)})`;
    lc.fillRect(0, 0, this.light.width, this.light.height);

    const view = this.viewRect(0);
    for (const L of lights) {
      const r = L.radius;
      if (L.x + r < view.x || L.x - r > view.x + view.w || L.y + r < view.y || L.y - r > view.y + view.h) continue;
      const spr = this._lightSprite(L.color);
      const intensity = clamp(L.intensity ?? 1, 0, 3);

      if (L.shadows && queryOccluders) {
        this._renderShadowedLight(L, spr, intensity, queryOccluders);
      } else {
        lc.save();
        this._worldTransform(lc, res);
        lc.globalCompositeOperation = 'lighter';
        // Intensität > 1: Licht mehrfach aufaddieren.
        let rest = intensity;
        while (rest > 0.001) {
          lc.globalAlpha = Math.min(1, rest);
          lc.drawImage(spr, L.x - r, L.y - r, r * 2, r * 2);
          rest -= 1;
        }
        lc.restore();
      }
    }

  }

  _renderShadowedLight(L, spr, intensity, queryOccluders) {
    const tc = this.ltctx;
    const res = this.lightRes;
    const r = L.radius;

    // Nur den Bereich des Lichts bearbeiten, nicht den ganzen Puffer.
    const bb = this._lightBox(L, res);
    if (!bb) return;
    tc.setTransform(1, 0, 0, 1, 0, 0);
    tc.globalCompositeOperation = 'source-over';
    tc.globalAlpha = 1;
    tc.clearRect(bb.x, bb.y, bb.w, bb.h);

    tc.save();
    this._worldTransform(tc, res);
    let rest = intensity;
    while (rest > 0.001) {
      tc.globalAlpha = Math.min(1, rest);
      tc.drawImage(spr, L.x - r, L.y - r, r * 2, r * 2);
      rest -= 1;
    }
    tc.globalAlpha = 1;

    // Schatten: Für jede Kante eines Hindernisses, die vom Licht WEG zeigt,
    // wird ein Viereck bis weit hinter das Hindernis ausgestanzt. Das Hindernis
    // selbst bleibt beleuchtet – so leuchten angestrahlte Wände schön auf.
    const occ = queryOccluders(L.x - r, L.y - r, r * 2, r * 2);
    if (occ.length) {
      tc.globalCompositeOperation = 'destination-out';
      tc.fillStyle = '#000';
      tc.beginPath();
      const far = r * 4;
      for (const o of occ) {
        // Liegt das Licht im Hindernis, wirft es keine Schatten davon.
        if (L.x > o.x && L.x < o.x + o.w && L.y > o.y && L.y < o.y + o.h) continue;
        const x0 = o.x, y0 = o.y, x1 = o.x + o.w, y1 = o.y + o.h;
        // Eine Kante wirft Schatten, wenn ihre Außennormale vom Licht wegzeigt.
        // Steht das Licht z. B. mittig über dem Block, sind das Unter-, Links-
        // UND Rechtskante – nur so gibt es keine Lücken neben dem Block.
        if (L.y < y1) castEdge(tc, L, x0, y1, x1, y1, far); // Unterkante (Normale nach unten)
        if (L.y > y0) castEdge(tc, L, x0, y0, x1, y0, far); // Oberkante  (Normale nach oben)
        if (L.x < x1) castEdge(tc, L, x1, y0, x1, y1, far); // Rechtskante
        if (L.x > x0) castEdge(tc, L, x0, y0, x0, y1, far); // Linkskante
      }
      tc.fill();
    }
    tc.restore();

    const lc = this.lctx;
    lc.save();
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalCompositeOperation = 'lighter';
    lc.drawImage(this.lightTmp, bb.x, bb.y, bb.w, bb.h, bb.x, bb.y, bb.w, bb.h);
    lc.restore();
  }

  /** Pixel-Rechteck eines Lichts im Lichtpuffer (auf den Puffer beschnitten). */
  _lightBox(L, res) {
    const z = this.zoom, k = res * z;
    const ox = (VIEW_W * res) / 2 - (VIEW_W / 2) * k - (this.camX + this.shakeX) * k;
    const oy = (VIEW_H * res) / 2 - (VIEW_H / 2) * k - (this.camY + this.shakeY) * k;
    const x0 = Math.max(0, Math.floor((L.x - L.radius) * k + ox) - 2);
    const y0 = Math.max(0, Math.floor((L.y - L.radius) * k + oy) - 2);
    const x1 = Math.min(this.light.width, Math.ceil((L.x + L.radius) * k + ox) + 2);
    const y1 = Math.min(this.light.height, Math.ceil((L.y + L.radius) * k + oy) + 2);
    if (x1 <= x0 || y1 <= y0) return null;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  // --- Nachbearbeitung und Ausgabe ----------------------------------------

  endFrame() {
    const sc = this.sctx;
    const s = this.settings;
    sc.save();
    sc.setTransform(1, 0, 0, 1, 0, 0);

    // Bloom: Glow-Puffer weichzeichnen und in zwei Radien aufaddieren –
    // eng für den Kern, weit für den Hof um helle Lichter.
    if (s.bloom) {
      const gb = this.gbctx;
      gb.setTransform(1, 0, 0, 1, 0, 0);
      gb.globalCompositeOperation = 'source-over';
      gb.clearRect(0, 0, this.glowBlur.width, this.glowBlur.height);
      if (this._supportsFilter) {
        gb.filter = `blur(${Math.max(1, 3 * this.glowRes)}px)`;
        gb.drawImage(this.glow, 0, 0);
        gb.filter = 'none';
      } else {
        gb.drawImage(this.glow, 0, 0);
      }
      // Weiter Hof: stärker weichgezeichnet, ebenfalls in Viertelauflösung.
      const g2 = this.gb2ctx;
      g2.setTransform(1, 0, 0, 1, 0, 0);
      g2.globalCompositeOperation = 'source-over';
      g2.clearRect(0, 0, this.glowBlur2.width, this.glowBlur2.height);
      if (this._supportsFilter) {
        g2.filter = `blur(${Math.max(2, 9 * this.glowRes)}px)`;
        g2.drawImage(this.glowBlur, 0, 0);
        g2.filter = 'none';
      }
      // Beide Stufen in einem Durchgang aufaddieren: erst klein ineinander, dann hochskaliert.
      gb.globalCompositeOperation = 'lighter';
      gb.globalAlpha = 0.6;
      gb.drawImage(this.glowBlur2, 0, 0);
      gb.globalAlpha = 1;
      sc.globalCompositeOperation = 'lighter';
      sc.globalAlpha = 0.95;
      sc.drawImage(this.glowBlur, 0, 0, this.scene.width, this.scene.height);
      sc.globalAlpha = 1;
    }

    // (Die Farbstimmung der Zone liegt auf der Kulisse – siehe flushBackground.)

    // Blutrausch / wenig Leben: Ränder färben sich rot.
    if (this.bloodTint > 0.01) {
      sc.globalCompositeOperation = 'source-over';
      const w = this.scene.width, h = this.scene.height;
      const g = sc.createRadialGradient(w / 2, h / 2, h * 0.25, w / 2, h / 2, Math.hypot(w, h) * 0.55);
      g.addColorStop(0, 'rgba(120,0,10,0)');
      g.addColorStop(1, `rgba(150,0,16,${0.55 * this.bloodTint})`);
      sc.fillStyle = g;
      sc.fillRect(0, 0, w, h);
    }

    if (this.desaturate > 0.01) {
      sc.globalCompositeOperation = 'saturation';
      sc.fillStyle = `rgba(128,128,128,${clamp(this.desaturate, 0, 1)})`;
      sc.fillRect(0, 0, this.scene.width, this.scene.height);
    }

    // Chromatische Aberration: die Farbkanäle fransen nach harten Treffern kurz aus.
    if (s.chromatic && this.chroma > 0.02) {
      this._chromatic(this.chroma);
    }

    if (s.vignette && this.vignette) {
      sc.globalCompositeOperation = 'source-over';
      sc.globalAlpha = 1;
      sc.drawImage(this.vignette, 0, 0, this.scene.width, this.scene.height);
    }

    if (s.grain) {
      // Ein einziger Musterdurchgang mit zufälligem Versatz.
      if (!this._grainPattern) this._grainPattern = sc.createPattern(this.grainTex, 'repeat');
      sc.globalCompositeOperation = 'overlay';
      sc.globalAlpha = 0.07;
      sc.save();
      sc.translate(-Math.floor(Math.random() * 256), -Math.floor(Math.random() * 256));
      sc.fillStyle = this._grainPattern;
      sc.fillRect(0, 0, this.scene.width + 256, this.scene.height + 256);
      sc.restore();
      sc.globalAlpha = 1;
    }

    if (this.flash.a > 0.004) {
      sc.globalCompositeOperation = 'source-over';
      sc.fillStyle = `rgba(${this.flash.r},${this.flash.g},${this.flash.b},${clamp(this.flash.a, 0, 1)})`;
      sc.fillRect(0, 0, this.scene.width, this.scene.height);
    }

    if (this.fade > 0.001) {
      sc.globalCompositeOperation = 'source-over';
      sc.fillStyle = `rgba(0,0,0,${clamp(this.fade, 0, 1)})`;
      sc.fillRect(0, 0, this.scene.width, this.scene.height);
    }
    sc.restore();

    // Auf den sichtbaren Canvas bringen.
    const d = this.dctx;
    d.setTransform(1, 0, 0, 1, 0, 0);
    d.globalCompositeOperation = 'source-over';
    d.globalAlpha = 1;
    d.fillStyle = '#000';
    d.fillRect(0, 0, this.display.width, this.display.height);
    d.imageSmoothingEnabled = true;
    d.imageSmoothingQuality = 'high';
    const lb = this.letterbox;
    d.drawImage(this.scene, lb.x, lb.y, lb.w, lb.h);
  }

  _chromatic(amount) {
    const fc = this.fxctx;
    const sc = this.sctx;
    const w = this.scene.width, h = this.scene.height;
    const off = amount * 4 * this.scale;
    fc.setTransform(1, 0, 0, 1, 0, 0);
    fc.globalCompositeOperation = 'source-over';
    fc.globalAlpha = 1;
    fc.drawImage(this.scene, 0, 0);
    // Rotkanal isolieren und versetzt aufaddieren, dann Cyan in Gegenrichtung.
    fc.globalCompositeOperation = 'multiply';
    fc.fillStyle = '#ff0000';
    fc.fillRect(0, 0, w, h);
    sc.globalCompositeOperation = 'lighter';
    sc.globalAlpha = 0.45 * clamp(amount, 0, 1);
    sc.drawImage(this.fx, off, 0);

    fc.globalCompositeOperation = 'source-over';
    fc.drawImage(this.scene, 0, 0);
    fc.globalCompositeOperation = 'multiply';
    fc.fillStyle = '#00ffff';
    fc.fillRect(0, 0, w, h);
    sc.drawImage(this.fx, -off, 0);
    sc.globalAlpha = 1;
  }

  // --- HUD in Bildschirmauflösung -----------------------------------------

  /**
   * Zeichnet in virtuellen UI-Koordinaten 1920x1080, abgebildet auf das
   * Letterbox-Rechteck. Schrift wird in echter Anzeigeauflösung gerastert.
   */
  ui(fn) {
    const d = this.dctx;
    const lb = this.letterbox;
    d.save();
    const k = lb.w / UI_W;
    d.setTransform(k, 0, 0, k, lb.x, lb.y);
    fn(d, UI_W, UI_H);
    d.restore();
  }

  // --- Effekte von außen anstoßen -----------------------------------------

  doFlash(r, g, b, a) {
    this.flash.r = r; this.flash.g = g; this.flash.b = b;
    this.flash.a = Math.max(this.flash.a, a);
  }

  /** Effekt-Abklingen, einmal pro Bild. */
  decay(dt) {
    this.flash.a = Math.max(0, this.flash.a - dt * 3.2);
    this.chroma = Math.max(0, this.chroma - dt * 3.5);
    this.lightning = Math.max(0, this.lightning - dt * 2.4);
  }
}

// Schattenviereck hinter einer Kante in den aktuellen Pfad legen.
// Alle Vierecke landen in EINEM Pfad. Damit sich überlappende Schatten bei
// der Nonzero-Füllregel nicht gegenseitig auslöschen, bekommen alle denselben
// Umlaufsinn.
function castEdge(ctx, L, ax, ay, bx, by, far) {
  const dax = ax - L.x, day = ay - L.y;
  const dbx = bx - L.x, dby = by - L.y;
  const la = Math.hypot(dax, day) || 1;
  const lb = Math.hypot(dbx, dby) || 1;
  const pax = ax + (dax / la) * far, pay = ay + (day / la) * far;
  const pbx = bx + (dbx / lb) * far, pby = by + (dby / lb) * far;
  // Vorzeichen der Fläche (Shoelace) bestimmt den Umlaufsinn.
  const area =
    (ax * by - bx * ay) + (bx * pby - pbx * by) +
    (pbx * pay - pax * pby) + (pax * ay - ax * pay);
  if (area >= 0) {
    ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(pbx, pby); ctx.lineTo(pax, pay);
  } else {
    ctx.moveTo(ax, ay); ctx.lineTo(pax, pay); ctx.lineTo(pbx, pby); ctx.lineTo(bx, by);
  }
  ctx.closePath();
}

/** Nimmt 'rgb(...)', 'rgba(...)' oder '#rrggbb' und setzt einen neuen Alphawert. */
export function withAlpha(color, a) {
  if (color.startsWith('#')) {
    const h = color.length === 4
      ? color.slice(1).split('').map((c) => c + c).join('')
      : color.slice(1, 7);
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m) return color;
  const p = m[1].split(',').map((x) => x.trim());
  return `rgba(${p[0]},${p[1]},${p[2]},${a})`;
}

export { UI_W, UI_H, makeCanvas };
