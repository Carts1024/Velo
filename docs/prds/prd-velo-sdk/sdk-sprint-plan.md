# Velo SDK Phase Sprint Plan

Source: `docs/prds/prd-velo-sdk/sdk-phase.md`

## Objective

Ship the first production-facing Velo SDK alpha for Stellar stablecoin checkout. The target developer journey is:

```ts
import { Velo } from "@carts1024/velo-sdk";

const velo = new Velo({ apiKey: process.env.VELO_API_KEY! });

const { checkoutUrl } = await velo.checkout.sessions.create({
  amount: "10.00",
  asset: "USDC",
  description: "Order #1001",
});

redirect(checkoutUrl);
```

The SDK must make checkout creation, payment status retrieval, list-based reconciliation, and webhook verification easy without exposing internal Convex document shapes or requiring project IDs from API consumers.

## Tyler Validation Summary

The SDK should be the adapter over a stable public API contract, not the place where backend semantics are discovered. Sequence backend contract hardening before publishing the SDK alpha.

Key technical constraints:

- Use `packages/velo-sdk` for the public SDK package.
- Keep `packages/stellar` focused on Stellar protocol helpers.
- API key authentication must derive project scope server-side.
- Do not reuse dashboard-owner-only Convex queries for SDK API access.
- Add idempotency before production create calls.
- Add retrieve/list public API routes before SDK release candidate.
- Public SDK types must not leak Convex document internals.

## Sprint 0: Contract Lock and Scope Cut

Goal: Freeze the alpha contract before implementation expands.

Canonical output: `docs/prds/prd-velo-sdk/sdk-alpha-contract.md`

Sprint 0 is a documentation-only contract freeze. It does not create `packages/velo-sdk`, edit runtime code, change Convex schema, or regenerate generated files.

Stories:

1. As a Velo SDK maintainer, I want a public API contract document so SDK implementation and backend routes target the same behavior.
2. As a developer, I want consistent error responses so failures are predictable.
3. As a product owner, I want alpha scope explicitly cut so the SDK does not expand into wallet, registry, analytics, or React components.
4. As a backend implementer, I want API key scoping, idempotency, pagination, and webhook naming locked before route hardening begins.

Tasks:

- Create the canonical SDK alpha contract at `docs/prds/prd-velo-sdk/sdk-alpha-contract.md`.
- Define public SDK package name, import path, runtime support, and release version in the contract.
- Define REST request and response shapes for create, retrieve, and list payment intent operations.
- Define the normalized error envelope for auth, validation, rate limit, not found, idempotency conflict, and server errors.
- Define cursor pagination shape and defaults for list responses.
- Define idempotency behavior for `POST /api/v1/payment-intents`.
- Preserve current webhook signature headers and event type names for alpha.
- Document alpha exclusions in one explicit contract section.

Acceptance criteria:

- Public contract includes create, retrieve, list, webhook verification, errors, pagination, and idempotency.
- API key implies project scope; SDK callers never pass `projectId`.
- Webhook naming preserves the current `x-velo-signature`, `x-velo-event`, `x-velo-delivery`, and `payment.*` event contract.
- Alpha exclusions are documented.
- Contract states that Sprint 0 is docs-only and does not change runtime code.
- Implementation tickets can be estimated without open API-shape questions.

Exit gate:

- `docs/prds/prd-velo-sdk/sdk-alpha-contract.md` reviewed by product and architecture before backend or SDK release work continues.

## Sprint 1: Public PaymentIntent API Hardening

Goal: Make the API stable enough for an SDK to wrap.

Stories:

1. As a developer, I want create payment intent to be idempotent so retries do not duplicate charges.
2. As a developer, I want to retrieve a payment intent after redirect success so I can unlock purchased access.
3. As a developer, I want to list payment intents by API key scope so I can reconcile payments server-side.
4. As Velo, I want all SDK-facing routes to enforce API-key scoped access.

Tasks:

- Add `Idempotency-Key` support to `POST /api/v1/payment-intents`.
- Persist idempotency records by project plus key, returning the original compatible response on replay.
- Add `GET /api/v1/payment-intents/:id`.
- Add `GET /api/v1/payment-intents` with status filter, limit, and cursor-ready response shape.
- Add Convex API-key-scoped query/mutation paths separate from dashboard owner queries.
- Standardize route-level error responses.
- Preserve existing rate-limit behavior and headers.
- Add backend/API tests for auth, validation, idempotency replay, retrieve, list scoping, filters, and pagination defaults.

Acceptance criteria:

- Duplicate create requests with the same project and idempotency key return the same payment intent response.
- Retrieve returns only payment intents owned by the API key's project.
- List returns only the API key's project data and defaults to a bounded page size.
- Invalid API keys, revoked keys, malformed ids, and cross-project access fail closed.
- No generated Convex files are edited manually.

Exit gate:

- Focused web/API and backend tests pass.
- Backend behavior matches the Sprint 0 contract.

## Sprint 2: SDK Package Foundation

Goal: Create the official SDK package with typed client primitives.

Stories:

1. As a developer, I want to install one SDK package and create a typed Velo client.
2. As a developer, I want SDK errors to be typed enough for retry, auth, and validation handling.
3. As a maintainer, I want the SDK package separated from Stellar protocol helpers.

Tasks:

- Create `packages/velo-sdk`.
- Configure package exports, TypeScript config, tests, and build output.
- Add `Velo` client with `apiKey`, `baseUrl`, `environment`, and `timeoutMs`.
- Add internal HTTP client with timeout handling.
- Add typed request options, including `idempotencyKey`.
- Add custom errors:
  - `VeloAPIError`
  - `VeloAuthError`
  - `VeloRateLimitError`
  - `VeloValidationError`
- Add public TypeScript types for payment intents, checkout sessions, list responses, and SDK config.

Acceptance criteria:

- `new Velo({ apiKey })` creates a usable client.
- SDK package has intentional public exports only.
- Unit tests cover config validation, auth header creation, timeout handling, error mapping, and idempotency header behavior.
- Package can be built and tested independently.

Exit gate:

- `pnpm --filter @carts1024/velo-sdk test` passes.
- Build output includes declarations and package exports.

## Sprint 3: Checkout and PaymentIntent SDK Resources

Goal: Deliver the core payment SDK API.

Stories:

1. As a developer, I want `checkout.sessions.create()` so I can redirect a customer to hosted checkout.
2. As a developer, I want `paymentIntents.retrieve()` so I can verify payment status after redirect.
3. As a developer, I want `paymentIntents.list()` so I can reconcile payments from my backend.

Tasks:

- Implement `velo.checkout.sessions.create(params, options)`.
- Implement `velo.paymentIntents.create(params, options)` as the lower-level create alias if desired.
- Implement `velo.paymentIntents.retrieve(id)`.
- Implement `velo.paymentIntents.list({ status, limit, cursor })`.
- Map API responses into stable SDK types.
- Add safe retry behavior only for GET requests.
- Do not automatically retry create unless an idempotency key is supplied and behavior is explicitly documented.

Acceptance criteria:

- Checkout creation returns `id`, `paymentIntentId`, `checkoutUrl`, `status`, `amount`, `asset`, and expiration fields where available.
- Retrieve and list match API-key project scoping.
- SDK methods do not expose Convex ids as an implementation detail beyond public payment intent identifiers.
- Tests cover success, validation failures, auth failures, rate limits, server errors, and list filtering.

Exit gate:

- SDK can create, retrieve, and list payment intents against mocked public API responses.
- Public API naming is reviewed before examples are written.

## Sprint 4: Webhook Developer Experience

Goal: Make webhook integration safe, typed, and easy to copy.

Stories:

1. As a developer, I want to verify Velo webhook signatures from raw request bodies.
2. As a developer, I want typed webhook events so fulfillment code can switch on event type.
3. As Velo, I want webhook verification to fail closed for malformed or replayed payloads.

Tasks:

- Export `velo.webhooks.verify()` and/or `Velo.webhooks.verify()`.
- Reuse the existing verification behavior from `packages/stellar/src/webhook.ts` where appropriate.
- Define public webhook event types:
  - `payment.created`
  - `payment.succeeded`
  - `payment.failed`
  - `payment.access_activated`
  - `contract.event`
- Document required headers:
  - `x-velo-signature`
  - `x-velo-event`
  - `x-velo-delivery`
- Add raw body examples for Next.js App Router and Express.
- Add tests for valid signature, missing header, malformed header, stale timestamp, wrong secret, and tampered payload.

Acceptance criteria:

- Webhook verification requires raw body input.
- Verification rejects stale timestamps and body tampering.
- Webhook secret usage is documented as server-only.
- Event payload types are stable and do not leak internal backend schema.

Exit gate:

- Webhook examples compile or typecheck where practical.
- Negative-path tests pass.

## Sprint 5: Examples, Docs, and Dashboard Snippet Migration

Goal: Make the alpha SDK trustworthy and fast to integrate.

Stories:

1. As a developer, I want a README that gets me to a checkout URL in minutes.
2. As a Next.js developer, I want an App Router example that keeps the API key server-side.
3. As an Express developer, I want a webhook and checkout example I can adapt directly.
4. As a Velo dashboard user, I want integration snippets to show the new SDK API.

Tasks:

- Write `packages/velo-sdk/README.md`.
- Add `examples/nextjs-app-router`.
- Add `examples/express`.
- Update dashboard integration snippets from `@repo/stellar` helper usage to the new SDK API.
- Document environment variables:
  - `VELO_API_KEY`
  - `VELO_WEBHOOK_SECRET`
  - optional `VELO_BASE_URL`
- Document idempotency usage.
- Document Testnet vs Mainnet behavior and alpha limitations.
- Add a changelog entry for `0.1.0-alpha.1`.

Acceptance criteria:

- README first example creates a checkout session with `new Velo({ apiKey })`.
- Examples keep API keys and webhook secrets server-side.
- Dashboard snippets match the SDK public API.
- Known alpha limitations are explicit.

Exit gate:

- A developer can follow docs to create checkout, redirect, retrieve status, and verify webhook.

## Sprint 6: Alpha Release Readiness

Goal: Validate the SDK end to end and prepare the alpha release.

Stories:

1. As Velo, I want proof that the SDK works against the hosted app API.
2. As a developer, I want package metadata and versioning that make the alpha status clear.
3. As a maintainer, I want a clean release checklist before publishing.

Tasks:

- Run live Testnet flow using the SDK:
  - create checkout session
  - redirect to hosted checkout
  - complete payment
  - retrieve paid status
  - receive and verify webhook
- Run package tests, backend tests, web tests, lint, and build.
- Verify package exports under Node 18+.
- Verify ESM/CJS strategy or explicitly document ESM-only alpha.
- Tag or prepare `@carts1024/velo-sdk@0.1.0-alpha.1`.
- Record release notes and remaining limitations.

Acceptance criteria:

- Live Testnet SDK flow succeeds.
- Webhook verification succeeds against an actual delivered event.
- All required checks pass or any exceptions are documented with owner and follow-up.
- Release notes state alpha support boundaries.

Exit gate:

- Product and architecture agree the SDK is ready for alpha use by early builders.

## Cross-Sprint Non-Goals

- React checkout components.
- Wallet connection SDK.
- Direct Stellar transaction builder expansion.
- Full event monitor SDK.
- Contract registry SDK.
- RPC gateway SDK.
- Analytics/dashboard SDK.

## Definition of Done

- SDK public API is typed and documented.
- API key scoping is enforced server-side.
- Idempotency is implemented for create calls.
- Retrieve and list endpoints exist and are tested.
- Webhook verification is exported, typed, and tested.
- Examples cover Next.js App Router and Express.
- Dashboard snippets use the new SDK.
- Live Testnet payment flow passes using SDK code.
- `pnpm build`, relevant tests, and `pnpm lint:fix` pass before handoff.

## Initial Implementation Order

1. Write the public API contract.
2. Implement idempotency and API-key-scoped retrieve/list routes.
3. Create `packages/velo-sdk`.
4. Implement typed client, errors, and request options.
5. Implement checkout/payment intent resources.
6. Implement webhook resource and event types.
7. Add examples and update dashboard snippets.
8. Run live Testnet validation and cut `0.1.0-alpha.1`.
