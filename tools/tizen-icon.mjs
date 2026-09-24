// Zeichnet das App-Symbol für den Fernseher (tizen/icon.png, 512×423 wie von Samsung gewünscht)
// mit derselben Figur wie im Spiel: der Fürst vor dem Blutmond.
// Aufruf: node tools/tizen-icon.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = 8141;
const srv = spawn(process.execPath, ['tools/serve.mjs', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 500));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 512, height: 423 } });
// Erst eine Datei vom Server öffnen, damit die Seite die Spielmodule laden darf (gleiche Herkunft).
await p.goto(`http://localhost:${PORT}/assets/fonts/fonts.css`);
await p.setContent(`<html><head><link rel="stylesheet" href="/assets/fonts/fonts.css"><style>body{margin:0;background:#000}</style></head><body><canvas id="c" width="512" height="423"></canvas></body></html>`);
await p.evaluate(async (port) => {
  const { drawHumanoid, makePose, COSTUMES, Cloth, solveRig } = await import(`http://localhost:${port}/src/render/puppet.js`);
  await document.fonts.load('900 60px "Cinzel Decorative"');
  const c = document.getElementById('c'), ctx = c.getContext('2d');
  const W = 512, H = 423;
  // Himmel
  let g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#12030a'); g.addColorStop(0.6, '#3a0612'); g.addColorStop(1, '#0a0205');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // Blutmond mit Schein
  const mx = 256, my = 165;
  g = ctx.createRadialGradient(mx, my, 60, mx, my, 250);
  g.addColorStop(0, 'rgba(255,60,70,0.55)'); g.addColorStop(1, 'rgba(255,40,60,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  g = ctx.createRadialGradient(mx - 25, my - 25, 10, mx, my, 110);
  g.addColorStop(0, '#ffb0a0'); g.addColorStop(0.5, '#e8283c'); g.addColorStop(1, '#8a0a1c');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(mx, my, 110, 0, Math.PI * 2); ctx.fill();
  // Felsen
  ctx.fillStyle = '#050103';
  ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(0, 330); ctx.lineTo(120, 310); ctx.lineTo(200, 322); ctx.lineTo(330, 318); ctx.lineTo(420, 330); ctx.lineTo(W, 310); ctx.lineTo(W, H); ctx.fill();
  // Der Fürst, Umhang im Wind
  const cape = new Cloth(8, 3.1, 560, 0.07), hair = new Cloth(5, 2.6, 400, 0.12);
  const s = 4.4, fx = 262 / s, fy = 322 / s, f = -1;
  let pose, rig;
  for (let i = 0; i < 240; i++) {
    const t = i / 120;
    pose = makePose('idle', t); rig = solveRig(pose);
    cape.update(1 / 120, fx + f * (rig.neck.x - 1.6), fy + rig.neck.y + 1.2, fy, 900);
    hair.update(1 / 120, fx + f * (rig.head.x - 2.2), fy + rig.head.y - 1, fy, 540);
  }
  ctx.save(); ctx.scale(s, s);
  drawHumanoid(ctx, fx, fy, f, pose, COSTUMES.ingomar, { cape, hair });
  ctx.restore();
  // Schriftzug
  ctx.textAlign = 'center';
  ctx.font = '900 64px "Cinzel Decorative", serif';
  ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.strokeText('BLUTMOND', W / 2, 395);
  g = ctx.createLinearGradient(0, 345, 0, 400);
  g.addColorStop(0, '#fff0e0'); g.addColorStop(0.5, '#ff5a64'); g.addColorStop(1, '#a00c20');
  ctx.fillStyle = g; ctx.fillText('BLUTMOND', W / 2, 395);
}, PORT);
await p.locator('#c').screenshot({ path: 'tizen/icon.png' });
await b.close(); srv.kill();
console.log('tizen/icon.png');
