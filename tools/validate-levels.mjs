// Erreichbarkeits-Prüfer für alle Zonen.
//
// Simuliert auf Kachelebene, wohin der Spieler laufen, springen und fallen kann.
// Zwei Bewegungsmodelle:
//   strict   – vorsichtig (keine Tricks, eher zu kurze Sprünge).
//              Damit muss der Pflichtweg IMMER klappen.
//   generous – großzügig (Sprung + Luft-Dash voll ausgereizt).
//              Damit darf ein gesperrtes Geheimnis OHNE die Kraft NICHT klappen.
//
// Aufruf: node tools/validate-levels.mjs   (Exitcode 1 bei Fehlern)

import { generateZone } from '../src/game/levelgen.js';
import { ZONES, ZONE_ORDER } from '../src/data/zones.js';
import { T } from '../src/game/tiles.js';
import { TILE } from '../src/data/config.js';

const FLOOR = new Set([T.SOLID, T.PLATFORM, T.BREAKABLE, T.GRATE]);

function makeModel(level, ab, mode) {
  const { w, h, tiles } = level;
  const tile = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? T.SOLID : tiles[y * w + x]);

  // Kann der Körper eine Kachel durchqueren? `horiz` = waagerechte Bewegung (Nebel-Dash).
  const passBody = (t, horiz) => {
    if (t === T.EMPTY || t === T.WATER || t === T.PLATFORM || t === T.GATE) return true;
    if (t === T.BREAKABLE) return !!ab.wolf;
    if (t === T.GRATE) return !!ab.mist && horiz;
    return false; // SOLID, SPIKES
  };
  const bodyClear = (x, feet, horiz) => passBody(tile(x, feet - 1), horiz) && passBody(tile(x, feet - 2), horiz);

  /** Fallen ab Fußzeile `from` in Spalte x. Liefert Landezeile oder null (Dornen/Abgrund). */
  const fall = (x, from) => {
    for (let r = from; r < h - 1; r++) {
      const t = tile(x, r);
      if (t === T.SPIKES) return null;
      if (FLOOR.has(t)) return bodyClear(x, r, false) ? r : null;
      if (!passBody(t, false)) return null;
    }
    return null;
  };

  const J = ab.bat ? 6 : 3;
  // Maximale Spaltendistanz, abhängig davon, wie hoch das Ziel liegt.
  const reach = (landUp, descend) => {
    let d;
    if (ab.bat) d = landUp <= 3 ? 7 : landUp <= 5 ? 5 : 3;
    else d = landUp <= 1 ? 5 : landUp === 2 ? 4 : 3;
    if (mode === 'generous') d += 5;              // Luft-Dash voll ausgereizt
    if (ab.bat) d += Math.min(10, descend * 2);   // Gleiten beim Sinken
    return d;
  };

  function* neighbors(x, y) {
    // 1) Laufen (inkl. Hinunterfallen an Kanten)
    for (const dx of [-1, 1]) {
      const nx = x + dx;
      if (!bodyClear(nx, y, true)) continue;
      const ly = fall(nx, y);
      if (ly != null) yield [nx, ly];
    }
    // 2) Durch Einbahnplattform fallen
    if (tile(x, y) === T.PLATFORM) {
      const ly = fall(x, y + 1);
      if (ly != null) yield [x, ly];
    }
    // 3) Springen: senkrecht bis Gipfel p, waagerecht, dann fallen
    for (let rise = 0; rise <= J; rise++) {
      const p = y - rise;
      // Aufstiegsweg in Spalte x frei?
      let ok = true;
      for (let r = p - 2; r <= y - 1; r++) if (!passBody(tile(x, r), false)) { ok = false; break; }
      if (!ok) break; // höher geht es erst recht nicht
      for (const dir of [-1, 1]) {
        const maxD = reach(rise, 0) + (ab.bat ? 10 : 0);
        for (let d = 1; d <= maxD; d++) {
          const nx = x + dir * d;
          if (!bodyClear(nx, p, true)) break;
          const ly = fall(nx, p);
          if (ly == null) continue;
          // Reichweite prüfen: Ziel relativ zum Start
          const landUp = y - ly;
          const descend = Math.max(0, ly - p);
          if (d <= reach(Math.max(0, landUp), descend)) yield [nx, ly];
        }
      }
    }
  }

  function bfs(sx, sy) {
    const seen = new Uint8Array(w * h);
    const q = [[sx, sy]];
    seen[sy * w + sx] = 1;
    while (q.length) {
      const [x, y] = q.pop();
      for (const [nx, ny] of neighbors(x, y)) {
        const k = ny * w + nx;
        if (!seen[k]) { seen[k] = 1; q.push([nx, ny]); }
      }
    }
    return seen;
  }

  return { tile, fall, bfs, w, h };
}

const toTile = (wx, wy) => [Math.floor(wx / TILE), Math.round(wy / TILE)];

/** Ist ein Ziel (Weltkoordinate, Füße) erreichbar? Toleranz: ±1 Spalte. */
function reached(seen, level, wx, wy, isItem = false) {
  const [tx, ty] = toTile(wx, wy);
  // Gegenstände schweben: Spieler muss mit dem Körper hinkommen – Stehplatz
  // bis 2 Zeilen darunter zählt.
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = isItem ? 0 : 0; dy <= (isItem ? 3 : 0); dy++) {
      const x = tx + dx, y = ty + dy;
      if (x >= 0 && x < level.w && y >= 0 && y < level.h && seen[y * level.w + x]) return true;
    }
  }
  return false;
}

let errors = 0, warnings = 0;
const err = (m) => { errors++; console.log('  ✗ ' + m); };
const warn = (m) => { warnings++; console.log('  ! ' + m); };
const ok = (m) => console.log('  ✓ ' + m);

const ALL = { lance: true, mist: true, bat: true, wolf: true };

for (let zi = 0; zi < ZONE_ORDER.length; zi++) {
  const id = ZONE_ORDER[zi];
  console.log(`\n${ZONES[id].name} (${id})`);
  let level;
  try {
    level = generateZone(id);
  } catch (e) {
    err('Generierung fehlgeschlagen: ' + e.message);
    continue;
  }
  console.log(`  Größe ${level.w}×${level.h} Kacheln, ${level.entities.length} Objekte, ${level.lights.length} Lichter`);

  // Fähigkeiten, die man beim ersten Betreten dieser Zone hat.
  const have = {};
  for (let j = 0; j < zi; j++) { const r = ZONES[ZONE_ORDER[j]].reward; if (r) have[r] = true; }

  if (!level.spawn) { err('Kein Startpunkt'); continue; }
  const [sx, sy] = toTile(level.spawn.x, level.spawn.y);
  const strict = makeModel(level, have, 'strict');
  if (!FLOOR.has(strict.tile(sx, sy))) err(`Startpunkt schwebt (${sx},${sy})`);

  const seen = strict.bfs(sx, sy);

  // Pflichtziele
  const must = [];
  for (const e of level.entities) {
    if (['checkpoint', 'exit', 'throne', 'prisoner', 'lore', 'bossDoor'].includes(e.type)) must.push(e);
  }
  if (level.bossArena) must.push({ type: 'bossArena', x: level.bossArena.x + level.bossArena.w / 2, y: level.bossArena.floorY });
  let mustOk = 0;
  for (const e of must) {
    if (reached(seen, level, e.x, e.y)) mustOk++;
    else err(`Pflichtziel unerreichbar: ${e.type} ${e.id || ''} bei Kachel ${toTile(e.x, e.y)}`);
  }
  if (mustOk === must.length) ok(`alle ${must.length} Pflichtziele erreichbar mit [${Object.keys(have).join(', ') || 'keine Kräfte'}]`);

  // Gegenstände: mit allen Kräften erreichbar? Und ist das Gating echt?
  const seenAll = makeModel(level, ALL, 'strict').bfs(sx, sy);
  for (const e of level.entities.filter((x) => x.type === 'item')) {
    const allOk = reached(seenAll, level, e.x, e.y, true);
    if (!allOk) { err(`Gegenstand ${e.id} (${e.kind}) selbst mit allen Kräften unerreichbar`); continue; }
    if (!e.requires) { ok(`Gegenstand ${e.id} (${e.kind}) frei erreichbar`); continue; }
    // Alle Kräfte AUSSER der, die das Versteck öffnet – großzügiges Modell.
    const seenWithout = makeModel(level, { ...ALL, [e.requires]: false }, 'generous').bfs(sx, sy);
    const leak = reached(seenWithout, level, e.x, e.y, true);
    const when = have[e.requires] ? 'sofort' : 'bei Rückkehr';
    if (leak) err(`Geheimnis ${e.id} (${e.kind}) auch ohne ${e.requires} erreichbar – Versteck undicht`);
    else ok(`Geheimnis ${e.id} (${e.kind}) braucht ${e.requires} (${when})`);
  }

  // Pflichtsperren: ohne die Kraft darf der Ausgang NICHT erreichbar sein,
  // sonst ist die Sperre wirkungslos (nur Warnung – Spielfluss ist trotzdem ok).
  const gates = ZONES[id].beats.filter((b) => ['mistGate', 'wolfGate', 'batGap'].includes(b));
  for (const g of gates) {
    const need = { mistGate: 'mist', wolfGate: 'wolf', batGap: 'bat' }[g];
    const without = { ...have, [need]: false };
    const seenW = makeModel(level, without, 'generous').bfs(sx, sy);
    const exitE = level.entities.find((e) => e.type === 'exit' || e.type === 'throne');
    if (exitE && reached(seenW, level, exitE.x, exitE.y)) warn(`Sperre ${g} umgehbar ohne ${need}`);
    else ok(`Sperre ${g} hält ohne ${need}`);
  }
}

console.log(`\n${errors} Fehler, ${warnings} Warnungen`);
process.exit(errors ? 1 : 0);
