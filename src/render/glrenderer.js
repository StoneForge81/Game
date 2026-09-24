// WebGL-Renderer: gleiche Schnittstelle wie der klassische Renderer, aber Licht,
// Schatten, Nebel und Nachbearbeitung rechnet die Grafikkarte.
//
// Gezeichnet wird weiterhin mit Canvas 2D – in getrennte Ebenen:
//   Kulisse (halbe Auflösung) · Umgebung (Kacheln, Deko) · Figuren · Leuchten ·
//   Glow (Viertelauflösung) · Overlay (Schadenszahlen) · Hindernisse (klein)
// Die Ebenen werden als Texturen hochgeladen und von Shadern zusammengesetzt:
//   1. Licht      – alle Lichter pro Pixel, weiche Schatten per Strahl (½ Auflösung)
//   2. Szene      – Relief- und Randlicht, Figurenschatten, Nebel mit Lichtstreuung
//   3. Bloom      – helle Stellen, fünfstufige Weichzeichnung
//   4. Ausgabe    – Tonkurve, Farbe, Vignette, Filmkorn, Blitze, Blende
// Das HUD liegt auf einem eigenen, durchsichtigen 2D-Canvas darüber.
//
// Klappt WebGL2 nicht (alter Fernseher-Browser, Treiberproblem), liefert
// createRenderer() den klassischen Canvas-2D-Renderer.

import { Renderer, makeCanvas } from './renderer.js';
import { VIEW_W, VIEW_H } from '../data/config.js';
import { clamp } from '../core/math.js';
import { createProgram, Target, CanvasTexture, createFullscreenTriangle } from './gl.js';
import { LIGHT_FS, COMPOSITE_FS, RAYS_FS, BRIGHT_FS, DOWN_FS, UP_FS, FINAL_FS, MAX_LIGHTS } from './shaders.js';

const OCC_MARGIN = 110;     // Hindernisse auch knapp außerhalb des Bildes (WE)
const OCC_RES = 0.5;        // Pixel pro WE in der Hindernis-Textur
const BLOOM_LEVELS = 5;

/**
 * Passenden Renderer bauen. `uiCanvas` ist der sichtbare Canvas aus der Seite;
 * im WebGL-Modus liegt er als durchsichtige HUD-Ebene über dem GL-Canvas.
 */
export function createRenderer(uiCanvas, settings) {
  if (settings.engine !== 'classic') {
    const glCanvas = document.createElement('canvas');
    glCanvas.id = 'gl';
    const gl = glCanvas.getContext('webgl2', {
      alpha: false, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance',
    });
    if (gl) {
      try {
        uiCanvas.parentNode.insertBefore(glCanvas, uiCanvas);
        for (const c of [glCanvas, uiCanvas]) { c.style.position = 'fixed'; c.style.left = '0'; c.style.top = '0'; }
        uiCanvas.style.zIndex = '1';
        const r = new GLRenderer(uiCanvas, settings, glCanvas, gl);
        r.engine = 'webgl';
        return r;
      } catch (e) {
        console.warn('WebGL nicht nutzbar, klassischer Renderer:', e);
        glCanvas.remove();
      }
    }
  }
  const r = new Renderer(uiCanvas, settings);
  r.engine = 'classic';
  return r;
}

export class GLRenderer extends Renderer {
  constructor(uiCanvas, settings, glCanvas, gl) {
    // Vor super(): die Basisklasse ruft _buildBuffers() auf, das GL braucht.
    GLRenderer._pending = { glCanvas, gl };
    super(uiCanvas, settings, { transparent: true });
    GLRenderer._pending = null;
    this._initGL();
  }

  // --- Einrichtung ---------------------------------------------------------

  _initGL() {
    const { glCanvas, gl } = this;
    gl.__halfFloatRT = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
    gl.getExtension('OES_texture_float_linear');
    this.vao = createFullscreenTriangle(gl);
    this.prog = {
      light: createProgram(gl, LIGHT_FS),
      comp: createProgram(gl, COMPOSITE_FS),
      rays: createProgram(gl, RAYS_FS),
      bright: createProgram(gl, BRIGHT_FS),
      down: createProgram(gl, DOWN_FS),
      up: createProgram(gl, UP_FS),
      final: createProgram(gl, FINAL_FS),
    };
    this.tex = {
      bg: new CanvasTexture(gl),
      env: new CanvasTexture(gl),
      act: new CanvasTexture(gl, { mipmap: true }),
      emis: new CanvasTexture(gl),
      glow: new CanvasTexture(gl),
      over: new CanvasTexture(gl),
      occ: new CanvasTexture(gl),
    };
    this._lightPos = new Float32Array(MAX_LIGHTS * 4);
    this._lightCol = new Float32Array(MAX_LIGHTS * 3);
    this._lightCount = 0;
    this._rayPos = new Float32Array(16);
    this._rayCol = new Float32Array(12);
    this._rayCount = 0;
    this._hasOcc = false;
    this._targetsFor = null;
    this.rt = null;
    this.lost = false;
    glCanvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
    glCanvas.addEventListener('webglcontextrestored', () => { this.lost = false; this._initGL(); });
    // Einmal vollständig zeichnen, damit Shader-Fehler sofort (und nicht mitten im Spiel) auffallen.
    this.beginFrame(0);
    this.computeLights([], null);
    this.endFrame();
    const err = gl.getError();
    if (err !== gl.NO_ERROR && err !== gl.CONTEXT_LOST_WEBGL) throw new Error('GL-Fehler ' + err);
  }

  _buildBuffers() {
    if (GLRenderer._pending) Object.assign(this, GLRenderer._pending);
    const s = this.scale;
    const W = Math.round(VIEW_W * s), H = Math.round(VIEW_H * s);
    // Die Basisklasse erwartet `scene` für Größenangaben.
    this.scene = { width: W, height: H };

    this.bgRes = s * 0.5;
    this.bgBuf = makeCanvas(VIEW_W * this.bgRes, VIEW_H * this.bgRes);
    this.bctx = this.bgBuf.getContext('2d', { alpha: false });

    this.worldBuf = makeCanvas(W, H);                 // Umgebung
    this.wctx = this.worldBuf.getContext('2d');
    this.actBuf = makeCanvas(W, H);                   // Figuren
    this.actx = this.actBuf.getContext('2d');
    this.emisBuf = makeCanvas(W, H);                  // Leuchtendes
    this.ectx = this.emisBuf.getContext('2d');
    this.overBuf = makeCanvas(W, H);                  // Schadenszahlen
    this.octx = this.overBuf.getContext('2d');

    this.glowRes = Math.max(0.5, s * 0.25);
    this.glow = makeCanvas(VIEW_W * this.glowRes, VIEW_H * this.glowRes);
    this.gctx = this.glow.getContext('2d');

    this.occ = makeCanvas((VIEW_W + OCC_MARGIN * 2) * OCC_RES * 1.6, (VIEW_H + OCC_MARGIN * 2) * OCC_RES * 1.6);
    this.occtx = this.occ.getContext('2d', { willReadFrequently: false });

    this._supportsFilter = false;
    for (const c of [this.bctx, this.wctx, this.actx, this.ectx, this.octx, this.gctx]) {
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = 'high';
    }
  }

  _buildStatic() {}
  _buildVignette() { this.vignette = true; }

  _buildTargets() {
    const gl = this.gl;
    const W = this.scene.width, H = this.scene.height;
    const key = W + 'x' + H;
    if (this._targetsFor === key) return;
    if (this.rt) for (const t of Object.values(this.rt).flat()) t.dispose();
    const bloom = [];
    let bw = W / 2, bh = H / 2;
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      bloom.push(new Target(gl, bw, bh, { hdr: true }));
      bw /= 2; bh /= 2;
    }
    this.rt = {
      light: new Target(gl, W / 2, H / 2, { count: 2, hdr: true }),
      rays: new Target(gl, W / 4, H / 4, { hdr: true }),   // weich – Viertelauflösung reicht
      scene: new Target(gl, W, H, { hdr: true }),
      bloom,
    };
    this._targetsFor = key;
  }

  resize() {
    super.resize();
    const c = this.glCanvas;
    if (c && (c.width !== this.display.width || c.height !== this.display.height)) {
      c.width = this.display.width;
      c.height = this.display.height;
    }
    if (c) { c.style.width = this.display.style.width; c.style.height = this.display.style.height; }
  }

  // --- Bildaufbau ----------------------------------------------------------

  beginFrame(dt) {
    this.time += dt;
    const b = this.bctx;
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.globalCompositeOperation = 'source-over';
    b.globalAlpha = 1;
    b.fillStyle = '#05040a';
    b.fillRect(0, 0, this.bgBuf.width, this.bgBuf.height);
    for (const [c, cv] of [[this.wctx, this.worldBuf], [this.actx, this.actBuf], [this.ectx, this.emisBuf], [this.gctx, this.glow]]) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
      c.clearRect(0, 0, cv.width, cv.height);
    }
    if (this._overUsed) {
      this.octx.setTransform(1, 0, 0, 1, 0, 0);
      this.octx.clearRect(0, 0, this.overBuf.width, this.overBuf.height);
      this._overUsed = false;
    }
  }

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
  }

  lightBackground() {}
  compositeWorld() {}

  /** Figuren, Gegenstände, Geschosse, Partikel – eigene Ebene (Randlicht, Schattenwurf). */
  actors(fn) {
    const c = this.actx;
    c.save();
    this._worldTransform(c, this.scale);
    fn(c);
    c.restore();
  }

  overlay(fn) {
    const c = this.octx;
    c.save();
    this._worldTransform(c, this.scale);
    fn(c);
    c.restore();
    this._overUsed = true;
  }

  screen(fn) {
    const c = this.octx;
    c.save();
    c.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    fn(c);
    c.restore();
    this._overUsed = true;
  }

  emissive(fn) {
    const c = this.ectx;
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

  // --- Licht ---------------------------------------------------------------

  /** Welt → Szenenpixel (y nach oben), mit der Kamera von JETZT. */
  _toScene(wx, wy) {
    const z = this.zoom, k = this.scale * z;
    const sx = (wx - (this.camX + this.shakeX)) * z + (VIEW_W / 2) * (1 - z);
    const sy = (wy - (this.camY + this.shakeY)) * z + (VIEW_H / 2) * (1 - z);
    return [sx * this.scale, this.scene.height - sy * this.scale, k];
  }

  computeLights(lights, queryOccluders) {
    const bright = clamp(this.settings.brightness ?? 1, 0.6, 1.8);
    const lift = (bright - 1) * 40;
    const lb = this.lightning * 190;
    this._ambient = [
      Math.min(255, this.grade.ambient[0] * bright + lift + lb) / 255,
      Math.min(255, this.grade.ambient[1] * bright + lift + lb) / 255,
      Math.min(255, this.grade.ambient[2] * bright + lift + lb * 1.1) / 255,
    ];

    const view = this.viewRect(0);
    let n = 0;
    const cand = [];
    for (const L of lights) {
      if (n >= MAX_LIGHTS) break;
      const r = L.radius;
      if (L.x + r < view.x || L.x - r > view.x + view.w || L.y + r < view.y || L.y - r > view.y + view.h) continue;
      const [x, y, k] = this._toScene(L.x, L.y);
      const [cr, cg, cb] = parseRgb(L.color);
      const it = clamp(L.intensity ?? 1, 0, 3);
      this._lightPos.set([x, y, r * k, L.shadows && queryOccluders ? 1 : 0], n * 4);
      this._lightCol.set([cr * it, cg * it, cb * it], n * 3);
      // Kandidaten für Lichtstrahlen: große, kräftige Lichter im Bild
      if (x > -r * k * 0.3 && x < this.scene.width + r * k * 0.3) cand.push({ x, y, R: r * k * 1.1, c: [cr * it, cg * it, cb * it], w: it * r });
      n++;
    }
    this._lightCount = n;
    cand.sort((a, b) => b.w - a.w);
    this._rayCount = Math.min(4, cand.length);
    for (let i = 0; i < this._rayCount; i++) {
      const c = cand[i];
      this._rayPos.set([c.x, c.y, c.R, 0], i * 4);
      this._rayCol.set(c.c, i * 3);
    }

    // Hindernisse als kleine Maske rund um das Bild
    this._hasOcc = false;
    if (queryOccluders) {
      const v = this.viewRect(OCC_MARGIN);
      const c = this.occtx;
      const kx = this.occ.width / v.w, ky = this.occ.height / v.h;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.fillStyle = '#000';
      c.fillRect(0, 0, this.occ.width, this.occ.height);
      c.fillStyle = '#fff';
      for (const o of queryOccluders(v.x, v.y, v.w, v.h)) c.fillRect((o.x - v.x) * kx, (o.y - v.y) * ky, o.w * kx, o.h * ky);
      // Abbildung Szenenpixel (y oben) → Masken-UV (v oben, weil gespiegelt hochgeladen)
      const z = this.zoom, S = this.scale * z, H = this.scene.height;
      const camWX = this.camX + this.shakeX - (VIEW_W / 2) * (1 - z) / z;
      const camWY = this.camY + this.shakeY - (VIEW_H / 2) * (1 - z) / z;
      this._occMap = [
        1 / (S * v.w),
        1 / (S * v.h),
        (camWX - v.x) / v.w,
        1 - (H / S + camWY - v.y) / v.h,
      ];
      this._hasOcc = true;
      this._occDirty = true;
    }
  }

  // --- Ausgabe -------------------------------------------------------------

  endFrame() {
    // HUD-Ebene leeren – sie liegt durchsichtig über dem Bild.
    const d = this.dctx;
    d.setTransform(1, 0, 0, 1, 0, 0);
    d.clearRect(0, 0, this.display.width, this.display.height);
    if (this.lost) return;

    const gl = this.gl;
    const s = this.settings;
    const W = this.scene.width, H = this.scene.height;
    this._buildTargets();
    gl.bindVertexArray(this.vao);
    gl.disable(gl.BLEND);

    const T = this.tex;
    T.bg.upload(this.bgBuf);
    T.env.upload(this.worldBuf);
    T.act.upload(this.actBuf);
    T.emis.upload(this.emisBuf);
    if (s.bloom) T.glow.upload(this.glow);
    if (this._overUsed) T.over.upload(this.overBuf);
    if (this._occDirty) { T.occ.upload(this.occ); this._occDirty = false; }

    const bind = (unit, tex) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); };
    const draw = () => gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 1. Licht
    const pl = this.prog.light;
    this.rt.light.bind();
    gl.useProgram(pl.p);
    gl.uniform1i(pl.u.uCount, this._lightCount);
    gl.uniform4fv(pl.u.uLPos, this._lightPos);
    gl.uniform3fv(pl.u.uLCol, this._lightCol);
    gl.uniform2f(pl.u.uScene, W, H);
    bind(0, T.occ.tex); gl.uniform1i(pl.u.uOcc, 0);
    gl.uniform4fv(pl.u.uOccMap, this._occMap || [0, 0, 0, 0]);
    gl.uniform1f(pl.u.uHasOcc, this._hasOcc ? 1 : 0);
    const wu = this.scale * this.zoom;
    gl.uniform1f(pl.u.uNear, 8 * wu);
    gl.uniform1f(pl.u.uStep, 6 * wu);
    gl.uniform1i(pl.u.uDebug, this.debugView | 0);
    draw();

    // 2a. Lichtstrahlen
    const pr = this.prog.rays;
    this.rt.rays.bind();
    gl.useProgram(pr.p);
    bind(0, T.env.tex); gl.uniform1i(pr.u.uEnv, 0);
    bind(1, T.act.tex); gl.uniform1i(pr.u.uAct, 1);
    gl.uniform2f(pr.u.uScene, W, H);
    gl.uniform1i(pr.u.uRCount, this._rayCount);
    gl.uniform4fv(pr.u.uRPos, this._rayPos);
    gl.uniform3fv(pr.u.uRCol, this._rayCol);
    draw();

    // 2. Szene
    const pc = this.prog.comp;
    this.rt.scene.bind();
    gl.useProgram(pc.p);
    bind(0, T.bg.tex); gl.uniform1i(pc.u.uBg, 0);
    bind(1, T.env.tex); gl.uniform1i(pc.u.uEnv, 1);
    bind(2, T.act.tex); gl.uniform1i(pc.u.uAct, 2);
    bind(3, T.emis.tex); gl.uniform1i(pc.u.uEmis, 3);
    bind(4, this.rt.light.tex[0]); gl.uniform1i(pc.u.uIrr, 4);
    bind(5, this.rt.light.tex[1]); gl.uniform1i(pc.u.uDir, 5);
    bind(6, this.rt.rays.t); gl.uniform1i(pc.u.uRays, 6);
    gl.uniform1f(pc.u.uRayK, 0.5);
    gl.uniform2f(pc.u.uScene, W, H);
    gl.uniform3fv(pc.u.uAmbient, this._ambient || [0.1, 0.1, 0.15]);
    gl.uniform1f(pc.u.uScale, wu);
    const z = this.zoom;
    gl.uniform2f(pc.u.uCam, this.camX + this.shakeX - (VIEW_W / 2) * (1 - z) / z, this.camY + this.shakeY - (VIEW_H / 2) * (1 - z) / z);
    gl.uniform1f(pc.u.uTime, this.time);
    gl.uniform1f(pc.u.uFog, this.grade.fog ?? 0.16);
    gl.uniform1f(pc.u.uShade, 0.6);
    gl.uniform1f(pc.u.uRim, 2.2);
    gl.uniform1f(pc.u.uBgLight, 0.22);
    gl.uniform1f(pc.u.uEmisK, 1.0);
    gl.uniform1i(pc.u.uDebug, this.debugView | 0);
    draw();

    // 3. Bloom
    const bl = this.rt.bloom;
    if (s.bloom) {
      const pb = this.prog.bright;
      bl[0].bind();
      gl.useProgram(pb.p);
      bind(0, this.rt.scene.t); gl.uniform1i(pb.u.uSrc, 0);
      bind(1, T.glow.tex); gl.uniform1i(pb.u.uGlow, 1);
      // Schwelle mit der Grundhelligkeit anheben – helle Zonen sollen nicht überstrahlen
      const amb = this._ambient || [0, 0, 0];
      gl.uniform1f(pb.u.uThresh, 0.88 + (amb[0] * 0.3 + amb[1] * 0.59 + amb[2] * 0.11) * 0.6);
      gl.uniform1f(pb.u.uGlowK, 0.8);
      draw();
      const pd = this.prog.down;
      gl.useProgram(pd.p);
      gl.uniform1i(pd.u.uSrc, 0);
      for (let i = 1; i < bl.length; i++) {
        bl[i].bind();
        bind(0, bl[i - 1].t);
        gl.uniform2f(pd.u.uHalf, 0.5 / bl[i - 1].w, 0.5 / bl[i - 1].h);
        draw();
      }
      const pu = this.prog.up;
      gl.useProgram(pu.p);
      gl.uniform1i(pu.u.uSrc, 0);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = bl.length - 2; i >= 0; i--) {
        bl[i].bind();
        bind(0, bl[i + 1].t);
        gl.uniform2f(pu.u.uHalf, 0.5 / bl[i + 1].w, 0.5 / bl[i + 1].h);
        gl.uniform1f(pu.u.uK, 1.0);
        draw();
      }
      gl.disable(gl.BLEND);
    }

    // 4. Ausgabe in den Letterbox-Bereich
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const lbx = this.letterbox;
    gl.viewport(0, 0, this.glCanvas.width, this.glCanvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.viewport(lbx.x, this.glCanvas.height - lbx.y - lbx.h, lbx.w, lbx.h);
    const pf = this.prog.final;
    gl.useProgram(pf.p);
    bind(0, this.rt.scene.t); gl.uniform1i(pf.u.uSrc, 0);
    bind(1, bl[0].t); gl.uniform1i(pf.u.uBloom, 1);
    bind(2, T.over.tex); gl.uniform1i(pf.u.uOverlay, 2);
    gl.uniform2f(pf.u.uScene, W, H);
    gl.uniform1f(pf.u.uBloomK, s.bloom ? 0.3 : 0);
    gl.uniform1f(pf.u.uChroma, s.chromatic ? this.chroma : 0);
    gl.uniform1f(pf.u.uBlood, this.bloodTint);
    gl.uniform1f(pf.u.uDesat, this.desaturate);
    gl.uniform1f(pf.u.uVig, s.vignette ? 1 : 0);
    gl.uniform1f(pf.u.uGrain, s.grain ? 1 : 0);
    gl.uniform1f(pf.u.uTime, this.time);
    gl.uniform1f(pf.u.uFade, this.fade);
    gl.uniform1f(pf.u.uHasOverlay, this._overUsed ? 1 : 0);
    gl.uniform1f(pf.u.uContrast, 1.05);
    gl.uniform1f(pf.u.uSat, 1.08);
    gl.uniform4f(pf.u.uFlash, this.flash.r / 255, this.flash.g / 255, this.flash.b / 255, this.flash.a);
    draw();
  }
}

const _rgbCache = new Map();
/** 'rgb(r,g,b)' oder '#rrggbb' → [0..1]*3 */
function parseRgb(c) {
  let v = _rgbCache.get(c);
  if (v) return v;
  if (c.startsWith('#')) {
    const h = c.length === 4 ? c.slice(1).split('').map((x) => x + x).join('') : c.slice(1, 7);
    const n = parseInt(h, 16);
    v = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  } else {
    const m = c.match(/rgba?\(([^)]+)\)/);
    const p = m ? m[1].split(',').map((x) => parseFloat(x)) : [255, 255, 255];
    v = [p[0] / 255, p[1] / 255, p[2] / 255];
  }
  _rgbCache.set(c, v);
  return v;
}
