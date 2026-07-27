# Sprint 3 Controlled Paid Cohort Launch

## Purpose and safe default

Sprint 3 is delivered production-ready but disabled. The global billing kill switch stays on,
Mainnet top-ups stay off, and commercial enforcement stays off until the launch workflow validates
every approval, treasury control, active Mainnet offer, and the production environment. Never
populate placeholders with invented addresses, evidence, approvers, or credentials.

Convex billing ledgers are the only entitlement source. The PayAccess balance is a display-only
mirror and must never be used to authorize a merchant payment.

## Required launch evidence

Record an append-only decision for Product, Finance, Legal, Tax, Compliance, Security, and
Operations. Every latest decision must be approved and reference the same reviewed policy digest.
A rejection or revocation is an immediate stop condition and automatically restores the safe
platform state if Mainnet was armed.

Configure one active production treasury with:

- its dedicated Mainnet account and canonical USDC issuer;
- independent receipt-verification evidence;
- signer and withdrawal-policy references;
- named monitoring and reconciliation owners;
- the incident-procedure reference.

Set `VELO_STELLAR_NETWORK=public`, `VELO_DEPLOYMENT_ENVIRONMENT=production`, and
`VELO_MAINNET_USDC_ISSUER=<canonical issuer public key>` in the production Convex environment.
The readiness gate remains blocked when the canonical issuer is absent or differs from the
treasury/offer asset.

Create the controlled Mainnet offer against that exact treasury. Testnet/XLM offers remain separate
and are activated independently.

## Activation sequence

1. Verify that automated backend, web, deployment, observability, and contract suites pass for the
   reviewed commit.
2. Record the seven approvals and treasury evidence in the billing operator dashboard.
3. Create and activate the exact Mainnet USDC offer.
4. Confirm the readiness dashboard has no blockers.
5. Select **Arm Mainnet**. This enables the guarded Mainnet policy while retaining the kill switch.
6. Prepare each organization individually using the cohort sequence below.
7. Review the readiness state again, then select **Activate Mainnet** only during the approved
   launch window.
8. Record the decision, operator, evidence, and launch window in the incident channel.

Every arm, activation, rollback, and kill-switch transition is preserved in the operational audit
log. Never enable the flags by editing database records.

## Organization rollout

Existing organizations are not migrated automatically. For every organization:

1. Verify the organization through the existing verification workflow.
2. Grant the one-time promotional trial, if it has not already been granted.
3. Assign `internal`, `design_partner`, or `paid_cohort`.
4. Enter an explicit grace deadline; there is no implicit grace period.
5. Send the migration notice and low-balance notice.
6. Enable organization enforcement only after the prerequisites above are visible.
7. Enable the PayAccess mirror only when the organization and its projects are ready for an external
   operator to sign mirror transactions.

During grace, merchant payments remain available and no new commercial reservation is made. After
grace, the existing atomic reserve/consume/release path applies only when both global and
organization enforcement are enabled. Mainnet top-ups are limited to enabled cohort organizations.

Start with internal traffic, then a small design-partner group, then the approved paid cohort.
Review the operator scorecard after each expansion: organization activation, trial-to-paid
conversion, repeat top-ups, payment success, credit consumption, contribution margins, exception
volume, disputes, and support time.

## Daily operations

- Review unmatched receipts and consumption, overdue exceptions, replay status, launch-gate
  changes, cohort activity, disputes, support workload, revenue, and contribution margins.
- The daily UTC replay reconstructs every organization/book balance from immutable ledger entries.
  It stores a deterministic run digest and creates assigned high-severity exceptions for mismatch.
- Critical exceptions have a one-hour SLA, high four hours, medium 24 hours, and low 72 hours.
- Finance enters immutable UTC cost periods and approves them before snapshot generation.
- Generate finance snapshots only from immutable receipts, ledger entries, refunds, and PDAX
  economics. Do not introduce an FX rate for non-USDC merchant successes.
- Independently sample treasury receipts and commercial consumes during the controlled cohort.

## Stop and rollback

Use **Rollback** immediately for a revoked approval, treasury anomaly, incorrect consumption,
unbounded reconciliation backlog, compromised production credential, or material cohort harm.
Rollback restores top-ups off, enforcement off, and the kill switch on. Preserve evidence, keep
commercial records immutable, and follow the incident runbook before recovery.
