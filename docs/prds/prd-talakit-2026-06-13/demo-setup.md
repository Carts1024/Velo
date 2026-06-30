# Velo DemoPay Setup

Use this flow before a timed hackathon demo. It requires no direct Convex database edits.

## Prerequisites

1. Start the web and Convex development processes with the documented environment variables.
2. Connect a funded Stellar Testnet wallet.
3. Set `NEXT_PUBLIC_VELO_REGISTRY_CONTRACT_ID` to the deployed Testnet registry contract.
4. Set `NEXT_PUBLIC_VELO_PAY_ACCESS_CONTRACT_ID` in the web app and `VELO_PAY_ACCESS_CONTRACT_ID` in Convex/backend to the deployed Testnet pay-access contract.
5. Have one DemoPay Soroban contract ID available.
6. For webhook delivery, deploy the web app or expose port 3000 through an HTTPS tunnel. Hosted Convex cannot call localhost.

## Timed Journey

1. Create a project named `DemoPay` from `/projects/new`.
2. Register it on-chain and wait for Velo to sync the registry project ID.
3. Add the DemoPay contract from the project contracts screen.
4. Poll events after the contract has emitted at least one Testnet event.
5. Open and copy the public proof URL. Verify it in a private browser window without a wallet.
6. Inspect the registration or event transaction hash in `/debug`.
7. Configure `/api/webhook-tester` on the public deployment as the webhook URL.
8. Send a test event and open the resulting delivery log.
9. Confirm the project dashboard checklist shows all six steps complete.

Target elapsed time after prerequisites are ready: under 10 minutes.

## Reset Strategy

- Create a new project slug for a clean run, such as `demopay-2`.
- Reuse the deployed registry and DemoPay contract.
- Do not delete or patch Convex rows during the demo.

## Known Limitations

- Testnet is the only supported network in Phase 1.
- Webhook delivery requires a public HTTPS endpoint; localhost is intentionally rejected.
- Webhook retries and signing are deferred. Each manual send is one recorded attempt.
- Event monitoring polls a bounded recent ledger window and can show stale when RPC polling is delayed.
- Public proof exposes registry-safe project fields and public on-chain event fields. Webhook URLs, delivery logs, raw event payloads, and poller errors remain owner-only.
- The setup flow is documented rather than automatically seeded because registration and contract linking require wallet signatures.
