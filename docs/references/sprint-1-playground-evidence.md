# Sprint 1 Playground evidence report

Overall status: **IMPLEMENTED — LIVE EVIDENCE PENDING**  
Reviewed: 2026-07-23

## Truth statement

The Sprint 1 implementation and deterministic test assets exist in the repository.
Live Testnet evidence is pending. The checked-in
`contracts/playground-fixtures/deployments/testnet.json` has:

- `status: "undeployed"`;
- `liveQualification: "pending"`;
- null source revision and generation time;
- null contract IDs, Wasm hashes, and deployment ledgers;
- null recorded tool versions.

No interactive browser/wallet run, transaction hash, terminal ledger, or decoded live
result is recorded. This report therefore makes no claim that the full Testnet path
has run successfully.

## Deterministic implementation evidence

The repository contains deterministic coverage for:

| Area                                                                                                                         | Evidence                                                   |
| ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Schema version 1 normalization, ordered source XDR, spec hash, recursive types, and JSON-safe values                         | `packages/stellar/src/contract-spec.test.ts`               |
| Request validation, immutable cache behavior, retry policy, size bounds, status mapping, and error redaction                 | `apps/web/features/playground/contract-loader.test.ts`     |
| Symbol validation, XDR-derived review, signature/hash integrity, mutation rejection, allowlisted call, and Mainnet rejection | `apps/web/features/playground/transaction-service.test.ts` |
| Browser-side unsigned/signed/reviewed hash equality                                                                          | `apps/web/features/playground/client-integrity.test.ts`    |
| Anonymous route, global wallet provider, UI states, accessibility markers, and Mainnet messaging                             | `apps/web/features/playground/playground-ui.test.ts`       |
| Five Rust fixture workspaces and normalized spec snapshots                                                                   | `contracts/playground-fixtures`                            |

Deterministic fixtures cover the `hello`, numeric, collection, nested custom type,
authorization, event, and error specifications. These tests do not contact Testnet
and do not prove current deployment availability or wallet interoperability.

## Validation performed in this worktree

The following non-live checks were run on 2026-07-23:

| Check                                                                                  | Result                                                         |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `pnpm --filter web test`                                                               | Passed                                                         |
| `pnpm --filter web build`                                                              | Passed, including web TypeScript validation                    |
| `pnpm --filter @repo/stellar exec tsc --noEmit`                                        | Passed                                                         |
| Focused `packages/stellar/src/contract-spec.test.ts`                                   | Passed                                                         |
| `cargo test --workspace --locked` in `contracts/playground-fixtures`                   | Passed                                                         |
| `cargo fmt --all -- --check` in `contracts/playground-fixtures`                        | Passed                                                         |
| `generate-spec-fixtures.mjs --check`                                                   | Passed; committed raw and normalized fixtures match local Wasm |
| Focused Oxlint and Oxfmt checks for Sprint 1 sources and docs                          | Passed                                                         |
| `git diff --check`                                                                     | Passed                                                         |
| Local Markdown links, code-fence balance, status wording, and whitespace               | Passed                                                         |
| Literal `ContractSpecError` and contract-spec export traceability to the API reference | Passed                                                         |

The aggregate `pnpm --filter @repo/stellar test` command was also run. Its
Sprint 1 contract-spec test passed, but the package command was not fully green
because `src/transaction-debugger.test.ts` failed. That test is outside the Sprint 1
contract-spec surface and was not changed or reclassified by this documentation
work. The aggregate package result must not be reported as passing.

## Live evidence checklist

| Evidence                                      | Current state |
| --------------------------------------------- | ------------- |
| Five Testnet fixture deployments recorded     | Pending       |
| Deployed Wasm hashes matched to local builds  | Pending       |
| All five specs loaded through the Velo API    | Pending       |
| Hello and nested custom-type live simulations | Pending       |
| Interactive Testnet wallet connection         | Pending       |
| Exact reviewed XDR signed                     | Pending       |
| Server-submitted transaction reached success  | Pending       |
| Transaction hash and terminal ledger retained | Pending       |
| Decoded hello result retained                 | Pending       |

## How to close the evidence gap

Follow the
[fixture deployment and requalification runbook](../operations/sprint-1-playground-fixture-runbook.md).
After the interactive gate succeeds, update this report with only the values captured
by that run, and update `liveQualification` through the repository's reviewed
qualification process. Do not change the status based solely on Cargo, package, web,
or snapshot tests.

Until those steps are complete, the required status remains:

> **IMPLEMENTED — LIVE EVIDENCE PENDING**
