# `@repo/pdax`

A server-only client library for the PDAX UAT integration inside **Velo Settlement**. This package abstracts authentication, token refresh, balance fetches, trading quotes, trade orders, payout channels, callback parsing, and webhook registration helpers used by Convex settlement actions.

## Requirements

- Node.js >= 18 (utilizes built-in native `fetch` API)
- Programmatic UAT credentials with MFA disabled.
- A public callback URL when testing provider webhooks against a deployed or tunneled Velo app.

## Configuration

Secrets must be loaded from server-only environment variables and never exposed to client-visible records.

```bash
PDAX_UAT_BASE_URL="https://uat.services.sandbox.pdax.ph/api/pdax-api"
PDAX_UAT_USERNAME="<provided-uat-username>"
PDAX_UAT_PASSWORD="<provided-uat-password>"
PDAX_CALLBACK_URL="https://<public-host>/api/webhooks/pdax"
```

## API Reference

### `PdaxClient`

Initialize the client with an optional base URL (defaults to UAT):

```typescript
import { PdaxClient } from "@repo/pdax";

const client = new PdaxClient(process.env.PDAX_UAT_BASE_URL, { timeoutMs: 2_500 });
```

#### Methods

- **`login(username, password, signal?)`**: Perform bounded initial login. Returns accessToken, idToken, and refreshToken.
- **`refresh(username, refreshToken, signal?)`**: Perform bounded token refresh before expiry.
- **`balances(accessToken, idToken, currency?)`**: Retrieve assets available/hold/total balances.
- **`cryptoDepositAddress(accessToken, idToken, currency, signal?)`**: Get the Stellar UAT deposit address and tag with caller cancellation.
- **`indicativeQuote(accessToken, idToken, params)`**: Fetch estimated conversion rate for trading pairs (e.g. `USDCXLM` -> `PHP`).
- **`firmQuote(accessToken, idToken, params)`**: Get a firm, executable quote valid for 15 seconds.
- **`executeTrade(accessToken, idToken, params)`**: Execute the trade order using a valid `quote_id` and unique `idempotency_id`.
- **`getOrder(accessToken, idToken, orderId)`**: Get trade order detail by order ID.
- **`fiatWithdraw(accessToken, idToken, params)`**: Initiate an InstaPay payout/withdrawal to supported test banks (CTBC or Security Bank).
- **`registerWebhook(accessToken, idToken, params)`**: Register the Velo callback URL for PDAX UAT callbacks when project connection or webhook settings change.
- **`getFiatTransactions(accessToken, idToken, params)`**: Poll fiat transaction records for pending withdrawals when callbacks are delayed.
- **`parseWebhook(payload)`**: Normalize webhook events for Convex provider-event processing.
- **`verifyWebhook(payload, headers)`**: Since PDAX webhooks do not contain authentication signatures, this method returns `true` (verification is done internally inside Convex handler logic by matching references).

## Runtime Flow

Velo Settlement uses this package from Convex actions only:

Every client request has a 2.5-second default total deadline. A caller signal is composed with that deadline, so route workers can cancel login, refresh, and destination lookup when their owning budget expires. The client stores only its base URL and timeout; credentials and tokens remain request arguments, making base-URL-scoped client reuse safe.

1. `connect` logs in or refreshes cached provider tokens per project.
2. `getBalances` retrieves searchable sandbox balances for the Settlement page.
3. `getQuote` returns indicative quotes or persists firm quotes with expiry.
4. `executeTrade` executes active firm quotes with idempotency protection.
5. `fiatWithdraw` initiates InstaPay UAT withdrawals and records payout references.
6. `POST /api/webhooks/pdax` forwards provider callbacks to Convex for deduplication and settlement status updates.
7. A Convex cron polls pending payouts every two minutes as a fallback when callbacks are delayed.
8. Velo sends signed merchant webhooks for settlement state transitions.

## Testing

Run unit tests using the Node test runner (with mock API server fetch responses):

```bash
pnpm --filter @repo/pdax test
```
