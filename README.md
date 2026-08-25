# PARTNRA website

This is the PARTNRA marketing site, including the "tell PARTNRA what you
sell, we'll find who can sell it" scanner on the homepage. This README
assumes no prior coding experience.

## 1. What this site needs to work fully

The website itself (all the text, sections, pricing, etc.) works with no setup
at all. The one feature that needs extra configuration is the **partner
discovery scanner** in the hero section — the box where a visitor types in
*their own* website and clicks "Find my partners". Behind the scenes it: (1)
analyses that business, (2) automatically identifies a couple of real,
comparable competitor brands, then (3) finds who's already promoting those
competitors — the visitor never has to know or enter a competitor's URL
themselves.

That scanner needs two **required** outside services, plus three **optional**
ones that add more coverage and contact details:

**Required:**

1. **A web search API**, so it can search the public web for evidence, and
   resolve the AI-suggested competitor names to real domains.
   We use **Serper** (a Google Search API).
   - Sign up at https://serper.dev/
   - Create an API key
   - This gives you a value for `SERPER_API_KEY`

2. **An AI model API**, used twice: once to read the visitor's own homepage
   and identify their product category and comparable competitor brands, and
   once to read the search results and decide which ones are real affiliate
   evidence (a promo code, an affiliate link, etc.) versus just a random
   mention of the brand. Both steps only ever name something they're
   confident is real — never a guess presented as fact.
   We use **Anthropic (Claude)**.
   - Sign up at https://console.anthropic.com/
   - Create an API key
   - This gives you a value for `ANTHROPIC_API_KEY`

Until both of these are added, the scanner will show a clear message
("Search API is not configured.") instead of pretending to work. It will
never show fake results as if they were real.

**Optional — the scanner works fine without these, they just add more:**

3. **YouTube Data API**, so the scanner also checks YouTube videos/channels.
   - Sign up at https://console.cloud.google.com/apis/library/youtube.googleapis.com
   - Create an API key
   - This gives you a value for `YOUTUBE_API_KEY`

4. **OpenAI**, so the scanner also runs an OpenAI Web Search pass (via the
   Responses API) looking specifically for promo codes, affiliate links,
   ambassador relationships and similar commercial signals.
   - Sign up at https://platform.openai.com/
   - Create an API key
   - This gives you a value for `OPENAI_API_KEY`

5. **Apify**, for public Instagram and TikTok posts. **Currently not called
   by the live scan** even if configured — Apify's actor-run calls were the
   confirmed cause of repeated production timeouts, and re-enabling them
   needs a background-job setup this project doesn't have yet. Configuring
   this key today has no effect; it's kept here so nothing needs to change
   once that exists.
   - Sign up at https://console.apify.com/
   - Create an API token under Settings → Integrations
   - This gives you a value for `APIFY_API_TOKEN`

6. **Hunter**, so verified candidates can show a real business email instead
   of "Coming soon".
   - Sign up at https://hunter.io/
   - Create an API key
   - This gives you a value for `HUNTER_API_KEY`
   - Hunter is only ever called for candidates that already passed evidence
     verification, and only when a real business domain (not a social
     profile) is available — it never guesses or invents an email.

If any of the optional services is missing or fails, the scan still runs on
whichever sources ARE available — it never fails the whole scan because one
optional add-on isn't configured.

## 2. Where to add these keys

All of these are **environment variables** — settings the website reads at
runtime, kept out of the code itself so they're never publicly visible.

**In Netlify (for the live website):**

1. Go to your site on https://app.netlify.com
2. Click **Site configuration** → **Environment variables**
3. Click **Add a variable** and add each of these one at a time:

   | Key | Value |
   |---|---|
   | `SEARCH_PROVIDER` | `serper` |
   | `SERPER_API_KEY` | (the key from Serper) |
   | `ANTHROPIC_API_KEY` | (the key from Anthropic) |
   | `LLM_MODEL` | `claude-haiku-4-5-20251001` |
   | `YOUTUBE_API_KEY` | (optional — the key from Google Cloud) |
   | `OPENAI_API_KEY` | (optional — the key from OpenAI) |
   | `APIFY_API_TOKEN` | (optional — the token from Apify; not currently used by the live scan, see above) |
   | `HUNTER_API_KEY` | (optional — the key from Hunter) |
   | `PARTNRA_MOCK_MODE` | `false` |

4. Trigger a new deploy (Netlify → **Deploys** → **Trigger deploy**) so the
   site picks up the new values.

**On your own computer (for local testing):** copy `.env.example` to a new
file named `.env.local` in the project folder, and fill in the same values.
`.env.local` is never uploaded to GitHub or Netlify — it's just for your
machine.

## 3. Running the site locally

You'll need [Node.js](https://nodejs.org) installed (version 20 or newer).

```bash
npm install
npm run dev
```

Then open http://localhost:3000 in your browser.

## 4. Testing the partner discovery scanner

**Without any API keys** (default): type any website into the hero scanner
and click the button. You'll see "Search API is not configured." — this
confirms the site is correctly refusing to fake results.

**With a quick fake demo, no API keys needed:** in your `.env.local` file,
set:

```
PARTNRA_MOCK_MODE=true
```

Restart `npm run dev`. Now the scanner will return a small set of obviously
labeled demo candidates ("Demo data" tag) so you can see the full results
experience without spending anything on search/AI calls. **Never turn this
on in Netlify's production environment variables** — leave
`PARTNRA_MOCK_MODE` set to `false` (or remove it) there.

**With real API keys:** add `SERPER_API_KEY` and `ANTHROPIC_API_KEY` to
`.env.local` (add `YOUTUBE_API_KEY`, `APIFY_API_TOKEN`, and/or
`HUNTER_API_KEY` too if you have them), make sure `PARTNRA_MOCK_MODE` is
`false` or removed, restart the dev server, and try a real, well-known
brand's own website (not a competitor's). A real scan typically takes several
seconds while it analyses the business, identifies competitors, searches,
verifies evidence, and looks up contact details.

## 5. How to tell if production is using real data or mock data

- If `PARTNRA_MOCK_MODE=true` is set anywhere the site is running, every
  scan result will be visibly tagged **"Demo data"** next to the results
  count. Real scans never carry that tag.
- If the search/AI keys are missing entirely, the scanner shows a plain
  error message and never returns any candidates — it does not fall back to
  fake data silently.
- Each real result shows exactly which platforms found it (e.g. "YouTube,
  Instagram") and, if Hunter found a contact, a real "Contact" button. If
  Hunter isn't configured or didn't find anything, it shows "Coming soon" or
  "Not found" — never a guessed email.

## 6. Setting up subscription payments (Stripe)

The pricing section's "Choose your plan" flow needs a Stripe account before
it can actually charge anyone. Until it's set up, clicking through to
checkout shows a clean "Subscriptions aren't open yet" message — visitors
never see a broken or fake checkout.

1. Create a Stripe account at https://dashboard.stripe.com/register if you
   don't have one.
2. **Get your API keys**: go to
   https://dashboard.stripe.com/apikeys and copy the **Secret key** (starts
   with `sk_`). That's your `STRIPE_SECRET_KEY`.
3. **Create a Price for each plan**: go to
   https://dashboard.stripe.com/products → **Add product**. Create three
   products (Starter, Growth, Pro) with a **recurring monthly** price of
   $49, $99, and $199. For each one, open the product and copy its **Price
   ID** (starts with `price_`) — these become `STRIPE_PRICE_STARTER`,
   `STRIPE_PRICE_GROWTH`, and `STRIPE_PRICE_PRO`.
4. **Set up the webhook**: go to
   https://dashboard.stripe.com/webhooks → **Add endpoint**. Set the URL to
   `https://<your-live-domain>/api/webhooks/stripe`, and select at least
   these events: `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`. After creating it, click into the
   endpoint and copy its **Signing secret** (starts with `whsec_`) — that's
   your `STRIPE_WEBHOOK_SECRET`.
5. Add all five values in Netlify the same way as the other keys (Site
   configuration → Environment variables): `STRIPE_SECRET_KEY`,
   `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_GROWTH`,
   `STRIPE_PRICE_PRO`. Then trigger a new deploy.

**Test mode first:** Stripe gives you separate test and live API keys —
start with the test ones (also on the API keys page) and use
[Stripe's test card numbers](https://docs.stripe.com/testing) to confirm a
full checkout before switching to live keys.

**What still needs building beyond this:** the webhook endpoint verifies
Stripe's signature and acknowledges events, but this project has no
database yet, so it doesn't store subscription status anywhere (see the
comment in `src/app/api/webhooks/stripe/route.ts`). A subscriber's payment
is real and processed by Stripe either way, but "is this visitor currently
subscribed" isn't tracked on our side yet — that needs an accounts/database
layer as a follow-up piece of work.

## 7. Deploying

This site auto-deploys through Netlify whenever changes are pushed to the
connected GitHub branch. To deploy manually:

```bash
npm run build
```

If this command finishes without errors, Netlify will succeed too. Then
push your changes to GitHub — Netlify picks them up automatically.

## 8. Project structure (for reference)

- `src/app/page.tsx` — the order of sections on the homepage
- `src/components/` — one file per section/component
- `src/app/api/discover-affiliates/route.ts` — the scanner's backend logic
- `src/lib/discovery/` — search, AI classification, and domain-parsing logic
  used by the scanner
- `src/components/PlanSelector.tsx` + `src/app/api/checkout/route.ts` — the
  "Choose your plan" modal and the Stripe Checkout Session it creates
- `src/app/api/webhooks/stripe/route.ts` — verifies and receives Stripe's
  webhook events
- `src/app/subscribed/page.tsx` — the post-checkout success page (verifies
  payment with Stripe directly before showing "Welcome to PARTNRA")
