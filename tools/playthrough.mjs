// Durchspiel-Test: Ein Bot spielt jede Zone im Zeitraffer (Logik ohne
// Zeichnen) über die echte Eingabeschnittstelle. Prüft Erkunden, Arenen,
// Bosskampf, Belohnung und Zonenübergang bis zum Abspann.
// Der Bot ist unverwundbar und darf zu Schlüsselstellen springen – getestet
// werden die Abläufe, nicht sein Geschick.
//
// Aufruf: node tools/playthrough.mjs [zonen...]

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const ZONES = process.argv.slice(2).length ? process.argv.slice(2) : ['krypta', 'katakomben', 'hof', 'bibliothek', 'uhrturm', 'kathedrale'];
const PORT = 8127;
fs.mkdirSync('screenshots', { recursive: true });
const srv = spawn(process.execPath, ['tools/serve.mjs', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n')));

// Bot-Code, der im Browser läuft
const BOT = () => {
  const a = window.__app;
  a.loop.stop();
  const inp = a.input;
  const ACT = ['left', 'right', 'up', 'down', 'jump', 'attack', 'lance', 'dash', 'drain', 'batForm', 'wolfClaw', 'menu', 'map', 'confirm', 'cancel'];
  const T = { EMPTY: 0, SOLID: 1, PLATFORM: 2, SPIKES: 3, BREAKABLE: 4, GRATE: 5, WATER: 6, GATE: 7 };
  let i = 0;
  const setKeys = (k) => {
    for (const n of ACT) { inp.prev[n] = inp.state[n]; inp.state[n] = !!k[n]; }
    inp.axisX = (k.right ? 1 : 0) - (k.left ? 1 : 0);
    inp.axisY = (k.down ? 1 : 0) - (k.up ? 1 : 0);
  };
  const pulse = (period, on = 2) => i % period < on;
  const bot = {
    god: true,
    stuck: 0, lastX: 0,
    decide(g) {
      const k = {};
      if (!g.player) return { confirm: pulse(14) };               // Titel
      if (g.prologue) return { menu: pulse(20) };
      if (g.overlay) return { confirm: pulse(14) };
      if (g.dialogue.active) return { confirm: pulse(10) };
      const p = g.player;
      if (this.god) { p.invuln = Math.max(p.invuln, 0.5); p.hp = p.maxHp; p.blood = Math.max(p.blood, 30); }
      if (g.cutscene || this.idle) return k;
      // Ziel: nächster Gegner in Reichweite
      const inArena = g.arenas.some((ar) => ar.active);
      let tgt = null, bd = inArena ? 2000 : 220;
      for (const e of g.enemies) {
        if (e.dead || !e.hurtable) continue;
        const d = Math.abs(e.x - p.x) + Math.abs(e.y - p.y) * 0.5;
        if (d < bd) { bd = d; tgt = e; }
      }
      if (p.drainCandidate && pulse(8)) { k.drain = true; return k; }
      if (tgt) {
        const dx = tgt.x - p.x, above = (p.y - p.h / 2) - (tgt.y - tgt.h / 2);
        const dir = dx > 0 ? 'right' : 'left';
        if (Math.abs(dx) > 26) k[dir] = true;
        else if (pulse(20, 1)) k[dir] = true;              // umdrehen, falls nötig
        if (Math.abs(dx) < 46 && pulse(9, 2)) k.attack = true;
        if (above > 26) { k.jump = pulse(40, 22); if (!p.onGround && pulse(6, 2)) k.attack = true; }
        if (Math.abs(dx) > 70 && p.abilities.lance && pulse(90, 2)) k.lance = true;
        if (tgt.def?.shield && Math.abs(dx) < 50 && p.abilities.wolf && pulse(60, 2)) k.wolfClaw = true;
      } else {
        k.right = true;
        const w = g.world, ahead = p.x + 14;
        const tAhead = w.tileAt(ahead, p.y - 10), tHead = w.tileAt(ahead, p.y - 30);
        const gapAhead = !w.groundBelow(p.x + 20, p.y, 0);
        if (tAhead === T.GRATE || tHead === T.GRATE) { if (pulse(30, 2)) k.dash = true; }
        else if (tAhead === T.BREAKABLE && p.abilities.wolf) { if (pulse(40, 2)) k.wolfClaw = true; }
        else if (tAhead === T.SOLID || gapAhead) { k.jump = pulse(50, 30); if (!p.onGround && p.abilities.bat && pulse(50, 30)) k.jump = true; }
        if (pulse(200, 2)) k.attack = true;
      }
      // Festgefahren? Springen, Dash, Doppelsprung probieren
      if (Math.abs(p.x - this.lastX) < 0.5) this.stuck++; else this.stuck = 0;
      this.lastX = p.x;
      if (this.stuck > 150) { k.jump = pulse(60, 35); if (pulse(60, 2)) k.dash = true; }
      return k;
    },
  };
  window.__bot = {
    run(steps, until = null) {
      for (let s = 0; s < steps; s++) {
        const g = a.scene;
        setKeys(bot.decide(g));
        a.scene.update(1 / 120);
        i++;
        if (until && until(a.scene)) return s;
      }
      return steps;
    },
    render() { for (let k = 0; k < 2; k++) a.scene.render(0, 1 / 60); },
    bot,
  };
};

const report = [];
for (const zone of ZONES) {
  const r = { zone, errors: [] };
  report.push(r);
  console.log(`\n=== ${zone} ===`);
  try {
    await page.goto(`http://localhost:${PORT}/index.html?zone=${zone}`);
    await page.waitForFunction(() => window.__ready === true);
    await page.evaluate(BOT);
    const res = await page.evaluate(() => {
      const out = { log: [] };
      const log = (m) => out.log.push(m);
      const B = window.__bot;
      const A = window.__app;
      const g = () => A.scene;
      const T0 = performance.now();
      try {
        // A) Erkunden
        const x0 = g().player.x;
        B.run(120 * 60);
        log(`Erkunden: ${Math.round((g().player.x - x0) / 20)} Kacheln nach rechts, ${g().kills || 0} Gegner besiegt`);
        // B) Arenen
        for (const ar of g().arenas) {
          if (ar.cleared) { log(`Arena ${ar.id}: schon geräumt`); continue; }
          g().player.teleport(ar.x + ar.w / 2, ar.floorY);
          B.run(120 * 90, (s) => ar.cleared);
          log(`Arena ${ar.id}: ${ar.cleared ? 'geräumt ✓' : 'NICHT geräumt ✗ (Welle ' + ar.wave + ', aktiv ' + ar.active + ')'}`);
          if (!ar.cleared) for (const e of ar.spawned.filter((e) => !e.dead)) log(`    übrig: ${e.kind} bei x=${Math.round(e.x)} y=${Math.round(e.y)} (Arena x ${ar.x}..${ar.x + ar.w}, Boden ${ar.floorY}) Zustand ${e.state}`);
          if (!ar.cleared) log(`    Spieler x=${Math.round(g().player.x)} y=${Math.round(g().player.y)}`);
          out.arenaFail = out.arenaFail || !ar.cleared;
        }
        B.run(120 * 2);
        // C) Boss
        const ba = g().level.bossArena;
        if (ba) {
          g().player.teleport(ba.x + 30, ba.floorY);
          B.run(120 * 240, (s) => s.save.bossesDefeated.includes(s.zone.boss) && !s.dialogue.active && !s.cutscene);
          const won = g().save.bossesDefeated.includes(g().zone.boss);
          log(`Boss ${g().zone.boss}: ${won ? 'besiegt ✓' : 'NICHT besiegt ✗ (HP ' + (g().boss && Math.round(g().boss.hp)) + ')'}`);
          out.bossFail = !won;
          // Belohnung einsammeln
          const reward = g().zone.reward;
          if (reward) {
            const pk = g().objects.find((o) => o.kind === 'ability');
            // Wie ein Spieler: auf dem Boden neben die Kugel stellen und hinlaufen.
            // Wie ein Spieler, der nicht hinsieht: stehen bleiben – die Kugel muss von selbst kommen.
            if (pk) { g().player.teleport(pk.x - 60, ba.floorY); B.bot.idle = true; for (let s = 0; s < 480 && !g().save.abilities[reward]; s++) B.run(1); B.bot.idle = false; }
            const got = g().save.abilities[reward];
            log(`Belohnung ${reward}: ${got ? 'erhalten ✓' : 'FEHLT ✗'}`);
            if (!got) log(`    Kugeln: ${JSON.stringify(g().objects.filter((o) => o.kind === 'ability').map((o) => [Math.round(o.x), Math.round(o.y)]))} Spieler ${Math.round(g().player.x)},${Math.round(g().player.y)} Zone ${g().zoneId}`);
            out.rewardFail = !got;
          }
        }
        // D) Ausgang / Ende
        const exit = g().level.entities.find((e) => e.type === 'exit');
        const throne = g().level.entities.find((e) => e.type === 'throne');
        if (exit) {
          const from = g().zoneId;
          g().player.teleport(exit.x - 30, exit.y);
          B.run(120 * 6, (s) => s.zoneId !== from && !s.cutscene);
          log(`Ausgang → ${g().zoneId}: ${g().zoneId === exit.to ? 'Zonenwechsel ✓' : 'KEIN Wechsel ✗'}`);
          out.exitFail = g().zoneId !== exit.to;
        } else if (throne) {
          const trig = g().level.triggers.find((t) => t.id === 'ending.throne');
          g().player.teleport(trig.x + 10, throne.y);
          B.run(120 * 120, (s) => !s.player);   // bis zurück zum Titel
          const back = !g().player;
          log(`Ende: ${back ? 'Abspann gesehen, zurück am Titel ✓' : 'hängt ✗ (' + (g().overlay?.constructor.name || 'kein Overlay') + ')'}`);
          out.endFail = !back;
        }
      } catch (e) {
        out.error = e.message + '\n' + e.stack.split('\n').slice(0, 6).join('\n');
      }
      out.seconds = ((performance.now() - T0) / 1000).toFixed(1);
      return out;
    });
    for (const l of res.log) console.log('  ' + l);
    if (res.error) { console.log('  ✗ FEHLER: ' + res.error); r.errors.push(res.error); }
    for (const f of ['arenaFail', 'bossFail', 'rewardFail', 'exitFail', 'endFail']) if (res[f]) r.errors.push(f);
    console.log(`  (${res.seconds} s Echtzeit)`);
    await page.evaluate(() => window.__bot.render());
    await page.screenshot({ path: `screenshots/play-${zone}.png` });
  } catch (e) {
    r.errors.push(e.message);
    console.log('  ✗ ' + e.message);
  }
}
await browser.close();
srv.kill();
const failed = report.filter((r) => r.errors.length);
if (pageErrors.length) console.log('\nSeitenfehler:\n  ' + [...new Set(pageErrors)].join('\n  '));
console.log(`\n${report.length - failed.length}/${report.length} Zonen ohne Befund`);
process.exit(failed.length || pageErrors.length ? 1 : 0);
