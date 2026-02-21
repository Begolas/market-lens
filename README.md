# MARKET·LENS – PWA Setup

## In 5 Minuten auf dem iPhone

### Schritt 1 – Diesen Ordner auf GitHub hochladen

1. Gehe zu **github.com** → Einloggen / kostenlosen Account erstellen
2. Klicke auf **„New repository"**
3. Name: `market-lens` → **„Create repository"**
4. Klicke auf **„uploading an existing file"**
5. Den **gesamten Inhalt** dieses ZIP-Ordners hochladen (alle Dateien und Unterordner)
6. Klicke **„Commit changes"**

---

### Schritt 2 – Auf Vercel deployen (kostenlos)

1. Gehe zu **vercel.com** → **„Continue with GitHub"** (einloggen)
2. Klicke auf **„New Project"**
3. Wähle dein `market-lens` Repository → **„Import"**
4. Einstellungen werden automatisch erkannt (Create React App)
5. Klicke **„Deploy"** → ca. 2 Minuten warten
6. Du bekommst eine URL wie: `https://market-lens-xyz.vercel.app`

---

### Schritt 3 – Als App auf iPhone installieren

1. Öffne die Vercel-URL in **Safari** auf dem iPhone (wichtig: Safari, nicht Chrome!)
2. Tippe auf das **Teilen-Symbol** (Quadrat mit Pfeil nach oben)
3. Wische nach unten → **„Zum Home-Bildschirm"**
4. Name bestätigen → **„Hinzufügen"**

✅ Die App erscheint jetzt als Icon auf dem Home-Screen – ohne App Store!

---

### Schritt 4 – App benutzen

1. App öffnen → Key ist bereits im MVP hinterlegt (kein Start-Prompt)
2. Optional kannst du lokal einen eigenen Key in der App setzen (localStorage `apiKey`)
3. Free Tier: 25 Anfragen/Tag, 5 Anfragen/Minute (Fallback-Key wird bei Limit genutzt)

---

## Lokale Entwicklung

```bash
npm install
npm start
# → öffnet http://localhost:3000
```

## Free-Tier Verhalten (MVP)

Dieses MVP nutzt bewusst nur Alpha-Vantage-Free-Endpunkte:
- `SYMBOL_SEARCH`
- `TIME_SERIES_DAILY` (compact)
- `TIME_SERIES_WEEKLY`
- `TIME_SERIES_MONTHLY`

Nicht genutzt: Intraday/Adjusted/Premium-Indikator-Endpunkte.
Indikatoren (SMA/EMA/RSI/MACD usw.) werden lokal aus OHLCV berechnet.

Details: siehe `FREE_TIER_NOTES.md`.

## Update deployen

Dateien auf GitHub aktualisieren → Vercel deployed automatisch neu.
