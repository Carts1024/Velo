# `@repo/pdax`

A server-only client library for the PDAX UAT integration inside **Velo Settlement**. This package abstracts authentication, token refresh, balance fetches, trading quotes, trade orders, payout channels, callback parsing, and webhook registration helpers used by Convex settlement actions.

## Requirements

- Node.js >= 18 (utilizes built-in native `fetch` API)
- Programmatic UAT credentials with MFA disabled.
- A public Convex site URL when testing provider callbacks.

## Configuration

Secrets must be loaded from server-only environment variables and never exposed to client-visible records.

```bash
PDAX_UAT_BASE_URL="https://uat.services.sandbox.pdax.ph/api/pdax-api"
PDAX_UAT_USERNAME="<provided-uat-username>"
PDAX_UAT_PASSWORD="<provided-uat-password>"
PDAX_CALLBACK_URL="https://<deployment>.convex.site"
PDAX_WEBHOOK_TOKEN="<high-entropy-secret>"
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
- **`parseWebhook(payload)`**: Strictly normalize allowlisted fiat/crypto callback fields, enums,
  numeric values, and string bounds. Evidence: [`rejects malformed and stale webhook shapes`](src/client.test.ts).
- **`verifyWebhook(payload, headers)`**: Returns `false`; PDAX does not provide native callback
  signatures, so Velo must not claim provider-signature verification. Evidence:
  [`does not claim native signature verification`](src/client.test.ts).

## Runtime Flow

Velo Settlement uses this package from Convex actions only:

Every client request has a 2.5-second default total deadline. A caller signal is composed with that deadline, so route workers can cancel login, refresh, and destination lookup when their owning budget expires. The client stores only its base URL and timeout; credentials and tokens remain request arguments, making base-URL-scoped client reuse safe.

1. `connect` logs in or refreshes cached provider tokens per project.
2. `getBalances` retrieves searchable sandbox balances for the Settlement page.
3. `getQuote` returns indicative quotes or persists firm quotes with expiry.
4. `executeTrade` executes active firm quotes with idempotency protection.
5. `fiatWithdraw` initiates InstaPay UAT withdrawals and records payout references.
6. `POST ${PDAX_CALLBACK_URL}/api/webhooks/pdax/v1?token=${PDAX_WEBHOOK_TOKEN}` accepts callbacks
   directly in Convex; the token, JSON content type, 64 KiB limit, and strict parser are required.
7. Unsigned callbacks are persisted as reconciliation hints. Matched withdrawals are corroborated
   by polling with the stable provider UUID; unmatched callbacks are quarantined.
8. The legacy Next.js `/api/webhooks/pdax` route returns `410 Gone` after callback migration.
9. Velo sends signed merchant webhooks for settlement state transitions.

## Reliability contract

PDAX calls use a 2.5-second client deadline. Durable Convex ownership provides **exactly-once
observable transitions**, not exactly-once transport. The 100-way reservation and stale-lease
contracts are covered by [`100 concurrent reservations produce one durable provider operation`](../backend/convex/durableReliability.test.ts) and [`lease fencing rejects stale completion and ambiguous trades cannot resubmit`](../backend/convex/durableReliability.test.ts).

Sprint 8 provides deterministic automated evidence only; it has no live SLO qualification and no
production availability evidence.

## Testing

Run unit tests using the Node test runner (with mock API server fetch responses):

```bash
pnpm --filter @repo/pdax test
```
