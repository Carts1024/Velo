import type { AuthConfig } from "convex/server";

import { resolveWalletAuthProvider } from "./authConfig";

export default {
  providers: [resolveWalletAuthProvider(process.env)],
} satisfies AuthConfig;
