// Kleine WebGL2-Werkzeugkiste: Shader bauen, Render-Ziele, Canvas-Texturen.
// Bewusst schlank – der GL-Renderer braucht nur Vollbild-Durchgänge.

/** Vollbild-Dreieck: deckt den Viewport mit einem einzigen Dreieck ab. */
export const FULLSCREEN_VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    const lines = src.split('\n').map((l, i) => `${String(i + 1).padStart(3)}: ${l}`).join('\n');
    throw new Error('Shader-Fehler: ' + log + '\n' + lines);
  }
  return sh;
}

/** Programm mit Uniform-Cache: prog.u.name liefert die Location. */
export function createProgram(gl, fsSrc, vsSrc = FULLSCREEN_VS) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fsSrc));
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link-Fehler: ' + gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    const name = info.name.replace(/\[0\]$/, '');
    u[name] = gl.getUniformLocation(p, info.name);
  }
  return { p, u };
}

/** Leere Textur anlegen. */
export function createTexture(gl, w, h, { internal, format, type, filter } = {}) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter ?? gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter ?? gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (w && h) gl.texImage2D(gl.TEXTURE_2D, 0, internal ?? gl.RGBA8, w, h, 0, format ?? gl.RGBA, type ?? gl.UNSIGNED_BYTE, null);
  return t;
}

/**
 * Render-Ziel mit einer oder mehreren Farbtexturen (MRT).
 * hdr: Halbfließkomma, damit Licht über 1,0 hinaus gehen kann (für Bloom).
 */
export class Target {
  constructor(gl, w, h, { count = 1, hdr = false } = {}) {
    this.gl = gl;
    this.w = Math.max(1, Math.round(w));
    this.h = Math.max(1, Math.round(h));
    const half = hdr && gl.__halfFloatRT;
    const opts = half ? { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT } : {};
    this.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    this.tex = [];
    const bufs = [];
    for (let i = 0; i < count; i++) {
      const t = createTexture(gl, this.w, this.h, opts);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0);
      this.tex.push(t);
      bufs.push(gl.COLOR_ATTACHMENT0 + i);
    }
    gl.drawBuffers(bufs);
    const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (st !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Framebuffer unvollständig: ' + st);
  }
  get t() { return this.tex[0]; }
  bind() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.w, this.h);
  }
  dispose() {
    const gl = this.gl;
    for (const t of this.tex) gl.deleteTexture(t);
    gl.deleteFramebuffer(this.fbo);
  }
}

/**
 * Canvas als Textur hochladen. Canvas-Inhalte sind vormultipliziert
 * (premultiplied alpha) und werden so auch übernommen – das spart Umrechnung.
 * Die Y-Achse wird gespiegelt, damit alle Texturen der GL-Konvention folgen
 * (v = 0 unten).
 */
export class CanvasTexture {
  constructor(gl, { mipmap = false } = {}) {
    this.gl = gl;
    this.mipmap = mipmap;
    // 1×1 durchsichtig, bis zum ersten Hochladen – so ist die Textur nie "unvollständig".
    this.tex = createTexture(gl, 1, 1);
    if (mipmap) {
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    }
    this.w = 1;
    this.h = 1;
  }
  upload(canvas) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    if (canvas.width !== this.w || canvas.height !== this.h) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      this.w = canvas.width;
      this.h = canvas.height;
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    }
    if (this.mipmap) gl.generateMipmap(gl.TEXTURE_2D);
  }
  dispose() { this.gl.deleteTexture(this.tex); }
}

/** Geometrie für das Vollbild-Dreieck (Attribut 0). */
export function createFullscreenTriangle(gl) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  return vao;
}
