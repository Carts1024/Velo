# PRD Addendum: TalaKit Verify + Debug

## Source Context

This PRD was drafted from `README.md` and `FOLDER_STRUCTURE.md`. The repo currently has a Next.js web app, Convex backend package, shared UI package, and monorepo tooling with pnpm and Turbo.

## Technical Context Preserved Outside PRD

- Suggested frontend stack: Next.js, TypeScript, Tailwind CSS, shadcn/ui, Freighter wallet integration.
- Suggested backend stack: Node.js, Convex for hackathon MVP, Stellar SDK, Soroban RPC client.
- Suggested smart contract stack: Rust, Soroban SDK, Stellar Testnet.
- Future production storage options named in the README: PostgreSQL for indexed blockchain data, ClickHouse for request logs and analytics, Redis for queues, caching, and rate limiting.

## Architecture From README

```txt
Frontend Dashboard
   |
   v
Backend API / Worker
   |
   +--> Soroban Registry Contract
   |
   +--> Stellar RPC / Testnet RPC
   |
   +--> Event Monitor
   |
   +--> Transaction Debugger
   |
   +--> Webhook Delivery Worker
   |
   v
Database
```

## Soroban Contract Design From README

Contract name:

```txt
stellar_kit_registry
```

Core functions:

```txt
register_project(name, metadata_hash)
update_project(project_id, metadata_hash)
add_contract(project_id, contract_id)
remove_contract(project_id, contract_id)
transfer_ownership(project_id, new_owner)
deactivate_project(project_id)
get_project(project_id)
get_project_contracts(project_id)
```

Example model:

```rust
pub struct Project {
    pub id: u64,
    pub owner: Address,
    pub name: String,
    pub metadata_hash: BytesN<32>,
    pub active: bool,
    pub created_ledger: u32,
}
```

## Positioning Notes

The README positions the product as:

```txt
Sentry + Tenderly + verified project registry for Stellar developers
```

This is useful for pitch and demo framing, but the PRD requirements should stay focused on capabilities rather than marketing comparison.

## Deferred Detail For Architecture

- Exact metadata hash format and canonical metadata serialization.
- Whether registry data should support project slug uniqueness.
- Webhook signing, retries, idempotency keys, and backoff policy.
- Event ingestion strategy: live polling, scheduled sync, cursor-based indexing, or RPC gateway capture.
- Transaction XDR parsing requirements and supported transaction envelope versions.
- Network abstraction for Testnet, Futurenet, and Mainnet.
- Rate limits and abuse controls for public pages, debugger lookup, and webhooks.
