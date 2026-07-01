import { hash, Keypair, xdr } from "@stellar/stellar-sdk";

/** SEP-53 prefix prepended to messages before hashing and signing. */
const SEP53_PREFIX = "Stellar Signed Message:\n";

function decodeSignatureBytes(bytes: Buffer) {
  if (bytes.length === 64) {
    return [bytes];
  }

  try {
    const decorated = xdr.DecoratedSignature.fromXDR(bytes);
    const signature = Buffer.from(decorated.signature());
    return signature.length === 64 ? [signature] : [];
  } catch {
    return [];
  }
}

function decodeSignatures(signature: string) {
  const trimmed = signature.trim();
  const candidates: Buffer[][] = [];

  if (/^[0-9a-f]+$/i.test(trimmed) && trimmed.length % 2 === 0) {
    candidates.push(decodeSignatureBytes(Buffer.from(trimmed, "hex")));
  }

  const base64 = trimmed.replace(/-/g, "+").replace(/_/g, "/");
  candidates.push(decodeSignatureBytes(Buffer.from(base64, "base64")));
  candidates.push(decodeSignatureBytes(Buffer.from(trimmed, "utf8")));

  const decoded = candidates.flat();
  if (decoded.length === 0) {
    throw new Error("Invalid Stellar signature");
  }

  return decoded;
}

export function verifySignedMessage(input: {
  publicKey: string;
  message: string;
  signature: string;
}) {
  const keypair = Keypair.fromPublicKey(input.publicKey);
  const message = Buffer.from(input.message, "utf8");
  const signatures = decodeSignatures(input.signature);
  const sep53Payload = Buffer.concat([Buffer.from(SEP53_PREFIX, "utf8"), message]);
  const signedPayloads = [message, hash(message), hash(sep53Payload)];

  return signedPayloads.some((payload) =>
    signatures.some((signature) => keypair.verify(payload, signature)),
  );
}
