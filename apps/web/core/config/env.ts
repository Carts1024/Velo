import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_CONVEX_URL: z.string().url({
    message: "NEXT_PUBLIC_CONVEX_URL must be a valid URL",
  }),
  NEXT_PUBLIC_CONVEX_SITE_URL: z.string().url().optional(),
  NEXT_PUBLIC_STELLAR_NETWORK: z.literal("testnet").default("testnet"),
  NEXT_PUBLIC_STELLAR_RPC_URL: z.string().url().default("https://soroban-testnet.stellar.org"),
  NEXT_PUBLIC_VELO_REGISTRY_CONTRACT_ID: z.string().optional(),
  NEXT_PUBLIC_VELO_PAY_ACCESS_CONTRACT_ID: z.string().optional(),
  NEXT_PUBLIC_USDC_ISSUER: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

// This will throw an error if validation fails
const validateEnv = () => {
  const parsed = envSchema.safeParse({
    NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,
    NEXT_PUBLIC_CONVEX_SITE_URL: process.env.NEXT_PUBLIC_CONVEX_SITE_URL,
    NEXT_PUBLIC_STELLAR_NETWORK: process.env.NEXT_PUBLIC_STELLAR_NETWORK,
    NEXT_PUBLIC_STELLAR_RPC_URL: process.env.NEXT_PUBLIC_STELLAR_RPC_URL,
    NEXT_PUBLIC_VELO_REGISTRY_CONTRACT_ID: process.env.NEXT_PUBLIC_VELO_REGISTRY_CONTRACT_ID,
    NEXT_PUBLIC_VELO_PAY_ACCESS_CONTRACT_ID: process.env.NEXT_PUBLIC_VELO_PAY_ACCESS_CONTRACT_ID,
    NEXT_PUBLIC_USDC_ISSUER: process.env.NEXT_PUBLIC_USDC_ISSUER,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  });

  if (!parsed.success) {
    console.error(
      "❌ Invalid environment variables:",
      JSON.stringify(parsed.error.format(), null, 2),
    );
    throw new Error("Invalid environment variables");
  }

  return parsed.data;
};

export const env = validateEnv();
