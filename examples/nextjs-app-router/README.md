# Velo SDK Next.js App Router Example

This is a simple demo application showing how to integrate `@velo/sdk` into a Next.js App Router application.

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

The application will be accessible at `http://localhost:3000`.

## Key Files

- [app/api/checkout/route.ts](file:///home/carts/Documents/Personal/Velo/examples/nextjs-app-router/app/api/checkout/route.ts): API route that instantiates the `Velo` client and creates payment intent checkout sessions securely on the server.
- [app/api/webhook/route.ts](file:///home/carts/Documents/Personal/Velo/examples/nextjs-app-router/app/api/webhook/route.ts): Route handler demonstrating raw request body capturing and secure webhook verification via `Velo.webhooks.verify`.
