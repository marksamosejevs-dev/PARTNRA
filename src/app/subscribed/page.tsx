import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";

interface VerifyResult {
  confirmed: boolean;
}

/**
 * Verifies payment directly with Stripe server-side before showing any
 * success state -- a visitor could otherwise navigate to this URL with a
 * fabricated or stale session_id and see a fake "subscribed" confirmation.
 */
async function verifySession(sessionId: string): Promise<VerifyResult> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return { confirmed: false };

  try {
    const res = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
      { headers: { Authorization: `Bearer ${secretKey}` }, cache: "no-store" }
    );
    if (!res.ok) return { confirmed: false };

    const data = (await res.json()) as { payment_status?: string; status?: string };
    const confirmed = data.payment_status === "paid" || data.status === "complete";
    return { confirmed };
  } catch {
    return { confirmed: false };
  }
}

export default async function SubscribedPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const params = await searchParams;
  const sessionId = params.session_id;
  const result = sessionId ? await verifySession(sessionId) : { confirmed: false };

  return (
    <section className="flex min-h-screen items-center bg-ink px-6 py-24 text-paper">
      <Container>
        <div className="mx-auto max-w-xl text-center">
          {result.confirmed ? (
            <>
              <div className="font-mono-label text-xs font-semibold uppercase tracking-[0.18em] text-lime">
                Subscription active
              </div>
              <h1 className="font-display mt-6 text-[clamp(2.2rem,6vw,4.2rem)] font-medium tracking-tight">
                Welcome to PARTNRA.
              </h1>
              <p className="mt-6 text-lg leading-relaxed text-paper/60">
                Your subscription is confirmed. We&rsquo;ll be in touch shortly with next steps
                for getting your first competitor scan running.
              </p>
            </>
          ) : (
            <>
              <h1 className="font-display mt-6 text-[clamp(1.8rem,5vw,3.2rem)] font-medium tracking-tight">
                We couldn&rsquo;t confirm your subscription.
              </h1>
              <p className="mt-6 text-lg leading-relaxed text-paper/60">
                If you just completed checkout, this can take a moment to confirm. If the
                problem continues, contact us and we&rsquo;ll sort it out.
              </p>
            </>
          )}

          <div className="mt-10 flex justify-center">
            <Button href="/" variant="secondary">
              Back to PARTNRA
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}
