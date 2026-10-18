# 64keys API – Testoberfläche

Eine schlanke Oberfläche zum Ausprobieren der 64keys REST API. Sie spricht
ausschließlich über `/api/v1` mit dem Backend, hält keine eigenen Daten und
braucht keinen Build-Schritt.

**Veröffentlicht über GitHub Pages** – die Seite läuft im Browser, die
Adresse des Backends und das Zugriffstoken trägt jede testende Person selbst
ein. Beides bleibt im eigenen Browser (`localStorage`); es wird nichts an
Dritte gesendet.

## Zwei Betriebsarten

**Charts** – bildet die heutige Weboberfläche nach: Suche mit Filtern, und
die Chartansicht mit denselben Reitern (Overview, Typ & Profil, Aktivierung,
Potenziale, Grafiken, Zeit, Varianten, Gruppen, Verwaltung, JSON).

**Endpunkte** – ein Explorer, der sich aus der API selbst aufbaut: Er liest
`GET /meta/openapi` und erzeugt daraus ein Formular je Endpunkt, mit
Beschreibungen, Auswahlfeldern und Pflichtfeldern. Zu jeder Anfrage gibt es
den passenden `curl`-Befehl, dazu Status, Dauer und die Rohantwort.

## Nutzung

1. Seite öffnen
2. Adresse der API eintragen, zum Beispiel `https://<host>/api/v1`
3. Zugriffstoken eintragen
4. „Verbinden“

Damit das funktioniert, muss die API Anfragen von dieser Herkunft erlauben
(CORS). In der 64keys-Anwendung steht die Liste in der Umgebungsvariable
`API_CORS_ORIGINS`; die Adresse dieser Seite gehört dort hinein.

Ein Token berechtigt zu allem, wozu das zugehörige Konto berechtigt ist —
also nicht weitergeben, und auf gemeinsam genutzten Rechnern über „Token
vergessen“ wieder entfernen.

## Lokal starten

```bash
python3 serve.py
```

Dann `http://127.0.0.1:8100/` öffnen. `serve.py` ist `python3 -m http.server`
mit `Cache-Control: no-store` — ohne das halten Browser ES-Module fest, und
nach einer Änderung passen die Module nicht mehr zusammen.

## Aufbau

```
index.html      Aufbau der Seite
css/app.css     Darstellung, hell und dunkel
js/api.js       spricht mit der API — die einzige Stelle mit fetch
js/ui.js        gemeinsame Darstellung: Maskierung, Status, Trefferliste
js/dict.js      Namen zu den Zahlen: Referenzdaten und Texte, je Sprache einmal geholt
js/chart.js     die Chartansicht mit ihren Reitern
js/explorer.js  der selbsterzeugte Teil: liest den Vertrag, baut Formulare
js/main.js      Zustand und Verdrahtung — kein HTML, kein fetch
```

Keine Abhängigkeiten, kein Bundler, kein CDN: native ES-Module, so wie sie
hier liegen.

## Veröffentlichung

Die Seite liegt auf GitHub Pages. `.github/workflows/pages.yml` lädt bei
jedem Push auf `main` den Stand hoch und schaltet ihn live — gebaut wird
nichts, die Dateien gehen so raus, wie sie hier liegen. Unter
*Settings → Pages* muss als Quelle „GitHub Actions" eingestellt sein.

Ein Lauf lässt sich auch ohne neuen Commit anstoßen: *Actions → Pages →
Run workflow*.

## Herkunft

Entwickelt im Rahmen der 64keys REST API. Der Quellstand liegt im Projekt
der Anwendung unter `apitest/`; dieses Repository ist die veröffentlichte
Fassung.
