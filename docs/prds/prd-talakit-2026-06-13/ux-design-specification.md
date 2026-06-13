---
title: "UX Design Specification: TalaKit Phase 1"
status: draft
created: 2026-06-13
updated: 2026-06-13
workflowType: ux-design
project_name: TalaKit
stepsCompleted: [1]
inputDocuments:
  - docs/prds/prd-talakit-2026-06-13/prd.md
  - docs/prds/prd-talakit-2026-06-13/architecture.md
  - README.md
---

# UX Design Specification: TalaKit Phase 1

## 1. Design Intent

TalaKit Phase 1 should feel like a developer operations cockpit for Stellar and Soroban apps: calm, information-dense, precise, and credible. The user is not browsing marketing copy; they are trying to prove ownership, debug failures, inspect activity, and show evidence during a hackathon demo.

The UI should optimize for this promise:

> "I can prove this contract belongs to my project, see what happened on-chain, and confirm my backend received the event."

## 2. Product Surface

Phase 1 needs these required screens:

1. Landing / Entry
2. Wallet Connect State
3. Project List / Dashboard Home
4. Create Project
5. Project Dashboard
6. Contract Management
7. Public Verified Project Page
8. Transaction Debugger
9. Event Monitor
10. Webhook Settings
11. Webhook Delivery Logs

Recommended route map:

```txt
/
/dashboard
/projects/new
/projects/[projectId]
/projects/[projectId]/contracts
/projects/[projectId]/events
/projects/[projectId]/webhooks
/debug
/verify/[slug]
```

## 3. UX Principles

- **Proof first:** surfaces that answer "is this official?" must foreground owner wallet, registry status, contract IDs, and last sync state.
- **No mystery chain states:** pending, failed, stale, rejected, unavailable, and verified states must be visible in plain language.
- **Copy addresses, do not read them:** long hashes and IDs should be truncated by default, copyable, and expandable.
- **Demo paths stay short:** the DemoPay journey should fit in one left-to-right workflow: create, register, add contract, verify, debug, webhook log.
- **Public is not private:** public verified pages must never expose webhook URLs, API keys, private settings, or dashboard-only logs.
- **Tables over decorative cards:** use tables, compact panels, tabs, and code blocks for developer data.

## 4. Information Architecture

### Primary App Shell

Use a persistent dashboard shell after wallet connection:

- Left sidebar on desktop.
- Top bar on mobile.
- Main content area with a page header, primary action, and status summary.

Primary navigation:

- Dashboard
- Projects
- Debugger

Project-level navigation:

- Overview
- Contracts
- Events
- Webhooks
- Public Page

### Global Header

Desktop header:

- Product mark: `TalaKit`
- Network badge: `Testnet`
- Sync health: `RPC OK`, `RPC slow`, or `RPC unavailable`
- Wallet button: connected address or `Connect wallet`

Mobile header:

- Product mark
- Wallet button
- Menu icon

## 5. Visual System Direction

### Existing UI Library

TalaKit should use the reusable component system in `packages/ui/src` as the base UI kit. Do not create a second design system inside `apps/web` for Phase 1.

Available component groups:

- Base UI primitives: `packages/ui/src/components/ui/*`
- Custom variants: `packages/ui/src/components/ui-customs/*`
- Loading states: `packages/ui/src/components/common/loading/*`
- Icons and utilities: `packages/ui/src/components/common/icons/*`
- Responsive hooks: `packages/ui/src/hooks/*`
- Shared utility: `packages/ui/src/lib/utils.ts`

Import guidance:

- The package is named `@repo/ui`.
- It exports files by source path pattern, so implementation should import concrete files such as `@repo/ui/components/ui/button`, `@repo/ui/components/ui/table`, and `@repo/ui/components/ui-customs/badge`.
- Prefer existing UI files over adding local copies under `apps/web`.
- Create TalaKit-specific composed components in `apps/web/features/*` only when they combine multiple primitives into a domain pattern, such as `CopyableHash`, `RegistryStatusBadge`, or `WebhookDeliveryTable`.

### Tone

Use a pragmatic developer-tool aesthetic:

- White or near-white background.
- Dark neutral text.
- Subtle borders.
- Crisp status badges.
- Minimal color, reserved for state and priority.

Avoid crypto-dashboard spectacle: no glowing gradients, no oversized token charts, no decorative hero cards.

### Suggested Palette

- Background: `#F8FAFC`
- Surface: `#FFFFFF`
- Primary text: `#0F172A`
- Secondary text: `#475569`
- Border: `#E2E8F0`
- Primary action: `#2563EB`
- Verified/success: `#16A34A`
- Warning/stale: `#D97706`
- Error/failed: `#DC2626`
- Info/pending: `#0891B2`
- Code/hash background: `#F1F5F9`

### Typography

- Use Inter or the app default sans font.
- Use tabular numbers for ledgers, fees, timestamps, and counts.
- Use monospace for wallet addresses, transaction hashes, contract IDs, XDR, JSON payloads, and event topics.

### Core Components

- Status badge: compose from `components/ui-customs/badge.tsx` because it already supports `success`, `warning`, `info`, `error`, and neutral variants.
- Copyable hash: compose from `components/ui/button.tsx`, `components/ui/tooltip.tsx`, and monospace text styles.
- Wallet button: compose from `components/ui/button.tsx`, `components/ui/dropdown-menu.tsx`, and `components/ui-customs/badge.tsx`.
- Network badge: use `components/ui-customs/badge.tsx`.
- Sync health indicator: use `components/ui-customs/badge.tsx` plus lucide status icons.
- Empty state: use `components/ui/empty.tsx`.
- Error callout: use `components/ui/alert.tsx`.
- Transaction timeline: compose from `components/ui/item.tsx`, `components/ui/separator.tsx`, and status badges.
- Event table: use `components/ui/table.tsx` with `components/ui-customs/x-scroll.tsx` for horizontal overflow.
- Webhook delivery table: use `components/ui/table.tsx`, `components/ui/sheet.tsx`, and `components/ui-customs/x-scroll.tsx`.
- JSON payload viewer: use a styled `pre` block inside `components/ui/scroll-area.tsx` or `components/ui-customs/x-scroll.tsx`.
- Confirmation modal for owner-only chain mutations: use `components/ui/alert-dialog.tsx`.
- Toasts for short feedback: use `components/ui/sonner.tsx` or `components/ui-customs/sonner.tsx`.
- Loading states: use `components/common/loading/loading-button.tsx`, `loading-screen.tsx`, `loading-full.tsx`, and `components/ui/skeleton.tsx`.

### Component Reuse Map

| UX Need | Existing Component(s) | TalaKit Composition |
| --- | --- | --- |
| Dashboard shell | `components/ui/sidebar.tsx`, `components/ui/breadcrumb.tsx`, `components/ui/separator.tsx` | `AppShell`, `ProjectShell` |
| Mobile navigation | `components/ui/sheet.tsx`, `components/ui/sidebar.tsx` | Collapsible sidebar using existing mobile sheet behavior |
| Primary actions | `components/ui/button.tsx`, `components/common/loading/loading-button.tsx` | `ConnectWalletButton`, `RegisterProjectButton` |
| Forms | `components/ui/form.tsx`, `components/ui/field.tsx`, `components/ui/input.tsx`, `components/ui/textarea.tsx`, `components/ui/label.tsx` | Project form, contract form, webhook form |
| Selects and filters | `components/ui/select.tsx`, `components/ui/combobox.tsx`, `components/ui/input-group.tsx` | Event filters, project/contract selectors |
| Binary settings | `components/ui/switch.tsx`, `components/ui/checkbox.tsx` | Webhook enabled toggle, event type checkboxes |
| Status and trust labels | `components/ui-customs/badge.tsx`, `components/ui/badge.tsx` | Registry status, webhook health, RPC health |
| Tables | `components/ui/table.tsx`, `components/ui-customs/x-scroll.tsx` | Project list, contracts, events, webhook logs |
| Page sections | `components/ui/card.tsx` sparingly, `components/ui/separator.tsx`, `components/ui/tabs.tsx` | Summary panels and project tabs |
| Detail panels | `components/ui/sheet.tsx`, `components/ui/drawer.tsx`, `components/ui/dialog.tsx` | Event detail, webhook payload, wallet account |
| Destructive confirmations | `components/ui/alert-dialog.tsx` | Remove contract, deactivate project |
| Empty/loading states | `components/ui/empty.tsx`, `components/ui/skeleton.tsx`, `components/common/loading/*` | Empty dashboard, fetching transaction, syncing events |
| Notifications | `components/ui/sonner.tsx`, `components/ui-customs/sonner.tsx` | Transaction submitted, copied hash, webhook test sent |
| Tooltips | `components/ui/tooltip.tsx` | Copy buttons, status explanation, truncated IDs |
| Search/command palette | `components/ui/command.tsx` | Optional quick project/transaction lookup |

## 6. Required Screen Designs

### 6.1 Landing / Entry Screen

Purpose: get the developer into the product quickly while making the value obvious.

Primary layout:

- Header with `TalaKit`, `Debugger`, `Verify`, and wallet button.
- First viewport should show:
  - H1: `Verified developer infrastructure for Stellar apps`
  - Supporting copy: register official contracts, debug transactions, monitor events, and prove webhook delivery.
  - Primary CTA: `Connect wallet`
  - Secondary CTA: `Debug transaction`
  - Tertiary link: `View verified project`
- Below the fold hint: compact three-column proof strip:
  - `Register contracts`
  - `Debug activity`
  - `Deliver webhooks`

Key states:

- Wallet unavailable: show setup hint for Freighter.
- Wallet connected: primary CTA changes to `Open dashboard`.
- RPC unavailable: show non-blocking top alert; debugger may still accept input but should show lookup limitations.

Implementation notes:

- This is an entry screen, not a long marketing page.
- The transaction debugger should be reachable without forcing project creation.
- Use `Button`, `Badge`, and `Alert` from `packages/ui`; avoid a separate landing-page component kit.

### 6.2 Wallet Connect State

Purpose: make wallet state understandable before the user performs owner-only actions.

This can be a modal, popover, or inline account panel.

Fields and controls:

- Wallet provider name.
- Connected address as copyable hash.
- Network: `Stellar Testnet`.
- Actions: `Disconnect`, `Copy address`.

Error states:

- `Freighter not found`
- `Connection rejected`
- `Wrong network`
- `Signature rejected`
- `Submission failed`

UX rule:

- Owner-only actions should explain why wallet connection is required before triggering a wallet prompt.
- Use `DropdownMenu` for the connected wallet menu on desktop and `Sheet` or `Drawer` for the same account details on mobile.

### 6.3 Project List / Dashboard Home

Purpose: orient a returning developer and route them to the next useful action.

Primary layout:

- Page header: `Dashboard`
- Primary button: `New project`
- Summary row:
  - Projects
  - Registered contracts
  - Recent events
  - Webhook deliveries
- Project table:
  - Project
  - Registry status
  - Contracts
  - Last activity
  - Webhook health
  - Actions

Empty state:

- Title: `Create your first verified Stellar project`
- Body: `Register a project, link official Soroban contracts, and publish a public verification page.`
- CTA: `New project`

Important states:

- Draft project: `Not registered`
- Pending registration: `Registration pending`
- Registered project: `Verified`
- Stale sync: `Registry sync stale`
- Error: `Needs attention`

Component notes:

- Use `SidebarProvider` and related sidebar components for the dashboard shell.
- Use `Table` for the project list.
- Use `Empty` for the first-project state.
- Use `Skeleton` for project list loading.

### 6.4 Create Project Screen

Purpose: collect enough off-chain metadata and drive the on-chain registration transaction.

Recommended layout:

- Left: project form.
- Right: sticky registration checklist.

Form fields:

- Project name, required.
- Slug, generated from name and editable.
- Description, optional.
- Website, optional.
- Metadata preview, read-only generated hash.

Checklist:

1. Connect wallet.
2. Save project metadata.
3. Sign registration transaction.
4. Wait for registry confirmation.

Primary action behavior:

- Before wallet: `Connect wallet`
- With wallet, unsaved form: `Create project`
- After metadata saved: `Register on-chain`
- During transaction: disabled `Registering...`
- After success: `Open project dashboard`

Validation:

- Project name required.
- Slug must be unique and URL-safe.
- Website must be a valid URL when provided.

Failure handling:

- Signature rejected: keep form data, show retry.
- Transaction failed: show tx hash when available and human-readable reason.
- Registry unavailable: allow project to remain a draft.

Component notes:

- Use `Form`, `Field`, `Input`, `Textarea`, and `LoadingButton`.
- Use `Alert` for transaction errors.
- Use `AlertDialog` only for irreversible or owner-sensitive confirmations; registration itself can be an inline guided action.

### 6.5 Project Dashboard

Purpose: the control center for one project.

Header:

- Project name.
- Status badge: `Verified`, `Draft`, `Pending`, `Inactive`, `Error`.
- Owner wallet as copyable hash.
- Actions: `View public page`, `Add contract`, `Debug transaction`.

Top summary:

- Registry status.
- Official contracts count.
- Recent events count.
- Last webhook delivery.

Main content:

- Left column:
  - Registry proof panel: project ID, owner, metadata hash, created ledger, last sync.
  - Official contracts table preview.
  - Recent events table preview.
- Right column:
  - Demo checklist.
  - Webhook health.
  - Recent transaction lookup shortcut.

Tabs or secondary nav:

- Overview
- Contracts
- Events
- Webhooks

Critical UX rule:

- When off-chain Convex data and on-chain registry data disagree, show a `Registry data is authoritative` warning and label dashboard data as stale.

Component notes:

- Use `Tabs` for `Overview`, `Contracts`, `Events`, and `Webhooks`.
- Use `Badge` variants for registry status and webhook health.
- Use `Table` previews for contracts and events.
- Use `Alert` for stale registry sync.

### 6.6 Contract Management Screen

Purpose: add and remove official Soroban contract IDs with strong trust cues.

Layout:

- Page header: `Official contracts`
- Inline add form:
  - Contract ID input.
  - `Add contract` button.
  - Validation hint under input.
- Contracts table:
  - Contract ID
  - Status
  - Added transaction
  - Last activity
  - Actions

Actions:

- Copy contract ID.
- Open public verification page filtered to contract.
- Remove contract.

Remove flow:

- Use a confirmation dialog.
- Explain that removal updates the on-chain registry.
- Require wallet signature.

States:

- Pending add.
- Active.
- Pending removal.
- Removed.
- Failed.

Component notes:

- Use `InputGroup` if adding copy/search affordances inside the contract ID input.
- Use `AlertDialog` for remove-contract confirmation.
- Use `XScroll` around the contracts table because contract IDs are long.

### 6.7 Public Verified Project Page

Purpose: provide shareable proof without requiring wallet connection.

Route:

```txt
/verify/[slug]
```

Primary layout:

- Public header: product mark, `Verify another project`, `Debug transaction`.
- Hero proof section:
  - Project name.
  - Verification badge.
  - One-sentence project description.
  - Owner wallet as copyable hash.
  - Registry project ID.
  - Last registry sync.
- Official contracts table.
- Recent public activity.
- Metadata section.

Verification states:

- `Verified`: on-chain active project with official contract IDs.
- `Unverified`: slug exists off-chain but registry confirmation missing.
- `Inactive`: project deactivated on-chain.
- `Unavailable`: project not found or registry read failed.
- `Stale`: public metadata hash no longer matches registry hash.

Privacy rule:

- Never show webhook URLs, API keys, private dashboard settings, internal error traces, or owner-only actions.

Component notes:

- Public page should still use shared `Badge`, `Table`, `Tooltip`, and `Alert` components for consistency.
- Do not use dashboard `Sidebar` on public verification pages; use a compact public header.

### 6.8 Transaction Debugger Screen

Purpose: answer "what happened in this transaction?" without custom scripts.

Layout:

- Page header: `Transaction debugger`.
- Input panel:
  - Segmented control: `Hash` / `XDR` if XDR is included.
  - Input field or textarea.
  - CTA: `Inspect transaction`.
- Result area:
  - Status summary strip.
  - Operation breakdown.
  - Contract calls.
  - Events emitted.
  - Fees and resource usage.
  - Failure reason and hint.
  - Raw response expandable section.

Status summary fields:

- Status.
- Transaction hash.
- Ledger.
- Fee charged.
- Result code.
- Timestamp when available.

Empty state:

- Show an example Testnet hash pattern and a short prompt.

Error states:

- Malformed hash.
- Transaction not found.
- Pending.
- RPC unavailable.
- Decode unsupported.

UX rule:

- Failure hints should be short and specific. Do not imply certainty when the parser only has partial data.

Component notes:

- Use `Tabs` or a segmented `ToggleGroup` for `Hash` / `XDR`.
- Use `Textarea` for XDR input.
- Use `Accordion` or `Collapsible` for raw response sections.
- Use `ScrollArea` or `XScroll` for JSON and XDR blocks.

### 6.9 Event Monitor Screen

Purpose: show recent contract events for registered contracts.

Layout:

- Page header: `Events`
- Filter bar:
  - Contract ID select.
  - Event type input/select.
  - Transaction hash input.
  - Ledger input.
  - Clear filters button.
- Event table:
  - Event/topic
  - Contract
  - Transaction
  - Ledger
  - Observed
  - Data preview
- Detail drawer:
  - Full topic list.
  - Decoded payload.
  - Raw payload.
  - Related transaction link.

Polling state:

- `Live`
- `Polling`
- `Stale`
- `Error`

Empty state:

- No contracts: prompt to add official contract.
- No events: explain the recent-window limitation and show last poll time.

Component notes:

- Use `Select` or `Combobox` for contract filters.
- Use `Table` for the event list.
- Use `Sheet` for event detail on desktop and mobile.

### 6.10 Webhook Settings Screen

Purpose: configure where TalaKit sends project activity.

Layout:

- Page header: `Webhooks`
- Endpoint form:
  - Webhook URL.
  - Enabled toggle.
  - Event type checkboxes:
    - `contract.event`
    - `transaction.succeeded`
    - `transaction.failed`
    - `project.registered`
    - `project.updated`
  - Actions: `Save webhook`, `Send test event`
- Security note:
  - `Webhook URLs are private and never shown on public project pages.`

Validation:

- URL must use `https://` unless local development explicitly allows localhost.
- Show destination host after save, not full URL, in summary rows.

States:

- Unsaved changes.
- Saving.
- Saved.
- Test sending.
- Test delivered.
- Test failed.

Component notes:

- Use `Switch` for endpoint enabled/disabled.
- Use `Checkbox` for event type selection.
- Use `LoadingButton` for `Save webhook` and `Send test event`.
- Use `Alert` for privacy and URL validation guidance.

### 6.11 Webhook Delivery Logs Screen

Purpose: prove that a webhook attempt happened and help debug delivery.

This may be a tab or section inside `/projects/[projectId]/webhooks`.

Layout:

- Summary strip:
  - Last delivery.
  - Success rate for recent attempts.
  - Failed attempts.
- Delivery table:
  - Time
  - Event type
  - Destination host
  - Status
  - HTTP status
  - Attempts
  - Payload
- Detail drawer:
  - Payload summary.
  - Error message.
  - Request timestamp.
  - Response status.

MVP retry rule:

- If retry is not implemented, do not show retry controls. Show `Retries deferred` only in internal notes, not user-facing product copy.

Component notes:

- Use `Table` with `XScroll`.
- Use `Sheet` for delivery detail.
- Use `Badge` variants for `success`, `failed`, and `pending`.

## 7. Primary Demo Journey

The hackathon demo should follow this sequence:

1. Landing: connect wallet.
2. Dashboard: create project.
3. Create project: register `DemoPay` on-chain.
4. Project dashboard: add official contract ID.
5. Public page: show verified project and official contract.
6. Debugger: inspect sample transaction.
7. Events: show emitted event.
8. Webhooks: configure endpoint and show delivery log.

Design implication:

- The project dashboard should include a compact demo checklist so the presenter always knows the next step.

## 8. Responsive Behavior

Desktop:

- Sidebar navigation.
- Two-column project dashboard.
- Tables with copy controls visible.
- Detail drawers open from the right.

Tablet:

- Sidebar may collapse.
- Summary metrics wrap to two columns.
- Detail drawers can become full-height panels.

Mobile:

- Use top navigation and bottom sheet menus.
- Tables become stacked rows with labels.
- Hashes remain copyable and truncated.
- Primary actions stay near the top of each screen.

## 9. Accessibility Requirements

- All core actions must be keyboard reachable.
- Status must use text plus color, never color alone.
- Wallet and transaction modals must trap focus.
- Copy buttons need accessible labels.
- Form errors must be linked to fields.
- Tables need useful column headers.
- JSON/code blocks need readable contrast and horizontal scrolling.

## 10. Open UX Decisions

- Confirm public product name: TalaKit vs StellarKit.
- Decide whether XDR paste is required in Phase 1 or hidden behind an advanced control.
- Decide if public verification lookup by contract ID is required in Phase 1.
- Decide whether the demo checklist is visible only in project dashboard or globally during demo mode.
- Decide whether webhook test delivery uses a generated fake payload or the latest observed event.

## 11. Implementation Handoff Notes

- Use existing shadcn/ui primitives from `packages/ui` where possible.
- Prefer `Tabs`, `Table`, `Badge`, `Dialog`, `Sheet`, `Input`, `Textarea`, `Select`, `Checkbox`, `Switch`, `Toast`, and `Tooltip`.
- Use lucide icons for actions such as copy, external link, refresh, alert, check, activity, wallet, webhook, and search.
- Keep route components thin; screen-specific forms and tables should live in feature modules matching the architecture.
- Use stable empty, loading, pending, failed, stale, and verified states before adding visual polish.
- Add TalaKit domain components in `apps/web/features/*` only when they wrap shared UI primitives with product logic. Recommended first set:
  - `AppShell`
  - `PageHeader`
  - `StatusBadge`
  - `CopyableHash`
  - `RegistryProofPanel`
  - `ProjectSummaryMetrics`
  - `ProjectTable`
  - `ContractTable`
  - `EventTable`
  - `WebhookDeliveryTable`
  - `JsonPayloadViewer`
  - `WalletAccountMenu`
- Keep reusable generic components in `packages/ui` only if they are product-agnostic enough to serve future apps. TalaKit-specific chain concepts should stay in `apps/web/features`.
