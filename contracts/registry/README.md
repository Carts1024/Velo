# TalaKit Registry Contract

Soroban registry contract for TalaKit project verification on Stellar Testnet.

## Public Interface

- `register_project(owner, name, metadata_hash) -> u64`
- `update_project(project_id, metadata_hash)`
- `add_contract(project_id, contract_id)`
- `remove_contract(project_id, contract_id)`
- `transfer_ownership(project_id, new_owner)`
- `deactivate_project(project_id)`
- `get_project(project_id) -> Option<Project>`
- `get_project_contracts(project_id) -> Vec<Address>`

Owner mutations require `owner.require_auth()`. Read functions require no auth.

## Test

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
target/wasm32v1-none/release/talakit_registry.wasm
```

If using Stellar CLI from the monorepo root, the equivalent command is:

```bash
stellar contract build --manifest-path contracts/registry/Cargo.toml
```

## Deploy To Testnet

Prerequisites:

- Stellar CLI installed and authenticated.
- A funded Testnet source account configured in Stellar CLI.
- Stellar Testnet network configured in Stellar CLI.

Deploy:

```bash
stellar contract deploy \
  --wasm target/wasm32v1-none/release/talakit_registry.wasm \
  --source-account <SOURCE_ACCOUNT> \
  --network testnet
```

After deployment, copy the returned contract ID into the web app environment:

```bash
NEXT_PUBLIC_TALAKIT_REGISTRY_CONTRACT_ID=<DEPLOYED_CONTRACT_ID>
```

Current Testnet registry contract ID:

```txt
[PENDING_DEPLOYMENT]
```
