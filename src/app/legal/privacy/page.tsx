import { LegalPage } from "@/components/legal/LegalPage";

export const metadata = {
  title: "Privacy Policy — PARTNRA",
  description: "How PARTNRA collects, uses, and protects personal data.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="24 August 2026">
      <h2>1. Who we are</h2>
      <p>
        PARTNRA is operated by <strong>IMUNO.LV SIA</strong> (&ldquo;PARTNRA&rdquo;,
        &ldquo;we&rdquo;, &ldquo;us&rdquo;). This policy explains what personal data we
        collect through our website and product, why, and what rights you have over it.
        It applies to visitors, subscribers, and the people whose public business
        information our product surfaces as potential affiliate candidates.
      </p>

      <h2>2. What personal data we collect</h2>
      <p>We collect the following categories of personal data:</p>
      <ul>
        <li>
          <strong>Account and billing data</strong> &mdash; your name, work email, company
          name, and the plan you subscribe to. Card details are entered directly into
          Stripe&rsquo;s own hosted checkout; we never see or store your full card number.
        </li>
        <li>
          <strong>Audit / discovery form data</strong> &mdash; the store URL and work email
          you submit through our &ldquo;See who&rsquo;s already selling your competitors&rdquo;
          form, so we can run a scan and get back to you.
        </li>
        <li>
          <strong>Website usage data</strong> &mdash; standard technical data such as IP
          address, browser type, and pages visited, collected only through the cookies and
          similar technologies described in our{" "}
          <a href="/legal/cookies">Cookie Policy</a>.
        </li>
        <li>
          <strong>Support communications</strong> &mdash; anything you send us via the
          contact or audit form, so we can respond to you.
        </li>
      </ul>

      <h2>3. Public affiliate/business data we process about third parties</h2>
      <p>
        PARTNRA&rsquo;s core function is to search publicly available web pages, videos,
        and social posts for evidence that a creator, publisher, or business is already
        promoting a product comparable to yours (for example, a promo code, an affiliate
        link, or a disclosed partnership), and to surface public business contact
        information where it is legally available (for example, a business email listed
        on a public website). We only process data that is already publicly accessible.
        We do <strong>not</strong> access private messages, private accounts, or
        anything behind a login wall, and we do <strong>not</strong> claim or imply that a
        surfaced candidate has consented to being contacted &mdash; that judgment, and
        compliance with any applicable marketing or data-protection law when you reach
        out to them, is yours to make as the subscriber using our output.
      </p>

      <h2>4. Why we process this data (purposes)</h2>
      <ul>
        <li>to provide and operate the PARTNRA product, including running scans and returning results;</li>
        <li>to create and manage your account and subscription, and to process payments;</li>
        <li>to respond to audit-form submissions and support requests;</li>
        <li>to keep the website secure and functioning correctly; and</li>
        <li>to comply with our legal and accounting obligations.</li>
      </ul>

      <h2>5. Legal bases for processing</h2>
      <p>Where the GDPR applies, we rely on:</p>
      <ul>
        <li><strong>Contract</strong> &mdash; to provide the product and services you subscribe to;</li>
        <li>
          <strong>Legitimate interests</strong> &mdash; to run the discovery/classification
          process on public data, to respond to enquiries, and to keep the service secure,
          balanced against the interests of the individuals involved; and
        </li>
        <li><strong>Consent</strong> &mdash; for non-essential cookies, as described in our <a href="/legal/cookies">Cookie Policy</a>.</li>
      </ul>

      <h2>6. Who we share data with (processors)</h2>
      <p>We only share personal data with service providers we actually use to run PARTNRA:</p>
      <ul>
        <li><strong>Stripe</strong> &mdash; payment processing and subscription billing;</li>
        <li><strong>Netlify</strong> &mdash; website hosting and infrastructure;</li>
        <li><strong>Serper</strong> &mdash; web search results that feed our discovery scans;</li>
        <li><strong>Anthropic</strong> &mdash; AI classification of search results into affiliate evidence;</li>
        <li><strong>Google (YouTube Data API)</strong> &mdash; where configured, video/channel data for scans;</li>
        <li><strong>Apify</strong> &mdash; where configured, public Instagram and TikTok data for scans; and</li>
        <li><strong>Hunter</strong> &mdash; where configured, public business-email lookups for already-verified candidates.</li>
      </ul>
      <p>
        We do not sell personal data, and we do not share it with anyone for their own
        marketing purposes.
      </p>

      <h2>7. International transfers</h2>
      <p>
        Some of the providers listed above may process data outside the European
        Economic Area (for example, in the United States). Where that happens, we rely on
        the safeguards recognised under GDPR, such as the provider&rsquo;s Standard
        Contractual Clauses, to protect the transfer.
      </p>

      <h2>8. Data retention</h2>
      <p>
        We keep account and billing data for as long as your subscription is active and
        for a reasonable period afterwards to meet accounting and legal obligations.
        Audit-form submissions and support communications are kept only as long as needed
        to respond to you and for a reasonable follow-up period. We delete or anonymise
        data once it is no longer needed for these purposes.
      </p>

      <h2>9. Security</h2>
      <p>
        We restrict access to personal data to what our systems and team genuinely need,
        transmit data over encrypted connections, and never expose API keys or secrets to
        the browser. No system is perfectly secure, but we take reasonable technical and
        organisational measures to protect the data we hold.
      </p>

      <h2>10. Your rights</h2>
      <p>Where the GDPR or a similar law applies to you, you have the right to:</p>
      <ul>
        <li>access the personal data we hold about you;</li>
        <li>correct inaccurate data;</li>
        <li>request deletion of your data, subject to our legal obligations;</li>
        <li>object to or restrict certain processing based on legitimate interests;</li>
        <li>request a copy of your data in a portable format; and</li>
        <li>withdraw consent at any time where processing is based on consent (such as non-essential cookies).</li>
      </ul>
      <p>To exercise any of these rights, contact us using the details below.</p>

      <h2>11. If you are a candidate PARTNRA has surfaced</h2>
      <p>
        If our product has surfaced your public business information as a potential
        affiliate candidate and you would like it removed from a future scan or corrected,
        contact us with the URL or profile in question and we will act on your request.
      </p>

      <h2>12. Complaints</h2>
      <p>
        If you believe we have not handled your personal data properly, you can contact us
        first so we can try to resolve it, or lodge a complaint with your local data
        protection supervisory authority.
      </p>

      <h2>13. Changes to this policy</h2>
      <p>
        We may update this policy from time to time. If a change is material, we will make
        reasonable efforts to notify you before it takes effect.
      </p>

      <h2>14. Contact</h2>
      <p>
        Questions about this policy, or requests to exercise your rights, can be sent via
        the contact form or audit form linked from our homepage.
      </p>
    </LegalPage>
  );
}
