# MARKET·LENS – PWA Setup

## In 5 Minuten auf dem iPhone

1. Repository auf GitHub hochladen
2. In Vercel importieren und deployen
3. URL in Safari öffnen → „Zum Home-Bildschirm“

## Lokale Entwicklung

```bash
npm install
npm start
```

## Free-Tier-optimiertes Verhalten (neu)

- **Local-first Startup**: App lädt zuerst aus IndexedDB.
- **Cold start Ziel**: nur **1 API-Market-Data-Call** (`TIME_SERIES_DAILY`) für aktives Symbol, wenn Cache fehlt/stale ist.
- **Kein Auto-Refresh-Loop**: Daten aktualisieren nur bei Symbol/Zeitraumwechsel oder manuell per **↻ Refresh**.
- **Stärkerer Cache**: Daily-Daten in IndexedDB, TTL **12h**.
- **Zeiträume lokal abgeleitet**:
  - API lädt nur `TIME_SERIES_DAILY`
  - `1W` / `1Mo` werden lokal aus Daily aggregiert.
- **Suche local-first**:
  - Suche läuft lokal auf gespeichertem Symbol-Index.
  - `SYMBOL_SEARCH` nur manuell per „Remote Suche“ (kein Keystroke-Spam).
- **Request Budget Manager**:
  - tägliche Calls in IndexedDB (`callsToday`/`date`)
  - Warnungen bei Schwellwerten
  - nicht-kritische Calls bei **25/25** blockiert.

## API-Key Fallbacks

- Standardmäßig nutzt die App eingebettete Keys für den Free-Tier-Betrieb.
- In den Einstellungen kannst du zusätzliche Alpha-Vantage-Keys lokal speichern.
- Zusätzliche Keys werden als Fallback-Rotation genutzt, um Ausfälle bei Limits zu reduzieren.

## Self-Check (1 Symbol, 1 Minute)

```bash
npm install
npm start
```

Dann in der App:
1. Symbol `AAPL` laden (oder Favorit antippen)
2. ggf. **↻ Refresh** drücken
3. **API Debug → anzeigen** aufklappen

Erfolg sieht so aus:
- Chart + OHLCV-Tabelle sind sichtbar
- API Debug zeigt `function: TIME_SERIES_DAILY` und Top-Level-Key `Time Series (Daily)`
- `Last Success` ist gesetzt

Wenn API limitiert ist:
- API Debug zeigt `Information`/Rate-Limit-Fehler
- bei vorhandenem Cache werden trotzdem Candle-Daten angezeigt
- in Vercel-Logs erscheinen `av_fetch_debug` Events über `/api/log` (inkl. Header-Snapshot, masked params, Fehlerstatus)

## Deployment Update

Änderungen pushen → Vercel deployed automatisch neu.
