// Eingabe: Gamepad (primär) + Tastatur (Ersatz).
// Liefert kantengenaue Abfragen (pressed/released) und analoge Achsen.
// Das Spiel merkt sich, welches Gerät zuletzt benutzt wurde, damit die
// Tastenanzeigen im HUD automatisch umschalten.

export const ACTIONS = [
  'left', 'right', 'up', 'down',
  'jump', 'attack', 'lance', 'dash', 'drain',
  'batForm', 'wolfClaw',
  'menu', 'map', 'confirm', 'cancel',
];

// Standard-Tastaturbelegung (mehrere Tasten pro Aktion erlaubt).
const DEFAULT_KEYS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  jump: ['Space', 'KeyK'],
  attack: ['KeyJ', 'KeyX'],
  lance: ['KeyL', 'KeyC'],
  dash: ['ShiftLeft', 'ShiftRight', 'KeyV'],
  drain: ['KeyE', 'KeyF'],
  batForm: [],
  wolfClaw: ['KeyQ', 'KeyR'],
  menu: ['Escape', 'KeyP'],
  map: ['Tab', 'KeyM'],
  confirm: ['Enter', 'Space', 'KeyJ'],
  cancel: ['Escape', 'Backspace', 'KeyX'],
};

// Standard-Gamepad-Belegung (Standard-Mapping, Xbox-Layout als Referenz).
// 0=A/Kreuz 1=B/Kreis 2=X/Viereck 3=Y/Dreieck 4=LB 5=RB 6=LT 7=RT
// 8=Back 9=Start 12=Hoch 13=Runter 14=Links 15=Rechts
const DEFAULT_PADS = {
  jump: [0],
  attack: [2],
  lance: [3],
  dash: [5, 7],
  drain: [1],
  batForm: [],
  // Wolfsklaue auf beiden linken Schultertasten – je nachdem, was dem Daumen näher liegt.
  wolfClaw: [4, 6],
  menu: [9],
  map: [8],
  confirm: [0],
  cancel: [1],
  left: [14], right: [15], up: [12], down: [13],
};

const DEADZONE = 0.28;

export class Input {
  constructor() {
    this.keys = { ...DEFAULT_KEYS };
    this.pads = { ...DEFAULT_PADS };

    this.state = Object.create(null);   // aktuell gedrückt
    this.prev = Object.create(null);    // im letzten Frame gedrückt
    for (const a of ACTIONS) { this.state[a] = false; this.prev[a] = false; }

    this.axisX = 0;
    this.axisY = 0;
    this.lastDevice = 'keyboard';       // 'keyboard' | 'gamepad'
    this.padIndex = null;
    this.padType = 'xbox';              // 'xbox' | 'playstation' | 'nintendo' | 'generic'

    this._down = new Set();             // rohe Tastencodes
    this._rumbleUntil = 0;
    this._enabled = true;

    this._onKeyDown = (e) => {
      if (!this._enabled) return;
      // Browser-Standardverhalten unterdrücken, das im Vollbild stört
      // (Leertaste scrollt, Tab springt zum nächsten Element, Pfeile scrollen).
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
      if (e.repeat) return;
      this._down.add(e.code);
      this.lastDevice = 'keyboard';
    };
    this._onKeyUp = (e) => { this._down.delete(e.code); };
    this._onBlur = () => { this._down.clear(); };

    this._onPadConnect = (e) => {
      this.padIndex = e.gamepad.index;
      this.padType = detectPadType(e.gamepad.id);
      this.lastDevice = 'gamepad';
    };
    this._onPadDisconnect = (e) => {
      if (this.padIndex === e.gamepad.index) this.padIndex = null;
    };
  }

  attach(target = window) {
    target.addEventListener('keydown', this._onKeyDown, { passive: false });
    target.addEventListener('keyup', this._onKeyUp);
    target.addEventListener('blur', this._onBlur);
    target.addEventListener('gamepadconnected', this._onPadConnect);
    target.addEventListener('gamepaddisconnected', this._onPadDisconnect);
    this._target = target;
    return this;
  }

  detach() {
    const t = this._target;
    if (!t) return;
    t.removeEventListener('keydown', this._onKeyDown);
    t.removeEventListener('keyup', this._onKeyUp);
    t.removeEventListener('blur', this._onBlur);
    t.removeEventListener('gamepadconnected', this._onPadConnect);
    t.removeEventListener('gamepaddisconnected', this._onPadDisconnect);
  }

  /** Einmal pro Frame aufrufen, VOR der Spiellogik. */
  poll() {
    for (const a of ACTIONS) this.prev[a] = this.state[a];

    const pad = this._activePad();
    let padAxisX = 0, padAxisY = 0;
    let padActive = false;

    if (pad) {
      const ax = pad.axes[0] ?? 0, ay = pad.axes[1] ?? 0;
      padAxisX = Math.abs(ax) > DEADZONE ? rescale(ax) : 0;
      padAxisY = Math.abs(ay) > DEADZONE ? rescale(ay) : 0;
      if (padAxisX || padAxisY) padActive = true;
    }

    for (const a of ACTIONS) {
      let on = false;
      for (const code of this.keys[a] || []) {
        if (this._down.has(code)) { on = true; break; }
      }
      if (pad) {
        for (const b of this.pads[a] || []) {
          const btn = pad.buttons[b];
          // Analoge Trigger zählen ab halbem Druck als gedrückt.
          if (btn && (btn.pressed || btn.value > 0.5)) { on = true; padActive = true; break; }
        }
      }
      this.state[a] = on;
    }

    // Stick-Richtung zusätzlich auf die Richtungsaktionen legen.
    if (padAxisX < -0.5) this.state.left = true;
    if (padAxisX > 0.5) this.state.right = true;
    if (padAxisY < -0.5) this.state.up = true;
    if (padAxisY > 0.5) this.state.down = true;

    if (padActive) this.lastDevice = 'gamepad';

    // Digitale Eingaben ergeben eine Achse von genau -1/0/1;
    // der Analogstick liefert feinere Werte für sanftes Gehen.
    const digitalX = (this.state.right ? 1 : 0) - (this.state.left ? 1 : 0);
    this.axisX = padAxisX !== 0 ? padAxisX : digitalX;
    const digitalY = (this.state.down ? 1 : 0) - (this.state.up ? 1 : 0);
    this.axisY = padAxisY !== 0 ? padAxisY : digitalY;
  }

  down(action) { return !!this.state[action]; }
  pressed(action) { return !!this.state[action] && !this.prev[action]; }
  released(action) { return !this.state[action] && !!this.prev[action]; }

  /** Setzt alle Kanten zurück – nach Szenenwechseln, damit nichts "durchfällt". */
  consumeAll() {
    for (const a of ACTIONS) this.prev[a] = this.state[a] = false;
    this._down.clear();
  }

  consume(action) { this.prev[action] = this.state[action] = true; }

  /** Vibration, sofern das Gamepad sie unterstützt. Fehler werden geschluckt. */
  rumble(strong = 0.5, weak = 0.3, ms = 120) {
    const pad = this._activePad();
    if (!pad) return;
    const act = pad.vibrationActuator;
    if (!act || typeof act.playEffect !== 'function') return;
    const now = performance.now();
    // Laufende, stärkere Vibration nicht durch eine schwächere ersetzen.
    if (now < this._rumbleUntil && strong < this._rumbleStrength) return;
    this._rumbleUntil = now + ms;
    this._rumbleStrength = strong;
    try {
      act.playEffect('dual-rumble', {
        startDelay: 0, duration: ms,
        strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak),
      }).catch(() => {});
    } catch { /* Browser ohne Vibrationsunterstützung */ }
  }

  _activePad() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    if (!pads) return null;
    if (this.padIndex != null && pads[this.padIndex]) return pads[this.padIndex];
    // Falls kein Verbindungsereignis kam (passiert in manchen TV-Browsern):
    // erstes verbundenes Pad übernehmen.
    for (let i = 0; i < pads.length; i++) {
      if (pads[i] && pads[i].connected) {
        this.padIndex = i;
        this.padType = detectPadType(pads[i].id);
        return pads[i];
      }
    }
    return null;
  }

  setEnabled(v) { this._enabled = v; }
}

function rescale(v) {
  // Totzone herausrechnen, damit der Stick direkt an der Grenze nicht springt.
  const s = Math.sign(v);
  return s * Math.min(1, (Math.abs(v) - DEADZONE) / (1 - DEADZONE));
}

function detectPadType(id = '') {
  const s = id.toLowerCase();
  if (/dualsense|dualshock|playstation|sony|054c/.test(s)) return 'playstation';
  if (/nintendo|switch|joy-con|057e/.test(s)) return 'nintendo';
  if (/xbox|xinput|045e/.test(s)) return 'xbox';
  return 'generic';
}

// Tastensymbole fürs HUD, je nach erkanntem Gerät.
const GLYPHS = {
  xbox:        { jump: 'A', attack: 'X', lance: 'Y', dash: 'RB', drain: 'B', wolfClaw: 'LB', menu: '☰', map: '⧉', confirm: 'A', cancel: 'B' },
  playstation: { jump: '✕', attack: '□', lance: '△', dash: 'R1', drain: '○', wolfClaw: 'L1', menu: 'Options', map: 'Share', confirm: '✕', cancel: '○' },
  nintendo:    { jump: 'B', attack: 'Y', lance: 'X', dash: 'R', drain: 'A', wolfClaw: 'L', menu: '+', map: '−', confirm: 'B', cancel: 'A' },
  generic:     { jump: '1', attack: '3', lance: '4', dash: 'R1', drain: '2', wolfClaw: 'L1', menu: 'Start', map: 'Select', confirm: '1', cancel: '2' },
  keyboard:    { jump: 'Leer', attack: 'J', lance: 'L', dash: 'Shift', drain: 'E', wolfClaw: 'Q', menu: 'Esc', map: 'Tab', confirm: 'Enter', cancel: 'Esc' },
};

export function glyph(input, action) {
  const set = input.lastDevice === 'gamepad' ? GLYPHS[input.padType] || GLYPHS.generic : GLYPHS.keyboard;
  return set[action] || action;
}
