import { NextRequest, NextResponse } from "next/server";
import { verifyStripeSignature } from "@/lib/stripe/verifySignature";

interface StripeEvent {
  type?: string;
  data?: { object?: unknown };
}

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook is not configured." }, { status: 501 });
  }

  const signatureHeader = request.headers.get("stripe-signature");
  const rawBody = await request.text();

  if (!signatureHeader || !verifyStripeSignature(rawBody, signatureHeader, secret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  // NOTE for whoever wires up persistence next: this handler verifies and
  // acknowledges Stripe's webhook events, but there is no database in this
  // project yet, so subscription status isn't stored anywhere. Until that
  // exists, each event type below is a no-op placeholder for where that
  // write would go (e.g. upsert a subscription row keyed by Stripe customer
  // ID, set its status/plan from the event payload).
  switch (event.type) {
    case "checkout.session.completed":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      break;
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
