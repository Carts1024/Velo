# @carts1024/velo-wallets

Hosted, project-configured multi-wallet integration for Stellar applications. Velo Wallets wraps Stellar Wallets Kit 2.3.0; it does not replace it.

The npm package bundles its pinned Wallets Kit runtime, so consumers do not need a JSR registry configuration.

## HTML

```html
<script type="module" src="https://wallets.velo.dev/v1/velo-wallet.js"></script>
<velo-wallet project-key="vw_pk_example"></velo-wallet>
```

The element provides `connect`, `disconnect`, `getAddress`, `signTransaction`, `signAuthEntry`, and `signMessage`, plus the versioned `velo:wallet-*` DOM events.

## React / Next.js

```tsx
"use client";

import { ConnectButton, VeloWalletProvider } from "@carts1024/velo-wallets/react";

export function WalletControls() {
  return (
    <VeloWalletProvider projectKey="vw_pk_example">
      <ConnectButton />
    </VeloWalletProvider>
  );
}
```

Mount the provider only at the client boundary that needs wallet state. Package entry imports are server-safe. Signing inputs and results remain in the consuming browser and are never sent to Velo.
