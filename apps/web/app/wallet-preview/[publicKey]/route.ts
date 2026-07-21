import { env } from "@/core/config/env";
import { withRouteTelemetry } from "@/core/observability";

type RouteContext = { params: Promise<{ publicKey: string }> };

function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ??
      character,
  );
}

export const GET = withRouteTelemetry(
  "wallet-preview.get",
  async (_request, _telemetry, context: RouteContext) => {
    const { publicKey } = await context.params;
    if (!/^vw_pk_[A-Za-z0-9_-]{32}$/.test(publicKey)) {
      return new Response("Invalid Velo Wallets project key", { status: 400 });
    }
    const appBase = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
    const cdnBase = (env.NEXT_PUBLIC_WALLETS_CDN_BASE_URL ?? `${appBase}/wallets`).replace(
      /\/$/,
      "",
    );
    const safeKey = escapeHtml(publicKey);
    const scriptData = JSON.stringify({ publicKey, appBase });
    return new Response(
      `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Velo Wallets diagnostics</title><style>
body{font:15px ui-sans-serif,system-ui;margin:0;background:#f4f4f5;color:#18181b}main{max-width:760px;margin:auto;padding:32px 18px}section{background:white;border:1px solid #d4d4d8;border-radius:12px;padding:20px;margin:16px 0}button{font:inherit;padding:9px 13px;border:1px solid #a1a1aa;border-radius:8px;background:white;cursor:pointer}button:disabled{opacity:.5;cursor:not-allowed}.steps{display:grid;gap:10px}.step{display:flex;justify-content:space-between;gap:12px;align-items:center;border-top:1px solid #e4e4e7;padding-top:10px}.status{font-size:13px;color:#52525b}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#18181b;color:#e4e4e7;padding:14px;border-radius:8px;min-height:70px}code{font-size:12px}.warning{color:#a16207}</style>
<script type="module" src="${cdnBase}/v1/velo-wallet.js"></script></head><body><main>
<h1>Velo Wallets diagnostics</h1><p>Isolated from Velo's authenticated wallet provider. No signing payload or signature is sent to Velo.</p>
<section><h2>Integration</h2><p><code>${safeKey}</code></p><velo-wallet id="wallet" project-key="${safeKey}" api-base="${appBase}"></velo-wallet></section>
<section><h2>Guided checks</h2><div class="steps">
<div class="step"><span>1. Load published configuration</span><span class="status" id="ready">Waiting…</span></div>
<div class="step"><span>2. Connect and confirm account/network</span><button id="connect">Connect</button></div>
<div class="step"><span>3. Sign a diagnostic message</span><button id="message" disabled>Sign message</button></div>
<div class="step"><span>4. Sign a safe Testnet transaction (never submitted)</span><button id="transaction" disabled>Sign Testnet XDR</button></div>
<div class="step"><span>5. Disconnect and reconnect</span><button id="disconnect" disabled>Disconnect</button></div>
</div><p class="warning">Rejecting any request is safe. Reconnect and retry to test recovery.</p></section>
<section><h2>Developer diagnostics</h2><pre id="log" role="status" aria-live="polite">Initializing…</pre></section>
<script type="module">
const settings=${scriptData}; const wallet=document.querySelector('#wallet'); const log=document.querySelector('#log');
const buttons={connect:document.querySelector('#connect'),message:document.querySelector('#message'),transaction:document.querySelector('#transaction'),disconnect:document.querySelector('#disconnect')};
function report(label,value){log.textContent=new Date().toISOString()+' '+label+(value?'\\n'+value:'')+'\\n\\n'+log.textContent}
function connected(value){buttons.message.disabled=!value;buttons.transaction.disabled=!value;buttons.disconnect.disabled=!value}
wallet.addEventListener('velo:wallet-ready',()=>{document.querySelector('#ready').textContent='Success';report('Configuration loaded','Runtime major 1')});
wallet.addEventListener('velo:wallet-connected',(event)=>{connected(true);report('Connected',event.detail.address)});
wallet.addEventListener('velo:wallet-disconnected',()=>{connected(false);report('Disconnected','Click Connect to verify recovery.')});
wallet.addEventListener('velo:wallet-error',(event)=>report('Wallet error',event.detail.error?.message??String(event.detail.error)));
buttons.connect.onclick=async()=>{try{const address=await wallet.connect();connected(true);report('Account confirmed',address+'\\nConfigured network is shown by the wallet selector.')}catch(error){report('Connection rejected',error.message)}};
buttons.message.onclick=async()=>{try{const signature=await wallet.signMessage('Velo Wallets diagnostic — '+new Date().toISOString());report('Message signed locally',signature)}catch(error){report('Message signing rejected',error.message)}};
buttons.transaction.onclick=async()=>{try{const address=await wallet.getAddress();if(!address)throw new Error('Connect first');const sdk=await import('https://esm.sh/@stellar/stellar-sdk@14.2.0');const accountResponse=await fetch('https://horizon-testnet.stellar.org/accounts/'+address);if(!accountResponse.ok)throw new Error('The connected account must exist on Testnet');const accountJson=await accountResponse.json();const account=new sdk.Account(address,accountJson.sequence);const tx=new sdk.TransactionBuilder(account,{fee:sdk.BASE_FEE,networkPassphrase:sdk.Networks.TESTNET}).addOperation(sdk.Operation.manageData({name:'velo-wallets-diagnostic',value:'not-submitted'})).setTimeout(300).build();const signed=await wallet.signTransaction(tx.toXDR());report('Testnet transaction signed locally — NOT submitted',signed)}catch(error){report('Transaction signing rejected',error.message)}};
buttons.disconnect.onclick=async()=>{try{await wallet.disconnect()}catch(error){report('Disconnect failed',error.message)}};
</script></main></body></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
    );
  },
);
