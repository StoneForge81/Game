// Ausrüstung, Tränke und Zauber: alles, was man finden, kaufen und anlegen kann.
//
// Werte sind Faktoren auf die Grundwerte des Fürsten:
//   dmg   – Schaden der Klinge          reach – Reichweite der Klinge
//   speed – Dauer eines Hiebs (kleiner = schneller)
//   crit  – Chance auf kritischen Treffer
//   def   – Anteil des Schadens, den die Rüstung schluckt (0,2 = 20 % weniger)
// `tier`: ab wie vielen besiegten Bossen der Händler es anbietet.

// === Waffen ===================================================================
// style bestimmt die Form (siehe render/puppet.js › drawLordBlade).

export const WEAPONS = {
  blutklinge: {
    name: 'Blutklinge', tier: -1, price: 0,
    desc: 'Die Klinge des Hauses Nachtfels. Ausgewogen und treu.',
    dmg: 1, reach: 1, speed: 1, crit: 0.08,
    style: 'sword', len: 15, width: 1.3, blade: '#e4e8f4', bladeShade: '#8a90a8', edge: '#ff2a40', guard: '#e2bd62', gem: '#ff1f35', glow: '#ff2a40',
  },
  knochendolch: {
    name: 'Knochendolch', tier: 0, price: 120,
    desc: 'Kurz und blitzschnell. Trifft öfter kritisch.',
    dmg: 0.8, reach: 0.82, speed: 0.72, crit: 0.18,
    style: 'dagger', len: 10, width: 1.2, blade: '#efe6cc', bladeShade: '#a89c7c', edge: '#ffd0a0', guard: '#8a7a5a', gem: '#ffcc60', glow: '#ffb070',
  },
  saebel: {
    name: 'Säbel des Grafen', tier: 1, price: 320,
    desc: 'Geschwungen und elegant. Mehr Schaden, etwas schneller.',
    dmg: 1.18, reach: 1.06, speed: 0.92, crit: 0.1,
    style: 'saber', len: 16.5, width: 1.25, blade: '#eef0fa', bladeShade: '#8e94ac', edge: '#ff5070', guard: '#f0cc70', gem: '#b01330', glow: '#ff3a60',
  },
  mondsichel: {
    name: 'Mondsichel', tier: 2, price: 620,
    desc: 'Aus Mondsilber geschmiedet – für Vampire ungefährlich, für Jäger nicht.',
    dmg: 1.3, reach: 1.14, speed: 0.95, crit: 0.22,
    style: 'scimitar', len: 17, width: 1.8, blade: '#dce6ff', bladeShade: '#7a88b8', edge: '#a8c8ff', guard: '#c8d0e8', gem: '#6a9aff', glow: '#7aa8ff',
  },
  richtschwert: {
    name: 'Richtschwert', tier: 3, price: 950,
    desc: 'Schwer und langsam – jeder Hieb ist ein Urteil. Bricht Schilde.',
    dmg: 1.75, reach: 1.32, speed: 1.3, crit: 0.06, heavy: true,
    style: 'greatsword', len: 23, width: 2.1, blade: '#d0d4e0', bladeShade: '#6a6e84', edge: '#ff2030', guard: '#3a3040', gem: '#ff1f35', glow: '#ff2030',
  },
  blutsense: {
    name: 'Blutsense', tier: 4, price: 1400,
    desc: 'Weiter Bogen. Jeder Treffer heilt dich ein wenig.',
    dmg: 1.45, reach: 1.42, speed: 1.08, crit: 0.1, lifesteal: 0.12,
    style: 'scythe', len: 22, width: 1.2, blade: '#e8dce4', bladeShade: '#8a6a7a', edge: '#ff1030', guard: '#2a1a24', gem: '#ff1f35', glow: '#ff1040',
  },
};

// === Rüstungen ================================================================
// palette überschreibt Farben des Kostüms; plates = Schulterstücke aus Metall.

export const ARMORS = {
  fuerstenmantel: {
    name: 'Fürstenmantel', tier: -1, price: 0,
    desc: 'Samt und Goldborte. Schützt nur deine Würde.',
    def: 0, palette: {},
  },
  lederwams: {
    name: 'Jägerleder', tier: 0, price: 150,
    desc: 'Einem Armbrustschützen abgenommen. Zäh und leicht.',
    def: 0.12,
    palette: { coat: '#4a3024', coatShade: '#281810', coatL: '#7a5840', trim: '#b89060', trimShade: '#6a4a28', pants: '#2a1e18', pantsShade: '#160e0a' },
  },
  kettenhemd: {
    name: 'Kettenhemd der Nacht', tier: 1, price: 420,
    desc: 'Geschwärzte Ringe, die nicht klirren.',
    def: 0.2, plates: true,
    palette: { plate: '#7e8298', plateShade: '#3a3e50', plateL: '#dfe3f0', coat: '#3a3a4a', coatShade: '#1c1c28', coatL: '#8a8aa8', trim: '#a8aec4', trimShade: '#5a6078' },
  },
  mondseide: {
    name: 'Mondseidenrobe', tier: 2, price: 560,
    desc: 'Leicht wie Nebel. Zauber sind stärker und kosten weniger Blut.',
    def: 0.1, spellPower: 1.3, spellCost: 0.75,
    palette: { coat: '#2a3460', coatShade: '#141a36', coatL: '#6a80c8', trim: '#dce4ff', trimShade: '#8a94c0', lining: '#4a6ad0', liningShade: '#24367a' },
  },
  blutpanzer: {
    name: 'Blutpanzer', tier: 3, price: 900,
    desc: 'Rote Platten über dem Herzen. +25 Lebenskraft.',
    def: 0.26, hp: 25, plates: true,
    palette: { plate: '#a01830', plateShade: '#4e0610', plateL: '#ff7088', coat: '#6a0a1c', coatShade: '#36040c', coatL: '#c02a44', trim: '#e8c060', trimShade: '#9a7422', pants: '#2a0a10', pantsShade: '#16040a' },
  },
  obsidian: {
    name: 'Obsidianrüstung', tier: 4, price: 1500,
    desc: 'Aus vulkanischem Glas. Die stärkste Rüstung Ingonesiens.',
    def: 0.36, plates: true,
    palette: { plate: '#2a2430', plateShade: '#0c0a10', plateL: '#8a70b0', coat: '#16121c', coatShade: '#08060c', coatL: '#5a4a78', trim: '#b01330', trimShade: '#6c0719', lining: '#2a0a3a', liningShade: '#14041c' },
  },
};

// === Ringe ====================================================================

export const RINGS = {
  ring_gier: {
    name: 'Ring der Gier', tier: 0, price: 180,
    desc: 'Besiegte Gegner lassen mehr Gold fallen (+50 %).',
    gold: 1.5, color: '#e8c050',
  },
  ring_durst: {
    name: 'Ring des Durstes', tier: 1, price: 300,
    desc: 'Jeder Schwerttreffer bringt doppelt so viel Blut.',
    bloodPerHit: 2, color: '#ff3050',
  },
  ring_eile: {
    name: 'Ring der Eile', tier: 2, price: 450,
    desc: 'Ausweichen ist schneller wieder bereit.',
    dashCd: 0.6, color: '#8ad0ff',
  },
  ring_leben: {
    name: 'Ring des Lebens', tier: 3, price: 700,
    desc: '+30 Lebenskraft.',
    hp: 30, color: '#ff8aa0',
  },
};

// === Verbrauchsgüter ==========================================================

export const CONSUMABLES = {
  heiltrank: {
    name: 'Heiltrank', tier: -1, price: 40, max: 9,
    desc: 'Stellt 40 Lebenskraft wieder her.',
    heal: 40, color: '#e8304a',
  },
  blutphiole: {
    name: 'Blutphiole', tier: -1, price: 45, max: 9,
    desc: 'Gibt dir 30 Blut für deine Zauber.',
    blood: 30, color: '#9a1040',
  },
  grosserHeiltrank: {
    name: 'Großer Heiltrank', tier: 1, price: 110, max: 5,
    desc: 'Stellt 100 Lebenskraft wieder her.',
    heal: 100, color: '#ff5070',
  },
  zorntrank: {
    name: 'Zornestrank', tier: 1, price: 120, max: 5,
    desc: '20 Sekunden lang: 50 % mehr Schaden.',
    buff: { kind: 'rage', t: 20 }, color: '#ff8a30',
  },
  steinhaut: {
    name: 'Steinhaut-Tinktur', tier: 2, price: 120, max: 5,
    desc: '20 Sekunden lang: 40 % weniger Schaden.',
    buff: { kind: 'stone', t: 20 }, color: '#a0a8c0',
  },
  elixier: {
    name: 'Elixier der Nacht', tier: 3, price: 320, max: 3,
    desc: 'Volle Lebenskraft und volles Blut.',
    heal: 9999, blood: 9999, color: '#c060ff',
  },
};

// === Zauber ===================================================================
// Zauber kosten Blut. Die Blutlanze erwacht nach dem ersten Boss,
// die anderen gibt es als Zauberbuch beim Händler.

export const SPELLS = {
  lance: {
    name: 'Blutlanze', tier: -1, price: 0, cost: 12, ability: 'lance',
    desc: 'Ein Speer aus geronnenem Blut durchbohrt bis zu drei Gegner und Schilde.',
    color: '#ff2a40',
  },
  fledermaeuse: {
    name: 'Fledermausschwarm', tier: 0, price: 280, cost: 16,
    desc: 'Vier Fledermäuse suchen sich selbst ihr Ziel.',
    color: '#b060ff',
  },
  hoellenfeuer: {
    name: 'Höllenfeuer', tier: 1, price: 480, cost: 18,
    desc: 'Drei Feuerbälle im Fächer – die Lieblingsgabe deines Großvaters.',
    color: '#ff8a20',
  },
  blutschild: {
    name: 'Blutschild', tier: 2, price: 450, cost: 22,
    desc: 'Eine Kugel aus Blut fängt die nächsten drei Treffer ab (15 Sekunden).',
    color: '#ff4060',
  },
  blutregen: {
    name: 'Blutregen', tier: 3, price: 900, cost: 36,
    desc: 'Blut regnet auf alle Gegner in der Nähe und heilt dich ein wenig.',
    color: '#d01030',
  },
};

export const CATEGORY = {
  weapon: { list: WEAPONS, label: 'Waffen', slot: 'weapon' },
  armor: { list: ARMORS, label: 'Rüstungen', slot: 'armor' },
  ring: { list: RINGS, label: 'Ringe', slot: 'ring' },
  item: { list: CONSUMABLES, label: 'Tränke' },
  spell: { list: SPELLS, label: 'Zauber' },
};

/** Ausrüstungswerte aus dem Spielstand zusammenrechnen. */
export function gearStats(save) {
  const eq = save.equip || {};
  const w = WEAPONS[eq.weapon] || WEAPONS.blutklinge;
  const a = ARMORS[eq.armor] || ARMORS.fuerstenmantel;
  const r = RINGS[eq.ring] || null;
  return {
    weapon: w, armor: a, ring: r,
    dmg: w.dmg, reach: w.reach, speed: w.speed, crit: w.crit, heavy: !!w.heavy, lifesteal: w.lifesteal || 0,
    def: a.def || 0,
    hp: (a.hp || 0) + (r?.hp || 0),
    spellPower: a.spellPower || 1,
    spellCost: a.spellCost || 1,
    gold: r?.gold || 1,
    bloodPerHit: r?.bloodPerHit || 1,
    dashCd: r?.dashCd || 1,
  };
}

/** Welche Zauber kennt der Fürst? (Reihenfolge = Wechselreihenfolge) */
export function knownSpells(save) {
  const out = [];
  for (const [id, s] of Object.entries(SPELLS)) {
    if (s.ability ? save.abilities?.[s.ability] : save.spells?.includes(id)) out.push(id);
  }
  return out;
}

/** Besitzt der Spieler das Ding schon (Ausrüstung/Zauber)? */
export function owns(save, cat, id) {
  if (cat === 'spell') return knownSpells(save).includes(id);
  if (cat === 'item') return (save.inventory?.[id] || 0) > 0;
  return (save.owned?.[cat] || []).includes(id);
}
