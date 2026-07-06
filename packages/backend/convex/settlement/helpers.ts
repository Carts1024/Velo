import { PdaxClient } from "@repo/pdax";

import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { ActionCtx } from "../_generated/server";

export async function getOrRefreshPdaxConnection(
  ctx: ActionCtx,
  projectId: Id<"projects">,
): Promise<{ accessToken: string; idToken: string; client: PdaxClient }> {
  const username = process.env.PDAX_UAT_USERNAME;
  const password = process.env.PDAX_UAT_PASSWORD;
  const baseUrl =
    process.env.PDAX_UAT_BASE_URL || "https://uat.services.sandbox.pdax.ph/api/pdax-api";

  if (!username || !password) {
    throw new Error("PDAX UAT credentials not configured in environment variables");
  }

  const client = new PdaxClient(baseUrl);
  const now = Date.now();

  // Query connection internally
  const connection = await ctx.runQuery(internal.provider_connections.query.getInternal, {
    projectId,
    provider: "pdax",
  });

  // If connection doesn't exist, log in
  if (!connection || connection.status === "disconnected") {
    const loginData = await client.login(username, password);
    await ctx.runMutation(internal.provider_connections.mutation.upsertInternal, {
      projectId,
      provider: "pdax",
      status: "connected",
      username: loginData.username,
      accessToken: loginData.access_token,
      idToken: loginData.id_token,
      refreshToken: loginData.refresh_token,
      tokenExpiresAt: now + loginData.expiry * 1000,
    });
    return { accessToken: loginData.access_token, idToken: loginData.id_token, client };
  }

  // If token is about to expire (within 1 minute), refresh it
  const expiresAt = connection.tokenExpiresAt ?? 0;
  if (expiresAt < now + 60000) {
    if (connection.refreshToken) {
      try {
        const refreshData = await client.refresh(username, connection.refreshToken);
        await ctx.runMutation(internal.provider_connections.mutation.upsertInternal, {
          projectId,
          provider: "pdax",
          status: "connected",
          username: refreshData.username,
          accessToken: refreshData.access_token,
          idToken: refreshData.id_token,
          refreshToken: refreshData.refresh_token,
          tokenExpiresAt: now + refreshData.expiry * 1000,
        });
        return { accessToken: refreshData.access_token, idToken: refreshData.id_token, client };
      } catch (error) {
        console.warn("Failed to refresh PDAX token, falling back to login", error);
      }
    }

    // Fallback to full login
    const loginData = await client.login(username, password);
    await ctx.runMutation(internal.provider_connections.mutation.upsertInternal, {
      projectId,
      provider: "pdax",
      status: "connected",
      username: loginData.username,
      accessToken: loginData.access_token,
      idToken: loginData.id_token,
      refreshToken: loginData.refresh_token,
      tokenExpiresAt: now + loginData.expiry * 1000,
    });
    return { accessToken: loginData.access_token, idToken: loginData.id_token, client };
  }

  // Connection is valid
  return {
    accessToken: connection.accessToken!,
    idToken: connection.idToken!,
    client,
  };
}
