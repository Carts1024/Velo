# Sprint 1 Playground evidence report

Overall status: **IMPLEMENTED — LIVE EVIDENCE PENDING**  
Reviewed: 2026-07-23

## Truth statement

The Sprint 1 implementation and deterministic test assets exist in the repository.
The checked-in `contracts/playground-fixtures/deployments/testnet.json` records a
complete five-contract Testnet deployment generated at `2026-07-23T08:25:16Z` from
source revision `9254a8a1cf7fc4556f7e804395a0d5a84650b752`.

At `2026-07-23T08:41:26Z`, the live smoke loaded all five specifications through the
Velo API, matched their deployed Wasm hashes, and simulated both `hello` and the
nested `custom-types` profile without submission.

`liveQualification` remains `pending`. No interactive browser/wallet transaction
hash, terminal ledger, or decoded live result is recorded, so this report does not
claim completion of the full Testnet exit gate.

| Fixture              | Contract ID                                                | Wasm hash                                                          | Deployment ledger |
| -------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------ | ----------------: |
| `hello`              | `CCTVBDL3OUNZXS2F6KUNPG4RGCKMI3F57SQ7YHFLG6TIK4NKDEDKMAG3` | `0c85c9f875dec390c4168f238869e6eb1ef7e7f0041af7392de037ee22b37c0e` |           3754794 |
| `numeric`            | `CBYINBKV52V5J7FQGLFQHFPNWKGW3ACXASGEKWCFNCMLEESOKBACZ5NY` | `bcbdd76fa14459f2cddab680fe47ea6062064ead12cf13ff673c4a97a50c809f` |           3754809 |
| `collections`        | `CBTYOCIVGJ2QGREMT6OXVBSGWGJASPNEXJORM34IPS2PBBRLQLXZNTHY` | `3e3d3578673cacd8bb029202e4ca022a6927e06f3ec136afa87981a68c525162` |           3754823 |
| `custom-types`       | `CDE5XAK4N5JCGWNPGCXPEWV4VWBAPT2J7RTHLPNUFD6N5PURJCDYVLYK` | `d69929e9ce25bb4f23e3e7d2aa0bceb853018c1c20568aa5cf5cffef5b16bd14` |           3755439 |
| `auth-events-errors` | `CDT3DBQMKRMWDOOXODNYD6ZP27LEZS5JMN2FMSL5OYXVDJJVI34U2TSQ` | `5f19b0b10cec803d6df7a25bbaebbe1cf56c0c1ebf876f43bd6d81516450491b` |           3755446 |

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

| Evidence                                      | Current state       |
| --------------------------------------------- | ------------------- |
| Five Testnet fixture deployments recorded     | Verified 2026-07-23 |
| Deployed Wasm hashes matched to local builds  | Verified 2026-07-23 |
| All five specs loaded through the Velo API    | Verified 2026-07-23 |
| Hello and nested custom-type live simulations | Verified 2026-07-23 |
| Interactive Testnet wallet connection         | Pending             |
| Exact reviewed XDR signed                     | Pending             |
| Server-submitted transaction reached success  | Pending             |
| Transaction hash and terminal ledger retained | Pending             |
| Decoded hello result retained                 | Pending             |

## How to close the evidence gap

Follow the
[fixture deployment and requalification runbook](../operations/sprint-1-playground-fixture-runbook.md).
After the interactive gate succeeds, update this report with only the values captured
by that run, and update `liveQualification` through the repository's reviewed
qualification process. Do not change the status based solely on Cargo, package, web,
or snapshot tests.

Until those steps are complete, the required status remains:

> **IMPLEMENTED — LIVE EVIDENCE PENDING**
