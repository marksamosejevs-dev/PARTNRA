import { LegalPage } from "@/components/legal/LegalPage";

export const metadata = {
  title: "Cancellation Policy — PARTNRA",
  description: "How PARTNRA subscriptions renew, and how to cancel them.",
};

export default function CancellationPage() {
  return (
    <LegalPage title="Cancellation Policy" updated="24 August 2026">
      <h2>Monthly recurring billing</h2>
      <p>
        PARTNRA subscriptions (Starter, Growth, Pro) bill monthly in advance at the price
        shown on our pricing page at the time you subscribe. Your subscription automatically
        renews each month at the same price and interval until you cancel.
      </p>

      <h2>How to cancel</h2>
      <p>
        You can cancel future renewals at any time. Cancelling stops the next billing
        cycle &mdash; it does not immediately end an already-paid period early. Once we have a
        customer account/billing portal live, cancellation will be self-serve from within
        your account; until then, cancel by contacting us through the audit form or contact
        link on our homepage, and we will action it promptly and confirm by email.
      </p>

      <h2>What happens to your access</h2>
      <p>
        Unless we tell you otherwise for a specific case, your access continues through the
        end of the billing period you have already paid for, and does not renew after that.
        We do not cut off access mid-period for a cancellation you made before that period&rsquo;s
        renewal date.
      </p>

      <h2>Refunds</h2>
      <p>
        Because PARTNRA is a software subscription that grants ongoing access rather than a
        one-off deliverable, we do not offer automatic refunds for partial months once a
        billing period has started, except:
      </p>
      <ul>
        <li>where required by applicable consumer-protection law in your jurisdiction;</li>
        <li>where we made a billing error; or</li>
        <li>where the service was materially unavailable for a significant part of the period through our fault.</li>
      </ul>
      <p>
        If you believe one of these applies to you, contact us and we will review it in good
        faith. Nothing in this policy overrides a statutory right you may have to a refund
        or withdrawal period under the law that applies to you.
      </p>

      <h2>Payment processing</h2>
      <p>
        Stripe processes all payments on our behalf. We never see or store your full card
        details. Any Stripe-side payment disputes or chargebacks are handled per Stripe&rsquo;s
        own process in addition to the options above.
      </p>

      <h2>Questions</h2>
      <p>
        If anything here is unclear, contact us before subscribing &mdash; we would rather
        clarify upfront than resolve a dispute afterwards.
      </p>
    </LegalPage>
  );
}
