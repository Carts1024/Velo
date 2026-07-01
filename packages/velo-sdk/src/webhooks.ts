import type { WebhookEvent, VerifyWebhookParams } from "./types.ts";

import { VeloWebhookSignatureVerificationError } from "./errors.ts";

/**
 * Verifies a Velo webhook signature using the Web Crypto API.
 * This is fully compatible with both browser/Edge and Node.js environments.
 * If signature verification fails, it throws a VeloWebhookSignatureVerificationError.
 *
 * @param params Object containing payload, signature, secret, and optional toleranceSeconds.
 * @returns A promise resolving to the parsed and typed WebhookEvent.
 * @throws {VeloWebhookSignatureVerificationError} If the verification fails.
 */
export async function verifyWebhookSignature(params: VerifyWebhookParams): Promise<WebhookEvent> {
  const { payload, signature: signatureHeader, secret, toleranceSeconds = 300 } = params;

  if (!signatureHeader) {
    throw new VeloWebhookSignatureVerificationError("Missing signature header");
  }

  if (!secret) {
    throw new VeloWebhookSignatureVerificationError("Missing webhook signing secret");
  }

  const parts = signatureHeader.split(",");
  let timestampStr: string | undefined;
  let signature: string | undefined;

  for (const part of parts) {
    const equalIndex = part.indexOf("=");
    if (equalIndex === -1) continue;
    const key = part.slice(0, equalIndex).trim();
    const val = part.slice(equalIndex + 1).trim();

    if (key === "t") timestampStr = val;
    if (key === "v1") signature = val;
  }

  if (!timestampStr || !signature) {
    throw new VeloWebhookSignatureVerificationError("Invalid signature header format");
  }

  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) {
    throw new VeloWebhookSignatureVerificationError("Invalid timestamp in header");
  }

  // Check clock drift to prevent replay attacks
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSeconds) {
    throw new VeloWebhookSignatureVerificationError(
      "Signature timestamp expired or from the future",
    );
  }

  const signaturePayload = `${timestamp}.${payload}`;

  try {
    const encoder = new TextEncoder();
    const secretKeyData = encoder.encode(secret);
    const signaturePayloadData = encoder.encode(signaturePayload);

    // Import secret key for HMAC SHA-256
    const cryptoKey = await globalThis.crypto.subtle.importKey(
      "raw",
      secretKeyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    // Compute expected signature
    const signatureBuffer = await globalThis.crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      signaturePayloadData,
    );

    // Convert to hexadecimal string
    const hashArray = Array.from(new Uint8Array(signatureBuffer));
    const expectedSignature = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    if (signature !== expectedSignature) {
      throw new VeloWebhookSignatureVerificationError("Signature mismatch");
    }

    const event = JSON.parse(payload) as WebhookEvent;

    return event;
  } catch (err: unknown) {
    if (err instanceof VeloWebhookSignatureVerificationError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new VeloWebhookSignatureVerificationError(`Verification failed: ${message}`);
  }
}
