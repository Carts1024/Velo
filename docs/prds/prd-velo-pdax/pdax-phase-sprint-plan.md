# Velo Settlement PDAX Sprint Plan

## Summary

Build **Velo Settlement** as the PDAX UAT-backed settlement layer for the APAC Stellar Hackathon. PDAX is Velo's first regional settlement provider, not a one-off integration.

Primary demo flow:

```txt
paid PaymentIntent
-> PDAX quote
-> trade execution
-> InstaPay withdrawal
-> PDAX webhook
-> normalized Velo webhook
```

Fiat-priced PaymentIntent stays P1 until the core settlement loop is stable.

## Product Goal

Help APAC builders accept stablecoins on Stellar and settle through local fiat rails, starting with PDAX UAT in the Philippines.

Success means a merchant can:

- View PDAX UAT provider status and supported balances.
- Quote `USDCXLM -> PHP`.
- Execute a PDAX trade from a firm quote.
- Initiate an InstaPay UAT withdrawal to a supported test bank.
- Track settlement lifecycle in Velo.
- Receive normalized signed Velo webhooks for settlement events.

## Scope

### P0

- PDAX UAT provider connection using global hackathon credentials.
- Server-only PDAX client package.
- Token lifecycle handling, including refresh for short-lived access tokens.
- Settlement records linked to `projectId` and optionally `paymentIntentId`.
- Balances view for supported UAT assets: `XLM`, `USDCXLM`, and PHP if returned by PDAX.
- Indicative quote and firm quote for `USDCXLM -> PHP`.
- Trade execution with idempotency protection.
- Order status lookup.
- InstaPay fiat withdrawal using UAT test banks.
- PDAX webhook receiver.
- Settlement history dashboard.
- Normalized Velo settlement webhooks.
- UAT warning copy for mock pricing, mock liquidity, simulated balances, and non-production settlement.

### P1

- Fiat-priced PaymentIntent.
- PDAX crypto deposit address display.
- SDK settlement methods.
- Provider health card.
- Settlement CSV export.

### Out Of Scope

- Production auto-settlement.
- Multi-country provider support.
- Full SEP/AnchorKit abstraction.
- Compliance/KYC automation.
- Custody claims beyond explicit PDAX UAT support.
- Customer payments routed directly to PDAX deposit addresses.

## Sprint Plan

### Sprint 0: Access And Contract Lock

Duration: half day.

Stories:

- Confirm PDAX API portal access and UAT credentials.
- Confirm exact request/response schemas for auth, balances, quotes, trades, orders, withdrawals, and webhooks.
- Confirm supported pair names and asset/network values for `USDCXLM`, `XLM`, `PHP`, and Stellar Testnet.
- Confirm webhook signature or verification model.
- Confirm supported bank payload fields for Security Bank `BASECPH` and CTBC `BACTBPH`.
- Lock normalized Velo event names and settlement statuses.

Acceptance:

- PDAX UAT credential source is known.
- Exact payload fields needed for Sprint 1 and Sprint 2 are documented.
- Unknown private-doc items are captured as implementation blockers, not guessed in production-facing code.

### Sprint 1: Provider Foundation

Duration: days 1-2.

Stories:

- Add server-only `packages/pdax` package.
- Implement PDAX client methods: `login`, `refresh`, `balances`, `indicativeQuote`, `firmQuote`, `executeTrade`, `getOrder`, `fiatWithdraw`, `cryptoDepositAddress`, `parseWebhook`, and `verifyWebhook`.
- Add mocked tests for success and provider error responses.
- Add Convex settlement schema for provider connections, quotes, transactions, and provider events.
- Add internal Convex mutations/queries for creating and reading settlement records.

Acceptance:

- Backend can authenticate with PDAX UAT.
- Backend can refresh tokens before expiry.
- Backend can fetch balances.
- Backend can create a firm quote.
- No PDAX credentials or tokens are exposed to browser/client-visible records.

### Sprint 2: Settlement Workflow

Duration: days 3-4.

Stories:

- Add settlement APIs/actions for provider status, balances, quotes, trades, withdrawals, transactions, and history.
- Link settlement records to project and optional paid PaymentIntent.
- Add idempotency IDs for quote, trade, and withdrawal attempts.
- Add `USDCXLM -> PHP` quote flow.
- Add firm quote execution flow.
- Add order status lookup.
- Add InstaPay withdrawal flow for Security Bank `BASECPH` and CTBC `BACTBPH`.

Acceptance:

- Paid PaymentIntent can start a settlement record.
- Merchant can request indicative and firm quotes.
- Merchant can execute a trade from firm quote.
- Merchant can initiate InstaPay UAT withdrawal.
- Settlement history shows quote, trade, order, and withdrawal state.

### Sprint 3: Webhooks And Dashboard

Duration: day 5.

Stories:

- Add `POST /api/webhooks/pdax`.
- Parse and verify PDAX webhook events.
- Store provider event summaries with duplicate event protection.
- Update settlement transaction state from provider events.
- Extend existing Velo webhook delivery pipeline with settlement event types.
- Add dashboard route `/projects/[projectId]/settlement`.
- Add UI sections: provider status, supported assets, balances, settlement actions, settlement history, and webhook health.

Normalized Velo events:

- `settlement.quote.created`
- `settlement.trade.executed`
- `settlement.withdrawal.pending`
- `settlement.withdrawal.succeeded`
- `settlement.withdrawal.failed`
- `provider.pdax.event.received`

Acceptance:

- PDAX webhook updates settlement history.
- Velo forwards signed merchant webhook through existing delivery logs.
- Dashboard clearly shows latest provider event and latest Velo webhook delivery.

### Sprint 4: Demo Hardening

Duration: day 6.

Stories:

- Add UAT-only warning copy across dashboard and API-facing docs.
- Add failure states for expired token, invalid parameters, insufficient balance, asset unavailable, and PDAX downtime.
- Add demo checklist for `USDCXLM`, Stellar Testnet, InstaPay, Security Bank, and CTBC.
- Run focused package, backend, web, build, and lint checks.
- Prepare fallback demo explanation if PDAX UAT is unavailable or reset.

Acceptance:

- Demo runs end-to-end without manual DB edits.
- UI never implies real production settlement.
- Provider failure can be explained and shown cleanly.
- Test results are recorded before handoff.

## Technical Boundaries

- Use `packages/pdax`, because workspace includes `packages/*`.
- Keep PDAX API calls server-side only.
- Prefer global UAT environment credentials for hackathon scope.
- Store provider references, statuses, summaries, and non-secret metadata in Convex.
- Do not store raw secrets or access tokens in client-visible documents.
- Use existing Velo webhook delivery pipeline rather than a second merchant webhook system.
- Use Velo's current PaymentIntent receiver model. Settlement happens after payment verification.

## Test Plan

- `packages/pdax`: mocked fetch tests for auth, refresh, balances, quotes, trades, withdrawals, errors, and webhook parsing.
- Convex: state transitions, duplicate provider event handling, quote expiry, ownership checks, and settlement history filtering.
- Web/API: route validation, auth checks, provider error mapping, webhook receiver behavior, and settlement UI states.
- Final checks:
  - `pnpm --filter @repo/pdax test`
  - `pnpm --filter @repo/backend test`
  - `pnpm --filter web test`
  - `pnpm --filter web build`
  - `pnpm --filter web lint:fix`

## Risks

- Private PDAX docs may differ from playbook examples.
- UAT uses mock pricing, mock liquidity, and simulated transaction behavior.
- UAT data may reset or become unavailable.
- Access tokens expire quickly and refresh must be reliable.
- Webhook signature model is not confirmed in public playbook.
- Duplicate webhook delivery can corrupt state if provider event IDs are not deduped.
- Support hours are Monday-Friday, 1:00 PM-6:00 PM Philippine Time.

## Open Questions

- Exact PDAX request/response schemas for firm quote, trade, withdrawal, and order status.
- Exact webhook event payload and signature headers.
- Whether PDAX UAT credentials are platform-level or project-level for demo.
- Whether PHP balance appears in balances endpoint or only through trade/withdrawal status.
- Whether withdrawal status is returned only by webhook, status endpoint, or both.

## Nicole Recommendation

Ship P0 as a thin but complete settlement loop. Do not chase generalized APAC provider support, production settlement, or fiat-priced PaymentIntent until the PDAX UAT loop proves the core assumption:

> Velo can turn a verified Stellar stablecoin payment into local fiat settlement workflow and expose one normalized webhook surface to developers.
