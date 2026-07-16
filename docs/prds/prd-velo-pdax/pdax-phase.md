Yes — Phase 1 should become **Velo Settlement**, not just a small PDAX add-on.

Based on the PDAX UAT playbook, you have enough access to build a credible hackathon integration around **fiat ↔ crypto conversion, crypto deposits, fiat deposits, fiat withdrawals, balances, trading workflows, and webhooks**. The playbook also confirms UAT support for **XLM**, **USDCXLM / USDC on Stellar**, **Stellar Testnet**, and **InstaPay** payout/deposit rails, with Security Bank and CTBC test bank references. 

My recommendation:

> **For the hackathon, integrate PDAX as Velo’s first settlement provider: a Philippine fiat/stablecoin bridge inside an APAC-ready settlement abstraction.**

That lets Velo stay APAC-relevant. PDAX is the first provider, but the product is not “only for the Philippines.” The architecture should say: **Velo can support any APAC settlement provider later; PDAX is the first working provider because the hackathon gives UAT access.**

---

## What PDAX can add to Velo

Velo already has PaymentIntents, hosted checkout, API keys, signed webhooks, SDK, payment scanner, payment metrics, and webhook delivery logs.  PDAX can add the missing settlement layer after a merchant receives stablecoin payment.

The current Velo flow is:

```txt
Customer pays USDC on Stellar
→ Velo verifies payment
→ Merchant sees paid PaymentIntent
→ Velo sends signed webhook
```

With PDAX, the flow becomes:

```txt
Customer pays USDC on Stellar
→ Velo verifies payment
→ Merchant chooses settlement action
→ PDAX quotes conversion
→ PDAX executes trade
→ PDAX withdraws fiat through InstaPay
→ Velo tracks the full settlement lifecycle
```

This is a stronger infrastructure story because Velo becomes not just checkout, but **payment acceptance + treasury + fiat settlement infrastructure**.

---

# Recommended PDAX integration features

## 1. PDAX Settlement Provider Dashboard

This should be the main hackathon feature.

Add a new page in Velo:

```txt
/projects/[projectId]/settlement
```

Sections:

| Section            | Purpose                                                |
| ------------------ | ------------------------------------------------------ |
| Provider status    | Shows whether PDAX UAT credentials are connected       |
| Supported assets   | Shows XLM and USDCXLM on Stellar Testnet               |
| Balances           | Shows PDAX wallet balances                             |
| Settlement actions | Convert, cash out, deposit, withdraw                   |
| Settlement history | Shows PDAX trades, deposits, withdrawals, and webhooks |
| Webhook health     | Shows latest PDAX event received by Velo               |

This maps directly to the PDAX playbook’s supported workflows: trading, funding, wallets, withdrawals, balances, and webhooks. 

For APAC positioning, call this module:

> **Settlement Providers**

Not only “PDAX.” Inside the module, show:

```txt
Provider: PDAX
Region: Philippines
Rails: Stellar Testnet, InstaPay
Status: UAT Connected
```

That makes the design expandable to future APAC providers in Singapore, Thailand, Vietnam, Indonesia, Japan, and others.

---

## 2. Fiat-priced PaymentIntent with USDC settlement

This is one of the best features for Velo.

Today, your PaymentIntent can be stablecoin-native. With PDAX, you can allow merchants to price in fiat but collect on Stellar.

Example:

```ts
await velo.paymentIntents.create({
  amount: "1500",
  currency: "PHP",
  settlementAsset: "USDCXLM",
  settlementProvider: "pdax",
});
```

Velo then uses PDAX’s indicative quote endpoint to show the estimated conversion rate, and later uses a firm quote before execution. The PDAX playbook lists an indicative price endpoint, a firm quote endpoint, trade execution, and order status tracking. 

User-facing demo:

```txt
Merchant creates ₱1,500 invoice
→ Velo quotes equivalent USDC on Stellar
→ Customer pays USDC
→ Velo verifies on-chain payment
→ Merchant sees PHP-estimated settlement value
```

This works very well for APAC because many merchants think in local fiat currency, while settlement can happen using stablecoins.

PDAX publicly supports USDC on Stellar in addition to other networks, and PDAX’s own USDC FAQ says USDC for Algorand, Stellar, and Polygon are available through the PDAX mobile app and web exchange. ([PDAX][1])

---

## 3. “Cash out via PDAX” settlement flow

This is the most practical business feature.

After a PaymentIntent is paid, show a button:

```txt
Settle to fiat via PDAX
```

Then flow:

```txt
Paid PaymentIntent
→ Select settlement amount
→ Get PDAX firm quote
→ Execute USDCXLM → PHP trade
→ Withdraw PHP through InstaPay
→ Track settlement status
```

The PDAX playbook supports firm quotes, trade execution, order status, and fiat withdrawals. It also says the UAT environment supports InstaPay as the payment and payout channel. 

This is the cleanest “merchant value” story:

> **Velo lets APAC merchants accept stablecoin payments on Stellar and settle into local fiat rails, starting with PDAX and InstaPay in the Philippines.**

PDAX’s public CAAS page also describes liquidity access, custodial wallet services, and cash-in/cash-out channel integration, which supports this positioning. ([PDAX][2])

---

## 4. PDAX Webhook Bridge into Velo Webhooks

This is very aligned with your existing product.

PDAX supports webhooks for deposits, withdrawals, trades, and transaction updates.  Velo already supports signed webhook delivery with event logs and SDK verification. 

So build a bridge:

```txt
PDAX webhook received
→ Velo normalizes event
→ Velo updates settlement record
→ Velo forwards signed Velo webhook to merchant
```

Example Velo events:

```txt
settlement.quote.created
settlement.trade.executed
settlement.withdrawal.pending
settlement.withdrawal.succeeded
settlement.withdrawal.failed
provider.pdax.deposit.received
provider.pdax.trade.updated
```

This is powerful because developers do not need to integrate PDAX webhooks directly. They integrate only Velo’s webhook system.

Developer pitch:

> **One webhook format for on-chain payments, fiat conversion, withdrawals, and provider updates.**

That is infrastructure.

---

## 5. PDAX Wallet + Balance Management

Add a simple “Treasury” card:

```txt
PDAX UAT Balances
- USDCXLM
- XLM
- PHP / fiat balance, if exposed by API
```

The playbook lists wallet and balance management as supported API workflows. 

In the hackathon demo, this makes Velo feel more complete:

```txt
Payment received
→ Balance updated
→ Quote generated
→ Trade executed
→ Fiat withdrawal initiated
```

Even if UAT uses mock balances and mock liquidity, the full workflow becomes visible.

Important: make the UI label clear:

```txt
UAT simulated balance — not real funds
```

The playbook explicitly says UAT uses mock pricing, mock liquidity, and simulated transaction behavior, and should not be treated as real settlement. 

---

## 6. PDAX Crypto Deposit Address as Merchant Settlement Account (Go for Option B)

PDAX has a crypto deposit endpoint that returns a wallet address and memo/tag when applicable. 

You can use this in two possible ways:

### Option A — Safer for hackathon

Merchant receives payment into their own Stellar wallet through Velo. Then Velo shows a PDAX deposit address for manual transfer.

```txt
Velo merchant wallet
→ PDAX USDCXLM deposit address
→ PDAX balance
→ Convert/cash out
```

### Option B — More automated but riskier

Velo generates PaymentIntents where the receiver is the PDAX deposit address/memo.

```txt
Customer pays directly to PDAX deposit address
→ PDAX webhook confirms deposit
→ Velo marks settlement received
```

For the hackathon, I recommend **Option A** first because your existing Velo Pay checkout already uses the project owner address as receiver and verifies payment through the backend scanner.  Changing the receiver model might introduce demo risk.

---

# Final feature set for Phase 1

## Must-build for hackathon

| Priority | Feature                              | Why it matters                        |
| -------- | ------------------------------------ | ------------------------------------- |
| P0       | PDAX credential connection page      | Required foundation                   |
| P0       | PDAX balances view                   | Proves wallet/balance API integration |
| P0       | Indicative quote + firm quote        | Shows fiat ↔ stablecoin conversion    |
| P0       | Execute trade                        | Proves settlement action              |
| P0       | Fiat withdrawal through InstaPay UAT | Completes the cash-out story          |
| P0       | PDAX webhook receiver                | Proves real-time provider updates     |
| P0       | Velo settlement history              | Makes the flow visible to judges      |
| P0       | Normalized Velo settlement webhooks  | Strong infrastructure differentiator  |

## Nice-to-have

| Priority | Feature                      | Why it matters                     |
| -------- | ---------------------------- | ---------------------------------- |
| P1       | Fiat-priced PaymentIntent    | Great merchant UX                  |
| P1       | Settlement CSV export        | Useful for B2B/accounting          |
| P1       | PDAX deposit address display | Shows crypto funding workflow      |
| P1       | Provider health monitor      | Good infra story                   |
| P1       | SDK methods for settlement   | Makes Velo more developer-friendly |

## Avoid for now

| Feature                               | Why to avoid during hackathon                         |
| ------------------------------------- | ----------------------------------------------------- |
| Fully automatic production settlement (Go for it, implement) | UAT is simulated and not production-grade             |
| Multi-country payout provider support | Too broad for current access                          |
| Full SEP abstraction inside Phase 1   | Save this for Phase 2 AnchorKit                       |
| Compliance/KYC automation             | Likely outside hackathon scope                        |
| Custody claims                        | Be careful unless PDAX agreement explicitly allows it |

---

# Suggested Velo product architecture

Add a new internal module:

```txt
packages/providers/pdax
```

Responsibilities:

```txt
auth/login
auth/refresh
balances/list
quotes/indicative
quotes/createFirm
trades/execute
orders/getStatus
deposits/getCryptoAddress
fiatDeposits/create
fiatWithdrawals/create
webhooks/verifyOrParse
```

Add Velo API routes:

```txt
POST /api/v1/providers/pdax/connect
GET  /api/v1/settlement/providers
GET  /api/v1/settlement/balances
POST /api/v1/settlement/quotes
POST /api/v1/settlement/trades
POST /api/v1/settlement/withdrawals
GET  /api/v1/settlement/transactions
POST /api/webhooks/pdax
```

Add SDK methods later:

```ts
await velo.settlement.providers.list();

await velo.settlement.quotes.create({
  provider: "pdax",
  fromAsset: "USDCXLM",
  toCurrency: "PHP",
  amount: "25",
});

await velo.settlement.withdrawals.create({
  provider: "pdax",
  currency: "PHP",
  amount: "1000",
  channel: "INSTAPAY",
});
```

---

# Recommended demo flow

This is the demo I would build:

```txt
1. Merchant connects wallet in Velo.
2. Merchant creates project and activates Velo Pay.
3. Merchant connects PDAX UAT as settlement provider.
4. Merchant creates a ₱1,000 PaymentIntent priced in PHP.
5. Velo displays USDCXLM equivalent using PDAX quote.
6. Customer pays through hosted checkout on Stellar Testnet.
7. Velo scanner verifies the payment.
8. Merchant opens Settlement tab.
9. Merchant gets firm PDAX quote for USDCXLM → PHP.
10. Merchant executes trade.
11. Merchant initiates InstaPay withdrawal to test bank.
12. PDAX webhook updates Velo settlement status.
13. Velo forwards a signed settlement webhook to the merchant endpoint.
```

This is a very strong APAC hackathon story because it shows the complete loop:

> **Stablecoin payment acceptance → local fiat settlement → webhook-driven infrastructure.**

---

# APAC positioning

Do not pitch this as “PDAX-only.” Pitch it like this:

> **Velo Settlement is an APAC-ready settlement layer for Stellar stablecoin payments. It lets builders accept stablecoins on Stellar, connect regional fiat/crypto providers, convert assets, trigger withdrawals, and receive normalized webhooks. For the hackathon, PDAX is the first live UAT provider, enabling a Philippines corridor through USDC on Stellar and InstaPay rails.**

This is better than saying:

> “Velo integrates PDAX.”

The stronger framing is:

> **Velo abstracts settlement providers for APAC. PDAX is the first provider.**

That makes the Philippines implementation a proof of a broader APAC infrastructure thesis.

---

# Why this fits Stellar

Stellar’s own Anchor Platform documentation describes anchor-related standards for service discovery, web authentication, deposit/withdrawal operations, hosted deposit/withdrawal flows, cross-border payment processing, quotes, and contract-account authentication. ([Stellar Docs][3]) Stellar’s anchor docs also describe SEP-6, SEP-24, SEP-31, SEP-10, SEP-12, and SEP-38 as important standards for anchors. ([Stellar Docs][4])

Your Phase 1 PDAX integration can be positioned as the practical precursor to Phase 2 AnchorKit:

```txt
Phase 1: Direct PDAX provider integration
Phase 2: Generalized AnchorKit for SEP-based providers
Phase 3: RPC/indexing/dev-ops infrastructure
```

This gives you a logical evolution:

> **First, Velo integrates one real APAC settlement provider. Then, Velo generalizes the pattern into an anchor/SEP abstraction layer.**

---

# My final recommendation

For Phase 1, finalize these as the integration scope:

1. **PDAX Settlement Provider**
2. **PDAX balance viewer**
3. **PDAX quote engine**
4. **PDAX trade execution**
5. **PDAX fiat withdrawal via InstaPay UAT**
6. **PDAX webhook receiver**
7. **Velo normalized settlement events**
8. **Settlement history dashboard**
9. **Optional (implement this if possible) fiat-priced PaymentIntent**

That is enough to make Velo feel like real infrastructure without overbuilding.

The feature name I would use in the product:

> **Velo Settlement**

And the pitch:

> **Velo Settlement lets APAC builders accept stablecoins on Stellar and settle through regional fiat rails. Our first provider integration is PDAX UAT, supporting USDC on Stellar, quotes, trades, balances, InstaPay withdrawals, and webhook-driven settlement tracking.**

[1]: https://pdax.ph/learn/faqs-on-the-use-of-alternative-networks-for-usdc-on-pdax/?utm_source=chatgpt.com "FAQs on the use of alternative networks for USDC on PDAX"
[2]: https://pdax.ph/caas/?utm_source=chatgpt.com "CAAS"
[3]: https://developers.stellar.org/docs/platforms/anchor-platform?utm_source=chatgpt.com "The Anchor Platform: Build and Manage On ..."
[4]: https://developers.stellar.org/docs/learn/fundamentals/anchors?utm_source=chatgpt.com "Learn About Anchors"
