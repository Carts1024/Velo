# `@repo/pdax`

A server-only client library for the PDAX UAT integration inside **Velo Settlement**. This package abstracts the authentication loop, balance fetches, trading quotes, trade orders, and payout channels.

## Requirements

- Node.js >= 18 (utilizes built-in native `fetch` API)
- Programmatic UAT credentials with MFA disabled.

## Configuration

Secrets must be loaded from server-only environment variables and never exposed to client-visible records.

```bash
PDAX_UAT_BASE_URL="https://uat.services.sandbox.pdax.ph/api/pdax-api"
PDAX_UAT_USERNAME="<provided-uat-username>"
PDAX_UAT_PASSWORD="<provided-uat-password>"
```

## API Reference

### `PdaxClient`

Initialize the client with an optional base URL (defaults to UAT):

```typescript
import { PdaxClient } from "@repo/pdax";

const client = new PdaxClient(process.env.PDAX_UAT_BASE_URL);
```

#### Methods

- **`login(username, password)`**: Perform initial login. Returns accessToken, idToken, and refreshToken.
- **`refresh(username, refreshToken)`**: Refresh tokens before the 10-minute expiry.
- **`balances(accessToken, idToken, currency?)`**: Retrieve assets available/hold/total balances.
- **`cryptoDepositAddress(accessToken, idToken, currency)`**: Get the Stellar UAT deposit address and tag.
- **`indicativeQuote(accessToken, idToken, params)`**: Fetch estimated conversion rate for trading pairs (e.g. `USDCXLM` -> `PHP`).
- **`firmQuote(accessToken, idToken, params)`**: Get a firm, executable quote valid for 15 seconds.
- **`executeTrade(accessToken, idToken, params)`**: Execute the trade order using a valid `quote_id` and unique `idempotency_id`.
- **`getOrder(accessToken, idToken, orderId)`**: Get trade order detail by order ID.
- **`fiatWithdraw(accessToken, idToken, params)`**: Initiate an InstaPay payout/withdrawal to supported test banks (CTBC or Security Bank).
- **`parseWebhook(payload)`**: Parse webhook events.
- **`verifyWebhook(payload, headers)`**: Since PDAX webhooks do not contain authentication signatures, this method returns `true` (verification is done internally inside Convex handler logic by matching references).

## Testing

Run unit tests using the Node test runner (with mock API server fetch responses):

```bash
pnpm --filter @repo/pdax test
```
