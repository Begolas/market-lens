# Implementation Plan — Alpha Vantage Free Tier Enforcement

## Scope
Enforce Free-tier-only MVP behavior (no premium endpoints/flows), with centralized endpoint mapping and robust limit handling.

## Tasks
1. **Audit API + UI usage**
   - Locate all Alpha Vantage endpoint calls and any premium/intraday/adjusted references.
   - Verify UI cannot select unsupported timeframes.

2. **Centralize endpoint mapping (single source of truth)**
   - Introduce one constant map for allowed endpoints:
     - `SYMBOL_SEARCH`
     - `TIME_SERIES_DAILY` (compact)
     - `TIME_SERIES_WEEKLY`
     - `TIME_SERIES_MONTHLY`
   - Route all API calls through this map.

3. **Harden API error handling**
   - Normalize Alpha Vantage `Note` / `Information` / `Error Message` payloads.
   - Provide clear Free-tier specific messages for rate limits and unavailable premium features.

4. **Constrain UI state**
   - Sanitize persisted `timeRange` from localStorage to free-safe values only (`1D`, `1W`, `1Mo`).
   - Ensure layout updates cannot set unsupported intervals.

5. **Documentation updates**
   - Add `FREE_TIER_NOTES.md` with allowed endpoints and limits.
   - Update `README.md` with Free-tier-only behavior and indicator implementation note (client-side TA).

6. **Validation + commit**
   - Run `npm run build` and fix issues.
   - Commit with message: `MVP: enforce Alpha Vantage free-tier endpoints only`.

## Audit Findings (violations found)
- Endpoint selection logic in code was **not centralized** (inline branching in `fetchCandles`), making future premium regressions easier.
- Error handling treated `Information` generically as premium but lacked robust normalization for varying Alpha Vantage `Note` responses.
- Persisted layout could theoretically carry a stale/unsupported interval from storage without explicit sanitization guard.

_No active premium endpoint calls were found in current MVP; main fixes are hardening + regression prevention._
