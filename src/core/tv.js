// Samsung-Fernseher (Tizen): Fernbedienung und App beenden.
//
// Läuft das Spiel als Tizen-App, gibt es das Objekt `tizen`. Dann
//  - melden wir die Farb- und Wiedergabetasten der Fernbedienung an
//    (sonst schluckt sie der Fernseher),
//  - kann das Titelmenü die App beenden.
// Im normalen Browser passiert hier nichts.

export const IS_TV = typeof window !== 'undefined' && typeof window.tizen === 'object' && !!window.tizen;

// Tasten, die der Fernseher nur nach Anmeldung an die App weitergibt.
const TV_KEYS = ['ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue', 'MediaPlayPause', 'MediaPlay', 'MediaPause'];

// Fernbedienung → Tastencode wie auf der Tastatur (e.code fehlt dort oft).
export const TV_KEYCODES = {
  37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown', 13: 'Enter',
  10009: 'TVBack',
  403: 'TVRed', 404: 'TVGreen', 405: 'TVYellow', 406: 'TVBlue',
  10252: 'TVPlayPause', 415: 'TVPlay', 19: 'TVPause',
};

export function tvSetup() {
  if (!IS_TV) return;
  try {
    const dev = window.tizen.tvinputdevice;
    for (const k of TV_KEYS) { try { dev.registerKey(k); } catch { /* Taste gibt es nicht */ } }
  } catch { /* ältere Geräte */ }
}

/** App schließen (nur am Fernseher). */
export function tvExit() {
  try { window.tizen.application.getCurrentApplication().exit(); } catch { /* kein Tizen */ }
}
