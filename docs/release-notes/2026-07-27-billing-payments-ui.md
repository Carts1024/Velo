# Velo release notes: billing, payments, and usability

**Date:** 2026-07-27

This release makes Velo’s billing and payment workflows easier to understand and more dependable. It adds a clearer billing workspace, improves supported-asset handling, provides more actionable payment feedback, and refines the surrounding user experience.

## What’s new

### A clearer billing workspace

- View billing balances and history in one dedicated workspace.
- Get more consistent selection and formatting for supported billing assets, including USDC and XLM.
- Follow clearer guidance through top-up and billing-error states.

### More actionable payment feedback

- Payment creation now distinguishes insufficient billing credits from other payment errors.
- Structured error information makes it easier for integrations to respond appropriately.
- Payment cancellation and recovery guidance is clearer, so users know what to do next when a payment cannot continue.

### A more polished interface

- Improved copy-to-clipboard behavior for code examples.
- Refined navigation, button ordering, and accessibility details across payment and developer workflows.
- More consistent validation of product telemetry, supporting more trustworthy diagnostics.

## Reliability improvements

The release adds automated coverage for billing-asset behavior, billing balances and history, top-up flows, payment states, and common error conditions. This gives the billing and payment experience stronger protection as the product evolves.

## What this means for Velo users

You should find it easier to understand your billing status, choose the right supported asset, recover from common payment issues, and move from integration examples to working payment flows with less friction.
