# Velo Playground fixture contracts

This isolated Cargo workspace owns the five contracts used to qualify the
Sprint 1 contract-spec parser. The contracts are deliberately small and their
public methods are mostly identity operations: their purpose is to expose a
stable Soroban specification, not to model production business logic.

| Fixture              | Specification coverage                                               | Browser invocation          |
| -------------------- | -------------------------------------------------------------------- | --------------------------- |
| `hello`              | symbol input and vector output                                       | Testnet allowlist candidate |
| `numeric`            | signed and unsigned 32/64/128/256-bit integers, timepoint, duration  | No                          |
| `collections`        | bool, string, bytes, fixed bytes, vector, map, tuple, option, result | No                          |
| `custom-types`       | nested structs, unit enum, integer enum, tuple union                 | No                          |
| `auth-events-errors` | address authorization, event specification, contract errors          | No                          |

## Deterministic checks

```bash
cargo test --workspace --locked
cargo build --workspace --release --target wasm32v1-none --locked
node --experimental-strip-types scripts/generate-spec-fixtures.mjs --check
git diff --check
```

The generator extracts ordered per-entry XDR from the locally built Wasm,
passes those entries through `@repo/stellar`'s normalizer, and updates:

- `spec-fixtures/raw/*.xdr.json` — ordered base64 `ScSpecEntry` values.
- `spec-fixtures/expected/*.json` — interface-only normalized snapshots,
  including their deterministic spec hash.

Deployment metadata is intentionally excluded from normalized snapshots.
Omit `--check` when intentionally refreshing the committed fixtures.

## Testnet deployment

The deployment tool accepts a Stellar CLI **identity name only**. It rejects
secret keys, seed phrases, and public keys as its `--identity` value.

```bash
./scripts/deploy-testnet.sh --identity velo-playground-deployer
```

The tool builds all fixtures, deploys them to the Stellar CLI `testnet`
network, and replaces `deployments/testnet.json` with confirmed contract IDs,
Wasm hashes, the first ledger observed after each confirmed deployment, tool
versions, and the source revision. The checked-in manifest remains explicitly
pending until an operator performs the interactive wallet gate. Deployment refuses
a dirty fixture workspace so the recorded revision can identify the exact source.

After each successful fixture, the tool writes ignored partial progress beside
the manifest. If a later RPC or deployment step fails, rerun the same command
with the same identity: already-recorded fixtures are validated against the
local Wasm and skipped. CLI errors remain visible so transient RPC failures are
diagnosable. The partial file is removed after all five fixtures are recorded.

Testnet state is reset periodically. Redeploy and rotate the manifest when a
contract is missing, archived, or its Wasm hash differs from the local build.
Do not hand-edit IDs or hashes.

## Opt-in live smoke

Start the Velo web application, deploy all fixtures, then run:

```bash
./scripts/smoke-testnet.sh \
  --identity velo-playground-deployer \
  --api-base-url http://localhost:3000
```

The smoke command:

1. loads all five contract specifications through the Velo API;
2. fails with a fixture name and stage on an ID/hash drift;
3. simulates the simple `hello` call; and
4. simulates a nested `custom-types` call through Stellar CLI without sending
   either transaction.

This command is intentionally outside normal CI. A passing local/Cargo run is
not live Testnet evidence, and the manifest's `liveQualification` must remain
`pending` until the interactive browser/wallet exit gate is retained.
