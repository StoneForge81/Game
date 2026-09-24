# BLUTMOND auf den Samsung-Fernseher bringen

Danach ist **Blutmond eine richtige App** auf dem Fernseher: Sie steht bei den
Apps, startet ohne Internet und lässt sich mit Gamepad oder Fernbedienung spielen.

Du brauchst: den PC mit **Tizen Studio**, den Fernseher und ein **Samsung-Konto**.
PC und Fernseher müssen im **selben WLAN/Netzwerk** sein.

---

## Teil A – einmalig einrichten (ca. 20 Minuten)

### 1. Zwei Zusätze in Tizen Studio installieren
1. **Package Manager** öffnen (in Tizen Studio: *Tools → Package Manager*).
2. Reiter **Extension SDK** anklicken.
3. Bei **TV Extensions** und bei **Samsung Certificate Extension** auf *Install* klicken.
4. Warten, bis beides fertig ist. Package Manager schließen.

### 2. Die IP-Adresse vom PC herausfinden
- **Windows:** Start → `cmd` eintippen → Enter → `ipconfig` eintippen → Enter.
  Die Zahl hinter **IPv4-Adresse** aufschreiben (z. B. `192.168.178.20`).
- **Mac:** Systemeinstellungen → Netzwerk → WLAN → Details → **IP-Adresse**.

### 3. Den Fernseher in den Entwicklermodus schalten
1. Am Fernseher die **Apps** öffnen (Home-Taste → *Apps*).
2. Dort nacheinander **1 2 3 4 5** eingeben
   (auf der Samsung-Fernbedienung: Taste **123** drücken, dann erscheint ein Zahlenfeld).
3. Es erscheint *Developer mode*: auf **On** stellen.
4. Bei *Host PC IP* die **IP-Adresse vom PC** aus Schritt 2 eintragen → **OK**.
5. Fernseher **neu starten**: Ein-/Aus-Taste auf der Fernbedienung so lange gedrückt halten,
   bis das Samsung-Logo kommt.

### 4. Die IP-Adresse vom Fernseher herausfinden
Am Fernseher: *Einstellungen → Allgemein → Netzwerk → Netzwerkstatus → IP-Einstellungen*.
Die **IP-Adresse** aufschreiben (z. B. `192.168.178.35`).

### 5. Fernseher mit Tizen Studio verbinden
1. In Tizen Studio: *Tools → Device Manager*.
2. Oben auf **Remote Device Manager** klicken (Symbol mit Bildschirm) → **+**.
3. Name: `Fernseher` · IP: die **Fernseher-IP** aus Schritt 4 · Port: `26101` → **Add**.
4. Den Schalter bei *Connection* auf **On** stellen.
   Jetzt steht der Fernseher in der Liste vom Device Manager.

### 6. Zertifikat anlegen (der „Ausweis“ für die App)
1. In Tizen Studio: *Tools → Certificate Manager* → **+**.
2. **Samsung** wählen → **TV** → Name: `Blutmond` → *Next*.
3. **Create a new author certificate** → einen Namen und ein Passwort ausdenken → *Next*.
4. Mit dem **Samsung-Konto anmelden** (es öffnet sich ein Browserfenster).
5. Beim *Distributor certificate*: **Privilege: Public** lassen.
   Der Fernseher wird automatisch eingetragen (weil er aus Schritt 5 verbunden ist) → *Next* → **Finish**.

---

## Teil B – das Spiel installieren (auch für jedes Update)

### 7. Die App herunterladen
Diesen Link öffnen und die Datei speichern:
**https://github.com/StoneForge81/Game/releases/download/tv/Blutmond-TV.zip**

Die Zip-Datei **entpacken** (Rechtsklick → *Alle extrahieren* bzw. am Mac doppelklicken).
Es entsteht ein Ordner **Blutmond**.

### 8. In Tizen Studio öffnen
1. *File → Import … → General → Existing Projects into Workspace* → *Next*.
2. Bei *Select root directory* auf *Browse* klicken und den Ordner **Blutmond** wählen.
3. Haken bei **Copy projects into workspace** setzen → **Finish**.

### 9. Auf den Fernseher spielen
1. Links im *Project Explorer* mit der rechten Maustaste auf **Blutmond** klicken.
2. **Run As → Tizen Web Application**.
3. Nach etwa einer Minute startet BLUTMOND auf dem Fernseher. 🦇

Ab jetzt steht **Blutmond** bei den Apps auf dem Fernseher – der PC wird nicht mehr gebraucht.

**Update einspielen:** In Tizen Studio das alte Projekt löschen
(Rechtsklick → *Delete*, Haken bei „Delete project contents“), dann Schritte 7 bis 9 wiederholen.
Die Spielstände auf dem Fernseher bleiben erhalten.

---

## Spielen am Fernseher

- **Gamepad** (Xbox oder PlayStation): am Fernseher unter
  *Einstellungen → Verbindung → Bluetooth-Geräteliste* koppeln. Damit spielt es sich am besten.
- **Nur Fernbedienung** geht auch:

| Taste | Wirkung |
|---|---|
| Pfeile | laufen, im Menü auswählen |
| OK | bestätigen |
| **Rot** | Klinge (Angriff) |
| **Grün** | springen |
| **Gelb** | Zauber |
| **Blau** | ausweichen |
| Zurück | Pause · im Titelmenü: App beenden |

## Wenn etwas hakt

- **Fernseher taucht in Schritt 5 nicht auf:** Stimmt die PC-IP im Entwicklermodus (Schritt 3)?
  Beide Geräte im selben Netzwerk? Fernseher wirklich neu gestartet?
- **Fehler beim Zertifikat oder bei „Run As“:** Foto vom Bildschirm machen und schicken.
