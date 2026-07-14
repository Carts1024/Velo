import { Migrations } from "@convex-dev/migrations";

import { components, internal } from "./_generated/api";
import schema from "./schema";

export const migrations = new Migrations(components.migrations, { schema });

export const backfillProjectRateLimitBackend = migrations.define({
  table: "projects",
  migrateOne: (_ctx, project) =>
    project.rateLimitBackend === undefined ? { rateLimitBackend: "convex" as const } : undefined,
});

export const runAll = migrations.runner([internal.migrations.backfillProjectRateLimitBackend]);
