# Sprint 1 Playground fixture deployment and requalification

Status: **IMPLEMENTED — LIVE EVIDENCE PENDING**  
Audience: Testnet fixture operators and release reviewers  
Scope: repository-owned `contracts/playground-fixtures` workspace

This runbook deploys and qualifies the five Sprint 1 spec fixtures. Only `hello` is
eligible for browser invocation. The other four fixtures provide deterministic
contract-spec coverage and live inspection/simulation checks.

The checked-in `deployments/testnet.json` is currently `undeployed`, contains null
contract IDs and Wasm hashes, and has `liveQualification: "pending"`. Do not set
live status from deterministic tests alone.

## Safety rules

- Use a Stellar CLI identity **name**, never a secret key, seed phrase, or public key
  as the `--identity` argument.
- Never commit wallet secrets, signed envelopes, provider credentials, or raw
  provider error payloads.
- Do not hand-edit deployment IDs or Wasm hashes. The deployment script calculates
  and records them.
- Deploy from a clean fixture workspace. The script rejects uncommitted fixture
  changes so `sourceRevision` remains meaningful.
- Testnet state can reset or expire. Treat the manifest as deployment metadata, not
  proof that the contracts are currently reachable.

## Prerequisites

- Node.js and pnpm dependencies installed for the monorepo;
- Rust, Cargo, and the `wasm32v1-none` target;
- Stellar CLI compatible with the pinned fixture workspace;
- `curl`, Git, Python 3, and `sha256sum`;
- a funded Stellar CLI Testnet identity;
- a local Velo web server for API and browser qualification;
- an installed Testnet-capable wallet for the interactive exit gate.

The fixture workspace pins `soroban-sdk = 25.0.1` and uses `Cargo.lock`.

## 1. Run deterministic qualification

From `contracts/playground-fixtures`:

```bash
cargo test --workspace --locked
cargo build --workspace --release --target wasm32v1-none --locked
node --experimental-strip-types scripts/generate-spec-fixtures.mjs --check
git diff --check
```

The generator compares the locally built Wasm specifications with committed:

- `spec-fixtures/raw/*.xdr.json`, which preserve ordered base64 spec entries;
- `spec-fixtures/expected/*.json`, which preserve the normalized interface and
  deterministic spec hash.

If a deliberate contract or toolchain change causes drift, run the generator without
`--check`, review every raw and normalized diff, rerun the checks, and commit the
fixture changes before deployment.

## 2. Deploy the fixtures

From `contracts/playground-fixtures`:

```bash
./scripts/deploy-testnet.sh --identity <STELLAR_CLI_IDENTITY_NAME>
```

The script builds and deploys, in order:

1. `hello`;
2. `numeric`;
3. `collections`;
4. `custom-types`;
5. `auth-events-errors`.

On success it replaces `deployments/testnet.json` with:

- `status: "deployed"` and `liveQualification: "pending"`;
- generation time and source revision;
- Stellar CLI, Rust, and Cargo versions;
- each contract ID, locally computed Wasm SHA-256, and first observed ledger after
  deployment.

The script records ignored partial progress after each successful fixture. If a
later deployment fails, rerun the same command with the same identity. Recorded
contracts are checked against the current local Wasm and skipped; the partial file
is removed only after the complete manifest is written. Review the visible Stellar
CLI error before retrying.

Review the manifest diff. Confirm that all five entries are non-null and that no key
material or provider credential appears.

## 3. Configure Velo

Set server environment values from the generated `hello` manifest entry:

```text
PLAYGROUND_HELLO_CONTRACT_ID=<HELLO_CONTRACT_ID>
PLAYGROUND_HELLO_WASM_HASH=<HELLO_WASM_HASH>
```

Optionally configure HTTPS RPC endpoints:

```text
STELLAR_TESTNET_RPC_URL=<HTTPS_TESTNET_RPC_URL>
STELLAR_MAINNET_RPC_URL=<HTTPS_MAINNET_RPC_URL>
```

Restart the web application after changing environment values. Do not expose fixture
configuration or provider credentials as new `NEXT_PUBLIC_*` values.

## 4. Run the opt-in Testnet smoke

Start the Velo web application, then run:

```bash
./scripts/smoke-testnet.sh \
  --identity <STELLAR_CLI_IDENTITY_NAME> \
  --api-base-url http://localhost:3000
```

The smoke:

- loads all five deployed specs through
  `POST /api/v1/playground/contracts/load`;
- checks each returned Wasm hash against the manifest;
- simulates `hello --to Velo` through Stellar CLI without sending;
- simulates the nested `custom-types` profile call without sending.

A passing smoke is useful live RPC evidence, but it is not the interactive
browser/wallet exit gate and does not change `liveQualification` from `pending`.

## 5. Complete the interactive browser/wallet gate

1. Open `/playground?network=testnet&contractId=<HELLO_CONTRACT_ID>`.
2. Confirm the loaded Wasm hash matches the manifest and invocation is eligible.
3. Inspect `hello(Symbol) -> Vec<Symbol>`.
4. Connect a funded Testnet wallet through the existing Velo wallet control.
5. Enter a valid Symbol.
6. Simulate and review network, source account, contract, Wasm hash, function,
   argument, sequence, time bounds, fees, and transaction hash.
7. Sign only the exact reviewed XDR.
8. Submit and wait for success or query the status endpoint with the returned hash.
9. Confirm the decoded result and Testnet explorer link.
10. Record sanitized evidence in
    [the Sprint 1 evidence report](../references/sprint-1-playground-evidence.md).

Do not record the signed XDR or signature. A live result is only passing when the
deployed manifest, configured hello fixture, reviewed XDR, submitted hash, and
decoded result all refer to the same run.

## Requalification triggers

Repeat deterministic qualification, deployment or drift checks, smoke, and the
interactive gate when any of these changes:

- fixture source, Cargo lockfile, Soroban SDK, Rust, or Stellar CLI version;
- built Wasm or normalized spec snapshot;
- normalized schema or hash algorithm;
- loader parsing, RPC, caching, or size limits;
- hello argument validation, simulation assembly, envelope verification, submission,
  polling, or result decoding;
- wallet provider or signing behavior;
- fixture contract ID, Wasm hash, archived/missing state, or Testnet reset;
- `PLAYGROUND_HELLO_*` or RPC configuration.

Re-run the interactive gate after deployment even when deterministic snapshots are
unchanged.

## Drift, rotation, and rollback

If loading fails, compare the manifest with the current Testnet contract instance.
If the contract is missing, archived, or points to a different Wasm hash:

1. stop treating the fixture as invocable;
2. keep `liveQualification` pending;
3. rerun deterministic checks;
4. redeploy with `deploy-testnet.sh`;
5. update Velo's hello environment configuration;
6. rerun smoke and the browser/wallet gate;
7. update the evidence report.

Rollback means restoring a previously reviewed fixture source revision, rebuilding,
and deploying a new Testnet instance. Do not restore an old contract ID unless the
live instance and Wasm hash have been reverified.

## Qualification record

Record only values actually produced by the run:

- source revision;
- deployment manifest generation time;
- tool versions;
- Testnet contract IDs and Wasm hashes;
- smoke time and result;
- wallet/browser used;
- reviewed and submitted transaction hash;
- terminal ledger and decoded result;
- failure stage, stable code, and correlation ID when applicable.

If any required value is unavailable, leave it pending. Never manufacture a
placeholder that looks like evidence.
