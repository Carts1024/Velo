# Sprint 6 Playground Project Integration

Status: **IMPLEMENTED AND DETERMINISTICALLY TESTED — PLAYWRIGHT/LIVE
QUALIFICATION PENDING**

## Boundaries

The anonymous `/playground` remains local-first and backward-compatible. An
authenticated project context adds persistence without changing Sprint 5 rate limits,
redaction, exact-XDR review, refresh recovery, or Mainnet simulation-only behavior.
Every project operation re-authorizes the normalized wallet address in Convex; UI
state is never an authorization boundary.

`projectContracts` continues to represent Testnet registry links. Playground contracts
are stored independently by project, network, and contract ID.

| Capability | Owner | Editor | Viewer |
| --- | --- | --- | --- |
| Read, resolve, simulate, invoke, inspect Logs | Yes | Yes | Yes |
| Contracts, requests, variables, shares, filters | Yes | Yes | No |
| Membership and role administration | Yes | No | No |

Existing `projects.ownerAddress` remains authoritative and is treated as an owner
membership without requiring a destructive migration. Additional memberships are
stored separately and may be revoked immediately.

## Persistence and privacy

Saved requests point to an immutable current version. Updates append a version and
duplicates create a distinct request. Only canonical argument templates, source
strategy, settings, tags, contract identity, Wasm hash, timestamps, and authors are
stored.

Variables are non-secret, network-specific typed leaves. `$variable` references are
resolved only for the selected network. Simulation resolves again server-side and
must match the authenticated preview hash.

The web server, not the browser, signs bounded execution outcomes with
`VELO_PLAYGROUND_PERSISTENCE_SECRET`. Stored evidence excludes XDR, signatures,
authorization envelopes, raw RPC bodies, private keys, seeds, and unrestricted
decoded output. Executions expire after 30 days through an indexed hourly cleanup.

One journey correlation ID links simulations, invocations, transaction polling,
stored executions, observed contract events, lifecycle stages, and webhook
deliveries. Idempotency keys prevent retry and refresh duplicates.

## Sharing and webhook review

Private project shares are the default and exclude arguments. Public-unlisted shares
default to 30 days; including arguments requires an explicit checkbox, a second
confirmation, and server-side scanning. Variable references and private metadata are
never published. Every recipient reloads the current contract and performs a fresh
simulation.

Event-derived webhook filters are stored separately from the single endpoint.
Creating one opens the existing webhook settings page with authorized evidence as a
prefill. The endpoint, topics, decoded data, signing setup, enabled state, and filter
must still be reviewed and saved. Matching happens before enqueue while the existing
idempotency, retry, and dead-letter pipeline remains unchanged.

