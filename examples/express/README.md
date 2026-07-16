# Velo SDK Express Server Example

This is a simple server application showing how to integrate `@carts1024/velo-sdk` into an Express application.

## Prerequisites

- Node.js >= 18
- pnpm

## Setup

1. Create a `.env` file from `.env.example` and set variables:

```bash
cp .env.example .env
```

Create two keys in the local dashboard at http://localhost:3000:

- Scope one key to **In-house** and assign it to `VELO_INHOUSE_API_KEY`.
- Scope the other key to **PDAX** and assign it to `VELO_PDAX_API_KEY`.
- Do not reuse the same key for both variables. Both values stay server-side and must start with `tk_live_`.

Set `VELO_ENV=development` when using the local Velo API. Each checkout request must specify `anchor` as `"inhouse"` or `"pdax"`; the server selects the corresponding API key before creating the SDK client.

2. Run the application:

```bash
pnpm install
pnpm dev
```

The server will be running on `http://localhost:3001`.

## Key Integration Details

- **Checkout Creation**: Defined in [server.ts](file:///home/carts/Documents/Personal/Velo/examples/express/server.ts), utilizing the `velo.checkout.sessions.create` method with a dedicated In-house or PDAX API key.
- **Webhook Signature Verification**: Defined in [server.ts](file:///home/carts/Documents/Personal/Velo/examples/express/server.ts#L43-L78). Webhook endpoint captures the raw request text using the `express.raw` parser and verifies it securely via `Velo.webhooks.verify` to protect against request spoofing.
