# TalaKit

**Verified developer infrastructure for Stellar and Soroban apps.**

StellarKit is a developer tooling platform that helps Stellar builders register, verify, monitor, and debug Soroban-powered applications.

It combines an on-chain Soroban project registry with an off-chain developer dashboard for transaction debugging, contract event monitoring, webhook delivery, and project verification.

> Free Stellar tools help developers access the network. StellarKit helps teams operate, monitor, and trust their Stellar apps.

---

## Problem

Building on Stellar is powerful, but production-ready developer workflows still require a lot of custom infrastructure.

Developers often need to answer questions like:

* Is this the official contract for this project?
* Who owns this app or contract?
* What happened in this transaction?
* Why did this transaction fail?
* What events did my contract emit?
* Did my backend receive the event notification?
* Can I monitor my app without manually polling Stellar RPC?

Today, teams often stitch together RPC calls, explorers, custom event indexers, databases, webhook workers, and debugging scripts.

StellarKit packages these missing workflow pieces into one developer platform.

---

## Solution

StellarKit provides a simple workflow for Soroban developers:

1. Create a StellarKit project.
2. Register the project on-chain through a Soroban registry contract.
3. Add official Soroban contract IDs to the project.
4. Monitor recent transactions and contract events.
5. Debug transaction hashes or XDR.
6. Configure webhooks for contract and transaction activity.
7. Share a public verified project page.

The goal is to make building on Stellar feel easier, safer, and more production-ready.

---

## Core Features

### 1. Soroban Project Registry

StellarKit includes a Soroban smart contract that acts as an on-chain registry for Stellar projects.

Developers can register project metadata and official contract IDs so users and other developers can verify which contracts belong to a project.

The registry stores lightweight trust data on-chain, including:

* Project ID
* Owner address
* Project name
* Metadata hash
* Official contract IDs
* Active status
* Created ledger

Full project details, webhook URLs, dashboard settings, and logs are stored off-chain.

### 2. Verified Project Pages

Each registered project gets a public verification page showing:

* Project name
* Owner wallet address
* Registered contract IDs
* Verification status
* Recent contract activity
* Project metadata

This helps reduce confusion around fake or incorrect contract addresses.

### 3. Transaction Debugger

Developers can paste a transaction hash or XDR and inspect what happened.

The debugger displays:

* Transaction status
* Operation breakdown
* Contract function calls
* Events emitted
* Fees and resource usage
* Failure reason, when available
* Human-readable debugging hints

### 4. Contract Event Monitor

StellarKit watches registered contracts and shows recent events in a readable dashboard.

Developers can filter events by:

* Project
* Contract ID
* Event type
* Transaction hash
* Ledger number

### 5. Webhooks

Developers can configure webhook URLs to receive notifications when Stellar activity happens.

Example webhook events:

* `contract.event`
* `transaction.succeeded`
* `transaction.failed`
* `project.registered`
* `project.updated`

Example payload:

```json
{
  "type": "contract.event",
  "projectId": "1",
  "contractId": "CDemoContract...",
  "eventName": "payment_received",
  "transactionHash": "abc123",
  "ledger": 123456,
  "data": {
    "from": "GABC...",
    "amount": "100"
  }
}
```

### 6. RPC Request Logs

StellarKit can act as a lightweight RPC gateway or request logger for selected Stellar RPC calls.

The dashboard can show:

* RPC method
* Timestamp
* Status
* Latency
* Project
* API key
* Error message

This gives developers more visibility into how their app interacts with Stellar.

---

## Why StellarKit?

Stellar already has excellent free tools, SDKs, RPC endpoints, and documentation. StellarKit is not meant to replace them.

Instead, StellarKit focuses on the workflow layer developers usually need after the basics:

| Need                                | Free Tools     | StellarKit           |
| ----------------------------------- | -------------- | -------------------- |
| Send transactions                   | Yes            | Yes                  |
| Read raw transaction data           | Yes            | Yes                  |
| Learn Stellar                       | Yes            | Not the main purpose |
| Register official project contracts | Manual         | Built-in             |
| Public verified project page        | Manual         | Built-in             |
| Friendly transaction debugging      | Limited        | Built-in             |
| Event monitoring dashboard          | Manual         | Built-in             |
| Webhooks                            | Build yourself | Built-in             |
| Project-level request logs          | Build yourself | Built-in             |
| Developer operations workflow       | Manual         | Built-in             |

StellarKit helps developers spend less time building internal infrastructure and more time building their actual product.

---

## Use Cases

### Soroban Developers

Register contracts, monitor events, and debug failed transactions from one dashboard.

### Hackathon Teams

Quickly create a verified project page, show official contract IDs, and demonstrate contract activity during judging.

### Payment Apps

Receive webhook notifications when payments, contract events, or transaction status changes happen.

### Wallets and Explorers

Use verified registry data to show which contracts officially belong to a project.

### Fintech Teams

Create audit-friendly logs for transaction activity, event delivery, and registered project metadata.

---

## Hackathon MVP Scope

For the Rise In x Stellar APAC Hackathon, the MVP focuses on **StellarKit Verify + Debug**.

### Smart Contract

* Soroban project registry
* Register project
* Update project metadata hash
* Add official contract ID
* Remove official contract ID
* Transfer ownership
* Deactivate project
* Read project details

### Web App

* Connect wallet
* Create project
* Register project on-chain
* Add official contract ID
* View project dashboard
* View public verified project page
* Lookup transaction hash
* Display recent contract events
* Configure webhook URL
* Show webhook delivery logs

### Optional MVP Features

* API key generation
* Basic RPC gateway
* Basic request logs
* Event filtering
* Simple error explanation engine

---

## Product Flow

```txt
Developer
   |
   v
Creates StellarKit project
   |
   v
Registers project through Soroban Registry Contract
   |
   v
Adds official Soroban contract IDs
   |
   v
StellarKit monitors transactions and events
   |
   v
Dashboard shows debugging, events, and webhook logs
   |
   v
Public project page proves official contracts
```

---

## Architecture

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

### On-chain Layer

The Soroban registry contract stores project ownership and contract verification data.

### Off-chain Layer

The backend stores dashboard data, webhook URLs, logs, API keys, and indexed events.

---

## Suggested Tech Stack

### Frontend

* Next.js
* TypeScript
* Tailwind CSS
* shadcn/ui
* Freighter wallet integration

### Backend

* Node.js
* Hono, Fastify, or Next.js API routes
* Stellar SDK
* Soroban RPC client

### Smart Contract

* Rust
* Soroban SDK
* Stellar Testnet

### Database

For hackathon MVP:

* Convex

For future production:

* PostgreSQL for indexed blockchain data
* ClickHouse for request logs and analytics
* Redis for queues, caching, and rate limiting

---

## Soroban Contract Design

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

Example project model:

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

---

## Demo Scenario

The hackathon demo follows a simple developer journey:

1. A developer creates a project called `DemoPay`.
2. The developer connects a Stellar wallet.
3. The project is registered on-chain through the Soroban registry.
4. The developer adds the official `DemoPay` contract ID.
5. StellarKit shows a public verified project page.
6. A sample transaction is submitted or looked up.
7. StellarKit displays the transaction status and emitted events.
8. A webhook notification is delivered to the developer backend.
9. The dashboard shows the webhook delivery log.

---

## Local Development

> Setup instructions will be updated as the project implementation progresses.

### Prerequisites

* Node.js
* pnpm or npm
* Rust
* Stellar CLI
* Soroban-compatible wallet such as Freighter

### Install dependencies

```bash
pnpm install
```

### Run frontend

```bash
pnpm dev
```

### Build Soroban contract

```bash
stellar contract build --manifest-path contracts/registry/Cargo.toml
```

### Deploy Soroban contract

```bash
stellar contract deploy \
  --wasm contracts/registry/target/wasm32v1-none/release/talakit_registry.wasm \
  --source-account <SOURCE_ACCOUNT> \
  --network testnet
```

---

## Roadmap

### Phase 1: Hackathon MVP

* Soroban project registry
* Wallet connection
* Project dashboard
* Official contract linking
* Public verified project page
* Basic transaction lookup
* Basic event monitor
* Simple webhook demo

### Phase 2: Developer Beta

* API keys
* RPC gateway
* Request logs
* Better transaction debugging
* Webhook retries
* Event filters
* Team projects

### Phase 3: Production Platform

* Hosted reliable RPC
* Advanced indexer APIs
* Long-term event history
* Usage analytics
* Billing
* Dedicated endpoints
* SLA and alerting

---

## Positioning

StellarKit is not a replacement for Stellar SDKs, Stellar Laboratory, or public RPC endpoints.

It is the developer operations layer for Stellar apps.

Think of it as:

```txt
Sentry + Tenderly + verified project registry for Stellar developers
```

---

## License

MIT

---

## Team

Built for the Rise In x Stellar APAC Hackathon.

Project name: **StellarKit**

Tagline: **Verified developer infrastructure for Stellar apps.**


CBSR5LFHR5Q2X3PO3HSMGXI43YEUYGFTHUPGNVGW6XH2VNOQUEUHIEJR