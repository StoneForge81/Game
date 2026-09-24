// Kampfregeln: Treffer auflösen, Schaden austeilen, Wucht erzeugen.
//
// Ein Angriff ist eine Hitbox mit Kennung. Jedes Ziel kann von einer
// Angriffs-Kennung nur einmal getroffen werden – so trifft ein Schwertstreich
// jeden Gegner genau einmal, auch wenn er mehrere Frames lang aktiv ist.

import { rectsOverlap, clamp } from '../core/math.js';
import { COMBAT } from '../data/config.js';

let attackSeq = 1;
export const newAttackId = () => attackSeq++;

/**
 * @param attack { id, x, y, w, h, damage, knockback, dir, team, heavy, breaksShield,
 *                 breaksWalls, holy, crit, source, onHit(target) }
 * @param targets Liste möglicher Ziele (Entities mit hurtable = true)
 * @returns Anzahl Treffer
 */
export function resolveAttack(game, attack, targets) {
  let hits = 0;
  for (const t of targets) {
    if (!t.hurtable || t.dead || t.team === attack.team) continue;
    if (t._hitBy && t._hitBy.has(attack.id)) continue;
    if (!rectsOverlap(attack, t.rect())) continue;
    t._hitBy = t._hitBy || new Set();
    t._hitBy.add(attack.id);
    // Speicher begrenzen – alte Kennungen vergessen.
    if (t._hitBy.size > 24) t._hitBy.delete(t._hitBy.values().next().value);
    const dealt = t.takeHit(game, attack);
    if (dealt !== false) {
      hits++;
      attack.onHit && attack.onHit(t, dealt);
    }
  }
  return hits;
}

/** Schaden mit Machtstufe und Zufallsstreuung berechnen. */
export function rollDamage(base, power = 1, critChance = 0.08, rng = Math.random) {
  const mult = 1 + (power - 1) * 0.08;
  const spread = 0.9 + rng() * 0.2;
  const crit = rng() < critChance;
  const dmg = Math.round(base * mult * spread * (crit ? 1.75 : 1));
  return { dmg: Math.max(1, dmg), crit };
}

/** Standard-Treffereffekte: Hitstop, Kamerawackeln, Funken, Blut, Sound. */
export function impactFx(game, x, y, dir, { heavy = false, crit = false, blood = true, sparks = false, holy = false } = {}) {
  const fx = game.fx;
  fx.hitstop(heavy || crit ? COMBAT.hitstopHeavy : COMBAT.hitstopLight);
  fx.shake(heavy ? 0.42 : crit ? 0.32 : 0.16);
  if (blood) game.particles.blood(x, y, dir > 0 ? -0.35 : -Math.PI + 0.35, heavy ? 22 : 12, heavy ? 300 : 220);
  if (sparks) game.particles.sparks(x, y, '#ffe6a8', heavy ? 16 : 9, 260, dir > 0 ? 0 : Math.PI);
  if (holy) game.particles.holy(x, y, 8);
  game.particles.ring(x, y, crit ? '#ffd0d8' : '#ff3a4a', 3, heavy ? 36 : 22, 0.22);
  game.audio.play(crit ? 'crit' : heavy ? 'hitHeavy' : 'hit', { x });
  if (crit) game.renderer.chroma = Math.max(game.renderer.chroma, 0.6);
  game.input.rumble(heavy ? 0.6 : 0.3, heavy ? 0.5 : 0.25, heavy ? 140 : 70);
}

/** Rückstoß anwenden, gedeckelt. */
export function knock(entity, dir, force, up = 120) {
  entity.vx = clamp(dir * force, -600, 600);
  entity.vy = Math.min(entity.vy, -up);
}
