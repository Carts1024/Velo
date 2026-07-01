# Velo SDK Alpha Contract

Status: Sprint 0 contract freeze candidate  
Version target: `@velo/sdk@0.1.0-alpha.1`  
Source sprint: `docs/prds/prd-velo-sdk/sdk-sprint-plan.md`

## Purpose

This document is the canonical alpha contract for the public Velo SDK and the SDK-facing REST API. Backend routes and SDK methods must target this behavior before alpha release work continues.

Sprint 0 is a documentation and contract freeze only. It does not create `packages/velo-sdk`, change runtime code, edit Convex schema, or regenerate generated files.

## SDK Identity

- Package name: `@velo/sdk`
- Future package location: `packages/velo-sdk`
- Import path:

```ts
import { Velo } from "@velo/sdk";
```

- Runtime support: Node.js `>=18`, server-side alpha only
- Browser SDK support: excluded for alpha
- Release version target: `0.1.0-alpha.1`

The target developer journey is:

```ts
const velo = new Velo({ apiKey: process.env.VELO_API_KEY! });

const { checkoutUrl } = await velo.checkout.sessions.create({
  amount: "10.00",
  asset: "USDC",
  description: "Order #1001",
});
```

The SDK must not expose Convex document shapes, Convex IDs as implementation details beyond public payment intent identifiers, dashboard-owner-only query paths, or `projectId` inputs.

## Project Scope and Authentication

Every SDK-facing API request is authenticated with a Velo API key. The API key implies the project scope server-side.

Rules:

- SDK callers never pass `projectId`.
- Public REST routes must resolve project scope from the API key.
- Cross-project access must fail closed.
- Revoked, malformed, or missing API keys return the normalized auth error envelope.

## Payment Intent Object

The public payment intent object is the stable REST and SDK representation. It intentionally omits internal Convex fields and dashboard-only data.

```ts
type PaymentIntent = {
  id: string;
  object: "payment_intent";
  paymentIntentId: string;
  status: "created" | "pending" | "paid" | "failed" | "expired" | "cancelled";
  amount: string;
  asset: string;
  description: string | null;
  checkoutUrl: string | null;
  successUrl: string | null;
  cancelUrl: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};
```

Timestamp fields are ISO 8601 strings in public responses.

## Create Payment Intent

Endpoint:

```http
POST /api/v1/payment-intents
Authorization: Bearer <VELO_API_KEY>
Content-Type: application/json
Idempotency-Key: <optional-client-key>
```

Request:

```ts
type CreatePaymentIntentRequest = {
  amount: string;
  asset?: string;
  description?: string;
  successUrl?: string;
  cancelUrl?: string;
};
```

Success response: `201 Created`

```json
{
  "id": "pi_...",
  "object": "payment_intent",
  "paymentIntentId": "pi_...",
  "status": "created",
  "amount": "10.00",
  "asset": "USDC",
  "description": "Order #1001",
  "checkoutUrl": "https://app.velo.example/pay/pi_...",
  "successUrl": "https://merchant.example/success",
  "cancelUrl": "https://merchant.example/cancel",
  "expiresAt": "2026-07-01T00:30:00.000Z",
  "createdAt": "2026-07-01T00:00:00.000Z",
  "updatedAt": "2026-07-01T00:00:00.000Z"
}
```

SDK method:

```ts
await velo.checkout.sessions.create(
  {
    amount: "10.00",
    asset: "USDC",
    description: "Order #1001",
  },
  {
    idempotencyKey: "order-1001-checkout",
  },
);
```

`velo.paymentIntents.create(...)` may be exposed as the lower-level alias in a later sprint, but `checkout.sessions.create(...)` is the primary alpha developer path.

## Retrieve Payment Intent

Endpoint:

```http
GET /api/v1/payment-intents/:id
Authorization: Bearer <VELO_API_KEY>
```

Success response: `200 OK`

Returns the same `PaymentIntent` object shape as create.

Rules:

- The `:id` value is a public payment intent identifier.
- The payment intent must belong to the project implied by the API key.
- Missing, malformed, or cross-project IDs return the normalized not-found error envelope.

## List Payment Intents

Endpoint:

```http
GET /api/v1/payment-intents?status=paid&limit=20&cursor=opaque_cursor
Authorization: Bearer <VELO_API_KEY>
```

Query parameters:

```ts
type ListPaymentIntentsQuery = {
  status?: PaymentIntent["status"];
  limit?: number;
  cursor?: string;
};
```

Pagination:

- Cursor-based only.
- Default `limit`: `20`
- Maximum `limit`: `100`
- `cursor` is opaque.
- Sort order: newest first by `createdAt`.
- `hasMore` is authoritative.
- `nextCursor` is `null` when no next page exists.

Success response: `200 OK`

```json
{
  "object": "list",
  "data": [
    {
      "id": "pi_...",
      "object": "payment_intent",
      "paymentIntentId": "pi_...",
      "status": "paid",
      "amount": "10.00",
      "asset": "USDC",
      "description": "Order #1001",
      "checkoutUrl": "https://app.velo.example/pay/pi_...",
      "successUrl": "https://merchant.example/success",
      "cancelUrl": "https://merchant.example/cancel",
      "expiresAt": "2026-07-01T00:30:00.000Z",
      "createdAt": "2026-07-01T00:00:00.000Z",
      "updatedAt": "2026-07-01T00:05:00.000Z"
    }
  ],
  "hasMore": false,
  "nextCursor": null
}
```

## Error Envelope

All SDK-facing REST errors use one normalized envelope.

```ts
type VeloErrorResponse = {
  error: {
    type:
      | "auth_error"
      | "validation_error"
      | "not_found_error"
      | "idempotency_error"
      | "rate_limit_error"
      | "api_error";
    code: string;
    message: string;
    param?: string;
    requestId?: string;
  };
};
```

Status mapping:

| HTTP status | Type | Example code |
| --- | --- | --- |
| `400` | `validation_error` | `invalid_request` |
| `401` | `auth_error` | `invalid_api_key` |
| `404` | `not_found_error` | `payment_intent_not_found` |
| `409` | `idempotency_error` | `idempotency_key_conflict` |
| `429` | `rate_limit_error` | `rate_limit_exceeded` |
| `500` | `api_error` | `internal_error` |

Example:

```json
{
  "error": {
    "type": "validation_error",
    "code": "invalid_request",
    "message": "amount is required and must be positive.",
    "param": "amount",
    "requestId": "req_..."
  }
}
```

Response headers:

- `X-Request-Id` should be present when available.
- `Retry-After` should be present on `429` responses when available.
- Existing rate-limit headers should be preserved.

## Idempotency

`POST /api/v1/payment-intents` supports idempotency through the `Idempotency-Key` request header.

Rules:

- The idempotency scope is project plus key.
- Same project, same key, and same normalized request body returns the original compatible response.
- Same project and same key with a different normalized request body returns `409 idempotency_error`.
- Different projects may use the same idempotency key independently.
- Missing `Idempotency-Key` remains allowed for alpha unless a later contract revision tightens this.
- Stored idempotency responses must not leak internal project or Convex fields.

SDK behavior:

- SDK create methods accept `{ idempotencyKey?: string }` request options.
- The SDK sends `Idempotency-Key` when provided.
- Automatic SDK-generated idempotency keys are out of scope for Sprint 0 and must be decided before implementation if added.

## Webhook Verification Contract

The alpha SDK preserves the current webhook contract.

Headers:

```http
x-velo-signature: t=<unix_seconds>,v1=<hex_hmac_sha256>
x-velo-event: payment.succeeded
x-velo-delivery: <delivery_id>
```

Signature rules:

- Signature payload: `${timestamp}.${rawBody}`
- Algorithm: HMAC-SHA256
- Secret: project-scoped webhook signing secret
- Default timestamp tolerance: 5 minutes
- Verification requires the raw request body.
- Verification fails closed for missing headers, malformed signature headers, stale timestamps, wrong secrets, tampered payloads, or invalid JSON payloads.

SDK-facing verification target:

```ts
const event = await velo.webhooks.verify({
  payload: rawBody,
  signature: request.headers.get("x-velo-signature"),
  secret: process.env.VELO_WEBHOOK_SECRET!,
});
```

Webhook event names preserved for alpha:

- `payment.created`
- `payment.succeeded`
- `payment.failed`
- `payment_access.activated`
- `contract.event`

Additional existing event names may remain available for dashboard/webhook settings, but the SDK alpha documentation should focus on payment and contract events only.

## Alpha Exclusions

The alpha SDK contract explicitly excludes:

- Wallet connection SDK
- SDK-managed Stellar wallet operations
- React checkout components
- Registry SDK
- Analytics SDK
- Refunds
- Disputes
- Subscriptions
- Partial captures
- Browser SDK support
- Public Convex API exposure
- Dashboard-owner-only API routes
- Webhook replay API
- Multi-project API-key switching
- Stable semver guarantees before `1.0`

## Sprint 0 Review Checklist

- Create, retrieve, list, webhook, error, pagination, and idempotency contracts are present.
- API-key project scoping is explicit.
- SDK callers never pass `projectId`.
- Alpha exclusions are documented in one section.
- Existing webhook headers and event names are preserved.
- Response shapes avoid Convex internals.
- Sprint 1+ implementation tickets can be estimated without unresolved API-shape questions.

## Exit Gate

Product and architecture must review this contract before backend route hardening or SDK release work continues.
