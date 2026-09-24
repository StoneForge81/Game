// Listet alle vertonbaren Textzeilen der Geschichte mit stabiler ID (Hash aus
// Sprecher + Text). Die Sprachdateien liegen unter assets/audio/voice/<id>.mp3.
// Aufruf: node tools/voice-lines.mjs [--json]
import { PROLOGUE, SCENES, ENDINGS, CHECKPOINT_LINES } from '../src/data/story.js';
import { voiceId } from '../src/core/voice-id.js';

// Aussprache für die Sprachaufnahmen. Der Text im Spiel bleibt, wie er ist –
// nur das, was die Sprecher vorlesen, wird angepasst.
export const PRONUNCIATION = [
  [/Yvonne/g, 'Yvonn'],   // „Yvonne“ wird „Yvonn“ gesprochen, ohne -e am Ende
];
export const spoken = (text) => PRONUNCIATION.reduce((t, [re, to]) => t.replace(re, to), text);

const out = [];
const add = (who, text, where) => {
  if (!text || /\{[a-zA-Z]+\}/.test(text)) return;   // Tastensymbole kann man nicht vorlesen
  if (!/\p{L}/u.test(text)) return;                    // „…“ – Schweigen muss man nicht aufnehmen
  out.push({ id: voiceId(who, text), who, text, spoken: spoken(text), where });
};
PROLOGUE.forEach((t, i) => add('narrator', t, `prolog ${i}`));
for (const [k, sc] of Object.entries(SCENES)) sc.forEach((l, i) => add(l.who, l.text, `${k} ${i}`));
for (const [k, e] of Object.entries(ENDINGS)) (e.lines || []).forEach((t, i) => add('narrator', t, `ende ${k} ${i}`));
CHECKPOINT_LINES.forEach((l, i) => add(l.who, l.text, `sarg ${i}`));

if (import.meta.url !== `file://${process.argv[1]}`) { /* nur importiert */ }
else if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 1));
else {
  const per = {};
  for (const l of out) per[l.who] = (per[l.who] || 0) + 1;
  console.log(out.length, 'Zeilen', out.reduce((a, l) => a + l.text.length, 0), 'Zeichen', per);
}
