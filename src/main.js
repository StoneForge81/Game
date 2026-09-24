// Einstieg: richtet Grafik, Eingabe und Ton ein und wechselt zwischen
// Titelbildschirm und Spiel.

import { Renderer } from './render/renderer.js';
import { createRenderer } from './render/glrenderer.js';
import { Input } from './core/input.js';
import { IS_TV, tvSetup, tvExit } from './core/tv.js';
import { AudioEngine, TRACKS } from './core/audio.js';
import { Loop } from './core/loop.js';
import { loadSettings, saveSettings, listSlots, loadSlot, lastSlot, newGameState, saveSlot, setLastSlot, storageAvailable } from './core/save.js';
import { Game } from './game/game.js';
import { Backgrounds } from './render/backgrounds.js';
import { ZONES } from './data/zones.js';
import { VIEW_W, VIEW_H } from './data/config.js';
import { drawHumanoid, makePose, COSTUMES, Cloth, solveRig, drawEyesGlow } from './render/puppet.js';
import { MenuScreen, ControlsScreen, optionsMenu, slotMenu, drawFooter } from './ui/menus.js';
import { FONT_TITLE, FONT_BODY, FONT_HEAD, strokeText } from './ui/text.js';
import { Particles } from './render/particles.js';

class App {
  constructor(canvas) {
    this.canvas = canvas;
    this.settings = loadSettings();
    // ?engine=classic erzwingt den alten Renderer (Tests, Vergleich)
    const forced = new URLSearchParams(location.search).get('engine');
    this.renderer = createRenderer(canvas, forced ? { ...this.settings, engine: forced } : this.settings);
    this.renderer.setScale(Renderer.scaleFor(this.settings.quality));
    this.renderer.onScaleChange = (s) => this.scene && this.scene.onScale && this.scene.onScale(s);
    this.input = new Input().attach(window);
    tvSetup();
    const rumble = this.input.rumble.bind(this.input);
    this.input.rumble = (...a) => { if (this.settings.rumble) rumble(...a); };
    this.audio = new AudioEngine(this.settings);
    this.loop = new Loop((dt) => this.update(dt), (a, f) => this.render(a, f));
    this.debug = new URLSearchParams(location.search).has('debug');

    window.addEventListener('resize', () => this.renderer.resize());
    document.addEventListener('fullscreenchange', () => setTimeout(() => this.renderer.resize(), 50));
    // Tab verlassen: Spiel pausieren, Ton leiser
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.scene instanceof Game && !this.scene.overlay && !this.scene.dialogue.active && !this.scene.prologue) this.scene._pauseMenu();
    });
    // Ton darf erst nach einer Nutzeraktion starten
    const unlock = () => { this.audio.unlock(); this.audio.resume(); };
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerdown', unlock);
    // Mauszeiger nach kurzer Zeit ausblenden (Fernseher)
    let cursorT;
    window.addEventListener('pointermove', () => {
      canvas.style.cursor = 'default';
      clearTimeout(cursorT);
      cursorT = setTimeout(() => { canvas.style.cursor = 'none'; }, 1800);
    });
    // Tastenkürzel: F = Vollbild
    window.addEventListener('keydown', (e) => { if (e.code === 'KeyF' && !e.repeat && !(this.scene instanceof Game)) this.toggleFullscreen(); });

    // Testzugang: ?zone=hof springt direkt in ein Gebiet (mit den Kräften,
    // die man dort regulär hätte). Nutzt einen eigenen Speicherplatz (9),
    // damit echte Spielstände unberührt bleiben.
    const q = new URLSearchParams(location.search);
    if (q.has('zone') && ZONES[q.get('zone')]) {
      const zone = q.get('zone');
      const s = newGameState();
      s.zone = zone;
      s.checkpoint = zone + '.start';
      Object.assign(s.storyFlags, { prologue: true, henryJoined: true, metFamily: true });
      const order = ['krypta', 'katakomben', 'hof', 'bibliothek', 'uhrturm', 'kathedrale'];
      const rewards = { krypta: 'lance', katakomben: 'mist', hof: 'bat', bibliothek: 'wolf', uhrturm: 'moonskin' };
      for (const z of order.slice(0, order.indexOf(zone))) { s.abilities[rewards[z]] = true; s.bossesDefeated.push(ZONES[z].boss); }
      if (q.has('all')) for (const k of Object.values(rewards)) s.abilities[k] = true;
      s.blood = s.maxBlood;
      this.audio.unlock();
      this.scene = new Game(this, s, 9);
    } else {
      this.scene = new TitleScene(this);
    }
    this.loop.start();
    window.__app = this;
    window.__ready = true;
  }

  applySettings() {
    saveSettings(this.settings);
    this.renderer.applySettings(this.settings);
    this.audio.applySettings(this.settings);
  }

  toggleFullscreen() {
    const d = document;
    try {
      if (!d.fullscreenElement) d.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
      else d.exitFullscreen().catch(() => {});
    } catch { /* Fernseher-Browser ohne Vollbild-API */ }
  }

  startGame(slot, save) {
    this.input.consumeAll();
    this.scene = new Game(this, save, slot);
    setLastSlot(slot);
  }

  toTitle() {
    this.input.consumeAll();
    this.loop.timeScale = 1;
    this.scene = new TitleScene(this);
  }

  update(dt) {
    this.input.poll();
    // Gamepad-Druck: Ton freischalten versuchen (klappt nicht in jedem Browser)
    if (!this.audio.unlocked && this.input.lastDevice === 'gamepad' && (this.input.pressed('confirm') || this.input.pressed('menu'))) {
      this.audio.unlock();
    }
    this.scene.update(dt);
  }

  render(alpha, frameDt) {
    const t0 = performance.now();
    this.scene.render(alpha, frameDt);
    this._autoQuality(frameDt, performance.now() - t0);
  }

  /**
   * Automatische Bildqualität: Läuft es nicht flüssig, wird die Renderauflösung
   * gesenkt; ist viel Luft, wird sie wieder angehoben. So ist das Spiel auf
   * einem schwachen TV-Browser spielbar und auf einem starken Rechner scharf.
   * Gemessen wird der Bildabstand (frameDt) über jeweils 2 Sekunden.
   */
  _autoQuality(frameDt, renderMs) {
    if (!this.settings.autoQuality || document.hidden) return;
    const a = this._aq || (this._aq = { t: 0, n: 0, sum: 0, cool: 3 });
    if (frameDt <= 0 || frameDt > 0.25) return;   // Ausreißer (Tab-Wechsel) ignorieren
    a.t += frameDt; a.n++; a.sum += frameDt;
    a.cool = Math.max(0, a.cool - frameDt);
    if (a.t < 2) return;
    const avg = a.sum / a.n;
    a.t = 0; a.n = 0; a.sum = 0;
    if (a.cool > 0) return;
    const q = this.settings.quality;
    if (avg > 1 / 48 && q > 0) {
      this.settings.quality = q - 1;
      a.cool = 4;
      this.applySettings();
    } else if (avg < 1 / 58 && renderMs < 9 && q < 3) {
      // Nur hochschalten, wenn sehr viel Reserve da ist – sonst pendelt es.
      this.settings.quality = q + 1;
      a.cool = 8;
      this.applySettings();
    }
  }
}

// === Titelbildschirm ========================================================

class TitleScene {
  constructor(app) {
    this.app = app;
    this.t = 0;
    this.started = false;       // "Drücke eine Taste" bestätigt
    this.overlay = null;
    this.bg = new Backgrounds(ZONES.hof, app.renderer.scale);
    this.particles = new Particles();
    this.cape = new Cloth(8, 3.1, 560, 0.07);
    this.hair = new Cloth(5, 2.6, 400, 0.12);
    this.pose = makePose('idle', 0);
    this.rig = solveRig(this.pose);
    this.menuItems = null;
    this.app.renderer.grade = { ...ZONES.hof.grade, ambient: [70, 30, 50] };
    this.app.audio.playTrack(TRACKS.title);
    this.app.audio.setAmbience('storm');
  }

  onScale(s) { this.bg.setScale(s); }

  _buildMenu() {
    const app = this.app;
    const slots = listSlots();
    const last = lastSlot();
    const hasLast = last >= 0 && slots[last];
    const anySave = slots.some(Boolean);
    const items = [];
    if (hasLast) items.push({ label: 'Fortsetzen', type: 'action', desc: `${ZONES[slots[last].zone].name} · Macht ${slots[last].power}`, onSelect: () => app.startGame(last, loadSlot(last)) });
    items.push({ label: 'Neues Spiel', type: 'action', desc: 'Erwache in deiner Gruft.', onSelect: () => this._newGame() });
    if (anySave) items.push({ label: 'Spielstand laden', type: 'action', onSelect: () => {
      this.overlay = slotMenu(app, listSlots(), {
        title: 'Spielstand laden', forNewGame: false,
        onPick: (i) => { const s = loadSlot(i); if (s) app.startGame(i, s); },
        onCancel: () => { this.overlay = null; },
      });
    } });
    items.push({ label: 'Optionen', type: 'action', onSelect: () => { this.overlay = optionsMenu(app, () => { this.overlay = null; }); } });
    items.push({ label: 'Steuerung', type: 'action', onSelect: () => { this.overlay = new ControlsScreen(app, () => { this.overlay = null; }); } });
    if (IS_TV) items.push({ label: 'Beenden', type: 'action', desc: 'Zurück zum Fernseher.', onSelect: () => tvExit() });
    else items.push({ label: 'Vollbild', type: 'action', desc: 'Oder die Taste F bzw. F11.', onSelect: () => app.toggleFullscreen() });
    // Am Fernseher schließt „Zurück“ im Titelmenü die App (so erwartet es Samsung).
    this.menu = new MenuScreen(app, { title: '', items, width: 760, backdrop: 0, footer: true, onCancel: IS_TV ? () => tvExit() : null });
    this.menu.draw = (ctx, W, H) => drawTitleMenu(ctx, W, H, this.menu, this.t);
  }

  _newGame() {
    const app = this.app;
    const slots = listSlots();
    const free = slots.findIndex((s) => !s);
    const start = (i) => {
      const s = newGameState();
      saveSlot(i, s);
      app.startGame(i, s);
    };
    if (free >= 0 && !slots.some(Boolean)) { start(free); return; }
    this.overlay = slotMenu(app, slots, {
      title: 'Neues Spiel', forNewGame: true,
      onPick: (i) => start(i),
      onCancel: () => { this.overlay = null; },
    });
  }

  update(dt) {
    this.t += dt;
    const input = this.app.input;
    this.particles.update(dt);
    if (Math.random() < 0.6) {
      this.particles.spawn({ kind: 'mote', x: Math.random() * VIEW_W, y: VIEW_H * (0.4 + Math.random() * 0.7), vx: (Math.random() - 0.3) * 20, vy: -10 - Math.random() * 20, life: 3, size: 0.6 + Math.random(), size1: 0.2, color: '#ff9a70', emissive: true });
    }
    // Ingomar steht auf dem Felsen, der Umhang weht im Sturm
    const fx = VIEW_W * 0.74, fy = VIEW_H * 0.78;
    this.pose = makePose('idle', this.t);
    this.rig = solveRig(this.pose);
    const f = -1;
    const wind = 700 + Math.sin(this.t * 0.9) * 400;
    this.cape.update(dt, fx + f * (this.rig.neck.x - 1.6), fy + this.rig.neck.y + 1.2, fy, wind);
    this.hair.update(dt, fx + f * (this.rig.head.x - 2.2), fy + this.rig.head.y - 1, fy, wind * 0.6);

    if (!this.started) {
      if (input.pressed('confirm') || input.pressed('jump') || input.pressed('menu') || input.pressed('attack')) {
        this.started = true;
        this.app.audio.unlock();
        this.app.audio.play('uiConfirm');
        this._buildMenu();
        input.consumeAll();
      }
      return;
    }
    if (this.overlay) this.overlay.update(dt);
    else this.menu.update(dt);
  }

  render(alpha, frameDt) {
    const r = this.app.renderer;
    const camX = this.t * 12;
    r.setCamera(camX, 0);
    r.beginFrame(frameDt);
    r.computeLights([{ x: camX + VIEW_W * 0.74, y: VIEW_H * 0.6, radius: 120, color: 'rgb(255,120,120)', intensity: 0.8 }], null);
    this.bg.draw(r, camX, 0, VIEW_H * 2, frameDt);
    this.bg.drawFog(r, camX);
    r.flushBackground();
    const fx = VIEW_W * 0.74, fy = VIEW_H * 0.78;
    r.backgroundScreen(() => {});
    // Felsen und Fürst (Bildschirmkoordinaten – Kamera bleibt für die Figur stehen)
    r.setCamera(0, 0);
    r.world((ctx) => {
      ctx.fillStyle = '#12060c';
      ctx.beginPath();
      ctx.moveTo(fx - 90, VIEW_H); ctx.lineTo(fx - 60, fy + 4); ctx.lineTo(fx - 20, fy - 2); ctx.lineTo(fx + 30, fy + 2); ctx.lineTo(fx + 60, fy + 20); ctx.lineTo(fx + 110, VIEW_H);
      ctx.fill();
    });
    r.actors((ctx) => drawHumanoid(ctx, fx, fy, -1, this.pose, COSTUMES.ingomar, { cape: this.cape, hair: this.hair, sz: 1.25 }));
    r.compositeWorld();
    r.emissive((ctx, isGlow) => {
      drawEyesGlow(ctx, fx, fy, -1, solveRig(this.pose, 1.12 * 1.25), '#ff1f35', isGlow, 1.25);
      this.particles.drawEmissive(ctx, { x: -50, y: -50, w: VIEW_W + 100, h: VIEW_H + 100 }, isGlow);
    });
    r.endFrame();
    r.ui((ctx, W, H) => {
      drawLogo(ctx, W, H, this.t);
      if (!this.started) {
        const a = 0.55 + 0.45 * Math.sin(this.t * 3);
        ctx.globalAlpha = a;
        ctx.textAlign = 'center';
        ctx.font = `600 42px ${FONT_HEAD}`;
        const dev = this.app.input.lastDevice === 'gamepad';
        strokeText(ctx, dev ? 'Drücke A' : IS_TV ? 'Drücke OK' : 'Drücke Enter oder klicke', W * 0.3, H * 0.74, '#ffe0e4');
        ctx.globalAlpha = 1;
        ctx.font = `italic 500 28px ${FONT_BODY}`;
        ctx.fillStyle = '#b89aa4';
        ctx.fillText(IS_TV ? 'Am besten mit Gamepad – oder mit den Farbtasten der Fernbedienung' : 'Am besten mit Gamepad und im Vollbild (Taste F)', W * 0.3, H * 0.74 + 52);
        if (!storageAvailable()) { ctx.fillStyle = '#ff9a70'; ctx.fillText('Hinweis: Dieser Browser speichert nicht dauerhaft (Privatmodus?).', W * 0.3, H * 0.74 + 96); }
        return;
      }
      this.menu.draw(ctx, W, H);
      if (this.overlay) this.overlay.draw(ctx, W, H);
    });
  }
}

function drawLogo(ctx, W, H, t) {
  const x = W * 0.3, y = H * 0.3;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = `900 190px ${FONT_TITLE}`;
  // Tiefer Schatten, dann Blutverlauf
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillText('BLUTMOND', x + 8, y + 12);
  const g = ctx.createLinearGradient(0, y - 150, 0, y + 20);
  g.addColorStop(0, '#ffd0c8'); g.addColorStop(0.45, '#e0203a'); g.addColorStop(1, '#5a0010');
  ctx.fillStyle = g;
  ctx.lineWidth = 8; ctx.strokeStyle = '#1a0006';
  ctx.strokeText('BLUTMOND', x, y);
  ctx.fillText('BLUTMOND', x, y);
  // Tropfen, der vom "U" rinnt
  const drip = (t * 0.25) % 1;
  ctx.fillStyle = '#c0102a';
  ctx.beginPath(); ctx.ellipse(x - 200, y + 14 + drip * 60, 6, 9 + drip * 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.font = `italic 600 52px ${FONT_BODY}`;
  strokeText(ctx, 'Der Fürst von Ingonesien', x, y + 80, '#f0d8c8', 'rgba(0,0,0,0.85)', 6);
  ctx.strokeStyle = '#c9a048'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x - 330, y + 112); ctx.lineTo(x + 330, y + 112); ctx.stroke();
  ctx.restore();
}

/** Titelmenü: schlichte Liste ohne Rahmen, links unter dem Logo. */
function drawTitleMenu(ctx, W, H, menu, t) {
  const x = W * 0.3;
  let y = H * 0.5;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  menu.items.forEach((it, i) => {
    const sel = i === menu.sel;
    ctx.font = `${sel ? 700 : 600} ${sel ? 56 : 46}px ${FONT_HEAD}`;
    if (sel) {
      const w = ctx.measureText(it.label).width;
      ctx.fillStyle = `rgba(160,10,36,${0.45 + 0.15 * Math.sin(t * 5)})`;
      ctx.fillRect(x - w / 2 - 60, y - 36, w + 120, 72);
      ctx.fillStyle = '#ffcf70';
      for (const s of [-1, 1]) {
        const bx = x + s * (w / 2 + 40);
        ctx.beginPath(); ctx.moveTo(bx, y); ctx.lineTo(bx - s * 14, y - 12); ctx.lineTo(bx - s * 8, y); ctx.lineTo(bx - s * 14, y + 12); ctx.closePath(); ctx.fill();
      }
    }
    strokeText(ctx, it.label, x, y + 2, sel ? '#fff4f0' : '#c8b0bc', 'rgba(0,0,0,0.85)', 6);
    y += 84;
  });
  const it = menu.items[menu.sel];
  if (it && it.desc) {
    ctx.font = `italic 500 32px ${FONT_BODY}`;
    ctx.fillStyle = '#d8b8c0';
    ctx.fillText(it.desc, x, y + 20);
  }
  ctx.restore();
  drawFooter(ctx, W, H, menu.app.input, [['confirm', 'Auswählen']]);
}

// Start
const canvas = document.getElementById('game');
// Schriften gleich laden – die Leinwand fordert sie sonst erst an, wenn sie gebraucht werden.
if (document.fonts) {
  for (const f of ['700 20px "Cinzel Decorative"', '900 20px "Cinzel Decorative"', '600 20px Cinzel', '500 20px "EB Garamond"', 'italic 500 20px "EB Garamond"']) document.fonts.load(f).catch(() => {});
}
try {
  new App(canvas);
  document.getElementById('loading')?.remove();
} catch (e) {
  const el = document.getElementById('loading');
  if (el) el.textContent = 'Fehler beim Start: ' + e.message;
  throw e;
}
