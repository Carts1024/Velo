import migrations from "@convex-dev/migrations/convex.config.js";
import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    UPSTASH_REDIS_REST_URL: v.optional(v.string()),
    UPSTASH_REDIS_REST_TOKEN: v.optional(v.string()),
    VELO_RATE_LIMIT_SCOPE_SECRET: v.optional(v.string()),
    VELO_ENABLE_RATE_LIMIT_BENCHMARK: v.optional(v.string()),
    VELO_CONVEX_TELEMETRY_ENABLED: v.optional(v.string()),
  },
});

app.use(migrations);

export default app;
