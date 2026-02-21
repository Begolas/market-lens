# Alpha Vantage Free Tier Notes (MVP)

## Endpoints used
- `TIME_SERIES_DAILY` (`outputsize=compact`) — **einzige** Candle-Quelle
- `LISTING_STATUS` — optionaler Symbol-Index (manuell)
- `SYMBOL_SEARCH` — nur manueller Fallback

## Not used
- `TIME_SERIES_WEEKLY` / `TIME_SERIES_MONTHLY` (werden lokal aus Daily aggregiert)
- Intraday / adjusted / premium indicator endpoints

## Local computation
- SMA/EMA/BB/VWAP/Ichimoku/Fibonacci/RSI/MACD komplett client-seitig
- `1W` / `1Mo` lokal aus Daily aggregiert

## Cache & persistence
- IndexedDB Stores:
  - `candles` (daily series je Symbol)
  - `symbols` (lokaler Symbol-Index)
  - `meta` (Request-Budget: `callsToday`, `date`, Warnstatus)
- Candle TTL: **12h**
- Symbol-Index TTL: **7 Tage**

## Budget behavior (25/day)
- Tagesbudget lokal gezählt
- Warnung bei hohen Ständen
- nicht-kritische Calls bei 25/25 blockiert
- kein Auto-Refresh-Loop; nur manuell (↻) oder bei notwendigem Symbolwechsel
