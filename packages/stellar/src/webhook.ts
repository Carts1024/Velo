/**
 * Verifies a Velo webhook signature using the Web Crypto API.
 * This is fully compatible with both browser and Node.js environments.
 *
 * @param payloadRaw The raw string request body.
 * @param signatureHeader The `x-velo-signature` header value (e.g. `t=1614856402,v1=abc...`).
 * @param secret The signing secret configured for the endpoint (e.g. `whsec_...`).
 * @param toleranceSeconds Allowed clock drift in seconds to prevent replay attacks (default 5 minutes).
 */
export async function verifyWebhookSignature(
  payloadRaw: string,
  signatureHeader: string,
  secret: string,
  toleranceSeconds = 300,
): Promise<{ isValid: boolean; error?: string; payload?: unknown }> {
  if (!signatureHeader) {
    return { isValid: false, error: "Missing signature header" };
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
    return { isValid: false, error: "Invalid signature header format" };
  }

  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) {
    return { isValid: false, error: "Invalid timestamp in header" };
  }

  // Check clock drift to prevent replay attacks
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSeconds) {
    return { isValid: false, error: "Signature timestamp expired or from the future" };
  }

  const signaturePayload = `${timestamp}.${payloadRaw}`;

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
      return { isValid: false, error: "Signature mismatch" };
    }

    const payload = JSON.parse(payloadRaw);
    return { isValid: true, payload };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { isValid: false, error: `Verification failed: ${message}` };
  }
}
