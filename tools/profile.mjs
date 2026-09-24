// Misst, wie viel Zeit jede Renderstufe pro Bild braucht.
// Aufruf: node tools/profile.mjs [zone] [qualität 0-3] [einstellungen-json] [webgl|classic]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const zone = process.argv[2] || 'krypta';
const quality = process.argv[3] ?? '2';
const extra = JSON.parse(process.argv[4] || '{}');
const engine = process.argv[5] || 'webgl';
const PORT = 8126;
const srv = spawn(process.execPath, ['tools/serve.mjs', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 500));
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', ...(process.env.GPU ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--enable-accelerated-2d-canvas'] : [])] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.addInitScript(([q, ex]) => { try { localStorage.setItem('blutmond.settings', JSON.stringify({ quality: Number(q), ...ex })); } catch {} }, [quality, extra]);
await page.goto(`http://localhost:${PORT}/index.html?zone=${zone}&engine=${engine}`);
await page.waitForFunction(() => window.__ready === true);
await page.waitForTimeout(1500);
const res = await page.evaluate(async () => {
  const a = window.__app;
  const r = a.renderer, g = a.scene;
  const T = {};
  // Chrome sammelt Zeichenbefehle und führt sie verzögert aus. Ein 1-Pixel-
  // Auslesen zwingt jede Leinwand, alles sofort abzuarbeiten – so landen die
  // Kosten bei der Stufe, die sie verursacht.
  const ctxs = [r.sctx, r.wctx, r.lctx, r.gctx, r.dctx, r.actx, r.ectx].filter(Boolean);
  const px = new Uint8Array(4);
  const flush = () => {
    for (const c of ctxs) c.getImageData(0, 0, 1, 1);
    if (r.gl) r.gl.readPixels(0, 0, 1, 1, r.gl.RGBA, r.gl.UNSIGNED_BYTE, px);   // wartet auf die Grafikkarte
  };
  const wrap = (obj, name, label = name) => {
    const f = obj[name].bind(obj);
    obj[name] = (...args) => { flush(); const t0 = performance.now(); const v = f(...args); flush(); T[label] = (T[label] || 0) + performance.now() - t0; return v; };
  };
  for (const m of ['computeLights', 'lightBackground', 'compositeWorld', 'endFrame', 'beginFrame']) wrap(r, m);
  // world/emissive/background/ui mit Unterscheidung
  wrap(r, 'world', 'world(draw)');
  wrap(r, 'actors', 'actors(draw)');
  wrap(r, 'emissive', 'emissive');
  wrap(r, 'ui', 'ui');
  wrap(g.bg, 'draw', 'bg.draw');
  wrap(g.bg, 'drawFog', 'bg.fog');
  wrap(g.tiles, 'drawBack', 'tiles.back');
  wrap(g.tiles, 'drawFront', 'tiles.front');
  wrap(g, 'update', 'game.update');
  // Frames zählen
  const frames = 40;
  const t0 = performance.now();
  for (let i = 0; i < frames; i++) await new Promise((res) => requestAnimationFrame(res));
  const total = performance.now() - t0;
  const out = {};
  for (const k in T) out[k] = +(T[k] / frames).toFixed(1);
  return { msPerFrame: +(total / frames).toFixed(1), scene: `${r.scene.width}x${r.scene.height}`, engine: r.engine, parts: out };
});
console.log(`${zone} q${quality} ${res.engine} ${JSON.stringify(extra)} → ${res.msPerFrame} ms/Bild (${res.scene})`);
console.log('   ' + Object.entries(res.parts).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '));
await browser.close();
srv.kill();
