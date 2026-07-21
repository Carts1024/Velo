import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ConnectButton, VeloWalletProvider } from "./react.js";

describe("React adapter", () => {
  it("imports and server-renders without accessing browser globals", () => {
    const html = renderToString(
      <VeloWalletProvider projectKey="vw_pk_example">
        <ConnectButton />
      </VeloWalletProvider>,
    );
    expect(html).toContain("Connect wallet");
  });
});
