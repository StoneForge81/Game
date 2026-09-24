// Speicherstände und Einstellungen in localStorage.
// Drei Steckplätze plus ein automatischer Stand an jedem Sarg (Checkpoint).
// Alles ist gegen fehlendes/kaputtes localStorage abgesichert – manche
// Fernseher-Browser laufen im Privatmodus und werfen beim Schreiben.

import { DEFAULT_SETTINGS } from '../data/config.js';

const PREFIX = 'blutmond.';
const SAVE_VERSION = 1;
export const SLOT_COUNT = 3;

function storage() {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    // Zugriff testen – im Privatmodus wirft schon setItem.
    const k = PREFIX + '__probe';
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch {
    return null;
  }
}

// Fällt localStorage aus, halten wir die Daten wenigstens für die Sitzung.
const memory = new Map();

function readRaw(key) {
  const s = storage();
  if (s) { try { return s.getItem(PREFIX + key); } catch { /* weiter zum Speicher */ } }
  return memory.has(key) ? memory.get(key) : null;
}

function writeRaw(key, value) {
  memory.set(key, value);
  const s = storage();
  if (!s) return false;
  try { s.setItem(PREFIX + key, value); return true; } catch { return false; }
}

function removeRaw(key) {
  memory.delete(key);
  const s = storage();
  if (!s) return;
  try { s.removeItem(PREFIX + key); } catch { /* egal */ }
}

// --- Einstellungen ----------------------------------------------------------
export function loadSettings() {
  const raw = readRaw('settings');
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(raw);
    // Früher gab es nur den Schalter „Leichter Modus“.
    if (parsed.difficulty == null && parsed.assistMode) parsed.difficulty = 'leicht';
    delete parsed.assistMode;
    // Unbekannte/fehlende Felder mit den Standardwerten auffüllen,
    // damit ein alter Stand nach einem Update nicht das Spiel zerlegt.
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  return writeRaw('settings', JSON.stringify(settings));
}

// --- Spielstände ------------------------------------------------------------
/** Frischer Spielstand: Ingomar erwacht, schwach und ohne Kräfte. */
export function newGameState() {
  return {
    version: SAVE_VERSION,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    playTime: 0,

    zone: 'krypta',
    checkpoint: 'krypta.start',

    // Fortschritt
    maxHealth: 100,
    maxBlood: 60,
    health: 100,
    blood: 20,
    power: 1,              // Machtstufe, steigt durch getrunkenes Blut
    bloodDrunk: 0,         // insgesamt getrunkenes Blut

    abilities: {
      lance: false,
      mist: false,
      bat: false,
      wolf: false,
      drain: true,         // Trinken kannst du von Anfang an – sonst verhungerst du
    },

    relics: [],            // passive Gegenstände
    heartShards: 0,        // je 4 Scherben: +1 maximale Lebenskraft-Stufe
    chalices: 0,           // je 4 Kelche: +1 maximale Blutstufe

    bossesDefeated: [],
    zonesVisited: ['krypta'],
    storyFlags: {},
    mapSeen: {},           // erkundete Bereiche pro Zone

    // Der moralische Zähler: verschonte Gefangene gegen ausgesaugte.
    mercy: 0,
    greed: 0,

    deaths: 0,
    seed: (Math.random() * 0xffffffff) >>> 0,
  };
}

export function listSlots() {
  const out = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    const raw = readRaw('slot' + i);
    if (!raw) { out.push(null); continue; }
    try {
      const s = JSON.parse(raw);
      out.push(s && s.version === SAVE_VERSION ? s : null);
    } catch {
      out.push(null);
    }
  }
  return out;
}

export function loadSlot(index) {
  const raw = readRaw('slot' + index);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    if (!s || s.version !== SAVE_VERSION) return null;
    // Gegen manipulierte oder beschädigte Stände absichern.
    return { ...newGameState(), ...s };
  } catch {
    return null;
  }
}

export function saveSlot(index, state) {
  state.updatedAt = Date.now();
  state.version = SAVE_VERSION;
  return writeRaw('slot' + index, JSON.stringify(state));
}

export function deleteSlot(index) { removeRaw('slot' + index); }

export function lastSlot() {
  const raw = readRaw('lastSlot');
  const n = raw == null ? -1 : parseInt(raw, 10);
  return Number.isInteger(n) && n >= 0 && n < SLOT_COUNT ? n : -1;
}

export function setLastSlot(index) { writeRaw('lastSlot', String(index)); }

/** true, wenn Speichern dauerhaft möglich ist (sonst nur für diese Sitzung). */
export function storageAvailable() { return storage() != null; }

export function formatPlayTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
