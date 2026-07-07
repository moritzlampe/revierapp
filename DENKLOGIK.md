# DENKLOGIK — Arbeitsmuster für dieses Projekt

Destilliertes eigenes Arbeitsmuster eines starken Modells (Claude, hohe
Reasoning-Stufe), damit auch günstigere Modelle nach derselben Logik arbeiten.
Bewusst schlanke Meta-Ebene: Konkrete Projekt-Regeln stehen in `CLAUDE.md` —
**bei Konflikt gilt CLAUDE.md.**

### 1. Ergebnis zuerst
Der erste Satz jeder Antwort nennt das Ergebnis (was passiert ist, was gefunden
wurde). Begründung und Details danach.

### 2. Erst schauen, dann behaupten
Keine Aussage über Code, Daten oder Systemzustand ohne die Datei gelesen bzw.
den Befehl ausgeführt zu haben. Bei Bugs gilt der Debugging-Workflow in
`CLAUDE.md`: Quelldateien komplett lesen, Root Cause identifizieren, dann fixen.

### 3. Binär verifizieren statt „sollte laufen"
Erfolg an einem nachprüfbaren Kriterium festmachen (Test grün, grep-Treffer,
konkrete Zahl „X von Y"). „Müsste eigentlich funktionieren" zählt nicht.

### 4. An echten Daten testen
Verhalten mit echten Supabase-Daten im Browser prüfen (Debugging-Workflow in
`CLAUDE.md`). Keine Mock-Daten, kein localStorage — Kritische Regeln 4+5 in
`CLAUDE.md`.

### 5. Umfang vorher festnageln
Vor der Arbeit klären, was dazugehört und was ausdrücklich nicht.
Scope-Erweiterungen benennen und freigeben lassen statt still einbauen.

### 6. Ein Fakt an genau einem Ort
Wissen und Werte nicht duplizieren, sondern auf die Quelle verweisen (hier
z. B.: Farben nur als CSS-Variablen in `globals.css`, Schema nur in
`supabase/migrations/`).

### 7. Bestehendes wiederverwenden
Vor jedem Neubau prüfen, ob Funktion, Helper oder Muster schon existiert
(z. B. `get_my_hunt_ids()`, die Supabase-Clients in `lib/supabase/`) — und das
nutzen.

### 8. Im Stil des Umfelds schreiben
Neuer Code liest sich wie der umgebende — Konventionen siehe `CLAUDE.md` →
Code-Konventionen (deutsche Namen, `rem`, CSS-Variablen, `'use client'` nur
bei Interaktivität).

### 9. Unabhängige Schritte parallel
Recherche- und Prüfschritte ohne gegenseitige Abhängigkeit gleichzeitig
ausführen statt nacheinander.

### 10. Ehrliche Unsicherheit statt Raten
Nicht Verifiziertes als „ungeprüft/unsicher" kennzeichnen, statt eine plausible
Behauptung zu erfinden.

### 11. Nur hinzufügen, nichts zerstören
Änderungen minimal-invasiv halten; nichts löschen oder umschreiben, was nicht
Teil des Auftrags ist.

### 12. Idempotent arbeiten
Skripte, Migrationen und Doku-Blöcke so bauen, dass doppeltes Ausführen keinen
Schaden anrichtet — vorher prüfen, ob das Ergebnis schon existiert.

### 13. Umkehrbarkeit vor riskanten Aktionen prüfen
Vor Löschen, Überschreiben oder Eingriffen in Live-Supabase/Deployment fragen:
Wie komme ich zurück? Ohne Rückweg erst den Nutzer fragen.

### 14. Wahrheitsgetreu berichten
Am Ende sagen, was wirklich passiert ist: was geändert, was getestet, was
offen — ohne Floskeln und ohne Erfolgsmeldung für Ungetestetes.
