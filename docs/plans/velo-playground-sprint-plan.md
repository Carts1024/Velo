# Velo Playground — Sprint Plan

Status: Sprint 1 **IMPLEMENTED — LIVE EVIDENCE PENDING**; Sprints 2–6 proposed and unimplemented  
Created: 2026-07-23  
Source: `docs/plans/Velo_Playground_Feature_Plan.md`  
Duration: 6 sprints / 12 weeks  
Cadence: 2 weeks / 10 working days per sprint  
Recommended start: 2026-07-27  
Target release: Testnet-first MVP with Velo project integration  
Owners: Product (Nicole), Engineering, Architecture, Design, QA

## Implementation status

Sprint 1 code and deterministic tests are implemented. Live evidence is pending
because `contracts/playground-fixtures/deployments/testnet.json` contains null
contract IDs and Wasm hashes and no interactive wallet run has been recorded.

- [Architecture decision](../architecture/sprint-1-playground-contract-spec-foundation.md)
- [API and versioned type-support reference](../references/sprint-1-playground-api-and-type-support.md)
- [Fixture deployment and requalification runbook](../operations/sprint-1-playground-fixture-runbook.md)
- [Deterministic and live evidence report](../references/sprint-1-playground-evidence.md)

The Sprint 1 implementation deliberately pulls a thin simulation/sign/submit path
forward for one repository-owned Testnet hello fixture. It does not implement the
general argument, simulation-diagnostics, lifecycle-recovery, or result/event scope
planned for Sprints 2–4.

## 1. Product Outcome

Ship a browser-based Soroban contract console that lets a developer:

```text
Select network
→ Load a deployed contract by ID
→ Inspect its contract specification
→ Enter type-safe arguments
→ Simulate the invocation
→ Review the exact transaction
→ Sign with a wallet
→ Submit and track it
→ Inspect decoded results and events
```

The first product proof is not the number of supported screens. It is a reliable,
reproducible Testnet invocation of an unfamiliar Soroban contract without writing a
frontend, converting values to `ScVal` by hand, or exposing a private key.

The strategic proof follows in Sprint 6: the same invocation becomes a Velo project
artifact connected to request logs, events, and webhooks.

## 2. Delivery Assumptions

- One multidisciplinary squad owns the increment from contract loading through final
  transaction status.
- Each sprint is ten working days. Dates below assume a 2026-07-27 kickoff and should
  shift together if kickoff changes.
- Team capacity is not yet supplied, so this plan uses dependency-ordered stories and
  release gates rather than invented story-point commitments.
- Sprint scope is selected only after engineering decomposes each story and confirms
  capacity.
- The existing Next.js 16 app, Convex backend, `@repo/stellar`, Stellar SDK 14.2.0,
  `@repo/ui`, and `@carts1024/velo-wallets` are the starting platform.
- The wallet flow will reuse the existing Velo Wallets runtime. Playground will not
  introduce a second wallet abstraction unless the Sprint 1 spike proves the current
  runtime cannot sign the required Soroban transaction flow.
- Testnet is the default environment. Mainnet is available only after the safeguards
  and release gates in this plan pass.
- No Playground flow asks for, transmits, or persists private keys or seed phrases.

## 3. Scope Contract

### P0 — Required for the MVP

- Testnet and Mainnet selection with persistent network identity.
- Load a deployed contract by contract ID and parse its on-chain specification.
- Display functions, arguments, documentation, return types, and custom types.
- Generate forms for agreed primitive and composite Soroban types.
- Provide synchronized Form and JSON input modes.
- Encode arguments to `ScVal` and decode simulation/final results.
- Require a fresh successful simulation before signing.
- Show fees, required authorization, footprint summary, diagnostics, and raw RPC data.
- Connect a supported wallet, review the exact transaction, sign, and submit it.
- Poll and recover the transaction lifecycle through a final or timed-out state.
- Decode emitted events and expose raw XDR.
- Apply explicit Mainnet warnings and confirmation controls.
- Persist anonymous recent contracts and requests locally.

### P1 — Included in the 12-week target

- TypeScript and Stellar CLI code generation.
- Save contracts and reusable requests to a Velo project.
- Project request history.
- Shareable request links that require re-simulation.
- Correlation with Velo request logs.
- Create a webhook flow from an emitted event.
- Testnet/Mainnet project environment variables for non-secret request values.
- Contract Wasm/spec hashes and a spec cache.

### Deferred

- Source verification and security scoring.
- Contract spec diff and upgrade-management UI.
- Custom/local RPC environments.
- Historical event browsing and full state diffs.
- Automatic restore transactions.
- Multisig, contract-account authorization, and sponsored fees.
- Collection execution, CI automation, VM-level traces, and AI debugging.

Any deferred item entering a sprint requires an explicit trade: an item of equal or
greater effort leaves the committed sprint.

## 4. Release Milestones

| Milestone           | Target          | Evidence                                                                                         |
| ------------------- | --------------- | ------------------------------------------------------------------------------------------------ |
| Technical proof     | End of Sprint 1 | Deterministic fixture/spec proof implemented; deployment and complete Testnet invocation pending |
| Interaction builder | End of Sprint 2 | Agreed type matrix round-trips through Form, JSON, and `ScVal`                                   |
| Safe simulation     | End of Sprint 3 | Invocations simulate with fees, auth, footprint, diagnostics, and invalidation                   |
| End-to-end core     | End of Sprint 4 | Wallet signs, transaction submits, refresh recovery works, result/events decode                  |
| Public alpha        | End of Sprint 5 | Testnet-first public flow passes accessibility, browser, security, and reliability gates         |
| Velo-integrated MVP | End of Sprint 6 | Contracts/requests persist; invocations correlate to Logs and event-to-webhook flow              |

## 5. Sprint Calendar

| Sprint | Dates         | Sprint goal                                                   | User-visible increment                                            |
| ------ | ------------- | ------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1      | Jul 27–Aug 7  | Prove arbitrary contract discovery and invocation feasibility | Load and inspect representative contracts; invoke one on Testnet  |
| 2      | Aug 10–Aug 21 | Make Soroban arguments safe and understandable                | Complete type-aware requests in Form or JSON mode                 |
| 3      | Aug 24–Sep 4  | Make simulation the trustworthy decision point                | Review result, fees, auth, footprint, warnings, and diagnostics   |
| 4      | Sep 7–Sep 18  | Complete the signed transaction lifecycle                     | Review, sign, submit, recover, and decode an invocation           |
| 5      | Sep 21–Oct 2  | Harden the standalone product for public alpha                | Reuse history, generate code, and use the primary flow accessibly |
| 6      | Oct 5–Oct 16  | Connect Playground to Velo operations                         | Save, share, trace, and turn an event into a webhook workflow     |

## 6. Sprint 1 — Contract Spec Foundation

**Goal:** Prove that Velo can load arbitrary deployed Soroban contracts, normalize
their specifications, and complete one browser-based Testnet invocation.

**Implementation status:** **IMPLEMENTED — LIVE EVIDENCE PENDING**

Implemented code covers the versioned normalizer, five deterministic fixture suites,
public loader/browser, and the allowlisted hello simulation/sign/submit/status path.
The live portion of the exit gate remains open until the fixtures are deployed and
an interactive wallet run is retained as evidence.

**Key question:** Can one normalized model support form generation, encoding,
simulation, decoding, and code generation without contract-specific exceptions?

### Stories

#### PG-101 — Lock technical decisions and the supported-type matrix

As the delivery team, we need explicit architectural boundaries so later sprints do
not build incompatible contract, transaction, or wallet paths.

Acceptance criteria:

- A short architecture decision records client/server responsibilities for spec
  loading, transaction preparation, signing, and submission.
- The decision confirms whether a dedicated `packages/stellar-contract-spec` package
  is warranted or whether the capability belongs in `@repo/stellar`.
- A versioned type-support matrix lists every primitive and composite type committed
  for the MVP, SDK support, fixture coverage, and known limitations.
- Simulation freshness, anonymous Mainnet behavior, submission ownership, RPC
  allowlisting, and raw-data redaction have named decisions or decision deadlines.
- The wallet decision evaluates reuse of `@carts1024/velo-wallets`.

#### PG-102 — Fetch and normalize a deployed contract specification

As a developer, I can enter a network and contract ID and receive a stable,
machine-readable description of its interface.

Acceptance criteria:

- Testnet and Mainnet contract addresses are validated before RPC work begins.
- The implementation fetches the contract instance, Wasm reference, and contract
  specification from the selected network.
- Functions, parameters, return types, custom types, and documentation comments are
  normalized without losing source information.
- The result includes network, contract ID, Wasm hash, spec hash, load ledger or
  timestamp, and a correlation ID.
- Malformed, missing, oversized, or unsupported specifications return stage-specific
  errors without crashing the page.
- Immutable spec data can be cached by network and Wasm hash; wallet data and
  signatures are never cached.

#### PG-103 — Build the first contract loader and function browser

As a developer, I can load a contract and understand its available functions before
choosing one.

Acceptance criteria:

- A public Playground route exposes network selection, contract ID entry, load,
  retry, loading, empty, and failure states.
- The contract overview shows contract ID, network, Wasm/spec hashes, function count,
  custom-type count, and load time.
- The function browser supports selection and search by function name.
- Function detail shows available documentation, parameters, parameter types, return
  type, and referenced custom types.
- No function is permanently labelled read-only based only on its name.

#### PG-104 — Establish the representative contract fixture suite

As the engineering team, we need stable fixtures that expose type, authorization,
event, and error edge cases before the UI depends on them.

Acceptance criteria:

- At least five contracts or deterministic fixtures cover primitives, large integers,
  addresses, bytes, vectors, maps, tuples, nested structs, options, enums/unions,
  authorization, emitted events, and contract errors.
- Fixture contract IDs, network, Wasm hashes, deployment steps, and expected
  functions are documented.
- Tests fail clearly when a deployed Testnet fixture changes or disappears.
- One simple and one complex invocation can be built and simulated from fixture data.

#### PG-105 — Complete the thin vertical slice

As a developer, I can load one supported Testnet contract, provide arguments, simulate
it, sign with a supported wallet, submit it, and see a decoded result.

Acceptance criteria:

- The slice proves the full transaction path without requiring production-ready UI.
- Velo never requests or handles the wallet secret.
- The reviewed network, contract, function, arguments, and transaction envelope match
  the signed transaction.
- A successful transaction hash and decoded result are captured as sprint evidence.
- Any gaps discovered are converted into Sprint 2–4 backlog items before sprint close.

### Sprint 1 exit gate

- **Deterministically implemented:** five representative specifications normalize
  from committed fixture XDR.
- **Deterministically implemented:** nested structs, vectors, maps, options,
  enums/unions, large integers, authorization, events, and contract errors have
  fixture and snapshot coverage.
- **Implemented but not live-qualified:** the browser-to-Testnet hello invocation
  path.
- **Pending:** Testnet deployment metadata and one retained interactive wallet
  success.
- **Resolved:** Sprint 1 architecture, type, freshness, Mainnet, RPC, submission,
  redaction, and wallet boundaries.

## 7. Sprint 2 — Dynamic Argument System

**Status:** Proposed and unimplemented.

**Goal:** Let a developer construct valid arguments for the supported Soroban type
matrix without manual `ScVal` conversion.

### Stories

#### PG-201 — Generate primitive and common-type controls

As a developer, I receive an appropriate validated input for each primitive argument.

Acceptance criteria:

- Controls support `bool`, signed/unsigned integers, `i128`/`u128`, supported
  `i256`/`u256`, string, symbol, bytes, fixed bytes, address, timepoint, duration,
  void, and supported error values.
- Large integers remain strings through the entire browser data path.
- Address controls distinguish account and contract addresses and expose exact
  field-path validation errors.
- Byte controls support the committed hex/base64 behavior without ambiguous
  conversion.

#### PG-202 — Generate composite and nested controls

As a developer, I can construct complex contract arguments through a usable,
type-aware form.

Acceptance criteria:

- Controls support options, results, vectors, maps, tuples, structs, enums, unions,
  and nested custom types included in the Sprint 1 matrix.
- Vector/map entries can be added, removed, reordered where order is meaningful, and
  validated independently.
- Union and enum variants expose only fields valid for the selected variant.
- Nesting depth, collection size, and payload limits prevent unresponsive or abusive
  forms.
- Errors identify the exact field path.

#### PG-203 — Implement canonical encode/decode round trips

As a developer, I can trust that visible values and signed values represent the same
contract arguments.

Acceptance criteria:

- One canonical value model drives Form mode, JSON mode, `ScVal` encoding, and result
  decoding.
- Every supported fixture value passes native JSON → `ScVal` → native JSON
  round-trip tests.
- Precision, byte representation, map keys, variants, and nested option semantics are
  covered explicitly.
- Unsupported values fail before transaction construction with a clear type and field
  path.

#### PG-204 — Add synchronized Form and JSON modes

As an advanced developer, I can paste or edit structured JSON without losing the safe
generated-form experience.

Acceptance criteria:

- A valid change in either mode appears in the other mode.
- Invalid JSON remains editable and cannot overwrite the last valid canonical value.
- Mode changes never silently truncate large integers, bytes, variants, or nested
  values.
- Reset-to-example and copy-value actions are keyboard accessible.
- A read-only encoded `ScVal` preview is available for diagnosis.

### Sprint 2 exit gate

- Every committed type has a fixture, control, validation rule, encoder, decoder, and
  automated round-trip test.
- A developer can prepare simple and complex requests in both Form and JSON modes.
- No JavaScript precision loss exists in the supported large-integer paths.
- Unsupported depth, size, and type cases fail safely.

## 8. Sprint 3 — Simulation and Preflight

**Status:** Proposed and unimplemented beyond the narrow Sprint 1 hello slice.

**Goal:** Make simulation the primary, trustworthy decision point before wallet
signing.

### Stories

#### PG-301 — Build and simulate a normalized request

As a developer, I can simulate a contract call using the selected source account and
invocation context.

Acceptance criteria:

- The builder loads the source account, encodes arguments, constructs the invoke
  operation, and calls Stellar RPC simulation using the selected network.
- The simulation record is bound to network, contract ID, Wasm hash, function,
  canonical arguments, source account, transaction settings, and latest ledger.
- Repeated clicks do not create inconsistent user-visible state.
- Every RPC request has a timeout, correlation ID, bounded retry behavior, and a
  stage-specific error.

#### PG-302 — Explain simulation output

As a developer, I can understand the likely result and cost before deciding to sign.

Acceptance criteria:

- The panel shows success/failure, decoded and raw return values, minimum resource
  fee, total fee estimate, latest ledger, required authorization, and footprint
  summary.
- Read-only and read-write ledger keys are distinguishable when present.
- Archived-state, missing account, insufficient balance, auth, excessive-fee, and
  contract-change warnings appear when detected.
- A write-free result is worded as “No writes detected in this simulation,” not as a
  permanent function classification.
- Facts from RPC are visually distinct from inferred explanations.

#### PG-303 — Enforce simulation freshness and invalidation

As a signer, I cannot approve a transaction based on stale or mismatched simulation
data.

Acceptance criteria:

- Argument, source account, network, contract Wasm, fee/resource setting, or wallet
  account changes invalidate the prior simulation.
- The configured freshness window is visible and covered by tests.
- An invalid or stale simulation disables review/signing and offers re-simulation.
- The UI warns that successful simulation does not guarantee final execution.

#### PG-304 — Provide diagnostic and raw-data views

As an advanced developer, I can inspect and copy the technical evidence needed to
reproduce a failure.

Acceptance criteria:

- Raw simulation response, diagnostic events, authorization entries, footprint, and
  unsigned XDR are accessible without obscuring the primary summary.
- Raw viewers are keyboard and screen-reader usable.
- Copy diagnostics includes stage and correlation ID.
- Logs and copied bundles redact configured secret-looking values and never contain
  signatures or wallet secrets.

### Sprint 3 exit gate

- All fixture requests can be simulated or fail with the expected diagnostic.
- The result panel covers fees, auth, footprint, raw data, and decoded errors.
- Every specified context change invalidates simulation.
- Signing cannot begin without a fresh successful simulation.

## 9. Sprint 4 — Wallet, Review, Submission, and Results

**Status:** Proposed and unimplemented beyond the narrow Sprint 1 hello slice.

**Goal:** Complete the safe signed-transaction lifecycle and recover it across page
refresh.

### Stories

#### PG-401 — Connect the Velo wallet runtime

As a developer, I can use a supported wallet account as the signing source.

Acceptance criteria:

- Playground reuses `@carts1024/velo-wallets` unless PG-101 records a justified
  exception.
- The UI supports connect, disconnect, account display, wallet rejection, account
  change, and network mismatch.
- A wallet account change invalidates the current simulation.
- Freighter passes a live Testnet connect and Soroban transaction-signing run on the
  staged Playground.
- Wallet capability limitations return typed, actionable errors.

#### PG-402 — Review the exact transaction

As a signer, I can verify what will be signed in human-readable and raw form.

Acceptance criteria:

- Review shows network, complete contract ID, function, decoded arguments, source
  account, fees, required auth, predicted writes, simulation ledger/time, timeout,
  and raw XDR.
- A stable fingerprint binds review to the exact transaction envelope.
- Any change to the envelope invalidates review and requires a new simulation.
- The signed envelope is verified against the reviewed transaction before
  submission.

#### PG-403 — Submit and track the transaction lifecycle

As a developer, I can see whether a signed transaction is pending, successful,
failed, expired, or unresolved.

Acceptance criteria:

- The implemented lifecycle covers Draft, Simulating, Simulation Failed, Ready to
  Sign, Awaiting Wallet, Signed, Submitting, Pending, Successful, Failed, Expired,
  and Unknown.
- The transaction hash appears as soon as available.
- Polling stops at a final state or bounded timeout; stopping UI polling does not
  imply transaction cancellation.
- Pending transaction identity and state survive refresh.
- Unknown submission outcomes reconcile by transaction hash and are not blindly
  resubmitted.

#### PG-404 — Decode final results and emitted events

As a developer, I can understand the on-chain outcome without manually decoding XDR.

Acceptance criteria:

- Success shows decoded return value, JSON, raw value, fee charged, final ledger,
  transaction hash, and relevant metadata.
- Emitted events show contract ID, topics, decoded data, raw XDR, order, ledger, and
  transaction hash.
- Failure identifies form, building, simulation, signing, submission, execution, or
  timeout stage and preserves the raw evidence.
- External explorer, transaction hash copy, and XDR copy actions are available.

#### PG-405 — Enforce Mainnet safeguards

As a user, I cannot mistake a Mainnet transaction for a Testnet interaction.

Acceptance criteria:

- Network identity remains visible on loader, builder, simulation, review, wallet,
  pending, and final-result states.
- Mainnet review requires explicit acknowledgement; high-risk/admin-tagged requests
  support the committed stronger confirmation.
- Contract ID, network, value-bearing arguments, and contract-change warnings are
  prominent.
- Mainnet requires immediate re-simulation before signing under the rule locked in
  Sprint 1.

### Sprint 4 exit gate

- Testnet happy paths succeed for simple, complex, authorization-required, and
  event-emitting fixture functions.
- Wallet rejection, network mismatch, on-chain failure, timeout, refresh recovery,
  and unknown submission outcomes pass.
- The reviewed, signed, and submitted transaction match.
- A Product/Engineering-approved low-risk Mainnet smoke or documented simulation-only
  gate validates network safeguards without requiring an unsafe value transfer.

## 10. Sprint 5 — Standalone Product Alpha

**Status:** Proposed and unimplemented.

**Goal:** Turn the end-to-end core into a reliable, reusable, accessible public
Testnet-first alpha.

### Stories

#### PG-501 — Add anonymous local history

As a returning anonymous developer, I can reopen recent contracts and requests without
creating an account.

Acceptance criteria:

- Recent contracts and requests are stored locally only by default.
- A user can reopen, duplicate, re-simulate, and clear local history.
- Stored items include network and Wasm/spec hash so contract changes can be flagged.
- Wallet signatures, private data, and raw secret-looking values are excluded.

#### PG-502 — Generate reproducible code

As a developer, I can move a proven Playground request into my own development
workflow.

Acceptance criteria:

- TypeScript SDK and Stellar CLI snippets match network, contract, function, and
  canonical arguments.
- Complex arguments follow the same tested encoding model as Playground.
- Snippets separate simulation, signing, and submission and never embed private keys.
- Package/tool versions and environment placeholders are visible.
- Fixture-based tests compare generated values with Playground encoding.

#### PG-503 — Complete accessibility and responsive behavior

As a keyboard, screen-reader, or narrow-screen user, I can complete the primary
Playground journey.

Acceptance criteria:

- Contract loading, function selection, form editing, simulation, review, wallet
  status, and results are keyboard operable.
- Status changes and field errors are announced accessibly and do not rely on color.
- Reduced-motion behavior and focus management cover dialogs, raw viewers, and state
  transitions.
- Desktop/tablet support the full flow; mobile supports contract loading, simple
  simulation, review, shared links, and status viewing.

#### PG-504 — Add product analytics and operational telemetry

As Product and Operations, we can see where users fail and trace individual requests
without collecting wallet secrets.

Acceptance criteria:

- The funnel records contract loaded, function selected, valid form, simulation,
  wallet connection, signature approval, submission, and final status.
- Timings include contract load, time to first simulation, RPC duration, signing wait,
  submission, and finalization.
- `playground_request_id`, network, contract ID, simulation ID, RPC request ID, and
  transaction hash propagate when available.
- Logs document redaction, retention, and payload limits.

#### PG-505 — Qualify the public alpha

As Product, we have evidence that the standalone Testnet flow is safe and reliable
enough for external users.

Acceptance criteria:

- Chrome, Firefox, Safari, and Edge execute the supported primary flows at the
  committed versions.
- RPC timeout, malformed spec, unsupported type, missing account, wallet rejection,
  network mismatch, simulation failure, on-chain failure, and stale simulation have
  verified recovery paths.
- Anonymous endpoints have rate limits and user-visible limit errors.
- No P0/P1 security or correctness defect remains open.
- The demo contract and fallback demo procedure are documented.

### Sprint 5 exit gate

- A first-time user can reach a successful Testnet simulation and invocation without
  team assistance.
- Code snippets reproduce fixture invocations.
- Primary flows pass keyboard, screen-reader, responsive, and browser qualification.
- Security review confirms no private-key handling, signature storage, or unsafe raw
  data persistence.
- Product approves the Testnet-first public alpha.

## 11. Sprint 6 — Velo Project Integration

**Status:** Proposed and unimplemented.

**Goal:** Make Playground part of Velo’s operational workflow rather than a standalone
contract form generator.

### Stories

#### PG-601 — Save contracts to Velo projects

As a signed-in project member, I can save a loaded contract with project metadata.

Acceptance criteria:

- Authorized members can save network, contract ID, display name, description, tags,
  Wasm hash, spec hash, repository URL, and documentation URL.
- Existing project contract records are reused or migrated deliberately; duplicate
  network/contract entries are prevented.
- Project permissions are enforced in Convex and independently of the UI.
- A Wasm hash change is displayed as an upgrade warning without implying a security
  verdict.

#### PG-602 — Save and reproduce Playground requests

As a project member, I can save a reusable function invocation and re-simulate it
later.

Acceptance criteria:

- A saved request stores contract reference, network, Wasm hash, function, canonical
  arguments/template, source strategy, settings, tags, owner, and timestamps.
- Reopening a request checks network, contract, and Wasm before enabling simulation.
- A user can duplicate, update, and re-simulate a request according to project role.
- Signatures and private keys are never persisted.

#### PG-603 — Persist project request history and audit identity

As a project operator, I can see who simulated or invoked a saved operation and its
outcome.

Acceptance criteria:

- History distinguishes simulations from submitted invocations.
- Entries expose initiating user, contract, function, source account, status, times,
  transaction hash, fee, Wasm hash, and correlation IDs when available.
- Search covers contract, function, account, hash, and status.
- Raw data follows documented redaction and retention rules.

#### PG-604 — Correlate Playground with Velo Logs

As an operator debugging an invocation, I can move from Playground to its RPC and
transaction evidence.

Acceptance criteria:

- One action opens the correlated Velo log/request view using a stable identifier.
- Playground, RPC, submission, status polling, and final result share correlation
  fields.
- Missing or expired log evidence produces a clear state rather than a broken link.
- Access to correlated logs respects project membership.

#### PG-605 — Create a webhook workflow from an emitted event

As a project member, I can use an event from a successful invocation to begin a
webhook subscription.

Acceptance criteria:

- The action pre-populates contract ID, network, and available event topics/data.
- The user reviews and confirms the filter before creating or updating an endpoint.
- Existing project webhook permissions and validation are reused.
- The source transaction and Playground request remain traceable from the resulting
  configuration.

#### PG-606 — Share a safe request

As a developer, I can share a reproducible request without sharing signatures or
secrets.

Acceptance criteria:

- A share uses an opaque server-side identifier and immutable request version.
- Visibility, argument inclusion, and revocation follow the MVP policy.
- Shared data excludes secrets, signatures, private project variables, and private
  metadata.
- A recipient sees the full network and contract ID and must re-simulate before
  invoking.
- A changed Wasm hash produces an explicit warning.

#### PG-607 — Resolve project environment variables safely

As a project member, I can reuse named non-secret contract and address values without
copying them into every request.

Acceptance criteria:

- Variables are scoped by project and environment, with separate Testnet and Mainnet
  values.
- The request builder can insert named variables and previews every resolved value
  before simulation.
- Resolution errors identify the missing or invalid variable and field path.
- Public shares and exports contain neither secret values nor unresolved access to
  private project variables.
- Private keys and wallet seed phrases are rejected as Playground variable values;
  broader secret-variable storage remains deferred until a dedicated security design
  is approved.

### Sprint 6 exit gate

- A project member can save a contract and request, re-simulate it, invoke it, and
  inspect project history.
- A saved request can resolve Testnet/Mainnet project variables and exposes the exact
  resolved values before simulation.
- The invocation opens in Velo Logs through a shared correlation chain.
- An emitted event can pre-populate the existing webhook workflow.
- A shared request is safe, revocable, and requires recipient re-simulation.
- The complete recommended demo runs without manual data correction.

## 12. Cross-Sprint Engineering Work

These are part of each story, not cleanup deferred to Sprint 5:

- Unit tests for spec parsing, supported type conversion, large integers, address
  validation, hashing, redaction, and Mainnet rules.
- Integration tests for RPC spec load, transaction construction, simulation, wallet
  adapter behavior, submission, polling, decoding, and refresh recovery.
- Fixture-based end-to-end tests for success and defined failure paths.
- Correlation IDs and bounded timeouts for every external operation.
- Keyboard, screen-reader, and responsive checks on every new primary state.
- Sanitization of contract comments and metadata before rendering.
- Payload, nesting, collection-size, and RPC time limits.
- Documentation of supported Stellar SDK, RPC, wallet, and browser versions.

## 13. Dependency and Decision Log

| Dependency or decision                        | Needed by      | Owner                         | Deadline          | Default if unresolved                                                                                                                         |
| --------------------------------------------- | -------------- | ----------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Dedicated spec package vs `@repo/stellar`     | PG-102         | Architecture                  | Sprint 1, Day 2   | Keep behind an internal boundary in `@repo/stellar`                                                                                           |
| Client/server transaction construction        | PG-105, PG-301 | Architecture + Security       | Sprint 1, Day 3   | Hybrid: normalize/server-assist, browser review/sign                                                                                          |
| Exact supported type matrix                   | PG-201         | Stellar Engineering           | Sprint 1, Day 4   | Support only types with fixture round-trip proof                                                                                              |
| Existing Velo Wallets suitability             | PG-401         | Wallet Engineering            | Sprint 1, Day 5   | Reuse global `WalletProvider`; do not use `@carts1024/velo-wallets` for anonymous Playground because it requires project-scoped configuration |
| Simulation freshness window                   | PG-303         | Product + Stellar Engineering | Sprint 3 planning | Require re-simulation after context change and before Mainnet sign                                                                            |
| Browser vs Velo signed-transaction submission | PG-403         | Architecture + Security       | Sprint 3, Day 5   | Browser submits directly                                                                                                                      |
| Anonymous Mainnet invocation policy           | PG-405         | Product + Security            | Sprint 4 planning | Simulation allowed; invocation disabled until approved                                                                                        |
| Raw RPC storage/redaction policy              | PG-304, PG-603 | Security + Operations         | Sprint 3, Day 3   | Do not persist raw anonymous payloads                                                                                                         |
| Share-link visibility and argument defaults   | PG-606         | Product + Security            | Sprint 6 planning | Private project link; arguments excluded by default                                                                                           |

## 14. Quality and Release Gates

### Definition of Ready

A story can enter a sprint only when:

- the user outcome and acceptance criteria are testable;
- dependencies and external services are named;
- fixtures, designs, or API decisions needed to begin are available;
- security/privacy impact is identified;
- the team has decomposed the work and confirmed capacity;
- the story can be demonstrated independently or as part of the sprint increment.

### Definition of Done

A story is done only when:

- acceptance criteria pass in the intended environment;
- automated tests cover new business and encoding rules;
- loading, empty, success, stale, and failure states are handled;
- accessibility and responsive behavior are verified for changed UI;
- correlation, timeout, redaction, and rate-limit requirements are met;
- documentation and compatibility notes are updated;
- code is formatted, type-checked, tested, and reviewed;
- Product can demonstrate the user outcome without developer intervention.

### MVP release gate

- All Sprint 1–5 exit gates pass.
- Core repository tests, full build, and lint/type checks pass.
- Five representative contract fixtures remain reproducible.
- Every invocation requires a fresh successful simulation.
- Reviewed, signed, and submitted transactions match.
- Pending status survives refresh and reaches a final or explicit Unknown state.
- No private key or seed phrase handling exists.
- No P0/P1 security, correctness, accessibility, or data-loss defect remains open.
- Testnet-first positioning and Mainnet limitations are visible in product and docs.

## 15. Product Metrics

Establish baselines during Sprints 1–4; do not publish unsupported latency claims.

Primary measures:

- valid-contract load rate;
- time from landing to first successful simulation;
- percentage of loaded contracts reaching a valid argument set;
- simulation success/failure by contract type and failure stage;
- wallet connection and signature approval rates;
- submitted transaction success rate;
- median simulation-to-final-result time, separated from wallet wait;
- unsupported type and decode failure rates;
- repeat use of recent/saved requests;
- project saves, Logs opens, share opens, and event-to-webhook starts.

Alpha guardrails:

- 100% of committed fixture types pass encode/decode round trips.
- 100% of successful public operations expose a support correlation ID.
- Zero known cases of signature, seed phrase, or private-key persistence.
- Zero signing flows enabled from stale or mismatched simulation state.
- Zero silent numeric-precision failures.

## 16. Risks and Mitigations

| Risk                                                         | Impact | Mitigation                                                                                         | Trigger                                                       |
| ------------------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| SDK/spec edge cases invalidate the generic form model        | High   | Lock matrix and fixtures in Sprint 1; defer unsupported types explicitly                           | A representative contract cannot normalize or round-trip      |
| RPC providers expose inconsistent responses or retention     | High   | Pin supported RPC behavior, keep raw evidence, add typed adapters and timeouts                     | Same request decodes differently across supported endpoints   |
| Wallet can connect but cannot sign required Soroban flows    | High   | Reuse Velo Wallets, run live Testnet qualification early, keep a typed capability gate             | PG-105 cannot complete with the selected wallet               |
| Authorization entries exceed the MVP wallet model            | High   | Cover simple auth in MVP; defer contract-account/multisig flows                                    | Fixture requires unsupported non-source authorization         |
| Mainnet UI creates false confidence                          | High   | Simulation-first behavior, persistent network identity, exact review, stronger confirmation        | Network or contract identity is absent from any signing state |
| Raw RPC data leaks user or wallet information                | High   | Default to no anonymous persistence, redact, cap payloads, security review                         | Raw/copy/log path contains signature or secret-looking value  |
| Deep types make the browser unresponsive                     | Medium | Depth/size limits, collapsed rendering, fixture stress tests                                       | Form interaction exceeds the agreed responsiveness budget     |
| Project integration expands before the standalone path works | Medium | Keep Sprints 1–5 standalone; begin persistence only after end-to-end gate                          | Sprint 4 happy path is incomplete                             |
| “Read-only” labeling misleads users                          | Medium | Describe only observed simulation writes and retain Unclassified before simulation                 | UI assigns permanent mutability without verified metadata     |
| Six-sprint scope exceeds actual squad capacity               | High   | Commit sprint-by-sprint after decomposition; preserve milestone order; move P1 before weakening P0 | Capacity forecast cannot meet a sprint exit gate              |

## 17. Demo Plan

Use one stable Testnet contract with:

- a getter-like function;
- a state-changing function;
- an address argument;
- a nested struct or enum;
- an authorization requirement;
- an emitted event.

Final demo:

1. Open the public Playground on Testnet.
2. Paste the contract ID and inspect discovered functions/types.
3. Select the custom-type function and complete its generated form.
4. Simulate and inspect decoded output, authorization, footprint, and fee.
5. Connect the qualified wallet.
6. Review the exact contract, function, arguments, fees, and XDR.
7. Sign and submit.
8. Follow the transaction to final status after a page refresh.
9. Inspect the decoded result and event.
10. Generate a TypeScript snippet.
11. Save the contract and request to a Velo project.
12. Open the correlated operation in Velo Logs.
13. Start a webhook flow from the emitted event.
14. Share a safe request and verify the recipient must re-simulate.

## 18. Sprint Operating Rhythm

- **Planning:** Select only stories whose dependencies are ready and whose combined
  tasks fit observed team capacity.
- **Daily review:** Track the sprint exit gate, not task completion percentage.
- **Mid-sprint proof:** Demonstrate the riskiest integration by Day 5.
- **Backlog refinement:** Prepare the next sprint’s fixtures, decisions, and designs
  before the current sprint ends.
- **Sprint review:** Run the user-visible increment with captured evidence.
- **Retrospective:** Record one process improvement and update capacity assumptions.
- **Release decision:** Product, Engineering, and Security jointly accept or reject the
  relevant milestone gate.

## 19. First Actions

1. Assign Architecture, Stellar Engineering, Web, QA, Design, and Security owners.
2. Confirm the recommended kickoff date and actual squad capacity.
3. Select and pin the five representative fixture contracts.
4. Schedule the PG-101 architecture decision review for Sprint 1, Day 2.
5. Create the minimal public Playground route behind a feature flag.
6. Run the existing Velo Wallets runtime against a Soroban Testnet transaction.
7. Decompose PG-102 through PG-105 and commit only the work that fits Sprint 1.
