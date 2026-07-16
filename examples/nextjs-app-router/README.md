# Velo SDK Next.js App Router Example

This is a simple demo application showing how to integrate `@carts1024/velo-sdk` into a Next.js App Router application.

## Prerequisites

- Node.js >= 18
- pnpm

## Setup

1. Create a `.env.local` file from `.env.example` and set variables:

```bash
cp .env.example .env.local
```

Create two keys in the local dashboard at http://localhost:3000:

- Scope one key to **In-house** and assign it to `VELO_INHOUSE_API_KEY`.
- Scope the other key to **PDAX** and assign it to `VELO_PDAX_API_KEY`.
- Do not reuse the same key for both variables. Both values stay server-side and must start with `tk_live_`.

Set `VELO_ENV=development` when using the local Velo API. The checkout route selects the matching SDK client from the requested anchor, so an in-house request is never authenticated with the PDAX-scoped key (or vice versa).

2. Run the application:

```bash
pnpm install
pnpm dev
```

The example runs at `http://localhost:3005`.

## Key Files

- [app/api/checkout/route.ts](file:///home/carts/Documents/Personal/Velo/examples/nextjs-app-router/app/api/checkout/route.ts): API route that instantiates the `Velo` client and creates payment intent checkout sessions securely on the server.
- [app/api/webhook/route.ts](file:///home/carts/Documents/Personal/Velo/examples/nextjs-app-router/app/api/webhook/route.ts): Route handler demonstrating raw request body capturing and secure webhook verification via `Velo.webhooks.verify`.
