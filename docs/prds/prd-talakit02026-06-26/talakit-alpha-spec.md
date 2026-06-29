# Velo Alpha Specification

## 1. Product Overview

**Velo Alpha** is an all-in-one developer operations platform for Stellar smart contract developers and builders.

It provides:

- Verified project registration using Soroban smart contracts
- Inter-contract smart contract architecture
- RPC gateway with project-level API keys and request logs
- Contract event indexer for registered projects
- Transaction debugger for Stellar/Soroban transactions
- Webhook system for contract and transaction events
- Mobile-responsive developer dashboard

### One-line pitch

> Velo is the all-in-one developer platform for Stellar builders: verified project registry, RPC gateway, contract event indexer, transaction debugger, and webhooks in one place.

### Alpha goal

The alpha version should move Velo from a hackathon MVP into a production-ready MVP that smart contract developers can actually use to manage, monitor, and debug their Stellar applications.

---

## 2. Mandatory Requirements

The alpha version must satisfy the following requirements:

- Build a fully functional production-ready MVP
- Stable frontend architecture
- Stable smart contract architecture
- Mobile responsive UI
- Proper loading states
- Proper error handling
- Inter-contract calls using 2 or more smart contracts
- Working RPC gateway
- Working contract event indexer
- Working transaction debugger
- Working webhook configuration and delivery logs

---

## 3. Target Users

Velo Alpha is for:

- Stellar smart contract developers
- Soroban builders
- Hackathon teams building on Stellar
- Stablecoin and payment app developers
- Wallet developers
- DeFi builders on Stellar
- Teams that need project verification, event monitoring, and transaction debugging

---

## 4. Core Product Flow

```txt
Developer connects wallet
    ↓
Creates a Velo project
    ↓
Registers the project on-chain using the Velo Registry contract
    ↓
Activates project access using the Velo AccessPass contract
    ↓
AccessPass calls Registry to verify the project exists and is active
    ↓
Developer receives or generates an API key
    ↓
Developer adds official Stellar/Soroban contract IDs
    ↓
Velo indexes events from those registered contracts
    ↓
Developer views events and transaction details in the dashboard
    ↓
Developer configures webhooks
    ↓
Velo sends webhook notifications when contract or transaction events happen
```

---

## 5. Alpha Feature Set

## 5.1 Wallet Connection

Users must be able to connect a Stellar wallet.

Recommended wallet:

- Freighter

Required states:

- Not connected
- Connecting
- Connected
- Connection rejected
- Wrong network
- Wallet unavailable

Required UI behavior:

- Show wallet address after connection
- Show active network
- Disable smart contract actions if wallet is not connected
- Show clear error messages when connection fails

---

## 5.2 Project Dashboard

Developers must be able to create and manage Velo projects.

Project fields:

- Project ID
- Project name
- Description
- Website URL
- GitHub URL
- Owner wallet address
- Network: testnet/mainnet
- Metadata hash
- Verification status
- Active/inactive status
- Created timestamp
- Registered ledger, if available

Dashboard should show:

- Project cards
- Project status
- Registered contract count
- Recent events
- Recent transactions
- API key status
- Webhook status

Required states:

- Loading projects
- No projects yet
- Project creation loading
- Project creation failed
- Project created successfully

---

## 5.3 Soroban Smart Contract Architecture

The alpha must include at least 2 smart contracts with inter-contract calls.

Recommended contracts:

1. `VeloRegistry`
2. `VeloAccessPass`

The inter-contract call must be meaningful and related to the product.

### Inter-contract requirement

`VeloAccessPass` must call `VeloRegistry` to verify that a project exists and is active before activating access for the project.

Example flow:

```txt
User calls VeloAccessPass.activate_access(project_id)
    ↓
VeloAccessPass calls VeloRegistry.get_project(project_id)
    ↓
Registry returns project data
    ↓
AccessPass checks if project is active
    ↓
AccessPass activates access for the project
```

---

## 5.4 Smart Contract 1: VeloRegistry

### Purpose

The Registry contract stores the on-chain identity and verification layer for Velo projects.

It proves:

- A project exists
- A wallet owns the project
- The project has official contract IDs
- The project metadata hash was registered on-chain
- The project is active or inactive

### Core functions

```rust
register_project(name, metadata_hash)
update_project(project_id, metadata_hash)
add_contract(project_id, contract_id)
remove_contract(project_id, contract_id)
set_project_status(project_id, status)
transfer_ownership(project_id, new_owner)
get_project(project_id)
get_project_contracts(project_id)
is_project_active(project_id)
```

### On-chain project data

```txt
Project {
  id: u64,
  owner: Address,
  name: String,
  metadata_hash: BytesN<32>,
  active: bool,
  verified: bool,
  created_ledger: u32
}
```

### Contract list data

```txt
ProjectContracts {
  project_id: u64,
  contract_ids: Vec<Address or BytesN<32>>
}
```

### Required checks

- Only the project owner can update metadata
- Only the project owner can add or remove contract IDs
- Only the project owner can deactivate the project
- Contract IDs must not be duplicated for the same project
- Project must exist before adding contracts

---

## 5.5 Smart Contract 2: VeloAccessPass

### Purpose

The AccessPass contract manages access activation, developer credits, or alpha usage rights for registered Velo projects.

It exists to satisfy the inter-contract call requirement in a way that is useful to the product.

### Core functions

```rust
activate_access(project_id)
consume_credit(project_id, amount)
get_access_status(project_id)
get_project_credits(project_id)
deactivate_access(project_id)
```

### Required inter-contract behavior

Before access is activated, this contract must call the Registry contract.

Pseudo-flow:

```rust
fn activate_access(env: Env, project_id: u64) {
    let project = registry_client.get_project(&project_id);

    if !project.active {
        panic!("Project is not active");
    }

    // Activate access for this project
}
```

### AccessPass data

```txt
AccessPass {
  project_id: u64,
  active: bool,
  credits: u64,
  activated_at_ledger: u32
}
```

### Required checks

- Project must exist in Registry
- Project must be active
- Only project owner should be able to activate access
- Access status should be queryable by project ID

---

## 5.6 Official Contract ID Management

Developers must be able to add official Soroban contract IDs to a registered project.

Purpose:

- Prevent contract spoofing
- Help users identify official project contracts
- Allow Velo to know which contracts to index
- Connect events and transactions back to a verified project

Required UI:

- Add contract ID form
- Contract ID list
- Remove contract action
- Copy contract ID button
- Contract status badge

Required validation:

- Contract ID cannot be empty
- Contract ID must match expected Stellar/Soroban format
- Contract ID must not already exist under the project
- User must own the project

---

## 5.7 Public Verified Project Page

Each registered project should have a public page.

Example route:

```txt
/projects/:projectId
```

Page should display:

- Project name
- Description
- Owner wallet address
- Network
- Official contract IDs
- Metadata hash
- On-chain registration status
- Active/inactive status
- Verification badge
- Recent contract events
- Recent transactions

Purpose:

- Let users verify official contracts
- Let developers share a trusted project page
- Give judges and users a simple way to understand the product

Required states:

- Loading project
- Project not found
- Failed to load on-chain data
- No contracts added yet
- No events found yet

---

## 5.8 RPC Gateway Alpha

Velo Alpha should include a working RPC gateway.

Example endpoint:

```txt
https://rpc.velo.xyz/testnet/YOUR_API_KEY
```

For alpha, testnet support is enough.

### Required features

- API key authentication
- Forward selected JSON-RPC requests to Stellar RPC
- Log request method
- Log request timestamp
- Log response status
- Log latency
- Log project ID
- Log API key ID, not the raw API key
- Log errors
- Basic rate limiting
- Health check endpoint

### Recommended supported RPC methods

Start with methods useful for debugging and contract activity:

```txt
getHealth
getLatestLedger
getTransaction
sendTransaction
simulateTransaction
getEvents
getLedgerEntries
```

### Dashboard logs

Show:

- Method
- Status
- Latency
- Timestamp
- Project
- Error message, if failed

Required states:

- Loading logs
- No requests yet
- RPC request failed
- Unauthorized API key
- Rate limit exceeded

---

## 5.9 API Keys

Each project should support API keys for RPC and API usage.

### Required features

- Generate API key
- Show API key only once
- Store only hashed API key
- Revoke API key
- Show last used timestamp
- Show request count

### Required fields

```txt
APIKey {
  id: string,
  project_id: string,
  key_hash: string,
  label: string,
  created_at: Date,
  last_used_at: Date | null,
  revoked: bool
}
```

### Security requirements

- Never store raw API keys
- Never display key again after creation
- Never expose key in logs
- Use environment variables for backend secrets

---

## 5.10 Contract Event Indexer Alpha

The indexer should ingest contract events from registered project contracts.

For alpha, do not index the whole Stellar network.

Only index:

- Projects registered in Velo
- Contract IDs added to those projects

### Indexer responsibilities

- Read registered project contract IDs
- Poll Stellar RPC `getEvents`
- Store contract events in database
- Link events to project ID
- Link events to contract ID
- Store transaction hash
- Store ledger number
- Store timestamp
- Store event topics
- Store event payload
- Track last processed ledger

### Event data model

```txt
ContractEvent {
  id: string,
  project_id: string,
  contract_id: string,
  transaction_hash: string,
  ledger: number,
  timestamp: Date,
  event_type: string,
  topics: JSON,
  payload: JSON,
  raw_event: JSON
}
```

### Event API endpoints

```txt
GET /api/projects/:projectId/events
GET /api/contracts/:contractId/events
GET /api/transactions/:hash/events
GET /api/events?projectId=&contractId=&eventType=
```

### Dashboard features

- Recent events table
- Filter by contract ID
- Filter by event type
- Filter by transaction hash
- Event detail modal/page
- Raw event view
- Decoded event view, if possible

Required states:

- Loading events
- No events found
- Failed to fetch events
- Invalid contract ID

---

## 5.11 Transaction Debugger V2

The transaction debugger should help developers understand Stellar/Soroban transactions.

### Inputs

- Transaction hash
- XDR, optional
- Contract ID, optional
- Project ID, optional

### Output

- Transaction status
- Ledger number
- Source account
- Fee
- Created timestamp
- Operations
- Contract invoked
- Events emitted
- Error code
- Human-readable explanation
- Suggested fix
- Raw response toggle

### Common error explanations

Include explanations for:

- Missing authorization
- Insufficient balance
- Invalid sequence number
- Transaction expired
- Resource limit exceeded
- Contract not found
- Simulation failed
- Host error
- RPC unavailable

### Example error explanation

```txt
Status: Failed
Reason: Missing authorization
Suggested fix: Make sure the required wallet signs the transaction. If this is a Soroban invocation, run simulation first, assemble the transaction using the simulation result, then sign with the required account.
```

Required states:

- Waiting for transaction hash
- Loading transaction
- Transaction not found
- Invalid transaction hash
- Failed to fetch transaction
- Transaction pending
- Transaction failed
- Transaction successful

---

## 5.12 Webhooks Alpha

Developers should be able to configure webhooks for project events.

### Supported webhook events

```txt
contract.event
transaction.succeeded
transaction.failed
project.registered
contract.added
access.activated
```

### Required webhook features

- Add webhook URL
- Enable/disable webhook
- Generate webhook secret
- Sign webhook payloads
- Test webhook button
- Delivery logs
- Retry failed webhook

### Webhook configuration model

```txt
WebhookEndpoint {
  id: string,
  project_id: string,
  url: string,
  secret_hash: string,
  enabled: bool,
  event_types: string[],
  created_at: Date
}
```

### Webhook delivery model

```txt
WebhookDelivery {
  id: string,
  webhook_id: string,
  project_id: string,
  event_type: string,
  payload: JSON,
  status: "delivered" | "failed" | "pending",
  http_status: number | null,
  response_time_ms: number | null,
  retry_count: number,
  created_at: Date
}
```

### Example webhook payload

```json
{
  "type": "contract.event",
  "projectId": "1",
  "contractId": "CDemoPay...",
  "eventName": "payment_sent",
  "transactionHash": "abc123",
  "ledger": 123456,
  "timestamp": "2026-06-26T00:00:00.000Z",
  "data": {
    "from": "GABC...",
    "amount": "100"
  }
}
```

Required states:

- Creating webhook
- Testing webhook
- Webhook delivered
- Webhook failed
- Invalid webhook URL
- Webhook disabled

---

## 5.13 Smart Contract Explorer for Registered Projects

Each registered project contract should have a contract detail page.

Page should show:

- Contract ID
- Linked project
- Owner
- Network
- Recent events
- Recent transactions
- Verification status
- Raw contract metadata, if available

Useful routes:

```txt
/projects/:projectId/contracts/:contractId
/contracts/:contractId
```

---

## 5.14 Usage and Observability Dashboard

The dashboard should give developers visibility into their project.

Show:

- Total RPC requests
- Failed RPC requests
- Average latency
- Indexed events count
- Webhook delivery count
- Failed webhook count
- Recent transactions
- Recent errors

For alpha, simple cards and tables are enough.

---

## 6. Frontend Requirements

Recommended frontend stack:

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui
- Freighter wallet integration

### Required pages

```txt
/
/dashboard
/dashboard/projects
/dashboard/projects/new
/dashboard/projects/:projectId
/dashboard/projects/:projectId/contracts
/dashboard/projects/:projectId/events
/dashboard/projects/:projectId/webhooks
/dashboard/projects/:projectId/api-keys
/debugger
/projects/:projectId
/contracts/:contractId
```

### Required frontend states

Every async action must have:

- Loading state
- Success state
- Error state
- Empty state, when applicable

Examples:

- Connecting wallet
- Registering project
- Activating access
- Adding contract ID
- Fetching events
- Fetching transaction
- Creating webhook
- Testing webhook
- Creating API key
- Loading RPC logs

### Mobile responsiveness

All pages must work on:

- Mobile phone
- Tablet
- Desktop

Mobile requirements:

- Responsive navigation
- Tables should become cards or horizontally scrollable
- Buttons should remain tappable
- Long contract IDs should truncate with copy buttons
- Dashboard cards should stack vertically

---

## 7. Backend Requirements

Recommended backend stack:

- Node.js with Hono or Fastify
- TypeScript
- PostgreSQL
- Redis for queues, rate limits, and caching
- Stellar SDK / Soroban RPC client

### Backend services

```txt
API Service
RPC Gateway Service
Indexer Worker
Webhook Worker
Debugger Service
Auth/API Key Service
```

### Required API routes

```txt
POST /api/projects
GET /api/projects
GET /api/projects/:projectId
POST /api/projects/:projectId/contracts
DELETE /api/projects/:projectId/contracts/:contractId
GET /api/projects/:projectId/events
GET /api/projects/:projectId/rpc-logs
POST /api/projects/:projectId/api-keys
DELETE /api/projects/:projectId/api-keys/:keyId
POST /api/projects/:projectId/webhooks
POST /api/projects/:projectId/webhooks/:webhookId/test
POST /api/projects/:projectId/webhooks/:webhookId/retry
GET /api/debug/transaction/:hash
POST /rpc/:network/:apiKey
```

---

## 8. Database Models

### Project

```txt
Project {
  id: string,
  onchain_project_id: string,
  owner_wallet: string,
  name: string,
  description: string,
  website_url: string | null,
  github_url: string | null,
  metadata_hash: string,
  network: "testnet" | "mainnet",
  active: bool,
  verified: bool,
  created_at: Date,
  updated_at: Date
}
```

### ProjectContract

```txt
ProjectContract {
  id: string,
  project_id: string,
  contract_id: string,
  network: "testnet" | "mainnet",
  added_at: Date
}
```

### APIKey

```txt
APIKey {
  id: string,
  project_id: string,
  key_hash: string,
  label: string,
  last_used_at: Date | null,
  revoked: bool,
  created_at: Date
}
```

### RPCLog

```txt
RPCLog {
  id: string,
  project_id: string,
  api_key_id: string,
  method: string,
  status: string,
  latency_ms: number,
  error_message: string | null,
  created_at: Date
}
```

### ContractEvent

```txt
ContractEvent {
  id: string,
  project_id: string,
  contract_id: string,
  transaction_hash: string,
  ledger: number,
  timestamp: Date,
  event_type: string,
  topics: JSON,
  payload: JSON,
  raw_event: JSON
}
```

### WebhookEndpoint

```txt
WebhookEndpoint {
  id: string,
  project_id: string,
  url: string,
  secret_hash: string,
  enabled: bool,
  event_types: string[],
  created_at: Date
}
```

### WebhookDelivery

```txt
WebhookDelivery {
  id: string,
  webhook_id: string,
  project_id: string,
  event_type: string,
  payload: JSON,
  status: "delivered" | "failed" | "pending",
  http_status: number | null,
  response_time_ms: number | null,
  retry_count: number,
  created_at: Date
}
```

---

## 9. Recommended Alpha Timeline

## Week 1: Smart Contract Foundation

Build:

- `VeloRegistry` contract
- `VeloAccessPass` contract
- Inter-contract call from AccessPass to Registry
- Contract tests
- Testnet deployment
- Frontend wallet connection
- Register project flow

Deliverable:

```txt
User can register a project and activate access through the second contract.
```

---

## Week 2: Dashboard and Project Management

Build:

- Project dashboard
- Create project flow
- Project detail page
- Add official contract ID
- Public verified project page
- API key generation
- Mobile responsive layout
- Basic loading/error states

Deliverable:

```txt
Developer can create and manage a verified Velo project.
```

---

## Week 3: RPC Gateway Alpha

Build:

- RPC proxy endpoint
- API key validation
- Request logging
- Latency tracking
- Rate limiting
- Error logs
- Dashboard usage table

Deliverable:

```txt
Developer can use Velo RPC URL and see request logs in the dashboard.
```

---

## Week 4: Indexer Alpha

Build:

- Poll events from registered contracts
- Store events in database
- Event API
- Event dashboard
- Event filters
- Event detail page

Deliverable:

```txt
Velo automatically indexes events from registered Stellar contracts.
```

---

## Week 5: Debugger and Webhooks

Build:

- Transaction hash lookup
- Transaction detail page
- Basic error explanations
- Webhook URL setup
- Webhook signing
- Delivery logs
- Retry webhook
- Test webhook button

Deliverable:

```txt
Developer can debug transactions and receive contract event webhooks.
```

---

## Week 6: Production Readiness and Polish

Build:

- Error handling pass
- Loading states pass
- Mobile responsiveness pass
- Security review
- Contract tests
- Backend tests
- Frontend QA
- Deployment
- README
- Demo video
- Pitch materials

Deliverable:

```txt
Production-ready alpha with stable frontend, smart contracts, RPC gateway, indexer, debugger, and webhooks.
```

---

## 10. Alpha Acceptance Criteria

The alpha is complete when the following demo works end-to-end:

```txt
1. User opens Velo on desktop or mobile.
2. User connects Freighter wallet.
3. User creates a project.
4. User registers project on-chain using VeloRegistry.
5. User activates project access using VeloAccessPass.
6. VeloAccessPass calls VeloRegistry to verify the project.
7. User adds an official contract ID.
8. User generates an API key.
9. User sends RPC requests through Velo RPC gateway.
10. Velo logs RPC requests and displays them in the dashboard.
11. Velo indexes events from the registered contract.
12. User views indexed events in the dashboard.
13. User pastes a transaction hash into the debugger.
14. Velo displays transaction status, events, and basic explanation.
15. User configures a webhook.
16. Velo sends a webhook when an event happens.
17. User sees webhook delivery logs.
18. Public project page shows verified project and official contract IDs.
```

---

## 11. What Not to Build Yet

Do not include these in alpha unless all core features are already stable:

- Full mainnet-grade RPC SLA
- Billing system
- Team accounts
- Advanced AI debugger
- Full-network Stellar indexer
- Complex analytics
- Marketplace
- Token launch
- SLA/slashing contract
- Multi-chain support

---

## 12. Final Alpha Positioning

Use this as the product description:

> Velo is an all-in-one developer operations platform for Stellar smart contract builders. It provides a verified project registry, RPC gateway, contract event indexer, transaction debugger, and webhook system so teams can build, monitor, and operate Stellar apps from one place.

---

## 13. Final Build Priority

If time is limited, prioritize in this order:

1. Registry smart contract
2. AccessPass smart contract
3. Inter-contract call
4. Wallet connection
5. Project creation and registration
6. Add official contract IDs
7. Public verified project page
8. API keys
9. RPC gateway
10. RPC request logs
11. Contract event indexer
12. Event dashboard
13. Transaction debugger
14. Webhooks
15. Loading states and error handling
16. Mobile responsiveness
17. Final polish

