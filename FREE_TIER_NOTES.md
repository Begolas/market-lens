# Alpha Vantage Free Tier Notes (MVP)

## Endpoints used in this app
- `SYMBOL_SEARCH` — symbol lookup
- `TIME_SERIES_DAILY` (`outputsize=compact`) — default candle source (`1D`)
- `TIME_SERIES_WEEKLY` — weekly candles (`1W`)
- `TIME_SERIES_MONTHLY` — monthly candles (`1Mo`)

## Explicitly not used
- Intraday endpoints (e.g. `TIME_SERIES_INTRADAY`)
- Adjusted/premium-only flows in this MVP
- Premium technical indicator endpoints (`SMA`, `EMA`, `RSI`, `MACD`, etc.)

## Indicator behavior
All chart indicators in MARKET·LENS are computed client-side from OHLCV candles (local TA functions), not fetched as premium indicator API endpoints.

## Limits handled
- Free tier: **5 requests/minute**, **25 requests/day**
- App normalizes Alpha Vantage `Note` responses and shows a clear rate-limit message.

## Safety defaults
- Time ranges are constrained to `1D`, `1W`, `1Mo`
- Unknown/stale range values fallback to `1D`
