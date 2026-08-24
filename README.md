# PARTNRA website

This is the PARTNRA marketing site, including the "find the affiliates already
promoting your competitors" scanner on the homepage. This README assumes no
prior coding experience.

## 1. What this site needs to work fully

The website itself (all the text, sections, pricing, etc.) works with no setup
at all. The one feature that needs extra configuration is the **competitor
scanner** in the hero section — the box where a visitor types in a
competitor's website and clicks "Find their affiliates".

That scanner needs two outside services:

1. **A web search API**, so it can search the public web for evidence.
   We use **Serper** (a Google Search API).
   - Sign up at https://serper.dev/
   - Create an API key
   - This gives you a value for `SERPER_API_KEY`

2. **An AI model API**, so it can read the search results and decide which
   ones are real affiliate evidence (a promo code, an affiliate link, etc.)
   versus just a random mention of the brand.
   We use **Anthropic (Claude)**.
   - Sign up at https://console.anthropic.com/
   - Create an API key
   - This gives you a value for `ANTHROPIC_API_KEY`

Until both of these are added, the scanner will show a clear message
("Search API is not configured.") instead of pretending to work. It will
never show fake results as if they were real.

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

## 4. Testing the affiliate scanner

**Without any API keys** (default): type a competitor URL into the hero
scanner and click the button. You'll see "Search API is not configured." —
this confirms the site is correctly refusing to fake results.

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
`.env.local`, make sure `PARTNRA_MOCK_MODE` is `false` or removed, restart
the dev server, and try a real, well-known competitor domain. A real scan
typically takes several seconds while it searches and verifies evidence.

## 5. How to tell if production is using real data or mock data

- If `PARTNRA_MOCK_MODE=true` is set anywhere the site is running, every
  scan result will be visibly tagged **"Demo data"** next to the results
  count. Real scans never carry that tag.
- If the search/AI keys are missing entirely, the scanner shows a plain
  error message and never returns any candidates — it does not fall back to
  fake data silently.

## 6. Deploying

This site auto-deploys through Netlify whenever changes are pushed to the
connected GitHub branch. To deploy manually:

```bash
npm run build
```

If this command finishes without errors, Netlify will succeed too. Then
push your changes to GitHub — Netlify picks them up automatically.

## 7. Project structure (for reference)

- `src/app/page.tsx` — the order of sections on the homepage
- `src/components/` — one file per section/component
- `src/app/api/discover-affiliates/route.ts` — the scanner's backend logic
- `src/lib/discovery/` — search, AI classification, and domain-parsing logic
  used by the scanner
