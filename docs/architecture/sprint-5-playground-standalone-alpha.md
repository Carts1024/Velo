# Sprint 5 Playground standalone public alpha

Status: **IMPLEMENTED — LIVE QUALIFICATION EVIDENCE PENDING**

Applies to: PG-501–PG-505

## Boundaries

Sprint 5 preserves Sprint 4's transaction trust boundary. The browser edits canonical
arguments, reviews exact XDR, and asks the wallet to sign. The server reloads the
contract, simulates, verifies the signed envelope, submits to its selected RPC, and
normalizes terminal evidence. Mainnet remains simulation-only.

- The browser owns versioned local history, safe replay, generated-code presentation,
  tab-scoped journey identity, and privacy-safe funnel emission.
- `@repo/stellar` owns deterministic TypeScript and CLI rendering from the normalized
  specification and canonical argument model.
- Next.js owns payload bounds, trusted proxy identity extraction, public errors, and
  telemetry intake.
- Convex owns operation-specific distributed token buckets. Only HMAC-derived opaque
  scope hashes reach Convex; raw client addresses are never stored.

## Local history and code generation

`velo:playground:history:v1` retains at most 50 newest entries for 30 days. Records
contain network, contract/function, Wasm/spec hashes, status, timestamp, optional
transaction hash, and canonical arguments only when they pass the secret scanner.
Wallet addresses, signatures, XDR, authorization entries, raw RPC evidence, decoded
results, and raw errors are excluded.

A valid Stellar seed, secret-like field name, or bearer/key-looking string makes the
record metadata-only. Corrupt, obsolete, expired, oversized, or unavailable storage
never blocks the primary flow. Replay reloads the contract and compares both hashes
before restoring arguments; every replay requires a fresh simulation.

`generatePlaygroundCode()` uses the same `encodeFunctionArguments()` path as
Playground. TypeScript output uses exact base64 `ScVal` values with Stellar SDK
14.2.0 and separates simulation, external signing, and submission. CLI output targets
Stellar CLI 25.2.0 and emits `--send=no` and `--send=yes` commands using a configured
`$STELLAR_IDENTITY`. Generation is local, and secret-looking input disables it.

## Telemetry and correlation

Each tab receives a random session ID. Each load or replay creates a
`playgroundRequestId` sent as `X-Velo-Journey-Id`. The funnel records only event name,
outcome, network, duration, normalized error category, session ID, and request ID. It
never records arguments, contract/wallet identifiers, XDR, signatures, transaction
hashes, generated code, IP hashes, or raw errors. Intake is same-origin, bounded,
rate-limited, and fail-open.

## Anonymous abuse controls

| Operation | Capacity/refill |
| --- | --- |
| Contract load | 30/minute |
| Simulation | 10/minute |
| Submission | 5/minute |
| Status recovery | 60/minute |

On Vercel, trusted `x-vercel-forwarded-for` identity is HMAC-hashed with
`VELO_PLAYGROUND_RATE_LIMIT_SECRET`; other environments use a shared anonymous scope.
The web server signs scope, operation, and timestamp, and Convex rejects signatures
older than 60 seconds. Configure the same secret in the web runtime and Convex.

Production refuses traffic when protection is unconfigured. Simulation and
submission fail closed during limiter outages; local load/status paths fail open.
Limits return `429`, retry/rate headers, and the safe correlation envelope. Payload
ceilings are 4 KiB for loads, 256 KiB for simulations, and 512 KiB for submissions.

## Demo and fallback

Primary demo:

1. Open `/playground` on Testnet and load the hello fixture from
   `deployments/testnet.json`.
2. Edit `hello`, simulate, review exact XDR, connect Freighter, sign, submit, and
   retain the final hash.
3. Reopen the local request, verify hashes, re-simulate, and copy both code forms.

Fallback when the fixture or wallet is unavailable:

1. Use the deterministic Playwright route mocks and package fixtures.
2. Demonstrate loading, history, hash-aware replay, code generation, keyboard and
   responsive behavior, and failure recovery.
3. Mark wallet/Testnet evidence pending; never present mocked evidence as live.

Automated qualification uses Playwright Chromium, Firefox, and WebKit at 320, 768,
and 1440 CSS pixels plus axe serious/critical checks. Manual release evidence covers
current and previous Chrome, Firefox, Safari, and Edge; current iOS Safari and Android
Chrome; keyboard-only use; 200% zoom; reduced motion; VoiceOver; and NVDA.
