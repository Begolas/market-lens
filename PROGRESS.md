# PROGRESS (2026-02-21)

## API root-cause capture (live)
Executed live requests with embedded keys against:
- `TIME_SERIES_DAILY` (`symbol=AAPL`, `outputsize=compact`)
- `SYMBOL_SEARCH` (`keywords=AAPL`)
- `LISTING_STATUS`

Findings:
- Both embedded keys currently return `Information` rate-limit style payloads for daily/search.
- Payload text contains both free-limit hints and premium upsell text.
- Old app logic interpreted this as `"Alpha Vantage Antwort unklar..."` for daily.
- `LISTING_STATUS` responded as `{}` (JSON) instead of CSV during this state.
- No `retry-after` header observed in sampled responses.

## Code changes in progress
- Replaced fragile AV error normalization with strict rate-limit/info detection.
- Removed daily-specific false premium/unclear classification.
- Added stale cache fallback for candles when live API fails.
- Added compact API Debug panel with toggle and:
  - params (masked key)
  - response top-level keys
  - error text
  - header snapshot
  - last success timestamp
- Kept free-tier-only baseline path (`TIME_SERIES_DAILY` + local aggregation for 1W/1Mo).

## Validation
- `npm run build` ✅ passed (compiled successfully)
- README self-check section ✅ added

## Remaining
- Commit + push to main.