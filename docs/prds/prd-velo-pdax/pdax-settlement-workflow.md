# PDAX UAT Settlement Workflow Documentation

This document explains the technical implementation of **Velo Settlement**'s PDAX UAT integration, covering connection management (Sprint 2) and webhook routing/dashboard features (Sprint 3).

## Core Architecture

Velo Settlement coordinates regional fiat-stablecoin conversions and payouts. The architecture comprises:
1. **`@repo/pdax` Client**: A server-only client wrapping programmatic endpoints for connection, pricing, execution, and InstaPay withdrawals.
2. **Convex Database Tables**:
   - `providerConnections`: Caches programmatic session tokens (`accessToken`, `idToken`, `refreshToken`) per project.
   - `settlementQuotes`: Stores executable firm quotes.
   - `settlementTransactions`: Tracks the lifecycle of the conversion and payout workflow.
   - `providerEvents`: Records incoming raw webhook payloads for idempotency checks.
   - `webhookDeliveries`: Logs outbound Velo merchant notifications.
3. **Convex Actions**: Expose public/internal methods to perform network requests, manage credentials, and transition records.
4. **Next.js Webhook Router**: Exposes `/api/webhooks/pdax` endpoint to ingest provider callbacks.
5. **Settlement Dashboard UI**: Interactive portal for managing balances, locked quotes, trade execution, withdrawals, simulation tests, and webhook delivery logs.

---

## Connection and Session Management

Tokens last 10 minutes (600 seconds) in UAT. To prevent programmatic login overhead and avoid provider rate limits, session tokens are cached in the `providerConnections` table:

```mermaid
sequenceDiagram
    participant Merchant Dashboard
    participant Convex Action
    participant Convex Database
    participant PDAX API

    Merchant Dashboard->>Convex Action: Trigger Action (projectId)
    Convex Action->>Convex Database: Query Connection (projectId)
    alt No Connection OR Disconnected
        Convex Action->>PDAX API: login(username, password)
        PDAX API-->>Convex Action: access_token, id_token, refresh_token, expiry
        Convex Action->>Convex Database: upsertInternal(status: "connected", tokens)
    else Connection exists but expires in < 60s
        alt Has refresh token
            Convex Action->>PDAX API: refresh(username, refresh_token)
            PDAX API-->>Convex Action: new tokens
            Convex Action->>Convex Database: upsertInternal(status: "connected", tokens)
        else Refresh fails / No refresh token
            Convex Action->>PDAX API: login(username, password)
            PDAX API-->>Convex Action: access_token, id_token, refresh_token, expiry
            Convex Action->>Convex Database: upsertInternal(status: "connected", tokens)
        end
    else Connection valid (> 60s left)
        Convex Database-->>Convex Action: return cached active tokens
    end
    Convex Action->>PDAX API: Execute API Request (tokens)
```

---

## Action Workflow and Status Lifecycle

The settlement lifecycle transitions through state changes stored in the `settlementTransactions` table:

```txt
[Indicative Quote] (No DB record)
  ↓
[Firm Quote] (QUOTE_FIRM)
  ↓
[Execute Trade] (TRADE_EXECUTED)
  ↓
[Fiat Payout] (PAYOUT_PENDING)
  ↓ [Incoming Webhook]
[Payout Complete] (PAYOUT_SUCCEEDED / PAYOUT_FAILED)
```

### 1. Quotes (`getQuote`)
- **Indicative Quote**: Returns estimated prices and rates. Not stored.
- **Firm Quote**: Executable for 15 seconds. Saves the quote to `settlementQuotes` with status `"active"` and creates a settlement transaction with status `"QUOTE_FIRM"`. Includes optional paid `paymentIntentId` verification.

### 2. Trade Execution (`executeTrade`)
- Checks quote expiry and status.
- Executes conversion on-chain/programmatically on PDAX.
- Marks the quote as `"executed"`.
- Updates the transaction status to `"TRADE_EXECUTED"` and stores `orderId` and `tradeDetails`.

### 3. InstaPay Withdrawal (`fiatWithdraw`)
- Triggers a fiat withdrawal via InstaPay rails using global merchant mock credentials.
- Creates or updates the transaction record to `"PAYOUT_PENDING"`, saving `withdrawalId` and `withdrawalDetails`.

---

## Webhook Processing & Delivery Architecture

When a payout withdrawal reaches a terminal state (succeeded or failed), PDAX fires an asynchronous webhook callback. Velo handles the payload, updates transaction states, and notifies the merchant's endpoint:

```mermaid
sequenceDiagram
    participant PDAX Rails
    participant Next.js API Route
    participant Convex Action (handlePdaxWebhook)
    participant Convex Database
    participant Outbound Dispatcher
    participant Merchant Server

    PDAX Rails->>Next.js API Route: POST /api/webhooks/pdax [raw payload]
    Next.js API Route->>Convex Action (handlePdaxWebhook): Invoke Action
    Convex Action (handlePdaxWebhook)->>Convex Database: Check providerEvents (eventId)
    alt Event already recorded
        Convex Action (handlePdaxWebhook)-->>Next.js API Route: return status: "duplicate"
    else New Event
        Convex Action (handlePdaxWebhook)->>Convex Database: Record Event (processed: false)
        Convex Action (handlePdaxWebhook)->>Convex Database: Find transaction (withdrawalId)
        Convex Action (handlePdaxWebhook)->>Convex Database: Update transaction status (PAYOUT_SUCCEEDED / PAYOUT_FAILED)
        Convex Action (handlePdaxWebhook)->>Convex Database: Mark Event (processed: true)
        Convex Action (handlePdaxWebhook)->>Outbound Dispatcher: Schedule Velo Webhook Trigger
        Outbound Dispatcher->>Merchant Server: Send POST [signed merchant webhook]
        Merchant Server-->>Outbound Dispatcher: 200 OK
        Outbound Dispatcher->>Convex Database: Record webhookDeliveries (status: "success")
        Convex Action (handlePdaxWebhook)-->>Next.js API Route: return status: "processed"
    end
    Next.js API Route-->>PDAX Rails: 200 OK
```

### Outbound Webhook Event Types
Velo publishes the following events upon receiving settlement updates:
- `settlement.quote.created`: Dispatched when a new firm quote is secured.
- `settlement.trade.executed`: Dispatched when conversion trade is executed.
- `settlement.withdrawal.pending`: Dispatched when InstaPay withdrawal is initiated.
- `settlement.withdrawal.succeeded`: Dispatched when bank payout succeeds.
- `settlement.withdrawal.failed`: Dispatched when bank payout fails.

---

## Supported Rails & Constants

- **Payout rails**: InstaPay UAT
- **UAT Test Banks**:
  - Security Bank: `BASECPH` (Test account: `0000042001461`)
  - CTBC Bank: `BACTBPH` (Test account: `001700062270`)
- **Supported pair**: `USDCXLM` -> `PHP` (Selling USDC on Stellar Testnet for Philippine Pesos).

---

## Idempotency and Webhook Protection

1. **Outbound Idempotency**: Each state mutation action requires an `idempotencyId`. If a request is retried, the backend returns the cached transaction details from the database without invoking the external PDAX API again.
2. **Inbound Webhook Deduplication**: Webhooks from PDAX are mapped via `request_id`, `reference_number`, and `reference_id` keys. Convex records incoming IDs to prevent double-processing payouts.
3. **Webhook Fallback**: If an incoming webhook does not match any transaction identifier, the handler falls back to associating the record with the first active project in the sandbox system, logging the event safely.
