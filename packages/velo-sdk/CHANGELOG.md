# Changelog

All notable changes to the Velo SDK will be documented in this file.

## [Unreleased]

### Added

- Optional durable `PaymentIntent.correlationId` for end-to-end payment journey lookup.
- Optional `RequestOptions.traceparent` propagation for existing W3C traces.

## [0.1.0-alpha.2] - 2026-07-02

### Added

- **Velo Client**: Class-based SDK client (`Velo`) with simple initialization: `new Velo({ apiKey })`.
- **Checkout Sessions**: Creation of checkout links via `velo.checkout.sessions.create()`.
- **Payment Intents**: Retrieve and list payment intents with cursor pagination support and project scoping.
- **Webhook Verification**: Secure HMAC-SHA256 signature validation with clock skew/tolerance checking using `Velo.webhooks.verify()`.
- **Typed Errors**: Custom error classes (`VeloAPIError`, `VeloAuthError`, `VeloRateLimitError`, `VeloValidationError`) matching API status codes.
- **Idempotency**: Support for client-supplied `Idempotency-Key` headers on payment session creation.
- **E2E Tests**: End-to-end test suite verifying payment flows.

### Changed

- **Package Rename**: Renamed package from `@velo/sdk` to `@carts1024/velo-sdk` and updated examples and documentation.
