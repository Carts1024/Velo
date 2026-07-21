# Velo Wallets — One-Sprint Implementation and Alpha Report

## Outcome

Velo Wallets is implemented as a project-configured wrapper around Stellar Wallets Kit 2.3.0. It keeps the existing Velo authentication provider isolated and gives builders two integrations backed by the same browser runtime:

```html
<script type="module" src="https://wallets.velo.dev/v1/velo-wallet.js"></script>
<velo-wallet project-key="vw_pk_example"></velo-wallet>
```

```tsx
<VeloWalletProvider projectKey="vw_pk_example">
  <ConnectButton />
</VeloWalletProvider>
```

The deployable alpha includes project-owned drafts, immutable publications, exact-origin enforcement, Testnet/Mainnet configuration, a no-code Wallets panel, generated integration snippets, a Web Component, a React adapter, an isolated real-wallet diagnostic route, and project-published visual theming for every wallet surface.

## Configurable wallet appearance

Project owners configure separate accessible Light and Dark palettes, typography, button style/size/radius, and modal radius/shadow in the Wallets panel. The live preview covers disconnected, connecting, connected, and error states plus the wallet selector. Published appearance is applied to the Web Component, React controls, and Stellar Wallets Kit modal; System mode follows the browser color scheme. Existing publications without the expanded appearance payload receive the alpha defaults without a migration or runtime-major change.

## Implemented sprint stories

| Story | Delivered |
|---|---|
| VW-1 | `@carts1024/velo-wallets` config/browser/element/react entries, exact Kit pin, ESM/npm and standalone CDN builds |
| VW-2 | Convex drafts, `vw_pk_` keys, validation, ownership, disable/enable, immutable publications |
| VW-3 | GET/OPTIONS public configuration endpoint with CORS, status mapping, compatibility and no-store policy |
| VW-4 | Project Wallets route, sidebar entry, guided preset, wallet/network/appearance/origin controls, preview and lifecycle states |
| VW-5 | Shared runtime, normalized state/errors, filtered Kit modules, local signing, minimal session restore and change handling |
| VW-6 | Registered-once Web Component with methods, events, connection controls, address copy, cleanup and announcements |
| VW-7 | Raw HTML diagnostic route for connect, message signing, unsigned Testnet construction/signing, disconnect and recovery |
| VW-8 | SSR-safe React provider, hook and button using the shared runtime |
| VW-9 | Generated HTML/React, CSP, event/hook/signing examples and diagnostics link |
| VW-10 | Reproducible CDN staging, npm package contents, automated gates and this compatibility report |

## Security and operational boundaries

- Signing XDR, authorization entries, messages, and signatures stay in the browser. Velo receives only the public configuration request.
- Public responses exclude owner identity, allowed origins, credentials, XDR, and signatures.
- Saving a draft does not change a live origin policy. Allowed origins are snapshotted with each immutable publication.
- A document can use one project key; elements and React consumers for that key share one runtime.
- The authenticated Velo `WalletProvider` is unchanged. The raw diagnostics handler bypasses the React root and global provider.
- Mainnet publication needs a non-local HTTPS origin plus an explicit typed confirmation in the panel.

## Wallet compatibility matrix

Automated coverage verifies catalog filtering, connection state normalization, session restore, transaction/auth-entry/message delegation, unsupported-method errors, SSR imports, element registration, and cleanup using a dependency-injected adapter.

| Wallet | Catalog/module | Transaction signing | Auth/message capability | Live Testnet alpha status |
|---|---|---|---|---|
| Freighter | Included | Required | Wallet-dependent | Manual blocker — pending extension run |
| Albedo | Included | Required | Wallet-dependent | Manual blocker — pending popup run |
| xBull | Included | Required | Wallet-dependent | Manual blocker — pending extension/mobile run |
| Fordefi | Included | Adapter-covered | Wallet-dependent | Manual report pending |
| Rabet | Included | Adapter-covered | Wallet-dependent | Manual report pending |
| LOBSTR | Included | Adapter-covered | Wallet-dependent | Manual report pending |
| Hana | Included | Adapter-covered | Wallet-dependent | Manual report pending |
| Klever | Included | Adapter-covered | Wallet-dependent | Manual report pending |
| OneKey | Included | Adapter-covered | Wallet-dependent | Manual report pending |
| Bitget | Included | Adapter-covered | Wallet-dependent | Manual report pending |
| Cactus Link | Included | Adapter-covered | Wallet-dependent | Manual report pending |

The alpha must not be promoted as wallet-compatible until Freighter, Albedo, and xBull pass live Testnet connection and transaction signing on the staged diagnostic page. No live Mainnet transaction is part of alpha qualification.

## Reproducible release artifacts

```bash
pnpm wallets:stage
mkdir -p artifacts
pnpm --filter @carts1024/velo-wallets pack --pack-destination artifacts
```

The staging command emits stable-major `/wallets/v1/velo-wallet.js` and immutable `/wallets/v1.0.0/velo-wallet.js`. Production DNS, npm publication, and credentials remain intentionally inactive.

## Release gates

```bash
pnpm --filter @repo/backend test
pnpm --filter @carts1024/velo-wallets test
pnpm --filter web test
pnpm build
pnpm lint:fix
```

After formatting, rerun affected tests and the full build. Complete a keyboard-only and narrow-viewport walkthrough plus the three blocker wallet runs before public alpha promotion.
