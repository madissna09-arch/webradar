# Webradar

Findet Betriebe **ohne Website, mit kaputter oder veralteter Website** — wie gonovu.com,
nur lokal, ohne Abo und ohne API-Schlüssel.

## Starten

Doppelklick auf `Webradar-starten.bat` — oder:

```
node server.mjs
```

Dann http://localhost:4210 öffnen. Braucht nur Node (ab 18), keine Pakete.

## Was bei einem Scan passiert

1. **Google Maps** — sucht „Branche in Ort“, bis zu 6 Seiten à 20 Treffer. Pro Betrieb:
   Name, Kategorie, Adresse, Telefon, Bewertung, Anzahl Rezensionen, Öffnungszeiten,
   Website-Angabe, ob der Inhaber das Profil verwaltet, Buchungslink, Koordinaten.
2. **Rezensionen nachladen** — wo die Trefferliste die Anzahl nicht mitliefert (max. 40, langsam).
3. **Website einordnen** — keine / nur Instagram, Facebook, Linktree / nur Plattform-Profil
   (Planity, Salonkee, Lieferando, eatbu, Branchenverzeichnisse …) / eigene Seite.
4. **Eigene Seiten prüfen** — erreichbar? Domain tot, 404, geparkt, Hoster-Standardseite?
   Handy-tauglich, HTTPS, Zertifikat, Copyright-Jahr / letzte Änderung, Flash, Frames,
   Tabellen-Layout, alter Doctype, WordPress-/Joomla-/PHP-Version, Baukasten-Subdomain,
   Ladezeit, Impressum und Datenschutz (inkl. /impressum direkt geprüft), Google Fonts extern,
   antippbare Telefonnummer, Meta-Description, strukturierte Daten, PDF-Speisekarte.
   Nebenbei werden Instagram, Facebook, TikTok, WhatsApp und E-Mail aus der Seite gezogen.
5. **Score 0–100** = Bedarf (max 50, Website-Lage) + Substanz (max 30, Bewertungen)
   + Erreichbarkeit (max 20). Ab 70 heiß, ab 45 warm. Ketten/Filialen werden erkannt
   (Name, bekannte Domains, Filial-Pfade, gleiche Website bei mehreren Treffern) und
   standardmäßig ausgeblendet.

## Im Detailfenster

- Befund mit Gewichtung, Technik, Copyright-Jahr, Ladezeit
- **Live-Vorschau** der Website als Handy oder Desktop — zum Zeigen beim Besuch
- Google-Eintrag, Öffnungszeiten, ob das Profil vom Inhaber gepflegt wird
- Social-Felder (automatisch befüllt, sonst „Suchen“ → eintragen, wird gespeichert).
  Warnung, wenn ein Instagram-Handle nicht zum Namen passt (oft Dachmarke/Vermieter).
- Pipeline-Status (Neu → Kontaktiert → Interessiert → Termin → Kunde) und Notiz
- **Ansprache** aus dem Befund: Instagram/WhatsApp, E-Mail, Anruf-Leitfaden mit
  Einwänden. du/Sie nach Branche. Absender unter Einstellungen (Zahnrad).
  Kein „kostenlos/gratis/unverbindlich“ — das Muster wird gezeigt, nicht verschenkt.
- Pfeiltasten ↑/↓ blättern durch die Liste, Esc schließt.

CSV-Export (Excel-tauglich, Semikolon) nimmt immer die aktuell gefilterte Liste.

## Grenzen — ehrlich

- **Google-Daten kommen aus der Maps-Webseite, nicht aus einer offiziellen API.** Das ist
  dieselbe Methode wie bei gonovu, aber Google kann das Format jederzeit ändern (dann
  `lib/gmaps.mjs`, Funktion `toPlace`, anpassen) oder bei sehr vielen Anfragen bremsen.
  Das Tool fragt deshalb bewusst langsam. Nicht dutzende Scans hintereinander feuern.
- **„Keine Website“ heißt: Google kennt keine.** Manche Betriebe haben trotzdem eine.
  Vor dem Anruf den „googeln“-Link im Detailfenster nutzen.
- **Instagram ohne Website wird nicht automatisch gesucht** — Suchmaschinen liefern Bots
  nur Müll. Dafür gibt es pro Betrieb den Such-Button.
- Das Design einer Seite kann kein Skript beurteilen. „Ordentlich“ heißt technisch sauber,
  nicht schön — dafür ist die Handy-Vorschau da.
- Versendet wird nichts automatisch. Texte kopieren, von Hand schicken.

## Dateien

```
server.mjs         HTTP-Server, Suchaufträge, Live-Stream, CSV, Vorschau-Proxy
lib/gmaps.mjs      Google-Maps-Suche und Feld-Zuordnung
lib/audit.mjs      Website-Prüfung
lib/score.mjs      Lead-Score und Ketten-Erkennung
lib/store.mjs      Speicherung in data/*.json
public/            Oberfläche (index.html, app.js, pitch.js, style.css)
data/              eure Leads und Suchen — nicht löschen, nicht hochladen
```
