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
| Blutklinge (3er-Kombo) | **X** | **□** | J |
| Blutlanze | **Y** | **△** | L |
| Ausweichen / Nebelschritt | **RB / RT** | **R1 / R2** | Shift |
| Wolfsklaue | **LB / LT** | **L1 / L2** | Q |
| Trinken / Handeln | **B** | **○** | E |
| Karte | Ansicht | Share | Tab |
| Pause | Menü | Options | Esc |

Durch Plattformen fallen: **unten + Springen**. Die Tastensymbole im Spiel passen sich automatisch an dein Gerät an.

## Spielprinzip

- **Blut ist deine Kraft.** Es füllt sich nicht von selbst. Prügle einen Jäger unter 35 % – dann geht er in die Knie und du kannst **trinken**: Das heilt dich und gibt Blut für Lanze und Klaue.
- **Geweihtes Licht brennt.** Lichtschächte flackern – warte auf den richtigen Moment. Im Nebel bist du unverwundbar.
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
- **Alles prozedural:** Figuren, Kulissen und Effekte werden im Code gezeichnet (Tuschekontur, Cel-Shading, Stoffsimulation für Umhang und Haare), der komplette **Soundtrack und alle Geräusche** werden live mit der Web Audio API synthetisiert – keine einzige Bild- oder Audiodatei.
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

Weitere Werkzeuge: `tools/screenshots.mjs`, `tools/boss-shots.mjs`, `tools/profile.mjs` (Renderzeit pro Stufe). Mit `?zone=hof` in der Adresse springt man direkt in ein Gebiet (eigener Test-Speicherplatz), mit `?debug` erscheint eine Bildrate-Anzeige.
