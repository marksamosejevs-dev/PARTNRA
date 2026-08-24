import { NextRequest, NextResponse } from "next/server";
import { isPlanKey, PlanKey } from "@/lib/plans";

const PRICE_ENV_BY_PLAN: Record<PlanKey, string | undefined> = {
  starter: process.env.STRIPE_PRICE_STARTER,
  growth: process.env.STRIPE_PRICE_GROWTH,
  pro: process.env.STRIPE_PRICE_PRO,
};

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid request body.", 400);
  }

  const { plan } = (body ?? {}) as { plan?: unknown };
  if (!isPlanKey(plan)) {
    return errorResponse("Select a valid plan.", 400);
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const priceId = PRICE_ENV_BY_PLAN[plan];

  if (!secretKey || !priceId) {
    return errorResponse("Subscriptions aren't open yet -- please check back soon.", 501);
  }

  const origin = request.headers.get("origin") ?? new URL(request.url).origin;

  try {
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        mode: "subscription",
        "line_items[0][price]": priceId,
        "line_items[0][quantity]": "1",
        success_url: `${origin}/subscribed?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/?checkout=cancelled`,
        allow_promotion_codes: "true",
      }),
    });

    if (!res.ok) {
      return errorResponse("We couldn't start checkout right now. Please try again.", 502);
    }

    const data = (await res.json()) as { url?: string };
    if (!data.url) {
      return errorResponse("We couldn't start checkout right now. Please try again.", 502);
    }

    return NextResponse.json({ url: data.url });
  } catch {
    return errorResponse("We couldn't start checkout right now. Please try again.", 502);
  }
}
