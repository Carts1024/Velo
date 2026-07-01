import type { AuthConfig } from "convex/server";

const issuer = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const jwks =
  process.env.VELO_AUTH_JWKS || `${issuer}/api/auth/wallet/jwks`;

export default {
  providers: [
    {
      type: "customJwt",
      applicationID: "velo-web",
      issuer,
      jwks,
      algorithm: "ES256",
    },
  ],
} satisfies AuthConfig;
