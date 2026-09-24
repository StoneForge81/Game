// Das laufende Spiel: verbindet Welt, Figuren, Kampf, Story und Anzeige.

import { VIEW_W, VIEW_H, TILE } from '../data/config.js';
import { ZONES, ZONE_ORDER, ABILITY_INFO } from '../data/zones.js';
import { SCENES, HINTS, LORE, CHECKPOINT_LINES, ENDINGS, pickEnding, PROLOGUE } from '../data/story.js';
import { generateZone } from './levelgen.js';
import { World } from './world.js';
import { Camera } from './camera.js';
import { Player } from './player.js';
import { Enemy } from './enemies.js';
import { createBoss } from './bosses.js';
import { Henry } from './henry.js';
import { Checkpoint, StartCoffin, Prisoner, LorePoint, Pickup, Door, Exit, Throne, Archivists } from './items.js';
import { Entity } from './entity.js';
import { Particles } from '../render/particles.js';
import { TileRenderer } from '../render/tiles.js';
import { Backgrounds } from '../render/backgrounds.js';
import { drawDeco, drawDecoEmissive, drawHolyShaft, drawWater, flicker } from '../render/deco.js';
import { drawHumanoid, makePose, COSTUMES } from '../render/puppet.js';
import { TRACKS } from '../core/audio.js';
import { saveSlot, setLastSlot } from '../core/save.js';
import { HUD } from '../ui/hud.js';
import { Dialogue } from '../ui/dialogue.js';
import { MenuScreen, MapScreen, LoreScreen, DeathScreen, EndingScreen, ControlsScreen, optionsMenu } from '../ui/menus.js';
import { FONT_TITLE, FONT_BODY, wrap, strokeText } from '../ui/text.js';
import { clamp, rectsOverlap, dist } from '../core/math.js';

const SEEN = 6; // Kacheln pro Kartenfeld

export class Game {
  constructor(app, save, slot) {
    this.app = app;
    this.renderer = app.renderer;
    this.input = app.input;
    this.audio = app.audio;
    this.settings = app.settings;
    this.save = save;
    this.slot = slot;

    this.particles = new Particles();
    this.camera = new Camera();
    this.hud = new HUD(app);
    this.dialogue = new Dialogue(app);
    this.overlay = null;
    this.time = 0;
    this.cutscene = false;
    this.fade = 1;           // 1 = schwarz; blendet beim Start ein
    this.fadeTarget = 0;
    this.fadeCb = null;
    this.levelCache = {};
    this.hintsShown = new Set();
    this.sequence = null;    // laufende Zwischensequenz (Liste von Schritten)
    this.prologue = null;

    this.fx = {
      hitstop: (t) => app.loop.freeze(t),
      shake: (v) => this.camera.addTrauma(v * this.settings.screenShake),
    };
    this.audio._onThunder = () => { if (this.zone && this.zone.sky) this.renderer.lightning = 1; };
    this.camera.shakeScale = 1;

    this.loadZone(save.zone, save.checkpoint);
    if (!save.storyFlags.prologue) this.prologue = { i: 0, t: 0 };
  }

  /** Renderauflösung hat sich geändert (Optionen oder Automatik). */
  onScale(s) {
    this.tiles.setScale(s);
    this.bg.setScale(s);
  }

  // === Zonen ==================================================================

  loadZone(zoneId, spawnRef) {
    const zone = ZONES[zoneId];
    this.zoneId = zoneId;
    this.zone = zone;
    this.zoneIndex = ZONE_ORDER.indexOf(zoneId);
    const level = this.levelCache[zoneId] || (this.levelCache[zoneId] = generateZone(zoneId));
    this.level = level;
    this.world = new World(level);
    this.tiles = new TileRenderer(this.world, zone, this.renderer.scale);
    this.bg = new Backgrounds(zone, this.renderer.scale);
    this.renderer.grade = { ...zone.grade, ambient: zone.ambient };
    this.particles.clear();
    this.particles.isSolidAt = (x, y) => this.world.isSolidAt(x, y);

    this.enemies = [];
    this.objects = [];
    this.projectiles = [];
    this.boss = null;

    const flags = this.save.storyFlags;
    this._repairSave();
    for (const e of level.entities) {
      switch (e.type) {
        case 'enemy': this.enemies.push(new Enemy(e.kind, e.x, e.y, this.zoneIndex, { passive: e.passive })); break;
        case 'item': if (!flags['got:' + e.id]) this.objects.push(new Pickup(e.kind, e.x, e.y, { id: e.id })); break;
        case 'checkpoint': this.objects.push(new Checkpoint(e)); break;
        case 'prisoner': if (!flags['prisoner:' + e.id]) this.objects.push(new Prisoner(e)); break;
        case 'lore': { const l = new LorePoint(e); l.read = !!flags['lore:' + e.key]; this.objects.push(l); break; }
        case 'coffin': this.objects.push(new StartCoffin(e)); break;
        case 'door': case 'bossDoor': this.objects.push(new Door(e)); break;
        case 'exit': this.objects.push(new Exit(e)); break;
        case 'throne': this.throne = new Throne(e); this.objects.push(this.throne); break;
        case 'archivists': { const a = new Archivists(e); a.talked = !!flags.fullMap; this.objects.push(a); break; }
        default: break;
      }
    }
    if (level.bossArena && !this.save.bossesDefeated.includes(zone.boss)) {
      this.boss = createBoss(zone.boss, level.bossArena, this);
      this.enemies.push(this.boss);
    }
    this.arenas = level.arenas.map((a) => ({ ...a, cleared: !!flags['arena:' + a.id], active: false, wave: 0, spawned: [] }));
    this.triggers = level.triggers.map((t) => ({ ...t, done: !!(t.once && (flags['story:' + t.id])) }));

    // Startpunkt
    let sx = level.spawn.x, sy = level.spawn.y;
    const cp = level.checkpoints.find((c) => c.id === spawnRef);
    if (cp) { sx = cp.x - 16; sy = cp.y; }
    this.player = new Player(sx, sy, this.save);
    this.player.facing = 1;

    this.henry = new Henry(sx + 22, sy);
    if (flags.henryJoined) { this.henry.form = 'bat'; this.henry.y = sy - 40; }
    else { this.henry.x = sx + 34; this.henry.facing = -1; }

    this.seen = new Set(this.save.mapSeen[zoneId] || []);
    this.camera = new Camera();
    this.camera.shakeScale = 1;
    this.camera.setBounds(this.world.pxW, this.world.pxH);
    this.camera.snap(this.player.x, this.player.y);
    this.tiles.prewarm(this.player.x, this.player.y);

    this.audio.playTrack(TRACKS[zone.music]);
    this.audio.setAmbience(zone.ambience);
    if (!this.save.zonesVisited.includes(zoneId)) this.save.zonesVisited.push(zoneId);
    this.save.zone = zoneId;
  }

  /**
   * Selbstheilender Spielstand: Zu jedem besiegten Boss gehört seine Kraft.
   * Fehlt sie (Kugel nicht eingesammelt, Absturz …), wird sie ergänzt –
   * sonst könnte man an einer Fähigkeitssperre für immer festsitzen.
   */
  _repairSave() {
    const s = this.save;
    for (const z of ZONE_ORDER) {
      const zd = ZONES[z];
      if (zd.reward && s.bossesDefeated.includes(zd.boss) && !s.abilities[zd.reward]) s.abilities[zd.reward] = true;
    }
  }

  exitZone(to) {
    if (!to) return;
    this.cutscene = true;
    this.player.locked = true;
    this.audio.play('door');
    this.fadeTo(1, () => {
      this.save.checkpoint = to + '.start';
      this.loadZone(to, to + '.start');
      this.persist();
      this.cutscene = false;
      this.fadeTo(0);
    });
  }

  fadeTo(v, cb = null) { this.fadeTarget = v; this.fadeCb = cb; }

  /** Nach `sec` Sekunden Spielzeit ausführen (läuft nicht im Pausenmenü weiter). */
  after(sec, fn) { (this.timers || (this.timers = [])).push({ t: sec, fn }); }

  _tickTimers(dt) {
    if (!this.timers?.length) return;
    for (const tm of this.timers) tm.t -= dt;
    const due = this.timers.filter((tm) => tm.t <= 0);
    this.timers = this.timers.filter((tm) => tm.t > 0);
    for (const tm of due) tm.fn();
  }

  // === Hilfen für Figuren =====================================================

  hurtables() { return this.enemies.filter((e) => e.hurtable && !e.dead); }
  spawnProjectile(p) { this.projectiles.push(p); }
  spawnEnemy(kind, x, y) {
    const e = new Enemy(kind, x, y, this.zoneIndex, { alwaysAware: true });
    e.aware = 3; e.state = 'chase';
    this.enemies.push(e);
    this.particles.dust(x, y, 8);
    return e;
  }
  damageNumber(x, y, v, color, crit = false) { if (this.settings.showDamageNumbers) this.particles.number(x, y, v, color, crit); }

  hint(id) {
    if (this.hintsShown.has(id) || !HINTS[id]) return;
    this.hintsShown.add(id);
    this._pendingHints = this._pendingHints || [];
    this._pendingHints.push(id);
  }

  /** Hinweise der Reihe nach zeigen – nie gleichzeitig mit Gebietstitel oder Dialog. */
  _flushHints() {
    if (!this._pendingHints?.length || this.hud.title || this.dialogue.active || this.henry.form !== 'bat') return;
    if (this.henry.bubble && this.henry.bubble.t < this.henry.bubble.dur - 0.3) return;
    this.henry.say(HINTS[this._pendingHints.shift()]);
  }

  startScene(id, onEnd = null, onChoice = null) {
    const lines = SCENES[id];
    if (!lines) { onEnd && onEnd(); return; }
    this.dialogue.start(lines, onEnd, onChoice);
  }

  isSeen(wx, wy) {
    if (this.save.storyFlags.fullMap) return true;
    const k = Math.floor(wx / TILE / SEEN) + Math.floor(wy / TILE / SEEN) * 10000;
    return this.seen.has(k);
  }

  persist() {
    this.save.health = Math.max(1, Math.ceil(this.player.hp));
    this.save.blood = Math.floor(this.player.blood);
    this.save.mapSeen[this.zoneId] = [...this.seen];
    saveSlot(this.slot, this.save);
    setLastSlot(this.slot);
  }

  // === Ereignisse ============================================================

  onEnemyKilled(e, drained) {
    this.kills = (this.kills || 0) + 1;
    if (e.isBoss) return;
    if (!drained) {
      const n = e.kind === 'knight' || e.kind === 'automaton' ? 3 : Math.random() < 0.5 ? 2 : 1;
      for (let i = 0; i < n; i++) this.objects.push(new Pickup('bloodOrb', e.x, e.y - 12, { vx: (Math.random() - 0.5) * 160, vy: -180 - Math.random() * 100 }));
    }
  }

  onBloodDrunk(amount) {
    const s = this.save;
    s.bloodDrunk += amount;
    const power = 1 + Math.floor(s.bloodDrunk / 120);
    if (power > s.power) {
      s.power = power;
      this.hud.notify('Deine Macht wächst', `Macht ${power} – deine Angriffe treffen härter`, '#ffd8a0');
      this.audio.play('levelUp');
    }
  }

  onPlayerDeath() {
    this.save.deaths++;
    this.audio.stopMusic(1.5);
    this.renderer.desaturate = 0;
    this._deathT = 0;
  }

  _respawn() {
    this.overlay = null;
    const p = this.save;
    p.health = p.maxHealth;
    this.fadeTo(1, () => {
      this.loadZone(p.zone, p.checkpoint);
      this.player.hp = this.player.maxHp;
      this.renderer.desaturate = 0;
      this.fadeTo(0);
      this.startScene('death');
    });
  }

  onPlayerFellInPit(dmg) {
    const p = this.player;
    if (this._pitT > 0 || p.state === 'dead') return;
    this._pitT = 0.8;
    p.hurt(this, dmg, p.x);
    this.audio.play('holyBurn', { x: p.x });
    this.particles.sparks(p.x, p.y, '#e8ecff', 14, 200, -Math.PI / 2);
    if (p.state === 'dead') return;
    this._pitFade = { t: 0 };
  }

  collect(pk) {
    const s = this.save, p = this.player;
    switch (pk.kind) {
      case 'bloodOrb':
        p.gainBlood(6);
        p.heal(pk.heal);
        this.audio.play('pickup', { x: pk.x, gain: 0.35 });
        break;
      case 'heartShard':
        s.heartShards++;
        if (pk.itemId) s.storyFlags['got:' + pk.itemId] = true;
        this.audio.play('heartShard');
        if (s.heartShards % 4 === 0) {
          s.maxHealth += 20; p.maxHp = s.maxHealth; p.hp = p.maxHp;
          this.hud.notify('Lebenskraft gestärkt!', `Maximale Lebenskraft: ${s.maxHealth}`, '#ff9aaa');
        } else this.hud.notify('Herzsplitter', `${s.heartShards % 4} von 4 – vier ergeben ein ganzes Herz`, '#ff9aaa');
        this.persist();
        break;
      case 'chalice':
        s.chalices++;
        if (pk.itemId) s.storyFlags['got:' + pk.itemId] = true;
        this.audio.play('heartShard');
        if (s.chalices % 4 === 0) {
          s.maxBlood += 20; p.blood = s.maxBlood;
          this.hud.notify('Blutdurst gestärkt!', `Maximales Blut: ${s.maxBlood}`, '#ffe0a0');
        } else this.hud.notify('Blutkelch', `${s.chalices % 4} von 4`, '#ffe0a0');
        this.persist();
        break;
      case 'ability': {
        s.abilities[pk.ability] = true;
        const info = ABILITY_INFO[pk.ability];
        this.hud.showBanner(info.name, info.desc + (info.action ? `  ({${info.action}})` : ''));
        this.audio.play('levelUp');
        this.renderer.doFlash(255, 60, 90, 0.4);
        this.particles.ring(p.x, p.y - 20, '#ff4060', 6, 90, 0.7);
        this.particles.bats(p.x, p.y - 20, 12);
        this.persist();
        break;
      }
      default: break;
    }
  }

  // --- Sarg -------------------------------------------------------------------

  openCheckpoint(cp) {
    const s = this.save;
    const open = () => {
      const zonesWithCp = ZONE_ORDER.filter((z) => z !== this.zoneId && s.storyFlags['cpz:' + z]);
      this.overlay = new MenuScreen(this.app, {
        title: 'Der Sarg',
        subtitle: 'Oma Renate hat frisch gepolstert.',
        width: 1000,
        onCancel: () => { this.overlay = null; },
        items: [
          { label: 'Ruhen und speichern', type: 'action', desc: 'Volle Lebenskraft und volles Blut. Hier erwachst du, wenn du zerfällst.', onSelect: () => { this.overlay = null; this._rest(cp); } },
          { label: 'Sargreise mit Opa Egon', type: 'action', disabled: zonesWithCp.length === 0, desc: zonesWithCp.length ? 'Reise zu einem anderen Sarg, in dem du schon geruht hast.' : 'Ruhe erst in Särgen anderer Gebiete.', onSelect: () => this._travelMenu(zonesWithCp) },
          { label: 'Mit Oma und Opa reden', type: 'action', onSelect: () => {
            this.overlay = null;
            const l = CHECKPOINT_LINES[(this._cpLine = ((this._cpLine ?? -1) + 1)) % CHECKPOINT_LINES.length];
            this.dialogue.start([l]);
          } },
          { label: 'Weiter', type: 'action', onSelect: () => { this.overlay = null; } },
        ],
      });
    };
    if (!s.storyFlags.metFamily) {
      s.storyFlags.metFamily = true;
      this.startScene('checkpoint.first', open);
    } else open();
  }

  _rest(cp) {
    const s = this.save, p = this.player;
    p.hp = p.maxHp;
    p.blood = p.maxBlood;
    s.checkpoint = cp.cpId;
    s.storyFlags['cpz:' + this.zoneId] = cp.cpId;
    this.persist();
    this.audio.play('checkpoint', { x: cp.x });
    this.particles.ring(cp.x, cp.y - 12, '#ff4060', 4, 60, 0.6);
    this.particles.bats(cp.x, cp.y - 12, 6);
    this.renderer.doFlash(120, 0, 30, 0.2);
    this.hud.notify('Gespeichert', 'Du hast im Sarg geruht.', '#ffd0d8');
  }

  _travelMenu(zones) {
    this.overlay = new MenuScreen(this.app, {
      title: 'Sargreise',
      subtitle: '„Wohin soll\'s gehen, Schwiegersohn?" – Opa Egon',
      onCancel: () => { this.overlay = null; },
      items: [
        ...zones.map((z) => ({ label: ZONES[z].name, type: 'action', onSelect: () => {
          this.overlay = null;
          this.cutscene = true;
          this.audio.play('bat');
          this.particles.bats(this.player.x, this.player.y - 16, 16);
          this.fadeTo(1, () => {
            const cpId = this.save.storyFlags['cpz:' + z];
            this.save.checkpoint = cpId;
            this.loadZone(z, cpId);
            this.persist();
            this.cutscene = false;
            this.fadeTo(0);
          });
        } })),
        { label: 'Hierbleiben', type: 'action', onSelect: () => { this.overlay = null; } },
      ],
    });
  }

  // --- Gefangene und Schriften ----------------------------------------------

  talkToPrisoner(pr) {
    const s = this.save, p = this.player;
    this.startScene('prisoner.' + pr.variant, null, (kind, choice) => {
      s.storyFlags['prisoner:' + pr.pid] = choice;
      if (choice === 'drink') {
        s.greed++;
        s.maxBlood += 10;
        p.blood = s.maxBlood;
        p.heal(30);
        this.onBloodDrunk(40);
        pr.drink(this);
        this.audio.play('drain', { x: pr.x });
        for (let i = 0; i < 12; i++) this.particles.bloodStream(pr.x, pr.y - 16, p.x + p.facing * 5, p.y - 25, 2);
        this.renderer.doFlash(140, 0, 20, 0.3);
        this.startScene('prisoner.drink', () => this.hud.notify('Blutdurst wächst', `Maximales Blut: ${s.maxBlood}`, '#ff8a9a'));
      } else {
        s.mercy++;
        s.maxHealth += 10;
        p.maxHp = s.maxHealth;
        p.heal(10);
        pr.free(this);
        this.startScene('prisoner.spare', () => this.hud.notify('Du erinnerst dich, wer du warst', `Maximale Lebenskraft: ${s.maxHealth}`, '#ffe0e8'));
      }
      this.persist();
    });
  }

  talkToArchivists(ar) {
    const s = this.save;
    if (s.storyFlags.fullMap) { this.startScene('bibliothek.archivists.again'); return; }
    this.startScene('bibliothek.archivists', () => {
      s.storyFlags.fullMap = true;
      ar.talked = true;
      this.audio.play('heartShard');
      this.hud.notify('Karte von Ingonesien', 'Alle Gebiete und Verstecke sind jetzt auf deiner Karte.', '#f0e0b0');
      this.persist();
    });
  }

  showLore(lp) {
    const lore = LORE[lp.key];
    if (!lore) return;
    lp.read = true;
    this.save.storyFlags['lore:' + lp.key] = true;
    this.audio.play('uiConfirm');
    this.overlay = new LoreScreen(this.app, lore, () => { this.overlay = null; });
  }

  // --- Boss -------------------------------------------------------------------

  _startBoss(t) {
    const b = this.boss;
    if (!b || b.state !== 'wait') return;
    const a = this.level.bossArena;
    this.world.setGate(a.gateL, true);
    this.world.setGate(a.gateR, true);
    this.camera.lock = { x: a.x, y: a.y - 30, w: a.w, h: a.h + 50 };
    this.cutscene = true;
    this.player.locked = true;
    this.player.vx = 0;
    this.audio.stopMusic(0.8);
    this.audio.play('bossRoar', { x: b.x });
    this.fx.shake(0.5);
    this.camera.focus = { x: (b.x + this.player.x) / 2, y: a.floorY - 60 };
    this.startScene(this.zoneId + '.boss.intro', () => {
      this.cutscene = false;
      this.player.locked = false;
      this.camera.focus = null;
      b.begin();
      this.audio.playTrack(this.zoneId === 'kathedrale' ? TRACKS.finale : TRACKS.boss, 0.4);
    });
  }

  onBossDying(boss) {
    this.audio.stopMusic(2);
    this.app.loop.timeScale = 0.35;
    this._slowmoT = 1.4;
    this.audio.play('bossRoar', { x: boss.x, gain: 0.8 });
    // Übrige Gegner (Isoldes Hunde) fliehen
    for (const e of this.enemies) if (!e.isBoss && !e.dead) e.die(this, 1);
  }

  onBossDefeated(boss) {
    const s = this.save;
    if (!s.bossesDefeated.includes(boss.kind)) s.bossesDefeated.push(boss.kind);
    const after = () => {
      const a = this.level.bossArena;
      this.world.setGate(a.gateL, false);
      this.world.setGate(a.gateR, false);
      this.camera.lock = null;
      this.cutscene = false;
      this.player.locked = false;
      if (this.zone.reward) this.objects.push(new Pickup('ability', boss.x, boss.floorY - 26, { ability: this.zone.reward }));
      // Belohnung: ein ganzes Herz
      s.maxHealth += 10; this.player.maxHp = s.maxHealth; this.player.hp = this.player.maxHp;
      this.audio.playTrack(TRACKS.sanctuary, 2);
      this.persist();
    };
    this.cutscene = true;
    this.player.locked = true;
    if (boss.kind === 'serafine') {
      this.startScene('kathedrale.boss.defeat', null, (kind, choice) => {
        s.storyFlags.drankSerafine = choice === 'drink';
        if (choice === 'drink') {
          this.audio.play('drain', { x: boss.x });
          for (let i = 0; i < 20; i++) this.particles.bloodStream(boss.x, boss.y - 20, this.player.x, this.player.y - 25, 2);
          this.renderer.doFlash(160, 0, 20, 0.4);
          this.onBloodDrunk(80);
        }
        this.startScene('kathedrale.serafine.' + (choice === 'drink' ? 'drink' : 'spare'), () => {
          boss.remove = true;
          this.particles.holy(boss.x, boss.y - 20, 30);
          after();
        });
      });
    } else {
      this.startScene(this.zoneId + '.boss.defeat', () => {
        boss.remove = true;
        this.particles.holy(boss.x, boss.y - 20, 30);
        after();
      });
    }
  }

  // --- Anfang und Ende --------------------------------------------------------

  _introSequence() {
    this.cutscene = true;
    this.player.locked = true;
    this.player.facing = 1;
    this.henry.facing = -1;
    this.particles.bats(this.player.x, this.player.y - 16, 14);
    this.audio.play('bat', { x: this.player.x });
    this.camera.targetZoom = 1.15;
    this.startScene('intro.awaken', () => {
      this.henry.transform(this, 'bat');
      this.save.storyFlags.henryJoined = true;
      this.camera.targetZoom = 1;
      this.cutscene = false;
      this.player.locked = false;
      this.hud.zoneTitle(this.zone.name, this.zone.subtitle);
      this.persist();
    });
  }

  _endingSequence() {
    const t = this.throne;
    if (!t) return;
    this.cutscene = true;
    this.player.locked = true;
    this.player.vx = 0;
    this.camera.focus = { x: t.x - 20, y: t.y - 40 };
    this.audio.playTrack(TRACKS.sanctuary, 2);
    this.startScene('ending.throne', () => {
      t.freed = true;
      this.audio.play('glassBreak', { x: t.x });
      this.renderer.doFlash(255, 250, 240, 0.8);
      this.fx.shake(0.6);
      this.particles.holy(t.x, t.y - 30, 40);
      this.particles.ring(t.x, t.y - 30, '#ffffff', 6, 120, 0.8);
      // Die Familie kommt zusammen
      this.henry.transform(this, 'boy');
      this.henry.x = t.x - 40; this.henry.y = t.y; this.henry.facing = 1;
      const renate = new FamilyNPC(t.x - 110, t.y, 'renate', 1);
      const egon = new FamilyNPC(t.x - 135, t.y, 'egon', 1);
      this.objects.push(renate, egon);
      this.particles.bats(renate.x, renate.y - 16, 8);
      this.particles.bats(egon.x, egon.y - 16, 8);
      this.after(0.9, () => this.startScene('ending.reunion', () => this._showEnding()));
    });
  }

  _showEnding() {
    const key = pickEnding(this.save);
    this.save.storyFlags.completed = true;
    this.save.storyFlags.ending = key;
    this.persist();
    this.fadeTo(1, () => {
      this.audio.playTrack(key === 'eternal' ? TRACKS.title : TRACKS.sanctuary, 2);
      this.overlay = new EndingScreen(this.app, ENDINGS[key], this.save, () => {
        this.overlay = null;
        this.app.toTitle();
      });
      this.fade = 0; this.fadeTarget = 0;
    });
  }

  // === Menüs ==================================================================

  _pauseMenu() {
    this.audio.setMuffle(0.7);
    const close = () => { this.overlay = null; this.audio.setMuffle(0); };
    this.overlay = new MenuScreen(this.app, {
      title: 'Pause',
      subtitle: `${this.zone.name} · Macht ${this.save.power}`,
      onCancel: close,
      items: [
        { label: 'Weiterspielen', type: 'action', onSelect: close },
        { label: 'Karte', type: 'action', onSelect: () => { this.overlay = new MapScreen(this.app, this, () => this._pauseMenu()); } },
        { label: 'Optionen', type: 'action', onSelect: () => { this.overlay = optionsMenu(this.app, () => this._pauseMenu()); } },
        { label: 'Steuerung', type: 'action', onSelect: () => { this.overlay = new ControlsScreen(this.app, () => this._pauseMenu()); } },
        { label: 'Zum Titelbildschirm', type: 'action', desc: 'Fortschritt bis zum letzten Sarg bleibt erhalten.', onSelect: () => { this.audio.setMuffle(0); this.app.toTitle(); } },
      ],
    });
  }

  // === Hauptschleife ==========================================================

  update(dt) {
    this.time += dt;
    const input = this.input;

    // Überblendung
    if (this.fade !== this.fadeTarget) {
      this.fade = this.fadeTarget > this.fade ? Math.min(this.fadeTarget, this.fade + dt * 2.5) : Math.max(this.fadeTarget, this.fade - dt * 1.6);
      if (this.fade === this.fadeTarget && this.fadeCb) { const cb = this.fadeCb; this.fadeCb = null; cb(); }
    }

    // Vorspann
    if (this.prologue) { this._updatePrologue(dt); return; }

    this.hud.update(dt, this);
    if (this.overlay) { this.overlay.update(dt); return; }
    this._tickTimers(dt);
    if (this.dialogue.active) {
      this.dialogue.update(dt);
      this.henry.update(dt, this);
      this.particles.update(dt);
      for (const o of this.objects) if (o instanceof FamilyNPC || o instanceof Throne) o.update(dt, this);
      this.camera.update(dt, this.player);
      this.renderer.decay(dt);
      return;
    }

    if (!this.cutscene && input.pressed('menu')) { this._pauseMenu(); return; }
    if (!this.cutscene && input.pressed('map')) { this.overlay = new MapScreen(this.app, this, () => { this.overlay = null; }); return; }

    if (this._slowmoT > 0) { this._slowmoT -= dt / Math.max(0.1, this.app.loop.timeScale); if (this._slowmoT <= 0) this.app.loop.timeScale = 1; }
    this._pitT = Math.max(0, (this._pitT || 0) - dt);

    this.world.update(dt);
    const p = this.player;
    p.update(dt, this);

    // Wem kann der Spieler gerade etwas tun?
    p.interactTarget = null;
    p.drainCandidate = null;
    if (!this.cutscene && p.state === 'normal') {
      let best = null, bd = 1e9;
      for (const e of this.enemies) {
        if (!e.drainable || e.dead) continue;
        const d = Math.abs(e.x - p.x);
        if (d < 32 && Math.abs(e.y - p.y) < 20 && d < bd) { bd = d; best = e; }
      }
      p.drainCandidate = best;
      if (!best) {
        for (const o of this.objects) {
          if (o.canInteract && o.canInteract(p)) { const d = Math.abs(o.x - p.x); if (d < bd) { bd = d; best = o; } }
        }
        p.interactTarget = best;
      }
    }
    if (p.drainCandidate) this.hint('hint.drain');

    this.henry.update(dt, this);
    for (const e of this.enemies) {
      e.update(dt, this);
      if (e.kind === 'knight' && e.aware > 0) this.hint('hint.knight');
    }
    this.enemies = this.enemies.filter((e) => !e.remove);
    for (const pr of this.projectiles) pr.update(dt, this);
    this.projectiles = this.projectiles.filter((pr) => !pr.remove);
    for (const o of this.objects) o.update(dt, this);
    this.objects = this.objects.filter((o) => !o.remove);
    this.particles.update(dt);

    this._triggers(p);
    this._flushHints();
    this._arenas(p);
    this._ambient(dt);
    this._markSeen(p);

    // Sturz in den Abgrund: kurz schwarz, dann zurück auf sicheren Boden
    if (this._pitFade) {
      this._pitFade.t += dt;
      if (this._pitFade.t > 0.25 && !this._pitFade.done) {
        this._pitFade.done = true;
        p.teleport(p.lastSafe.x, p.lastSafe.y);
        p.invuln = 1.2;
        p.state = 'normal';
        this.camera.snap(p.x, p.y);
      }
      if (this._pitFade.t > 0.5) this._pitFade = null;
    }

    // Tod
    if (p.state === 'dead') {
      this._deathT = (this._deathT || 0) + dt;
      this.renderer.desaturate = clamp(this._deathT / 1.5, 0, 0.85);
      if (this._deathT > 2.2 && !this.overlay) this.overlay = new DeathScreen(this.app, () => this._respawn());
    }

    this.camera.update(dt, p);
    this.renderer.decay(dt);

    // Klang: Stereo nach Kamera, Kampfintensität, Herzschlag
    this.audio.setListener(this.camera.x + VIEW_W / 2, VIEW_W / 2);
    let threat = 0;
    for (const e of this.enemies) if (!e.dead && (e.aware > 0 || e.isBoss && e.state === 'fight') && dist(e.x, e.y, p.x, p.y) < 260) threat += e.isBoss ? 2 : 0.4;
    this.audio.setIntensity(clamp(threat, 0.15, 1));
    const hpk = p.hp / p.maxHp;
    this.audio.setHeartbeat(p.state === 'dead' ? 0 : hpk < 0.3 ? 1 - hpk / 0.3 : 0);
    this.renderer.bloodTint = p.state === 'dead' ? 0.6 : hpk < 0.3 ? (1 - hpk / 0.3) * 0.8 : 0;
    if (p.blood < 8 && this.time > 20) this.hint('hint.lowBlood');

    this.save.playTime += dt;
  }

  _triggers(p) {
    const pr = p.rect();
    for (const t of this.triggers) {
      if (t.done) continue;
      if (!rectsOverlap(pr, t)) continue;
      switch (t.kind) {
        case 'story':
          t.done = true;
          if (this.save.storyFlags['story:' + t.id]) break;
          this.save.storyFlags['story:' + t.id] = true;
          if (t.id === 'intro.awaken') this._introSequence();
          else if (t.id === 'ending.throne') this._endingSequence();
          else this.startScene(t.id);
          break;
        case 'hint': t.done = true; this.hint(t.id); break;
        case 'zoneTitle':
          t.done = true;
          if (this.save.storyFlags.henryJoined) this.hud.zoneTitle(this.zone.name, this.zone.subtitle);
          break;
        case 'pit': if (p.y > t.y + 4) this.onPlayerFellInPit(22); break;
        case 'boss': if (this.boss && this.boss.state === 'wait') { t.done = true; this._startBoss(t); } break;
        default: break;
      }
    }
    // Erster Sarg: Henry macht darauf aufmerksam
    for (const o of this.objects) if (o instanceof Checkpoint && Math.abs(o.x - p.x) < 120 && Math.abs(o.y - p.y) < 60) this.hint('hint.checkpoint');
  }

  _arenas(p) {
    for (const a of this.arenas) {
      if (a.cleared) continue;
      if (!a.active) {
        if (p.x > a.x + 60 && p.x < a.x + a.w - 60 && p.y <= a.floorY + 2 && p.y > a.y) {
          a.active = true;
          this.world.setGate(a.gateL, true);
          this.world.setGate(a.gateR, true);
          this.audio.play('door');
          this.fx.shake(0.4);
          this.hud.notify('Hinterhalt!', 'Die Tore schließen sich.', '#ff8a9a');
          this._spawnWave(a);
        }
        continue;
      }
      if (a.spawned.every((e) => e.dead || e.remove)) {
        a.wave++;
        if (a.wave < a.waves.length) this._spawnWave(a);
        else {
          a.cleared = true;
          a.active = false;
          this.save.storyFlags['arena:' + a.id] = true;
          this.world.setGate(a.gateL, false);
          this.world.setGate(a.gateR, false);
          this.audio.play('door');
          const idx = this.arenas.indexOf(a);
          const kind = (idx + this.zoneIndex) % 2 === 0 ? 'heartShard' : 'chalice';
          this.objects.push(new Pickup(kind, a.reward.x, a.reward.y, { id: a.id + '.reward' }));
          this.hud.notify('Arena bezwungen', 'Ein Schatz liegt bereit.', '#ffd8a0');
        }
      }
    }
  }

  _spawnWave(a) {
    const list = a.waves[a.wave];
    a.spawned = list.map((kind, i) => {
      const x = a.x + 60 + ((i + 0.5) / list.length) * (a.w - 120);
      const e = new Enemy(kind, x, a.floorY, this.zoneIndex, { alwaysAware: true });
      e.aware = 3; e.state = 'chase';
      this.enemies.push(e);
      this.particles.mist(x, a.floorY - 16, 10, '#d8d0e8');
      this.particles.holy(x, a.floorY - 20, 6);
      return e;
    });
    this.audio.play('holyShot');
  }

  _ambient(dt) {
    // Schwebende Glut / Geisterlicht / Staub in der Zonenfarbe
    const cam = this.camera;
    if (Math.random() < 0.45) {
      this.particles.spawn({
        kind: 'mote', x: cam.x + Math.random() * VIEW_W, y: cam.y + VIEW_H * (0.3 + Math.random() * 0.8),
        vx: (Math.random() - 0.4) * 14, vy: -6 - Math.random() * 16, life: 2.5 + Math.random() * 2,
        size: 0.6 + Math.random() * 1.1, size1: 0.2, color: this.bg.motes, emissive: true,
      });
    }
    if (this.zone.rain) {
      for (let i = 0; i < 3; i++) {
        this.particles.spawn({ kind: 'rain', x: cam.x + Math.random() * (VIEW_W + 60), y: cam.y - 10, vx: -70, vy: 560, life: 0.7, size: 1, color: 'rgba(210,190,220,0.55)', stick: false, alpha: 0.6 });
      }
    }
    // Fackeln sprühen Funken
    if (Math.random() < 0.2) {
      const d = this.level.deco[Math.floor(Math.random() * this.level.deco.length)];
      if (d && d.type === 'torch' && Math.abs(d.x - cam.x - VIEW_W / 2) < VIEW_W) this.particles.embers(d.x, d.y - 12, '#ffb050', 1, 2);
    }
  }

  _markSeen(p) {
    const tx = Math.floor(p.x / TILE / SEEN), ty = Math.floor(p.y / TILE / SEEN);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) this.seen.add((tx + dx) + (ty + dy) * 10000);
  }

  _updatePrologue(dt) {
    const pr = this.prologue;
    pr.t += dt;
    const input = this.input;
    const lineDur = 4.2;
    if (input.pressed('confirm') || input.pressed('attack') || input.pressed('drain') || pr.t > lineDur) {
      pr.i++;
      pr.t = 0;
      if (pr.i === 1) this.audio.play('checkpoint');
      if (pr.i >= PROLOGUE.length) {
        this.prologue = null;
        this.save.storyFlags.prologue = true;
        this.fade = 1;
        this.fadeTo(0);
      }
    }
    if (input.pressed('menu')) { this.prologue = null; this.save.storyFlags.prologue = true; this.fadeTo(0); }
  }

  // === Zeichnen ===============================================================

  render(alpha, frameDt) {
    const r = this.renderer;
    if (this.prologue) { this._renderPrologue(); return; }
    const cam = this.camera;
    r.setCamera(cam.x, cam.y, cam.shakeX, cam.shakeY, cam.zoom);
    r.beginFrame(frameDt);
    const view = r.viewRect(60);
    const t = this.time;
    const inView = (o, m = 80) => o.x > view.x - m && o.x < view.x + view.w + m && o.y > view.y - m && o.y < view.y + view.h + m * 2;

    // --- Licht ---
    const lights = [];
    for (const L of this.level.lights) {
      if (!inView(L, L.radius)) continue;
      lights.push(L.flicker ? { ...L, intensity: L.intensity * flicker(t, L.x * 0.37) } : L);
    }
    const add = (L) => { if (L) lights.push(L); };
    add(this.player.light(this));
    for (const e of this.enemies) if (inView(e)) add(e.light(this));
    for (const o of this.objects) if (inView(o) && o.light) add(o.light(this));
    for (const pr of this.projectiles) add(pr.light());
    for (const z of this.world.holy) {
      const s = this.world.holyState(z);
      if (s.glow > 0.1 && inView({ x: z.x, y: z.y + z.h }, 200)) lights.push({ x: z.x + z.w / 2, y: z.y + z.h - 12, radius: 90 + z.w * 2, color: 'rgb(255,232,170)', intensity: s.glow * (s.active ? 1.4 : 0.35) });
    }
    r.computeLights(lights, (x, y, w, h) => this.world.queryOccluders(x, y, w, h));

    // --- Hintergrund ---
    this.bg.draw(r, cam.x, cam.y, this.world.pxH, frameDt);
    this.bg.drawFog(r, cam.x);
    r.flushBackground();

    // --- Welt (beleuchtet) ---
    r.world((ctx) => {
      // Mauern zuerst: sie enthalten den Rückwand-Sockel, vor dem alles andere steht.
      this.tiles.drawFront(ctx, view);
      for (const d of this.level.deco) if (inView(d, 120)) drawDeco(ctx, d, t, this.zone);
      this.particles.drawDecals(ctx, view);
    });
    r.actors((ctx) => {
      for (const o of this.objects) if (!(o instanceof Pickup) && inView(o)) o.draw(ctx, this);
      for (const e of this.enemies) if (inView(e, 120)) e.draw(ctx, this);
      this.henry.draw(ctx, this);
      this.player.draw(ctx, this);
      for (const o of this.objects) if (o instanceof Pickup && inView(o)) o.draw(ctx, this);
      for (const pr of this.projectiles) pr.draw(ctx, this);
      this.particles.drawNormal(ctx, view);
      for (const z of this.level.water) if (inView({ x: z.x + z.w / 2, y: z.y }, z.w)) drawWater(ctx, z, t);
    });
    r.compositeWorld();

    // --- Leuchten ---
    r.emissive((ctx, isGlow) => {
      for (const d of this.level.deco) if (inView(d, 120)) drawDecoEmissive(ctx, d, t, isGlow);
      for (const z of this.world.holy) if (inView({ x: z.x, y: z.y + z.h }, 200)) drawHolyShaft(ctx, z, this.world.holyState(z), t, isGlow);
      for (const o of this.objects) if (inView(o) && o.drawEmissive) o.drawEmissive(ctx, this, isGlow);
      for (const e of this.enemies) if (inView(e, 120)) e.drawEmissive(ctx, this, isGlow);
      this.henry.drawEmissive(ctx, this, isGlow);
      this.player.drawEmissive(ctx, this, isGlow);
      for (const pr of this.projectiles) pr.drawEmissive(ctx, this, isGlow);
      this.particles.drawEmissive(ctx, view, isGlow);
    });

    // Schadenszahlen unbeleuchtet obendrauf
    r.overlay((ctx) => this.particles.drawTexts(ctx));
    r.endFrame();

    // --- Anzeige ---
    r.ui((ctx, W, H) => {
      if (this._pitFade) { ctx.fillStyle = `rgba(0,0,0,${Math.sin(Math.min(1, this._pitFade.t / 0.5) * Math.PI)})`; ctx.fillRect(0, 0, W, H); }
      // Kinobalken in Zwischensequenzen
      const bars = this.cutscene || this.dialogue.active ? 1 : 0;
      this._bars = (this._bars || 0) + (bars - (this._bars || 0)) * 0.12;
      if (this._bars > 0.01) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, 90 * this._bars);
        ctx.fillRect(0, H - 90 * this._bars, W, 90 * this._bars);
      }
      if (!this.overlay || this.overlay instanceof MenuScreen) this.hud.draw(ctx, W, H, this);
      this.dialogue.draw(ctx, W, H);
      if (this.fade > 0.001) { ctx.fillStyle = `rgba(0,0,0,${this.fade})`; ctx.fillRect(0, 0, W, H); }
      if (this.overlay) this.overlay.draw(ctx, W, H);
      if (this.app.debug) {
        ctx.font = '24px monospace'; ctx.fillStyle = '#0f0'; ctx.textAlign = 'left';
        ctx.fillText(`${this.app.loop.fps.toFixed(0)} fps · ${this.enemies.length} Gegner · ${this.particles.count} Partikel · x ${Math.round(this.player.x / TILE)}`, 20, H - 20);
      }
    });
  }

  _renderPrologue() {
    const r = this.renderer;
    r.setCamera(0, 0);
    r.beginFrame(0);
    r.endFrame();
    const pr = this.prologue;
    r.ui((ctx, W, H) => {
      ctx.fillStyle = '#030104';
      ctx.fillRect(0, 0, W, H);
      const text = PROLOGUE[pr.i];
      if (!text) return;
      const a = clamp(Math.min(pr.t * 1.5, (4.2 - pr.t) * 1.5), 0, 1);
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      if (pr.i === 0) {
        ctx.font = `700 110px ${FONT_TITLE}`;
        strokeText(ctx, text, W / 2, H / 2, '#e8d8c8', '#000', 4);
      } else {
        ctx.font = `italic 500 48px ${FONT_BODY}`;
        const lines = wrap(ctx, text, 1400);
        lines.forEach((l, i) => { ctx.fillStyle = pr.i === PROLOGUE.length - 1 ? '#ff5068' : '#e0d4dc'; ctx.fillText(l, W / 2, H / 2 - (lines.length - 1) * 32 + i * 64); });
      }
      ctx.globalAlpha = 1;
      ctx.font = `500 28px ${FONT_BODY}`;
      ctx.fillStyle = '#6a5a64';
      ctx.fillText('Überspringen mit Pause', W / 2, H - 60);
    });
  }
}

/** Oma Renate und Opa Egon in der Schlussszene. */
class FamilyNPC extends Entity {
  constructor(x, y, who, facing) {
    super(x, y, 14, 30);
    this.solid = false; this.gravity = 0;
    this.who = who; this.facing = facing;
  }
  draw(ctx) {
    drawHumanoid(ctx, this.x, this.y, this.facing, makePose('idle', this.age + (this.who === 'egon' ? 1.7 : 0)), COSTUMES[this.who], { sz: 0.95, t: this.age });
  }
}

