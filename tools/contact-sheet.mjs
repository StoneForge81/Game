// Kontaktbogen aus PNGs (nebeneinander): node tools/contact-sheet.mjs <ordner> <dateipräfix> <spalten> <ausgabe.png>
import { chromium } from 'playwright';
import fs from 'node:fs';
const [,, dir, prefix, cols, out] = process.argv;
const files = fs.readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith('.png')).sort();
const imgs = files.map((f) => 'data:image/png;base64,' + fs.readFileSync(dir + '/' + f).toString('base64'));
const b = await chromium.launch(); const p = await b.newPage();
await p.setContent(`<body style="margin:0;background:#000;display:grid;grid-template-columns:repeat(${cols},auto);gap:2px;width:max-content">${imgs.map((s) => `<img src="${s}">`).join('')}</body>`);
await p.waitForTimeout(300);
await p.locator('body').screenshot({ path: out });
await b.close(); console.log('ok', files.length);
