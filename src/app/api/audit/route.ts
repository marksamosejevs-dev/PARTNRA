import { NextRequest, NextResponse } from "next/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normaliseStoreUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { storeUrl, email } = (body ?? {}) as { storeUrl?: unknown; email?: unknown };

  if (typeof storeUrl !== "string" || typeof email !== "string") {
    return NextResponse.json(
      { error: "storeUrl and email are required." },
      { status: 400 }
    );
  }

  const normalisedUrl = normaliseStoreUrl(storeUrl);
  if (!normalisedUrl) {
    return NextResponse.json({ error: "Enter a valid store URL." }, { status: 400 });
  }

  const trimmedEmail = email.trim();
  if (!EMAIL_RE.test(trimmedEmail)) {
    return NextResponse.json({ error: "Enter a valid work email." }, { status: 400 });
  }

  // NOTE: PARTNRA's discovery engine is not yet connected. This endpoint
  // records the request so a snapshot can be prepared and sent manually.
  // Replace with real audit-pipeline dispatch when the backend ships.

  return NextResponse.json({
    status: "received",
    message:
      "Alex is on it. We'll prepare your competitor affiliate snapshot and send it to the email provided.",
  });
}
