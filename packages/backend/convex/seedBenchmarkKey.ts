import type { Id } from "./_generated/dataModel";

import { mutation } from "./_generated/server";
export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    const projectId = "kd7aewqagjy7skyct50m6abajn8afdvm" as Id<"projects">;

    // Check if key hash already exists
    const keyHash = "21bf8f8c78df224fdf35c1087003765469829d70a963f3306bfb525d4e2aa915";
    const existing = await ctx.db
      .query("apiKeys")
      .withIndex("by_key_hash", (q) => q.eq("keyHash", keyHash))
      .unique();

    if (existing) {
      return "Already seeded";
    }

    await ctx.db.insert("apiKeys", {
      projectId,
      keyHash,
      prefix: "tk_live_c7a0...217",
      label: "Benchmark Key",
      createdAt: Date.now(),
      requestCount: 0,
      revoked: false,
    });

    return "Seeded successfully";
  },
});
