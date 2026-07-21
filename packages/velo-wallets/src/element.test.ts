import { describe, expect, it } from "vitest";

import { VeloWalletElement } from "./element.js";

describe("Velo Wallets Web Component", () => {
  it("registers once and renders accessible setup guidance without a key", () => {
    expect(customElements.get("velo-wallet")).toBe(VeloWalletElement);
    const element = document.createElement("velo-wallet");
    document.body.append(element);
    expect(element.shadowRoot?.querySelector('[role="alert"]')?.textContent).toContain(
      "project-key",
    );
    element.remove();
  });
});
