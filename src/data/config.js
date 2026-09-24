// Zentrale Spielkonstanten. Alles in Welt-Einheiten (WE), nicht in Bildschirmpixeln.
// Die Kamera zeigt immer VIEW_W x VIEW_H Welt-Einheiten; die tatsächliche
// Pixelauflösung des Canvas ist davon entkoppelt (siehe render/renderer.js).

export const TILE = 20;          // Kantenlänge einer Kachel in WE
export const VIEW_W = 416;       // sichtbare Breite in WE  (20,8 Kacheln)
export const VIEW_H = 234;       // sichtbare Höhe in WE    (11,7 Kacheln) – exakt 16:9

/** Figuren werden etwas größer gezeichnet als ihre Trefferbox – wie in 2D-Actionspielen üblich. */
export const CHAR_SCALE = 1.12;

/** Grafikstufen: Renderhöhe in Pixeln. Pixel pro Welteinheit = Höhe / VIEW_H. */
export const QUALITY_HEIGHTS = [540, 720, 900, 1080];

export const FIXED_DT = 1 / 120; // Physik-Schrittweite (s) – stabil & präzise
export const MAX_FRAME = 0.25;   // Obergrenze pro Frame, verhindert Todesspirale

// --- Physik -----------------------------------------------------------------
export const PHYS = {
  gravity: 1750,
  maxFallSpeed: 900,
  // Kurz nach dem Verlassen einer Kante darf noch gesprungen werden ("Coyote Time").
  coyoteTime: 0.10,
  // Sprungtaste darf kurz VOR der Landung gedrückt werden und wird gepuffert.
  jumpBuffer: 0.12,
};

// --- Spielerwerte -----------------------------------------------------------
export const PLAYER = {
  w: 16, h: 30,
  runSpeed: 190,
  airControl: 0.72,
  accelGround: 2200,
  accelAir: 1500,
  frictionGround: 2600,
  frictionAir: 420,
  jumpSpeed: 520,
  // Beim Loslassen der Sprungtaste wird die Aufwärtsbewegung gekappt (variable Sprunghöhe).
  jumpCutMultiplier: 0.42,
  batJumpSpeed: 430,      // zweiter Sprung in Fledermausform
  glideFallSpeed: 110,
  dashSpeed: 520,
  dashTime: 0.17,
  dashCooldown: 0.42,
  invulnAfterHit: 0.9,
  hitKnockback: 190,

  baseHealth: 100,
  baseBlood: 60,
  // Blut regeneriert NICHT von selbst – nur durch Trinken. Das ist der Kern des Vampirs.
  bloodPerHit: 4,
  bloodPerDrain: 26,
};

// --- Kosten der Vampirkräfte -----------------------------------------------
export const COST = {
  bloodLance: 12,
  wolfClaw: 18,
  // Nebelschritt und Fledermausgestalt kosten nichts: sie sind Bewegung,
  // und Bewegung soll sich nie knapp anfühlen.
};

// --- Kampf ------------------------------------------------------------------
export const COMBAT = {
  comboWindow: 0.42,      // Zeit für den nächsten Schlag der Kette
  hitstopLight: 0.045,    // Kurzes Einfrieren bei Treffern – gibt Wucht
  hitstopHeavy: 0.11,
  parryWindow: 0.16,
};

// --- Schaden durch heiliges Licht (deine Schwäche) --------------------------
export const HOLY = {
  damagePerSecond: 26,
  // In geweihtem Licht regenerierst du nicht und Fähigkeiten kosten mehr.
  costMultiplier: 1.6,
};

export const LAYER = {
  BG_FAR: 0, BG_MID: 1, BG_NEAR: 2, WORLD: 3, FG: 4,
};

// Standard-Einstellungen. Werden beim ersten Start in localStorage geschrieben.
export const DEFAULT_SETTINGS = {
  quality: 2,            // Index in QUALITY_HEIGHTS: 0 = 540p … 3 = 1080p (volle HD-Schärfe)
  autoQuality: true,     // Qualität automatisch an die Leistung des Geräts anpassen
  masterVolume: 0.8,
  musicVolume: 0.55,
  sfxVolume: 0.9,
  screenShake: 1,
  bloom: true,
  vignette: true,
  grain: true,
  chromatic: true,
  showDamageNumbers: true,
  rumble: true,
  language: 'de',
  safeAreaInset: 0,      // Overscan-Ausgleich für ältere Fernseher (0–6 %)
  brightness: 1,         // 0.6–1.8: hebt dunkle Bereiche an (viele TVs verschlucken Schwarz)
  difficulty: 'normal',  // 'leicht' | 'normal' | 'schwer' (siehe DIFFICULTY)
  engine: 'webgl',       // 'webgl' (Grafikkarte) | 'classic' (Canvas 2D, für schwache Geräte)
};

// --- Schwierigkeitsgrade -------------------------------------------------------
// dmgTaken: Faktor auf erlittenen Schaden · bossHp: Faktor auf Boss-Leben
// bossPause: Faktor auf die Atempause zwischen Boss-Angriffen
// bossOrbs: Blutkugeln, die der Boss beim Wechsel in Phase 2 verliert (je 8 LP)
export const DIFFICULTY = {
  leicht: { label: 'Leicht', dmgTaken: 0.5,  bossHp: 0.7,  bossPause: 1.5, bossOrbs: 4 },
  normal: { label: 'Normal', dmgTaken: 0.75, bossHp: 0.85, bossPause: 1.2, bossOrbs: 3 },
  schwer: { label: 'Schwer', dmgTaken: 1,    bossHp: 1,    bossPause: 1,   bossOrbs: 0 },
};

export function difficultyOf(settings) {
  return DIFFICULTY[settings?.difficulty] || DIFFICULTY.normal;
}
