// Die sechs Gebiete von Schloss Nachtfels – von der Gruft ganz unten bis zur
// Kathedrale, die der Orden über deinem alten Thronsaal errichtet hat.
// Du steigst auf und holst dir dein Schloss Stockwerk für Stockwerk zurück.
//
// `beats` beschreibt den Ablauf eines Gebiets. Der Levelgenerator
// (game/levelgen.js) baut daraus die eigentliche Geometrie – deterministisch,
// also bei jedem Start gleich.

export const ZONE_ORDER = ['krypta', 'katakomben', 'hof', 'bibliothek', 'uhrturm', 'kathedrale'];

export const ZONES = {
  krypta: {
    name: 'Die Gruft',
    subtitle: 'Wo der Fürst dreihundert Jahre schlief',
    seed: 1101,
    music: 'krypta',
    ambience: 'crypt',
    // Umgebungslicht (RGB) – so dunkel ist es ohne Lichtquelle.
    ambient: [58, 80, 84],
    grade: { tint: 'rgba(30,70,70,0.22)', mode: 'soft-light' },
    fog: '#1c3432',
    sky: null,
    bg: 'crypt',
    tiles: {
      base: '#434c51', dark: '#21272a', light: '#64736f', mortar: '#151a1b',
      top: '#51754b', topLight: '#72a65f', // Moos
      platform: '#544334', platformTop: '#755b41',
    },
    lightColor: 'rgb(120,220,170)',     // Geisterlicht
    torchColor: 'rgb(255,150,70)',
    enemies: [['novice', 3], ['skeleton', 4], ['acolyte', 1]],
    boss: 'ambrosius',
    reward: 'lance',
    height: 46,
    beats: [
      'awaken', 'corridor', 'tutorialJump', 'corridor', 'lore', 'pit', 'checkpoint',
      'stairsUp', 'corridor', 'prisoner', 'holyIntro', 'corridor', 'tower', 'arena',
      'secretBreakable', 'checkpoint', 'bossGate', 'boss', 'exit',
    ],
  },

  katakomben: {
    name: 'Die Reliquienkammern',
    subtitle: 'Hier stapeln sie die Knochen deiner Diener',
    seed: 2202,
    music: 'katakomben',
    ambience: 'water',
    ambient: [52, 66, 104],
    grade: { tint: 'rgba(30,60,120,0.24)', mode: 'soft-light' },
    fog: '#14223a',
    bg: 'catacomb',
    tiles: {
      base: '#3b4357', dark: '#1b202c', light: '#5d6886', mortar: '#10131d',
      top: '#445875', topLight: '#6c85ac',
      platform: '#433d37', platformTop: '#645b51',
    },
    lightColor: 'rgb(110,160,255)',
    torchColor: 'rgb(255,160,80)',
    enemies: [['skeleton', 3], ['acolyte', 3], ['crossbow', 2], ['novice', 1]],
    boss: 'mirella',
    reward: 'mist',
    height: 50,
    beats: [
      'arrive', 'corridor', 'water', 'corridor', 'checkpoint', 'pit', 'lore',
      'stairsDown', 'water', 'prisoner', 'holyCorridor', 'tower', 'arena', 'checkpoint',
      'secretBat', 'corridor', 'bossGate', 'boss', 'exit',
    ],
  },

  hof: {
    name: 'Die Zwinger',
    subtitle: 'Hoch über den Dächern von Ingopolis',
    seed: 3303,
    music: 'hof',
    ambience: 'storm',
    ambient: [104, 58, 78],
    grade: { tint: 'rgba(120,20,40,0.2)', mode: 'soft-light' },
    fog: '#2a1424',
    // Draußen: Himmel mit Blutmond.
    sky: { top: '#0b0612', bottom: '#3a0f1c', moon: '#ff4a3a', moonGlow: 'rgba(255,60,50,0.35)' },
    bg: 'courtyard',
    rain: true,
    tiles: {
      base: '#4a3e4a', dark: '#221b24', light: '#756473', mortar: '#130e13',
      top: '#4f4b3a', topLight: '#807856',
      platform: '#543d31', platformTop: '#7a5841',
    },
    lightColor: 'rgb(255,90,80)',
    torchColor: 'rgb(255,170,90)',
    enemies: [['hound', 4], ['crossbow', 2], ['knight', 2], ['novice', 1]],
    boss: 'isolde',
    reward: 'bat',
    height: 48,
    beats: [
      'arrive', 'corridor', 'rooftops', 'checkpoint', 'corridor', 'pit', 'lore',
      'holyCorridor', 'prisoner', 'rooftops', 'arena', 'checkpoint', 'secretMist',
      'stairsUp', 'corridor', 'bossGate', 'boss', 'exit',
    ],
  },

  bibliothek: {
    name: 'Die Bibliothek',
    subtitle: 'Sie haben deine Bücher gelesen. Alle.',
    seed: 4404,
    music: 'bibliothek',
    ambience: 'library',
    ambient: [100, 70, 50],
    grade: { tint: 'rgba(140,80,20,0.18)', mode: 'soft-light' },
    fog: '#2a1a10',
    bg: 'library',
    tiles: {
      base: '#5a4132', dark: '#2a1c15', light: '#8f6746', mortar: '#1d130d',
      top: '#754b2f', topLight: '#a67343',
      platform: '#6b462e', platformTop: '#9f6b3e',
    },
    lightColor: 'rgb(255,190,110)',
    torchColor: 'rgb(255,180,90)',
    enemies: [['acolyte', 2], ['tome', 4], ['crossbow', 2], ['knight', 1]],
    boss: 'malachias',
    reward: 'wolf',
    height: 58,
    beats: [
      'arrive', 'corridor', 'tower', 'lore', 'archivists', 'checkpoint', 'batGap', 'corridor',
      'prisoner', 'holyCorridor', 'tower', 'mistGate', 'arena', 'checkpoint',
      'lore', 'corridor', 'bossGate', 'boss', 'exit',
    ],
  },

  uhrturm: {
    name: 'Das Sonnenwerk',
    subtitle: 'Eine Maschine, die den Tag erzwingt',
    seed: 5505,
    music: 'uhrturm',
    ambience: 'clockwork',
    ambient: [104, 76, 44],
    grade: { tint: 'rgba(150,100,30,0.2)', mode: 'soft-light' },
    fog: '#2a200e',
    bg: 'clock',
    tiles: {
      base: '#5a4e3b', dark: '#272015', light: '#ba9756', mortar: '#18130b',
      top: '#b38a37', topLight: '#faca60',
      platform: '#826b3d', platformTop: '#e5b353',
    },
    lightColor: 'rgb(255,200,120)',
    torchColor: 'rgb(255,190,110)',
    enemies: [['knight', 3], ['crossbow', 2], ['automaton', 4], ['acolyte', 1]],
    boss: 'cogliostro',
    reward: 'moonskin',
    height: 64,
    beats: [
      'arrive', 'tower', 'corridor', 'checkpoint', 'batGap', 'holyCorridor',
      'wolfGate', 'lore', 'prisoner', 'tower', 'arena', 'checkpoint',
      'holyCorridor', 'tower', 'bossGate', 'boss', 'exit',
    ],
  },

  kathedrale: {
    name: 'Die Kathedrale des Silbernen Morgens',
    subtitle: 'Gebaut auf deinem Thron',
    seed: 6606,
    music: 'kathedrale',
    ambience: 'cathedral',
    // Die Kathedrale ist hell – der gefährlichste Ort für einen Vampir.
    ambient: [150, 144, 176],
    grade: { tint: 'rgba(200,190,255,0.14)', mode: 'soft-light' },
    fog: '#3a3850',
    bg: 'cathedral',
    tiles: {
      base: '#d6d0ec', dark: '#6f6984', light: '#ffffff', mortar: '#434056',
      top: '#ffe592', topLight: '#ffffb9', // Blattgold
      platform: '#9a8ba2', platformTop: '#e5d0ef',
    },
    lightColor: 'rgb(255,240,200)',
    torchColor: 'rgb(255,220,160)',
    enemies: [['knight', 3], ['acolyte', 3], ['crossbow', 2], ['inquisitor', 2]],
    boss: 'serafine',
    reward: null,
    height: 56,
    beats: [
      'arrive', 'holyCorridor', 'corridor', 'checkpoint', 'lore', 'tower',
      'prisoner', 'holyCorridor', 'arena', 'checkpoint', 'corridor',
      'holyCorridor', 'bossGate', 'boss', 'throne',
    ],
  },
};

/** Welche Fähigkeit öffnet welche Sperre? */
export const GATE_ABILITY = {
  mistGate: 'mist',
  batGap: 'bat',
  wolfGate: 'wolf',
  secretMist: 'mist',
  secretBat: 'bat',
  secretBreakable: 'wolf',
};

export const ABILITY_INFO = {
  lance: {
    name: 'Blutlanze',
    desc: 'Schleudere geronnenes Blut als Speer. Durchbohrt mehrere Gegner.',
    action: 'lance',
  },
  mist: {
    name: 'Nebelschritt',
    desc: 'Löse dich beim Ausweichen in Nebel auf: unverwundbar und durch Gitter hindurch.',
    action: 'dash',
  },
  bat: {
    name: 'Fledermausgestalt',
    desc: 'Springe in der Luft ein zweites Mal. Halte Springen gedrückt, um zu gleiten.',
    action: 'jump',
  },
  wolf: {
    name: 'Wolfsklaue',
    desc: 'Ein verheerender Hieb, der Schilde bricht und morsche Mauern einreißt.',
    action: 'wolfClaw',
  },
  moonskin: {
    name: 'Mondhaut',
    desc: 'Geweihtes Licht verbrennt dich nur noch zur Hälfte.',
    action: null,
  },
  drain: {
    name: 'Blutdurst',
    desc: 'Packe einen geschwächten Feind und trinke. Heilt dich und füllt dein Blut.',
    action: 'drain',
  },
};
