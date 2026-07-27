# Sprint 3 Billing Incident Runbook

## First response

1. Acknowledge the alert and assign an incident commander.
2. Record impact, affected organizations, first observed time in UTC, and evidence links.
3. If commercial correctness or treasury safety is uncertain, use the guarded rollback action. This
   turns Mainnet top-ups and enforcement off and restores the kill switch.
4. Preserve receipts, ledger entries, mirror attempts, reconciliation results, and operator audit
   events. Never delete or rewrite financial records.
5. Classify and assign the billing exception. Use the one-hour critical, four-hour high, 24-hour
   medium, or 72-hour low SLA.

## Treasury anomaly or unmatched receipt

- Stop top-ups and confirm the configured treasury account, USDC issuer, amount, memo, payment
  intent, ledger, and finality independently.
- Do not grant credits from an unverified or mismatched transfer.
- Run reconciliation and the complete ledger replay; attach explorer and verifier evidence.
- Resume only after Finance and Operations confirm the discrepancy is understood and treasury
  readiness remains valid.

## Incorrect or unmatched consumption

- Activate rollback before attempting compensation.
- Identify the payment intent, reservation, immutable consume/release entries, verifier result, and
  duplicate/idempotency keys.
- Do not edit balances or restore credits by editing a receipt. Use an approved compensating ledger
  entry linked to the exception and preserve the resolution history.
- Re-run the affected organization/book replay and lifecycle tests before recovery.

## Dispute or cash refund

- Link the refund to its settled top-up and treasury receipt.
- Classify it as deferred-revenue reduction, recognized-revenue reversal, or expense.
- A cash refund does not automatically restore credits. Any credit adjustment is a separate,
  approved compensating entry.
- Attach processor/treasury evidence and include the refund in the next immutable finance snapshot.

## Compromised credential or mirror authority

- Roll back Mainnet billing if a treasury, verifier, operator, or deployment credential is exposed.
- Revoke the credential in its owning system and rotate it under the documented signer policy.
- PayAccess mirror-authority rotation requires authorization from both the old and new authorities.
  If the old authority is unavailable, follow the reviewed contract recovery/upgrade policy rather
  than bypassing authorization.
- A mirror outage, stale value, or corruption affects display only. Do not change Convex commercial
  entitlement to match the mirror.

## Verifier or PDAX outage

- Disable affected traffic or roll back when finality cannot be established.
- Keep reservations bounded by their existing expiry and release rules; never consume without one
  verified success.
- Record PDAX quoted cost, actual cost, failure cost, subsidy, and pass-through economics even on
  failure.
- Recover only after health checks and a controlled retry prove idempotent behavior.

## Reconciliation backlog or replay failure

- Assign a high-severity exception to Billing Operations and review replay cursor, digest, processed
  balance count, and last error.
- Keep the kill switch on if the backlog can hide material commercial mismatch.
- Retry the resumable run from its stored run/cursor. Do not start competing runs for the same UTC
  date.
- Sample immutable entries against materialized balances before closing the exception.

## Recovery

1. Document root cause, affected records, compensating entries, and test evidence.
2. Confirm all seven latest launch approvals remain approved and share one policy digest.
3. Revalidate treasury readiness, the active Mainnet offer, production environment, exception
   backlog, and cohort configuration.
4. Arm Mainnet with the kill switch retained, observe a controlled health window, then activate only
   with the approved launch owner present.
5. Close exceptions with evidence and resolution history; publish the post-incident review.

