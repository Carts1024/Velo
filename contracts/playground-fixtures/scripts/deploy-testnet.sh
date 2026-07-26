#!/usr/bin/env bash
set -euo pipefail

workspace="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
manifest="$workspace/deployments/testnet.json"
identity=""

usage() {
  echo "Usage: $0 --identity <stellar-cli-identity-name> [--manifest <path>]"
}

while (($# > 0)); do
  case "$1" in
    --identity)
      identity="${2:-}"
      shift 2
      ;;
    --manifest)
      manifest="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
done

if [[
  -z "$identity" ||
  ! "$identity" =~ ^[A-Za-z0-9._-]+$ ||
  "$identity" =~ ^[GSCMPTX][A-Z2-7]{55}$
]]; then
  echo "deployment failed [validate-identity]: pass a Stellar CLI identity name, not key material" >&2
  exit 2
fi

for command in cargo curl git python3 sha256sum stellar; do
  command -v "$command" >/dev/null || {
    echo "deployment failed [preflight]: missing command $command" >&2
    exit 1
  }
done

deployer_account="$(stellar keys address "$identity")" || {
  echo "deployment failed [validate-identity]: Stellar CLI identity '$identity' was not found" >&2
  exit 1
}

if [[ -n "$(git -C "$workspace" status --porcelain -- .)" ]]; then
  echo "deployment failed [source-dirty]: commit fixture changes before deployment" >&2
  exit 1
fi

cargo build \
  --manifest-path "$workspace/Cargo.toml" \
  --workspace \
  --release \
  --target wasm32v1-none \
  --locked

records="$(mktemp)"
progress="${manifest%.json}.partial.tsv"
progress_tmp=""

cleanup() {
  rm -f "$records"
  if [[ -n "$progress_tmp" ]]; then
    rm -f "$progress_tmp"
  fi
}
trap cleanup EXIT

if [[ -f "$progress" ]]; then
  IFS=$'\t' read -r progress_marker progress_account <"$progress"
  if [[ "$progress_marker" != "#deployerAccount" || "$progress_account" != "$deployer_account" ]]; then
    echo "deployment failed [resume]: partial progress belongs to another deployer" >&2
    echo "review or remove $progress before starting a new deployment" >&2
    exit 1
  fi
  tail -n +2 "$progress" >"$records"
  echo "resuming deployment progress from $progress"
fi

fixtures=(
  "hello:velo_playground_hello.wasm"
  "numeric:velo_playground_numeric.wasm"
  "collections:velo_playground_collections.wasm"
  "custom-types:velo_playground_custom_types.wasm"
  "auth-events-errors:velo_playground_auth_events_errors.wasm"
)

for fixture in "${fixtures[@]}"; do
  name="${fixture%%:*}"
  wasm_file="${fixture#*:}"
  wasm="$workspace/target/wasm32v1-none/release/$wasm_file"
  wasm_hash="$(sha256sum "$wasm" | cut -d ' ' -f 1)"

  existing_record="$(awk -F $'\t' -v fixture_name="$name" '$1 == fixture_name { print; exit }' "$records")"
  if [[ -n "$existing_record" ]]; then
    IFS=$'\t' read -r _ existing_contract_id existing_wasm_hash existing_ledger \
      <<<"$existing_record"
    if [[
      ! "$existing_contract_id" =~ ^C[A-Z2-7]{55}$ ||
      "$existing_wasm_hash" != "$wasm_hash" ||
      ! "$existing_ledger" =~ ^[0-9]+$
    ]]; then
      echo "deployment failed [$name:resume-drift]: partial deployment does not match local Wasm" >&2
      exit 1
    fi
    if ! stellar contract info interface \
      --contract-id "$existing_contract_id" \
      --network testnet \
      --output json \
      --quiet >/dev/null; then
      echo "deployment failed [$name:resume-missing]: recorded contract is not available on Testnet" >&2
      exit 1
    fi
    echo "resumed $name at observed ledger $existing_ledger"
    continue
  fi

  contract_id="$(
    stellar contract deploy \
      --wasm "$wasm" \
      --source "$identity" \
      --network testnet
  )" || {
    echo "deployment failed [$name:deploy]" >&2
    echo "successful fixture records remain in $progress; rerun the same command to resume" >&2
    exit 1
  }

  if [[ ! "$contract_id" =~ ^C[A-Z2-7]{55}$ ]]; then
    echo "deployment failed [$name:validate-contract-id]" >&2
    exit 1
  fi

  latest_ledger="$(
    curl --fail --silent --show-error \
      -H "Content-Type: application/json" \
      -d '{"jsonrpc":"2.0","id":1,"method":"getLatestLedger"}' \
      https://soroban-testnet.stellar.org |
      python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["sequence"])'
  )" || {
    echo "deployment failed [$name:resolve-ledger]" >&2
    exit 1
  }

  printf '%s\t%s\t%s\t%s\n' "$name" "$contract_id" "$wasm_hash" "$latest_ledger" >>"$records"
  progress_tmp="$(mktemp)"
  {
    printf '#deployerAccount\t%s\n' "$deployer_account"
    cat "$records"
  } >"$progress_tmp"
  mv "$progress_tmp" "$progress"
  progress_tmp=""
  echo "deployed $name at observed ledger $latest_ledger"
done

source_revision="$(git -C "$workspace" rev-parse HEAD)"
generated_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
stellar_version="$(stellar --version)"
rustc_version="$(rustc --version)"
cargo_version="$(cargo --version)"

python3 - "$records" "$manifest" "$generated_at" "$source_revision" \
  "$stellar_version" "$rustc_version" "$cargo_version" <<'PY'
import json
import pathlib
import sys

records_path, manifest_path, generated_at, revision, stellar, rustc, cargo = sys.argv[1:]
contracts = {}
with open(records_path, encoding="utf-8") as records:
    for line in records:
        name, contract_id, wasm_hash, ledger = line.rstrip("\n").split("\t")
        contracts[name] = {
            "contractId": contract_id,
            "wasmHash": wasm_hash,
            "deploymentLedger": int(ledger),
        }

manifest = {
    "schemaVersion": 1,
    "network": "testnet",
    "status": "deployed",
    "liveQualification": "pending",
    "generatedAt": generated_at,
    "sourceRevision": revision,
    "toolVersions": {
        "stellarCli": stellar,
        "rustc": rustc,
        "cargo": cargo,
    },
    "contracts": contracts,
}
path = pathlib.Path(manifest_path)
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
PY

rm -f "$progress"
echo "wrote deployment manifest: $manifest"
echo "live qualification remains pending until the browser/wallet exit gate is retained"
