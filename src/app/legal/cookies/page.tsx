import { LegalPage } from "@/components/legal/LegalPage";

export const metadata = {
  title: "Cookie Policy — PARTNRA",
  description: "Which cookies PARTNRA uses, and why.",
};

export default function CookiesPage() {
  return (
    <LegalPage title="Cookie Policy" updated="24 August 2026">
      <h2>1. What this policy covers</h2>
      <p>
        This policy explains which cookies and similar technologies PARTNRA&rsquo;s website
        uses, and why. It only lists categories and cookies that actually exist on this
        site today &mdash; we update it if that changes.
      </p>

      <h2>2. Strictly necessary</h2>
      <p>
        These are required for the site and product to function, and cannot be switched
        off. They include:
      </p>
      <ul>
        <li>your cookie-preference choice itself, so we don&rsquo;t ask you again every visit;</li>
        <li>
          session/security cookies used during Stripe Checkout to process a subscription
          payment; and
        </li>
        <li>
          any cookie a future customer login/account area needs to keep you signed in.
        </li>
      </ul>

      <h2>3. Analytics</h2>
      <p>
        PARTNRA does not currently use any analytics or visitor-tracking cookies. If we
        add analytics in the future, this section will describe exactly what is used and
        why, and it will only run if you accept it in our cookie preferences.
      </p>

      <h2>4. Functional</h2>
      <p>
        PARTNRA does not currently set any optional functional cookies (for example, to
        remember a preference beyond your cookie choice). This section will be updated if
        that changes.
      </p>

      <h2>5. Marketing</h2>
      <p>
        PARTNRA does not currently use any marketing or advertising cookies, and we do not
        share cookie data with ad networks. This section will be updated if that changes.
      </p>

      <h2>6. Managing your preferences</h2>
      <p>
        You can accept all cookies, reject all non-essential cookies, or choose per
        category, from the cookie banner shown on your first visit. You can change your
        choice at any time using the &ldquo;Cookie settings&rdquo; link in the footer of every
        page. Your choice is stored in your browser&rsquo;s local storage, not sent to any
        third party.
      </p>

      <h2>7. Browser controls</h2>
      <p>
        You can also block or delete cookies using your browser&rsquo;s own settings.
        Blocking strictly necessary cookies may stop parts of the site &mdash; such as
        Stripe Checkout &mdash; from working correctly.
      </p>

      <h2>8. Changes to this policy</h2>
      <p>
        If we introduce a new cookie or category, we will update this page and, where the
        change is material, ask for your consent again through the cookie banner.
      </p>

      <h2>9. Contact</h2>
      <p>
        Questions about this policy can be sent via the contact form or audit form linked
        from our homepage.
      </p>
    </LegalPage>
  );
}
