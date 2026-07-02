# Velo SDK Express Server Example

This is a simple server application showing how to integrate `@carts1024/velo-sdk` into an Express application.

## Prerequisites

- Node.js >= 18
- pnpm

## Setup

1. Copy the environment variables template and configure them:

```bash
# Set your keys
export VELO_API_KEY="tk_test_..."
export VELO_WEBHOOK_SECRET="whsec_..."
```

2. Run the application:

```bash
pnpm install
pnpm dev
```

The server will be running on `http://localhost:3001`.

## Key Integration Details

- **Checkout Creation**: Defined in [server.ts](file:///home/carts/Documents/Personal/Velo/examples/express/server.ts#L20-L40), utilizing the `velo.checkout.sessions.create` method.
- **Webhook Signature Verification**: Defined in [server.ts](file:///home/carts/Documents/Personal/Velo/examples/express/server.ts#L43-L78). Webhook endpoint captures the raw request text using the `express.raw` parser and verifies it securely via `Velo.webhooks.verify` to protect against request spoofing.
