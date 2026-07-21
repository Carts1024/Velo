import {
  getSharedVeloWalletClient,
  type VeloWalletClient,
  type VeloWalletState,
} from "./browser.js";

const EVENT_VERSION = 1;
const BaseElement: typeof HTMLElement =
  typeof HTMLElement === "undefined" ? (class {} as typeof HTMLElement) : HTMLElement;

export class VeloWalletElement extends BaseElement {
  private client: VeloWalletClient | null = null;
  private unsubscribe: (() => void) | null = null;
  private root: ShadowRoot | null = null;
  private lastStatus: VeloWalletState["status"] = "idle";

  connectedCallback() {
    if (!this.root) this.root = this.attachShadow({ mode: "open" });
    const projectKey = this.getAttribute("project-key");
    if (!projectKey) {
      this.renderError("Add a project-key attribute to initialize Velo Wallets.");
      return;
    }

    this.client = getSharedVeloWalletClient({
      projectKey,
      apiBaseUrl: this.getAttribute("api-base") ?? undefined,
    });
    this.unsubscribe = this.client.subscribe(() => this.render());
    this.render();
    this.client
      .initialize()
      .then(() => this.dispatch("velo:wallet-ready"))
      .catch((error) => this.dispatch("velo:wallet-error", { error }));
  }

  disconnectedCallback() {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  async connect() {
    if (!this.client) throw new Error("Velo Wallets element is not connected.");
    try {
      return await this.client.connect();
    } finally {
      this.root?.querySelector<HTMLElement>(".primary")?.focus();
    }
  }

  async disconnect() {
    if (!this.client) return;
    await this.client.disconnect();
    this.root?.querySelector<HTMLElement>(".primary")?.focus();
  }

  getAddress() {
    return Promise.resolve(this.client?.getAddress() ?? null);
  }

  signTransaction(xdr: string) {
    if (!this.client) throw new Error("Velo Wallets element is not connected.");
    return this.announceSigning("transaction", () => this.client!.signTransaction(xdr));
  }

  signAuthEntry(authEntry: string) {
    if (!this.client) throw new Error("Velo Wallets element is not connected.");
    return this.announceSigning("authorization entry", () => this.client!.signAuthEntry(authEntry));
  }

  signMessage(message: string) {
    if (!this.client) throw new Error("Velo Wallets element is not connected.");
    return this.announceSigning("message", () => this.client!.signMessage(message));
  }

  private render() {
    if (!this.root || !this.client) return;
    const state = this.client.getState();
    const connected = state.status === "connected";
    const theme = this.client.getConfig()?.appearance.theme ?? "system";
    const label = connected
      ? `${state.walletName ?? "Wallet"} · ${shortenAddress(state.address)}`
      : state.status === "connecting"
        ? "Connecting…"
        : (this.client.getConfig()?.appearance.buttonLabel ?? "Connect wallet");
    this.root.innerHTML = `
      <style>${styles}</style>
      <div class="wallet theme-${theme}" data-status="${state.status}">
        <button class="primary" type="button" ${state.status === "connecting" ? "disabled" : ""}>${escapeHtml(label)}</button>
        ${connected ? `<div class="actions"><button class="copy" type="button">Copy address</button><button class="disconnect" type="button">Disconnect</button></div>` : ""}
        <span class="status" role="status" aria-live="polite">${escapeHtml(statusMessage(state))}</span>
      </div>
    `;
    this.root.querySelector(".primary")?.addEventListener("click", () => {
      const action = connected ? Promise.resolve() : this.connect();
      action.catch((error) => this.dispatch("velo:wallet-error", { error }));
    });
    this.root.querySelector(".disconnect")?.addEventListener("click", () => {
      this.disconnect().catch((error) => this.dispatch("velo:wallet-error", { error }));
    });
    this.root.querySelector(".copy")?.addEventListener("click", () => {
      const address = state.address;
      if (address && navigator.clipboard) {
        navigator.clipboard.writeText(address).then(() => this.setAnnouncement("Address copied."));
      }
    });
    this.dispatch("velo:wallet-changed", { state });
    if (state.status === "connected" && this.lastStatus !== "connected") {
      this.dispatch("velo:wallet-connected", { address: state.address });
    }
    if (state.status === "disconnected" && this.lastStatus === "connected") {
      this.dispatch("velo:wallet-disconnected");
    }
    this.lastStatus = state.status;
  }

  private renderError(message: string) {
    if (!this.root) return;
    this.root.innerHTML = `<span role="alert">${escapeHtml(message)}</span>`;
  }

  private async announceSigning(label: string, operation: () => Promise<string>) {
    this.setAnnouncement(`Requesting ${label} signature.`);
    try {
      const result = await operation();
      this.setAnnouncement(`${label[0]?.toUpperCase()}${label.slice(1)} signed.`);
      return result;
    } catch (error) {
      this.setAnnouncement(`${label[0]?.toUpperCase()}${label.slice(1)} signing failed.`);
      this.dispatch("velo:wallet-error", { error });
      throw error;
    }
  }

  private setAnnouncement(message: string) {
    const status = this.root?.querySelector<HTMLElement>(".status");
    if (status) status.textContent = message;
  }

  private dispatch(name: string, detail: Record<string, unknown> = {}) {
    this.dispatchEvent(
      new CustomEvent(name, {
        bubbles: true,
        composed: true,
        detail: { version: EVENT_VERSION, ...detail },
      }),
    );
  }
}

function statusMessage(state: VeloWalletState) {
  if (state.error) return state.error.message;
  if (state.status === "connected") return `Connected to ${state.walletName ?? "wallet"}.`;
  if (state.status === "connecting") return "Opening wallet selector.";
  if (state.status === "loading") return "Loading wallet configuration.";
  if (state.status === "ready") return "Wallet connection is ready.";
  if (state.status === "disconnected") return "Wallet disconnected.";
  return "";
}

function shortenAddress(address: string | null) {
  return address && address.length > 14
    ? `${address.slice(0, 7)}…${address.slice(-5)}`
    : (address ?? "");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character] ?? character;
  });
}

const styles = `
  :host { display: inline-block; font-family: ui-sans-serif, system-ui, sans-serif; }
  .wallet { display: grid; gap: .35rem; }
  .theme-dark { color-scheme: dark; }
  @media (prefers-color-scheme: dark) { .theme-system { color-scheme: dark; } }
  button { border: 1px solid #d4d4d8; border-radius: .5rem; background: white; color: #18181b; cursor: pointer; font: inherit; font-weight: 600; padding: .5rem .75rem; }
  button.primary { background: #18181b; color: white; padding: .65rem 1rem; }
  .actions { display: flex; gap: .4rem; }
  button:focus-visible { outline: 3px solid #60a5fa; outline-offset: 2px; }
  button:disabled { cursor: wait; opacity: .65; }
  .status { color: #52525b; font-size: .75rem; max-width: 24rem; }
`;

if (typeof customElements !== "undefined" && !customElements.get("velo-wallet")) {
  customElements.define("velo-wallet", VeloWalletElement);
}

declare global {
  interface HTMLElementTagNameMap {
    "velo-wallet": VeloWalletElement;
  }
}
