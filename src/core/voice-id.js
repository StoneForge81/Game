// Stabile Kennung einer Sprachzeile: kurzer Hash aus Sprecher und Text.
// Ändert sich der Text, passt die alte Aufnahme nicht mehr – dann wird die
// Zeile einfach wieder nur als Text gezeigt.
export function voiceId(who, text) {
  let h = 0x811c9dc5;
  const s = who + '|' + text;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return who + '-' + h.toString(36);
}
