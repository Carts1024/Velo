# Velo Pay Access Contract

Soroban contract for activating Velo Pay access against an existing Velo registry project.

## Public Interface

- `initialize(registry_contract)`
- `activate_payments(project_id)`
- `deactivate_payments(project_id)`
- `consume_checkout_credit(project_id, amount)`
- `get_payment_access_status(project_id) -> PaymentAccessStatus`
- `get_checkout_credits(project_id) -> i128`

`activate_payments`, `deactivate_payments`, and `consume_checkout_credit` load the project from `VeloRegistry.get_project(project_id)` and require the registry project owner to authorize the mutation. Activation rejects missing or inactive registry projects.

## Test

From this directory:

```bash
cargo test
```

## Build

From this directory:

```bash
cargo build --target wasm32v1-none --release
```

The optimized WASM is emitted at:

```txt
target/wasm32v1-none/release/velo_pay_access.wasm
```

If using Stellar CLI from the monorepo root, the equivalent command is:

```bash
stellar contract build --manifest-path contracts/pay_access/Cargo.toml
```

## Deploy

The supported monorepo deployment entry point deploys the registry and pay-access contract in
dependency order, then initializes pay access. See [`../README.md`](../README.md).

## Manual Testnet Deployment

Prerequisites:

- Stellar CLI installed and authenticated.
- A funded Testnet source account configured in Stellar CLI.
- Stellar Testnet network configured in Stellar CLI.
- `VeloRegistry` already deployed to Testnet.

Deploy:

```bash
stellar contract deploy \
  --wasm target/wasm32v1-none/release/velo_pay_access.wasm \
  --source-account <SOURCE_ACCOUNT> \
  --network testnet
```

Initialize with the deployed registry contract ID:

```bash
stellar contract invoke \
  --id <VELO_PAY_ACCESS_CONTRACT_ID> \
  --source-account <SOURCE_ACCOUNT> \
  --network testnet \
  -- initialize \
  --registry_contract <VELO_REGISTRY_CONTRACT_ID>
```

After deployment, copy the returned contract ID into the web app environment:

```bash
NEXT_PUBLIC_VELO_PAY_ACCESS_CONTRACT_ID=<DEPLOYED_CONTRACT_ID>
```

Copy the same contract ID into the Convex/backend environment for event sync:

```bash
VELO_PAY_ACCESS_CONTRACT_ID=<DEPLOYED_CONTRACT_ID>
```

`VELO_PAY_ACCESS_CONTRACT_ID` is the canonical backend variable. `NEXT_PUBLIC_VELO_PAY_ACCESS_CONTRACT_ID` is retained as a local compatibility fallback, but hosted Convex deployments should set the backend variable explicitly.

Current Testnet pay access contract ID:

```txt
CBHDLZYSYWETHPC6KDGH35S4SNBU5P7QWLNNDWYXJRHZMZDTQSKYVOXJ
```
