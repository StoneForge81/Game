// Kacheltypen. Als Zahlen, damit die Karte in ein Uint8Array passt.
export const T = {
  EMPTY: 0,
  SOLID: 1,
  PLATFORM: 2,   // Einbahn: von unten durchspringbar, von oben begehbar
  SPIKES: 3,     // Silberdornen – verletzen und werfen zurück
  BREAKABLE: 4,  // Morsches Mauerwerk – nur die Wolfsklaue reißt es ein
  GRATE: 5,      // Eisengitter – nur als Nebel passierbar
  WATER: 6,      // Nicht fest, bremst dich
  GATE: 7,       // Arenatore – fest, solange der Kampf läuft
};

/** Blockiert diese Kachel Bewegung? (Einbahnplattformen gesondert behandelt.) */
export const isSolid = (t) => t === T.SOLID || t === T.BREAKABLE || t === T.GRATE || t === T.GATE;

/** Wirft diese Kachel Schatten? Gitter lassen Licht durch. */
export const isOccluder = (t) => t === T.SOLID || t === T.BREAKABLE || t === T.GATE;
