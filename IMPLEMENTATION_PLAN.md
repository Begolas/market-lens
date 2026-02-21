# IMPLEMENTATION PLAN — Ralph Mode Reset/Fix (2026-02-21)

## 1) Root-cause with real API calls (done first)
Live calls executed against app-used endpoints with embedded keys:
- `TIME_SERIES_DAILY`
- `SYMBOL_SEARCH`
- `LISTING_STATUS`

### Observed responses (both embedded keys)
Keys tested:
- `PBGV8GAJ362XPAY6`
- `16QCQ1L3KRI9DOM5`

`TIME_SERIES_DAILY` and `SYMBOL_SEARCH` returned HTTP 200 JSON:
```json
{
  "Information": "Thank you for using Alpha Vantage! ... (1 request per second) ... (25 requests per day) ... premium ..."
}
```
`LISTING_STATUS` returned HTTP 200 with JSON body `{}` (not CSV payload).

Relevant response headers seen:
- `content-type: application/json`
- `date: ...`
- `via: 2.0 heroku-router`
- `server: cloudflare`
- No explicit `retry-after` header in observed responses.

### Exact root-cause
The app previously mapped `Information` + `premium/subscription` text to a **misleading Daily-specific error** (`"Alpha Vantage Antwort unklar..."`).
Alpha Vantage rate-limit/info messages include premium wording, so valid limit/info responses were misclassified as “unclear daily response”.

## 2) MVP data path rebuild (minimal + robust)
- Keep free-tier endpoint only for chart baseline: `TIME_SERIES_DAILY`.
- Preserve key rotation, but remove fragile “unclear daily” classification.
- Add stale-cache fallback if API is unavailable so chart/table still render when cache exists.

## 3) UI diagnostics visibility
Add compact API Debug panel (toggle):
- Last request params (API key masked)
- Response top-level keys
- Error message
- Header snapshot
- Last successful fetch timestamp

## 4) Call-minimal but correctness-first
- Manual refresh retained.
- Correctness favored over aggressive suppression (still fetches daily when needed).

## 5) Validation
- Build must pass: `npm run build`
- Add README self-check section for one-symbol sanity test.

## 6) Delivery
- Commit and push to `main` after successful build.