import { createHmac, timingSafeEqual } from "crypto";

const TOLERANCE_SECONDS = 300;

/**
 * Verifies a Stripe webhook signature per Stripe's documented scheme:
 * header is "t=<timestamp>,v1=<hex hmac-sha256 of `${timestamp}.${rawBody}`>".
 * Implemented directly (no Stripe SDK) to keep this project dependency-light,
 * matching the rest of the discovery pipeline's plain-fetch integrations.
 */
export function verifyStripeSignature(rawBody: string, signatureHeader: string, secret: string): boolean {
  const parts = signatureHeader.split(",").reduce<Record<string, string>>((acc, part) => {
    const [key, value] = part.split("=");
    if (key && value) acc[key] = value;
    return acc;
  }, {});

  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const signatureBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== signatureBuf.length) return false;

  try {
    return timingSafeEqual(expectedBuf, signatureBuf);
  } catch {
    return false;
  }
}
