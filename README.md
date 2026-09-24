# 🦇 BLUTMOND – Der Fürst von Ingonesien

Ein gotisches 2.5D-Actionspiel im Stil von *Castlevania* – nur dass du diesmal **nicht** der Held bist.

Du bist **Fürst Ingomar von Nachtfels**, der gefürchtete Vampirfürst von Ingonesien. Vor dreihundert Jahren hat dich der Orden vom Silbernen Morgen in deiner Gruft versiegelt und deine Gemahlin **Yvonne** in einen Kristall aus geweihtem Licht gesperrt. Heute Nacht steigt der Blutmond auf. Dein Sohn **Henry** weckt dich – und du holst dir dein Schloss zurück, Stockwerk für Stockwerk, von der Gruft bis zur Kathedrale, die der Orden auf deinen Thron gebaut hat.

Gemacht zum Spielen **am Fernseher mit Gamepad**.

---

## Auf den Fernseher bringen

Das Spiel läuft im Browser, ohne Installation. Drei Wege, vom einfachsten zum bequemsten:

### A) Mac oder PC per HDMI am Fernseher (empfohlen)

1. Im Projektordner im Terminal: `npm start` (braucht [Node.js](https://nodejs.org))
   – oder ganz ohne Installation auf dem Mac: `python3 -m http.server 8080`
2. Im Browser **http://localhost:8080** öffnen, **F** für Vollbild drücken.
3. Gamepad (Xbox, PlayStation, Switch Pro) per USB oder Bluetooth verbinden – fertig.

Ein Mac mit Apple-Chip oder ein Rechner mit Grafikkarte schafft flüssige 60 Bilder pro Sekunde in voller HD-Schärfe.

### B) Direkt im Browser des Smart-TVs

`npm start` auf einem Rechner im Heimnetz starten. Der Server zeigt eine Adresse wie **http://192.168.178.23:8080** an – die im Browser des Fernsehers eintippen. Die **automatische Bildqualität** passt die Schärfe an die (meist schwächere) Leistung des Fernsehers an.

### C) Dauerhaft online über GitHub Pages

Nach dem Zusammenführen in `main`: im Repository unter **Settings → Pages** als Quelle *Deploy from a branch*, Branch `main`, Ordner `/ (root)` wählen. Danach ist das Spiel unter `https://stoneforge81.github.io/Game/` erreichbar – auf jedem Gerät, auch direkt auf dem Fernseher, ohne Rechner.

> **Wichtig:** Die Datei `index.html` nicht per Doppelklick öffnen – Browser laden Spiele-Module nicht von der Festplatte. Immer über einen der drei Wege oben.

> **Ton:** Browser erlauben Ton erst nach einem Klick oder Tastendruck. Am Titelbildschirm deshalb einmal **Enter** drücken oder klicken (manche Browser akzeptieren auch die A-Taste).

---

## Steuerung

| Aktion | Xbox | PlayStation | Tastatur |
|---|---|---|---|
| Laufen | linker Stick / Steuerkreuz | linker Stick / Steuerkreuz | Pfeile oder WASD |
| Springen (halten = höher) | **A** | **✕** | Leertaste |
| Klinge (3er-Kombo, mit hoch: Hieb nach oben) | **X** | **□** | J |
| Zauber (Blutlanze und gekaufte Zauber) | **Y** | **△** | L |
| Zauber wechseln | rechten Stick kippen/drücken | rechten Stick kippen/drücken | T |
| Ausweichen / Nebelschritt | **RB / RT** | **R1 / R2** | Shift |
| Wolfsklaue | **LB / LT** | **L1 / L2** | Q |
| Trinken / Handeln | **B** | **○** | E |
| Trank (Schnelltaste) | Steuerkreuz hoch | Steuerkreuz hoch | H |
| Inventar | linken Stick drücken (oder Pause) | L3 (oder Pause) | I |
| Karte | Ansicht | Share | Tab |
| Pause | Menü | Options | Esc |

Durch Plattformen fallen: **unten + Springen**. Die Tastensymbole im Spiel passen sich automatisch an dein Gerät an.

## Spielprinzip

- **Blut ist deine Kraft.** Es füllt sich nicht von selbst. Prügle einen Jäger unter 35 % – dann geht er in die Knie und du kannst **trinken**: Das heilt dich und gibt Blut für Lanze und Klaue.
- **Geweihtes Licht brennt.** Lichtschächte flackern – warte auf den richtigen Moment. Im Nebel bist du unverwundbar.
- **Mortimer, der Händler,** steht mit seinem Karren in jedem Gebiet gleich hinter dem ersten Sarg. Die Jäger lassen **Gold** fallen – dafür gibt es **Heiltränke** und andere Tränke, **Waffen** (Dolch, Säbel, Mondsichel, Richtschwert, Blutsense), **Rüstungen**, **Ringe** und **Zauberbücher** (Fledermausschwarm, Höllenfeuer, Blutschild, Blutregen). Nach jedem Boss hat er neue Ware.
- **Inventar:** Waffen und Rüstungen sieht man am Fürsten. Im Inventar legst du sie an, wählst deinen Zauber und legst einen Trank auf die Schnelltaste.
- **Särge** sind deine Speicherpunkte. Dort warten **Oma Renate** (Ausruhen) und **Opa Egon** (Sargreise zwischen den Gebieten).
- **Gefangene aus Ingopolis:** trinken oder freilassen? Beides macht dich stärker – aber deine Taten entscheiden über das **Ende** (es gibt drei).
- **Sechs Gebiete, sechs Helden des Ordens** als Bosse, jede besiegte Heldin und jeder besiegte Held schenkt dir eine alte Kraft zurück: Blutlanze, Nebelschritt, Fledermausgestalt, Wolfsklaue, Mondhaut.
- **Geheimnisse:** Manche Verstecke öffnen sich erst mit späteren Kräften – mit der Sargreise kannst du zurückkehren. **Ines und Matthias**, die Chronisten von Ingopolis, helfen dir mit einer Karte.

## Tipps für den Fernseher (Menü → Optionen)

- **Helligkeit:** Wirkt das Bild zu dunkel? Viele Fernseher verschlucken dunkle Töne – hochdrehen.
- **Bildrand (Overscan):** Werden Anzeigen am Rand abgeschnitten? Erhöhen, bis alles sichtbar ist.
- **Bildqualität:** *Automatisch* passt sich an; bei Ruckeln eine feste, niedrigere Stufe wählen.
- **Schwierigkeit** (Optionen, jederzeit änderbar): *Leicht* – halber Schaden, schwächere Bosse; *Normal* – fair zum Lernen; *Schwer* – das volle Castlevania-Gefühl. Auf Leicht und Normal verlieren Bosse in Phase 2 heilende Blutkugeln.

---

## Die Besetzung

| | Rolle |
|---|---|
| **Ingo** | als Fürst Ingomar von Nachtfels |
| **Yvonne** | als Fürstin Yvonne |
| **Henry** | als Prinz Henry |
| **Renate** | als Oma Renate |
| **Egon** | als Opa Egon |
| **Ines & Matthias** | als die Chronisten von Ingopolis |

---

## Technik (für Neugierige)

- Reines JavaScript mit ES-Modulen, **WebGL2** und Canvas 2D, keine Bibliotheken, kein Build-Schritt.
- **Grafik prozedural:** Figuren, Kulissen und Effekte werden im Code gezeichnet (Tuschekontur, Cel-Shading, Stoffsimulation für Umhang und Haare) – keine einzige Bilddatei.
- **Ton mit ElevenLabs:** Orchestermusik für jedes Gebiet und jeden Boss, Umgebungsgeräusche (Gruft, Wasser, Sturm, Bibliothek, Uhrwerk), rund 40 Soundeffekte in 81 Varianten und **alle Dialoge mit Sprechern** (Erzähler, Ingomar, Henry, Yvonne, Oma Renate, Opa Egon, die Jäger …) liegen unter `assets/audio/` und wurden mit ElevenLabs erzeugt. Die Engine gleicht die Lautstärken automatisch an, spielt Effekte leicht verstimmt und nie zweimal gleich, blendet Musik weich in die Schleife über und senkt sie ab, solange jemand spricht.
- **Rückfall auf Synthese:** Fehlt eine Datei, lädt sie noch oder ist man offline, erzeugt die Web Audio API den Klang wie früher live (Orgel, Cembalo, Chor, Pauken, alle Effekte). Unter *Optionen → Klang* lässt sich auch ganz auf den erzeugten Klang umschalten; *Optionen → Stimmen* regelt die Sprecher.
- Neue Klangdateien: in den passenden Ordner legen (`music/<track>.mp3`, `amb/<art>.mp3`, `sfx/<name>_<n>.mp3`, `voice/<id>.mp3`) und `npm run audio:manifest` ausführen. Die IDs der Sprachzeilen listet `node tools/voice-lines.mjs --json` (inkl. Aussprache-Hinweisen, z. B. „Yvonne“ → „Yvonn“).
- **WebGL-Renderer** (Standard): Die Grafikkarte berechnet jedes Licht pro Pixel mit weichen Schatten, Relief- und Kantenlicht auf Mauern und Figuren, Figurenschatten, Lichtstrahlen und leuchtenden Dunst, HDR-Bloom und eine filmische Tonkurve.
- Ohne WebGL2 (alte Fernseher-Browser) schaltet das Spiel automatisch auf den klassischen Canvas-2D-Renderer um. Umstellen geht auch von Hand unter *Optionen → Grafik-Engine*.
- Gemalte Gegenlicht-Kulissen pro Gebiet.
- Levels entstehen deterministisch aus Ablaufplänen pro Gebiet; ein Prüfprogramm beweist, dass jede Stelle mit den Kräften erreichbar ist, die man dort schon hat.

### Tests

```bash
npm install          # einmalig (Playwright für die Browser-Tests)
npm test             # alle Tests
```

| Test | Was er prüft |
|---|---|
| `tools/validate-levels.mjs` | Alle Pflichtziele erreichbar, Fähigkeitssperren halten, Geheimnisse nur mit der richtigen Kraft |
| `tools/smoke-test.mjs` | Titel → Vorspann → Intro → erste Kämpfe im echten Browser, ohne JavaScript-Fehler |
| `tools/systems-test.mjs` | Gamepad-Steuerung (simulierter Xbox-Controller), Speichern/Laden, hörbarer Ton |
| `tools/playthrough.mjs` | Ein Bot spielt alle sechs Gebiete im Zeitraffer durch: Arenen, Bosse, Kräfte, Übergänge, Abspann |
| `tools/gear-test.mjs` | Händler, Kaufen, Anlegen, Rüstungsschutz, Tränke, alle Zauber, Gold-Beute, Schwerthiebe, Spielstand (auch alte Stände) |
| `tools/audio-test.mjs` (`npm run test:audio`) | Aufgenommene Musik, Umgebung, Effekte und Stimmen werden wirklich gespielt; Lautstärke im Vergleich zum erzeugten Klang |

Weitere Werkzeuge: `tools/screenshots.mjs`, `tools/boss-shots.mjs`, `tools/profile.mjs` (Renderzeit pro Stufe). Mit `?zone=hof` in der Adresse springt man direkt in ein Gebiet (eigener Test-Speicherplatz), mit `?debug` erscheint eine Bildrate-Anzeige.
