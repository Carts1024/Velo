---
title: "Sprint 0 Readiness Decisions"
status: accepted
created: 2026-06-13
updated: 2026-07-01
project_name: Velo
---

# Sprint 0 Readiness Decisions

These decisions close the implementation blockers for Phase 1 Sprint 0. They can be revisited later, but development should proceed with these defaults unless the product owner changes them.

## Accepted Defaults

| Decision | Sprint 0 Default | Rationale |
| --- | --- | --- |
| Public product name | Velo | Matches repo name and current planning artifacts. |
| First wallet target | Freighter | Narrowest path for Stellar/Soroban hackathon MVP. |
| Network | Stellar Testnet only | Keeps deployment, RPC, and UX states bounded. |
| Transaction debugger input | Transaction hash required; XDR deferred | Hash lookup is enough for Phase 1 acceptance. |
| Public verification route | `/verify/[slug]` | Matches UX spec and architecture route map. |
| Webhook signing | Deferred | Not required for hackathon demo. |
| Webhook retries | Deferred | Delivery logs matter more than production retry semantics in Phase 1. |
| API keys / RPC gateway / request logs | Deferred | Explicitly optional and not on the core Verify + Debug path. |

## Environment Contract

The web app centralizes Phase 1 Testnet configuration in `apps/web/core/config/stellar.ts`, backed by `apps/web/core/config/env.ts`.

Required now:

- `NEXT_PUBLIC_CONVEX_URL`

Optional or defaulted for local development:

- `NEXT_PUBLIC_CONVEX_SITE_URL`
- `NEXT_PUBLIC_STELLAR_NETWORK=testnet`
- `NEXT_PUBLIC_STELLAR_RPC_URL=https://soroban-testnet.stellar.org`
- `NEXT_PUBLIC_VELO_REGISTRY_CONTRACT_ID`
- `NEXT_PUBLIC_VELO_PAY_ACCESS_CONTRACT_ID`

Hosted deployments must set both public contract IDs and should enable the guardrail with `VELO_REQUIRE_CONTRACT_IDS=true` unless the hosting platform sets `VERCEL_ENV=production`.

Backend/Convex contract IDs:

- `STELLAR_RPC_URL` is preferred backend-side; `NEXT_PUBLIC_STELLAR_RPC_URL` remains a compatibility fallback.
- `VELO_PAY_ACCESS_CONTRACT_ID` is the canonical Convex/backend pay-access sync variable.
- `NEXT_PUBLIC_VELO_PAY_ACCESS_CONTRACT_ID` is retained only as a local compatibility fallback for Convex.

Current Testnet contract IDs:

```txt
NEXT_PUBLIC_VELO_REGISTRY_CONTRACT_ID=CBSR5LFHR5Q2X3PO3HSMGXI43YEUYGFTHUPGNVGW6XH2VNOQUEUHIEJR
NEXT_PUBLIC_VELO_PAY_ACCESS_CONTRACT_ID=CBHDLZYSYWETHPC6KDGH35S4SNBU5P7QWLNNDWYXJRHZMZDTQSKYVOXJ
VELO_PAY_ACCESS_CONTRACT_ID=CBHDLZYSYWETHPC6KDGH35S4SNBU5P7QWLNNDWYXJRHZMZDTQSKYVOXJ
```

## Route Contract

Sprint 0 placeholder routes are:

```txt
/
/dashboard
/projects/new
/projects/[projectId]
/projects/[projectId]/contracts
/projects/[projectId]/events
/projects/[projectId]/webhooks
/debug
/verify/[slug]
```

These routes intentionally use placeholder screens. Product behavior is added in later sprints.

## Shared UI Contract

The web app should import shared UI primitives from `@repo/ui` concrete source paths, for example:

```ts
import { Button } from "@repo/ui/components/ui/button";
import { Table } from "@repo/ui/components/ui/table";
import { Badge } from "@repo/ui/components/ui-customs/badge";
```

Velo-specific compositions should live under `apps/web/features/*`.
