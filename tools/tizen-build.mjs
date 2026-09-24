// Baut die Samsung-Fernseher-App (Tizen) nach dist/tizen/Blutmond
// und packt sie als dist/Blutmond-TV.zip.
//
// Warum ein eigener Bau? Am Fernseher liegt das Spiel als Datei vor (file://).
// Dort laufen keine ES-Module – darum wird der ganze Code mit esbuild zu
// einer einzigen Datei (game.js) gebündelt und für ältere Fernseher übersetzt.
//
// Aufruf: node tools/tizen-build.mjs      (oder: npm run tv)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const out = path.join(dist, 'tizen', 'Blutmond');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

fs.rmSync(path.join(dist, 'tizen'), { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// 1. Code bündeln (klassisches Skript statt Modul)
await build({
  entryPoints: [path.join(root, 'src/main.js')],
  outfile: path.join(out, 'game.js'),
  bundle: true,
  format: 'iife',
  target: ['chrome63'],   // Samsung-Fernseher ab 2019 (Tizen 5.0)
  minify: true,
  keepNames: true,       // lesbare Fehlermeldungen am Fernseher
  legalComments: 'none',
  logLevel: 'warning',
});

// 2. Startseite: Modul-Skript durch das gebündelte Skript ersetzen
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
if (!html.includes('<script type="module" src="src/main.js"></script>')) throw new Error('index.html: Skript-Zeile nicht gefunden');
html = html.replace('<script type="module" src="src/main.js"></script>', '<script src="game.js"></script>');
fs.writeFileSync(path.join(out, 'index.html'), html);

// 3. Klänge, Schriften, Symbol, App-Beschreibung (Versionsnummer aus package.json)
fs.cpSync(path.join(root, 'assets'), path.join(out, 'assets'), { recursive: true });
fs.copyFileSync(path.join(root, 'tizen/icon.png'), path.join(out, 'icon.png'));
const config = fs.readFileSync(path.join(root, 'tizen/config.xml'), 'utf8')
  .replace(/(<widget[^>]*\sversion=")[^"]*"/, `$1${pkg.version}"`);
fs.writeFileSync(path.join(out, 'config.xml'), config);

// 4. Projektdateien, damit Tizen Studio den Ordner direkt importieren kann
fs.copyFileSync(path.join(root, 'tizen/project.xml'), path.join(out, '.project'));
fs.copyFileSync(path.join(root, 'tizen/tproject.xml'), path.join(out, '.tproject'));

// 5. Zip zum Herunterladen
const zip = path.join(dist, 'Blutmond-TV.zip');
fs.rmSync(zip, { force: true });
execFileSync('zip', ['-qr', zip, 'Blutmond'], { cwd: path.join(dist, 'tizen') });

const size = (p) => (fs.statSync(p).size / 1e6).toFixed(1) + ' MB';
console.log(`Fertig: ${path.relative(root, out)} (game.js ${size(path.join(out, 'game.js'))})`);
console.log(`        ${path.relative(root, zip)} (${size(zip)})`);
