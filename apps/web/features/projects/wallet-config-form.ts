import type { WalletDraftConfig } from "@carts1024/velo-wallets/config";

export function parseOriginLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function walletIntegrationSnippets(options: {
  projectKey: string;
  cdnBaseUrl: string;
  apiBaseUrl: string;
}) {
  const cdnBaseUrl = options.cdnBaseUrl.replace(/\/$/, "");
  const apiBaseUrl = options.apiBaseUrl.replace(/\/$/, "");
  return {
    html: `<script type="module" src="${cdnBaseUrl}/v1/velo-wallet.js"></script>\n<velo-wallet id="stellar-wallet" project-key="${options.projectKey}" api-base="${apiBaseUrl}"></velo-wallet>\n<script>\n  const wallet = document.querySelector("#stellar-wallet");\n  wallet.addEventListener("velo:wallet-connected", (event) => {\n    console.log("Connected", event.detail.address);\n  });\n  // const signedXdr = await wallet.signTransaction(transactionXdr);\n</script>`,
    react: `"use client";\n\nimport { ConnectButton, VeloWalletProvider, useVeloWallet } from "@carts1024/velo-wallets/react";\n\nfunction WalletActions() {\n  const wallet = useVeloWallet();\n  return (\n    <>\n      <ConnectButton />\n      <button onClick={() => wallet.signMessage("Hello from my app")}>Sign message</button>\n    </>\n  );\n}\n\nexport function WalletControls() {\n  return (\n    <VeloWalletProvider projectKey="${options.projectKey}" apiBaseUrl="${apiBaseUrl}">\n      <WalletActions />\n    </VeloWalletProvider>\n  );\n}`,
    csp: `script-src 'self' ${new URL(cdnBaseUrl).origin}; connect-src 'self' ${new URL(apiBaseUrl).origin}`,
  };
}

export function draftFromDocument(document: {
  network: WalletDraftConfig["network"];
  walletIds: string[];
  theme: WalletDraftConfig["theme"];
  buttonLabel: string;
  showInstallLabel: boolean;
  hideUnsupportedWallets: boolean;
  persistSession: boolean;
  allowedOrigins: string[];
}): WalletDraftConfig {
  return {
    network: document.network,
    walletIds: [...document.walletIds],
    theme: document.theme,
    buttonLabel: document.buttonLabel,
    showInstallLabel: document.showInstallLabel,
    hideUnsupportedWallets: document.hideUnsupportedWallets,
    persistSession: document.persistSession,
    allowedOrigins: [...document.allowedOrigins],
  };
}
