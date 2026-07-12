import { PdaxClient, PdaxError } from "@repo/pdax";

import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { ActionCtx } from "../_generated/server";

export async function getOrRefreshPdaxConnection(
  ctx: ActionCtx,
  projectId: Id<"projects">,
  options: { signal?: AbortSignal } = {},
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
    const loginData = await client.login(username, password, options.signal);
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
        const refreshData = await client.refresh(username, connection.refreshToken, options.signal);
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
    const loginData = await client.login(username, password, options.signal);
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

export function mapPdaxError(err: unknown): Error {
  if (err instanceof PdaxError) {
    const status = err.status;
    const body = err.body;
    let message = "";

    if (typeof body === "string") {
      message = body;
    } else if (body && typeof body === "object") {
      message = ((body as Record<string, unknown>).message as string) || JSON.stringify(body);
    } else {
      message = err.message || "";
    }

    const lowerMessage = message.toLowerCase();

    // 1. Expired Token / Authentication Failure (401)
    if (status === 401) {
      return new Error("PDAX authentication failed. Please check your credentials or reconnect.");
    }

    // 2. Insufficient Balance
    const hasInsufficientCode =
      body &&
      typeof body === "object" &&
      ["PAP0013", "OT010006", "OT010008"].includes(
        (body as Record<string, unknown>).code as string,
      );
    if (
      lowerMessage.includes("insufficient") ||
      lowerMessage.includes("cannot hold specified amounts") ||
      hasInsufficientCode
    ) {
      return new Error("Insufficient balance in your PDAX settlement wallet.");
    }

    // 3. Asset Unavailable
    const hasAssetUnavailableCode =
      body &&
      typeof body === "object" &&
      ["OT010003", "OT010016"].includes((body as Record<string, unknown>).code as string);
    if (
      lowerMessage.includes("asset unavailable") ||
      lowerMessage.includes("trading pair cannot be found") ||
      hasAssetUnavailableCode
    ) {
      return new Error("The requested asset is currently unavailable for settlement.");
    }

    // 4. Invalid Parameters (400 or 422)
    const hasInvalidParamsCode =
      body &&
      typeof body === "object" &&
      ["OT010026"].includes((body as Record<string, unknown>).code as string);
    if (
      status === 400 ||
      status === 422 ||
      lowerMessage.includes("malformed parameters") ||
      lowerMessage.includes("required") ||
      lowerMessage.includes("must be") ||
      hasInvalidParamsCode
    ) {
      return new Error("Invalid parameters provided to settlement broker.");
    }

    // 5. PDAX Downtime (502, 503, 504)
    if (status === 502 || status === 503 || status === 504) {
      return new Error("PDAX settlement service is currently offline or experiencing downtime.");
    }

    return new Error(`PDAX API error (${status}): ${message}`);
  }

  // 6. Generic Network Offline / Timeout
  if (err instanceof Error) {
    const lowerMessage = err.message.toLowerCase();
    if (
      lowerMessage.includes("fetch failed") ||
      lowerMessage.includes("network") ||
      lowerMessage.includes("timeout") ||
      lowerMessage.includes("connect")
    ) {
      return new Error("PDAX settlement service is currently offline or experiencing downtime.");
    }
    return err;
  }

  return new Error(String(err));
}
