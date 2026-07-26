#!/usr/bin/env bash
set -euo pipefail

workspace="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
manifest="$workspace/deployments/testnet.json"
api_base_url="http://localhost:3000"
identity=""

usage() {
  echo "Usage: $0 --identity <stellar-cli-identity-name> [--api-base-url <http(s)://host>] [--manifest <path>]"
}

while (($# > 0)); do
  case "$1" in
    --identity)
      identity="${2:-}"
      shift 2
      ;;
    --api-base-url)
      api_base_url="${2:-}"
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
  echo "smoke failed [validate-identity]: pass a Stellar CLI identity name, not key material" >&2
  exit 2
fi
if [[ ! "$api_base_url" =~ ^https?://[^[:space:]]+$ ]]; then
  echo "smoke failed [validate-api-url]: expected an http(s) URL" >&2
  exit 2
fi

for command in curl python3 stellar; do
  command -v "$command" >/dev/null || {
    echo "smoke failed [preflight]: missing command $command" >&2
    exit 1
  }
done

stellar keys address "$identity" >/dev/null || {
  echo "smoke failed [validate-identity]: Stellar CLI identity '$identity' was not found" >&2
  exit 1
}

manifest_status="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["status"])' "$manifest")"
if [[ "$manifest_status" != "deployed" ]]; then
  echo "smoke failed [manifest]: fixtures are not marked deployed" >&2
  exit 1
fi

fixtures=(hello numeric collections custom-types auth-events-errors)
for name in "${fixtures[@]}"; do
  contract_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["contracts"][sys.argv[2]]["contractId"])' "$manifest" "$name")"
  expected_hash="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["contracts"][sys.argv[2]]["wasmHash"])' "$manifest" "$name")"
  response="$(mktemp)"
  trap 'rm -f "$response"' EXIT

  curl --fail-with-body --silent --show-error \
    -H "Content-Type: application/json" \
    -d "{\"network\":\"testnet\",\"contractId\":\"$contract_id\"}" \
    "$api_base_url/api/v1/playground/contracts/load" >"$response" || {
    if [[ -s "$response" ]]; then
      python3 - "$response" <<'PY' >&2
import json
import sys

try:
    error = json.load(open(sys.argv[1], encoding="utf-8")).get("error", {})
except (OSError, json.JSONDecodeError):
    error = {}
if error:
    print(
        "api error"
        f" code={error.get('code', 'UNKNOWN')}"
        f" stage={error.get('stage', 'unknown')}"
        f" correlationId={error.get('correlationId', 'unknown')}"
    )
PY
    fi
    echo "smoke failed [$name:load]" >&2
    exit 1
  }

  actual_hash="$(
    python3 - "$response" <<'PY'
import json
import sys

payload = json.load(open(sys.argv[1], encoding="utf-8"))
candidates = [
    payload,
    payload.get("data", {}) if isinstance(payload, dict) else {},
    payload.get("contract", {}) if isinstance(payload, dict) else {},
]
for candidate in candidates:
    if isinstance(candidate, dict) and candidate.get("wasmHash"):
        print(candidate["wasmHash"])
        break
else:
    raise SystemExit("response did not contain wasmHash")
PY
  )" || {
    echo "smoke failed [$name:decode-load]" >&2
    exit 1
  }

  if [[ "${actual_hash,,}" != "${expected_hash,,}" ]]; then
    echo "smoke failed [$name:wasm-drift]: expected $expected_hash, received $actual_hash" >&2
    exit 1
  fi

  rm -f "$response"
  trap - EXIT
  echo "loaded $name ($contract_id)"
done

hello_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["contracts"]["hello"]["contractId"])' "$manifest")"
stellar contract invoke \
  --id "$hello_id" \
  --source "$identity" \
  --network testnet \
  --send no \
  -- \
  hello \
  --to Velo >/dev/null || {
  echo "smoke failed [hello:simulate]" >&2
  exit 1
}
echo "simulated hello"

custom_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["contracts"]["custom-types"]["contractId"])' "$manifest")"
profile='{"display_name":"Velo","home":{"latitude":14599500,"longitude":120984200},"tags":["stellar","soroban"]}'
stellar contract invoke \
  --id "$custom_id" \
  --source "$identity" \
  --network testnet \
  --send no \
  -- \
  echo_profile \
  --value "$profile" >/dev/null || {
  echo "smoke failed [custom-types:simulate]" >&2
  exit 1
}
echo "simulated custom-types nested profile"
echo "Testnet smoke passed; interactive browser/wallet live qualification is still pending"
