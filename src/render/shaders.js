// GLSL-Shader des WebGL-Renderers.
//
// Koordinaten: Alle Texturen folgen der GL-Konvention (v = 0 unten). Positionen
// in "Szenenpixeln" (px) mit y nach OBEN, 0..uScene.

export const MAX_LIGHTS = 32;

const COMMON = `#version 300 es
precision highp float;
in vec2 vUv;
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
// Interleaved Gradient Noise – ruhiges Rauschen gegen Stufen in Schatten und Nebel
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
`;

// === 1. Licht ================================================================
// Summiert alle Lichter pro Pixel (halbe Auflösung). Schatten per Strahl durch
// die Hindernis-Textur vom Pixel zum Licht, weiche Dämpfung je Treffer.
// Seitenansicht: Man blickt auf die Vorderseite der Mauern – die eigene Mauer
// eines Pixels wirft also keinen Schatten auf ihn, nur Mauern DAZWISCHEN.
// Ausgabe 0: Lichtfarbe (ohne Umgebungslicht) · Ausgabe 1: gewichtete Richtung zum Licht.
export const LIGHT_FS = COMMON + `
#define MAXL ${MAX_LIGHTS}
layout(location = 0) out vec4 oIrr;
layout(location = 1) out vec4 oDir;
uniform int uCount;
uniform vec4 uLPos[MAXL];   // x, y (px), Radius (px), wirft Schatten (0/1)
uniform vec3 uLCol[MAXL];   // Farbe * Intensität
uniform vec2 uScene;
uniform sampler2D uOcc;
uniform vec4 uOccMap;       // occUv = px * xy + zw
uniform float uHasOcc;
uniform float uNear;        // Abstand zum Licht, ab dem nichts mehr zählt (Wandfackeln)
uniform float uStep;        // Schrittweite des Schattenstrahls (px)
uniform int uDebug;         // 2 = Hindernis-Maske anzeigen

float shadow(vec2 p, vec2 L, float jit) {
  vec2 d = L - p;
  float len = length(d);
  float reach = max(0.0, len - uNear);
  int n = int(clamp(reach / uStep, 2.0, 40.0));
  float T = 1.0;
  bool out_ = false;          // eigene Mauer verlassen?
  for (int i = 0; i < 40; i++) {
    if (i >= n) break;
    float t = (float(i) + jit) / float(n) * reach / max(len, 1e-3);
    vec2 q = p + d * t;
    float o = texture(uOcc, q * uOccMap.xy + uOccMap.zw).r;
    if (!out_) { out_ = o < 0.5; continue; }
    T *= 1.0 - o * 0.5;
    if (T < 0.02) break;
  }
  return T;
}

void main() {
  vec2 p = vUv * uScene;
  vec3 irr = vec3(0.0);
  vec2 dir = vec2(0.0);
  float jit = ign(gl_FragCoord.xy);
  for (int i = 0; i < MAXL; i++) {
    if (i >= uCount) break;
    vec4 L = uLPos[i];
    vec2 d = L.xy - p;
    float dist = length(d);
    if (dist >= L.z) continue;
    float x = dist / L.z;
    float f = 1.0 - x * x;
    f *= f;
    float s = (L.w > 0.5 && uHasOcc > 0.5) ? shadow(p, L.xy, jit) : 1.0;
    vec3 c = uLCol[i] * (f * s);
    irr += c;
    dir += d / max(dist, 1.0) * luma(c);
  }
  if (uDebug == 2) irr = vec3(texture(uOcc, p * uOccMap.xy + uOccMap.zw).r, irr.g * 0.5, 0.0);
  oIrr = vec4(irr, 1.0);
  oDir = vec4(dir, 0.0, 1.0);
}`;

// === 2. Zusammensetzen =======================================================
// Kulisse + Umgebung + Figuren, jeweils mit eigener Beleuchtung:
// – Relief aus der Helligkeit (Steinfugen, Stoffe) und Kantennormalen aus der
//   Deckkraft ergeben ein Volumen, das auf die Lichtrichtung reagiert.
// – Kanten, die zum Licht zeigen, bekommen Randlicht (Gegenlicht-Look).
// – Figuren werfen weiche Schatten auf Mauern und Boden.
// – Nebel streut das Licht der Fackeln; wo Schatten fallen, entstehen Lichtbahnen.
export const COMPOSITE_FS = COMMON + `
out vec4 oCol;
uniform sampler2D uBg, uEnv, uAct, uEmis, uIrr, uDir, uRays;
uniform float uRayK;
uniform vec2 uScene;
uniform vec3 uAmbient;
uniform float uScale;       // px pro Welteinheit (inkl. Zoom)
uniform vec2 uCam;          // Welt-Koordinate der linken oberen Bildecke
uniform float uTime;
uniform float uFog;         // Nebeldichte
uniform float uShade;       // Stärke der Reliefschattierung
uniform float uRim;         // Stärke des Randlichts
uniform float uBgLight;     // wie viel Fackelschein die Kulisse abbekommt
uniform float uEmisK;
uniform int uDebug;         // 1/2 = nur Licht zeigen

// Weiche Schulter: bis 0,85 unverändert, darüber sanft bis ~1,1 (warme Lichtkerne)
vec3 shoulder(vec3 x) {
  vec3 e = max(x - 0.85, 0.0);
  return min(x, vec3(0.85)) + 0.25 * (1.0 - exp(-e / 0.25));
}
// "Aufhellen" wie Licht im Dunst: wirkt in dunklen Bereichen, nicht in hellen
vec3 screenAdd(vec3 base, vec3 add) { return 1.0 - (1.0 - base) * (1.0 - clamp(add, 0.0, 1.0)); }

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1, 0)), c = hash21(i + vec2(0, 1)), d = hash21(i + vec2(1, 1));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return s;
}

vec4 shadeLayer(sampler2D T, vec2 uv, vec2 px, float edgeR, float bumpK, float rimK, float volK,
                vec3 irr, vec2 L2, float dStr) {
  vec4 c = texture(T, uv);
  if (c.a < 0.004) return vec4(0.0);
  vec3 alb = c.rgb / c.a;
  vec2 o = edgeR * px;
  vec2 ga = vec2(texture(T, uv + vec2(o.x, 0.0)).a - texture(T, uv - vec2(o.x, 0.0)).a,
                 texture(T, uv + vec2(0.0, o.y)).a - texture(T, uv - vec2(0.0, o.y)).a);
  vec2 gl = vec2(luma(texture(T, uv + vec2(px.x, 0.0)).rgb) - luma(texture(T, uv - vec2(px.x, 0.0)).rgb),
                 luma(texture(T, uv + vec2(0.0, px.y)).rgb) - luma(texture(T, uv - vec2(0.0, px.y)).rgb));
  // Höhe = Deckkraft (Silhouette) + Helligkeit (Relief). Die Neigung zum Licht hin
  // hellt auf, von ihm weg dunkelt ab – im Mittel bleibt eine Fläche gleich hell.
  vec2 slope = -(ga * 1.3 + gl * bumpK);
  if (volK > 0.0) {
    // Weiches Volumen: Deckkraft stark weichgezeichnet (Mipmap) = gewölbte Oberfläche
    vec2 ov = edgeR * 3.0 * px;
    vec2 gv = vec2(textureLod(T, uv + vec2(ov.x, 0.0), 3.0).a - textureLod(T, uv - vec2(ov.x, 0.0), 3.0).a,
                   textureLod(T, uv + vec2(0.0, ov.y), 3.0).a - textureLod(T, uv - vec2(0.0, ov.y), 3.0).a);
    slope -= gv * volK;
  }
  float rel = clamp(1.0 + dot(slope, L2) * dStr * 1.6, 0.35, 1.9);
  vec3 lit = alb * shoulder(uAmbient + irr * mix(1.0, rel, uShade));
  float edge = clamp(length(ga) * 1.4, 0.0, 1.0);
  float facing = max(dot(normalize(-ga + 1e-6), L2), 0.0) * dStr;
  lit += min(irr, vec3(1.0)) * edge * facing * rimK * (0.4 + 0.6 * alb);
  return vec4(lit * c.a, c.a);
}

void main() {
  vec2 uv = vUv;
  vec2 px = 1.0 / uScene;
  vec3 irr = texture(uIrr, uv).rgb;
  vec2 dsum = texture(uDir, uv).xy;
  float il = luma(irr);
  float dl = length(dsum);
  vec2 L2 = dl > 1e-5 ? dsum / dl : vec2(0.0);
  float dStr = clamp(dl / max(il, 1e-3), 0.0, 1.0);

  // Weicher Figurenschatten: Liegt zwischen diesem Punkt und dem Licht eine Figur?
  float wu = uScale;                                   // px pro WE
  vec2 shUv = uv + L2 * (5.0 * wu) * px;
  float sh = textureLod(uAct, shUv, 3.0).a * dStr * clamp(il * 1.6, 0.0, 1.0) * 0.6;
  // Helle Zonen: Dunst, Strahlen und Randlicht zurücknehmen, sonst wird alles milchig
  float dark = clamp(1.3 - luma(uAmbient) * 1.6, 0.25, 1.0);
  // Kontaktschatten direkt unter Füßen
  float ao = textureLod(uAct, uv + vec2(0.0, 3.0 * wu) * px, 3.5).a * 0.3;
  vec3 irrEnv = irr * (1.0 - sh);

  vec3 bg = texture(uBg, uv).rgb;
  bg = screenAdd(bg, bg * shoulder(irr) * uBgLight * 2.0);
  vec4 env = shadeLayer(uEnv, uv, px, 1.1 * wu, 2.2, uRim * 0.8 * dark, 0.0, irrEnv, L2, dStr);
  env.rgb *= 1.0 - ao * env.a;
  vec4 act = shadeLayer(uAct, uv, px, 1.2 * wu, 1.4, uRim * mix(0.5, 1.0, dark), 1.1, irr, L2, dStr);

  vec3 col = bg * (1.0 - env.a) + env.rgb;

  // Nebel in Weltkoordinaten (bewegt sich mit der Welt, driftet langsam)
  vec2 w = uCam + vec2(uv.x, 1.0 - uv.y) * uScene / wu;
  float n = fbm(w * vec2(0.010, 0.016) + vec2(uTime * 0.035, uTime * 0.008));
  // In hellen Zonen (Kathedrale) kaum Dunst – er würde nur alles verwaschen.
  float dens = uFog * (0.35 + 1.1 * n) * (0.65 + 0.55 * (1.0 - uv.y)) * dark;
  vec3 scatter = shoulder(irr) * dens;
  col = screenAdd(col, scatter * (1.0 - 0.6 * env.a));

  // Lichtstrahlen im Dunst (vor den Mauern, hinter den Figuren)
  vec3 rays = texture(uRays, uv).rgb * uRayK * (0.55 + 0.9 * n) * dark;
  col = screenAdd(col, rays * (1.0 - 0.7 * env.a));

  col = col * (1.0 - act.a) + act.rgb;
  col = screenAdd(col, (scatter + rays * 0.5) * 0.25 * act.a);   // leichter Dunst auch vor den Figuren
  col += texture(uEmis, uv).rgb * uEmisK;
  if (uDebug == 3) col = texture(uRays, uv).rgb;
  else if (uDebug > 0) col = irr * 0.6 + env.a * 0.15;
  oCol = vec4(col, 1.0);
}`;

// === 2b. Lichtstrahlen ========================================================
// Für die hellsten Lichter: Wie frei ist der Weg von hier zum Licht? Mauern und
// Figuren schneiden dunkle Bahnen in den leuchtenden Dunst (halbe Auflösung).
export const RAYS_FS = COMMON + `
out vec4 oCol;
uniform sampler2D uEnv, uAct;
uniform vec2 uScene;
uniform int uRCount;
uniform vec4 uRPos[4];      // x, y (px), Reichweite (px)
uniform vec3 uRCol[4];
void main() {
  vec2 p = vUv * uScene;
  float jit = ign(gl_FragCoord.xy);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    if (i >= uRCount) break;
    vec2 L = uRPos[i].xy;
    float R = uRPos[i].z;
    vec2 d = L - p;
    float dist = length(d);
    if (dist > R) continue;
    float x = dist / R;
    float f = (1.0 - x) * (1.0 - x);
    float vis = 0.0;
    for (int k = 0; k < 14; k++) {
      vec2 q = (p + d * ((float(k) + jit) / 14.0 * 0.94)) / uScene;
      vis += 1.0 - max(texture(uEnv, q).a, texture(uAct, q).a);
    }
    vis /= 14.0;
    acc += uRCol[i] * f * vis * vis;
  }
  oCol = vec4(acc, 1.0);
}`;

// === 3. Bloom ================================================================
// Helle Stellen herausfiltern (+ reine Glow-Ebene), dann Dual-Filter-Kaskade.
export const BRIGHT_FS = COMMON + `
out vec4 oCol;
uniform sampler2D uSrc, uGlow;
uniform float uThresh, uGlowK;
void main() {
  vec3 c = texture(uSrc, vUv).rgb;
  float l = luma(c);
  vec3 b = c * max(l - uThresh, 0.0) / max(l, 1e-3);
  oCol = vec4(b + texture(uGlow, vUv).rgb * uGlowK, 1.0);
}`;

export const DOWN_FS = COMMON + `
out vec4 oCol;
uniform sampler2D uSrc;
uniform vec2 uHalf;   // halbe Texelgröße der Quelle
void main() {
  vec3 s = texture(uSrc, vUv).rgb * 4.0;
  s += texture(uSrc, vUv - uHalf).rgb;
  s += texture(uSrc, vUv + uHalf).rgb;
  s += texture(uSrc, vUv + vec2(uHalf.x, -uHalf.y)).rgb;
  s += texture(uSrc, vUv - vec2(uHalf.x, -uHalf.y)).rgb;
  oCol = vec4(s / 8.0, 1.0);
}`;

export const UP_FS = COMMON + `
out vec4 oCol;
uniform sampler2D uSrc;
uniform vec2 uHalf;
uniform float uK;
void main() {
  vec3 s = texture(uSrc, vUv + vec2(-uHalf.x * 2.0, 0.0)).rgb;
  s += texture(uSrc, vUv + vec2(-uHalf.x, uHalf.y)).rgb * 2.0;
  s += texture(uSrc, vUv + vec2(0.0, uHalf.y * 2.0)).rgb;
  s += texture(uSrc, vUv + vec2(uHalf.x, uHalf.y)).rgb * 2.0;
  s += texture(uSrc, vUv + vec2(uHalf.x * 2.0, 0.0)).rgb;
  s += texture(uSrc, vUv + vec2(uHalf.x, -uHalf.y)).rgb * 2.0;
  s += texture(uSrc, vUv + vec2(0.0, -uHalf.y * 2.0)).rgb;
  s += texture(uSrc, vUv + vec2(-uHalf.x, -uHalf.y)).rgb * 2.0;
  oCol = vec4(s / 12.0 * uK, 1.0);
}`;

// === 4. Ausgabe ==============================================================
export const FINAL_FS = COMMON + `
out vec4 oCol;
uniform sampler2D uSrc, uBloom, uOverlay;
uniform vec2 uScene;
uniform float uBloomK, uChroma, uBlood, uDesat, uVig, uGrain, uTime, uFade, uHasOverlay;
uniform float uContrast, uSat;
uniform vec4 uFlash;

vec3 tone(vec3 x) {
  vec3 e = max(x - 0.8, 0.0);
  return min(x, vec3(0.8)) + 0.2 * (1.0 - exp(-e / 0.2));
}

void main() {
  vec2 uv = vUv;
  vec3 col = texture(uSrc, uv).rgb;
  if (uChroma > 0.002) {
    vec2 off = vec2(uChroma * 0.006, 0.0);
    float a = clamp(uChroma, 0.0, 1.0) * 0.75;
    col.r = mix(col.r, texture(uSrc, uv + off).r, a);
    col.b = mix(col.b, texture(uSrc, uv - off).b, a);
  }
  col += texture(uBloom, uv).rgb * uBloomK;

  if (uHasOverlay > 0.5) {
    vec4 ov = texture(uOverlay, uv);
    col = col * (1.0 - ov.a) + ov.rgb;
  }

  // Blutrand bei wenig Leben
  vec2 p = (uv - 0.5) * uScene;
  float r = length(p);
  float hyp = length(uScene);
  if (uBlood > 0.01) {
    float t = smoothstep(uScene.y * 0.25, hyp * 0.55, r);
    col = mix(col, vec3(0.59, 0.0, 0.063), t * 0.55 * uBlood);
  }

  col = tone(col);
  // Leichte Filmkurve: etwas mehr Kontrast und Farbe
  float l = luma(col);
  col = mix(vec3(l), col, uSat);
  col = (col - 0.5) * uContrast + 0.5;
  col = mix(col, vec3(luma(col)), clamp(uDesat, 0.0, 1.0));

  if (uVig > 0.5) {
    vec2 q = uv - vec2(0.5, 0.54);
    float d = length(q * uScene) / (hyp * 0.5);
    float v = d < 0.32 ? 0.0 : d < 0.55 ? mix(0.0, 0.16, (d - 0.32) / 0.23) : mix(0.16, 0.8, clamp((d - 0.55) / 0.47, 0.0, 1.0));
    col *= 1.0 - v;
  }
  if (uGrain > 0.5) {
    float g = hash21(floor(uv * uScene) + fract(uTime * 7.13) * 311.0);
    vec3 ov = mix(2.0 * col * g, 1.0 - 2.0 * (1.0 - col) * (1.0 - g), step(0.5, col));
    col = mix(col, ov, 0.07);
  }
  col = mix(col, uFlash.rgb, clamp(uFlash.a, 0.0, 1.0));
  col *= 1.0 - clamp(uFade, 0.0, 1.0);
  oCol = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;
