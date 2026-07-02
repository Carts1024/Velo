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

Make sure `VELO_API_KEY` starts with `tk_live_` (generated from local dashboard at http://localhost:3000) and `VELO_ENV=development`.

2. Run the application:

```bash
pnpm install
pnpm dev
```

The application will be accessible at `http://localhost:3001` or `http://localhost:3002` (if port 3000/3001 are occupied).

## Key Files

- [app/api/checkout/route.ts](file:///home/carts/Documents/Personal/Velo/examples/nextjs-app-router/app/api/checkout/route.ts): API route that instantiates the `Velo` client and creates payment intent checkout sessions securely on the server.
- [app/api/webhook/route.ts](file:///home/carts/Documents/Personal/Velo/examples/nextjs-app-router/app/api/webhook/route.ts): Route handler demonstrating raw request body capturing and secure webhook verification via `Velo.webhooks.verify`.
