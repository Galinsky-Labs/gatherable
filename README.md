# Gatherable website

Marketing site for Gatherable, LLC (https://gatherablehub.com) with two AI features:

- **Smart intake** (`/#contact`): a four-step inquiry form. Each lead is saved to Postgres and, when an Anthropic API key is set, Claude writes George a short pre-meeting brief.
- **Free Pitch Check** (`/pitch-check`): visitors upload a PDF deck or RFP response and get a scorecard on seven criteria, the top three fixes and likely client questions. The PDF is sent to Claude for analysis and is never stored.
- **Digital product sales** (`/#checklist`): "Don't want to wait for a meeting? Get the comprehensive checklist." Products (title, price, description, file) are managed in the admin page. Buyers pay through Stripe Checkout and get a private download link (`/download/<token>`, up to 25 downloads). Files are stored in Postgres.
- **Edit website text** (`/admin` → Website text): opens any page in editing mode; click text, type, save. Edits are stored in Postgres (`content`, with `content_history`) and applied when pages are served. Editable elements carry `data-edit` keys; run `node tools/assign-edit-keys.mjs` after adding new copy to the HTML.
- **Pictures**: in the editor, click any picture to replace it. It is resized in the browser, stored in Postgres (`media`) and served from `/media/…`.
- **Online booking** (`/admin` → Online booking): paste a Cal.com or Calendly link and switch it on; visitors get a "Pick a time now" button and the calendar opens after they send the contact form.
- **Legal pages** (`/privacy`, `/terms`): drafted, hidden until switched on in `/admin` → Legal pages; then linked in every footer and added to the sitemap.
- **Lead tracking** (`/admin` → Leads): status, follow-up dates with due alerts, notes, filters, search and CSV export.
- **SEO** (`/admin` → SEO): per-page Google title and description with a live preview and checks, Search Console / Bing verification, optional Google Analytics. The server also serves `robots.txt`, `sitemap.xml`, social preview tags and structured data (business, founder, FAQ), with gzip compression.
- **Admin** (`/admin`, HTTP Basic auth; the password can be changed in the admin page, falling back to `ADMIN_PASSWORD`): lists leads, AI briefs and Pitch Check results, with a status per lead.

## Stack

- Node.js 22, no framework (`server.js`), dependencies: `@anthropic-ai/sdk`, `pg`
- Neon Postgres (project `gatherable`, Galinsky Labs org). Tables are created on startup.
- Claude Opus 5.5 via the Anthropic SDK, structured JSON output, server-side refusal fallback enabled
- Hosted on Render (web service, auto-deploys from `main`)

## Files

| Path | What it is |
|---|---|
| `server.js` | HTTP server: static files, `/api/intake`, `/api/review`, `/admin`, `/api/health` |
| `site.js` | Renders pages with text edits and SEO settings; robots, sitemap, structured data |
| `admin-assets/editor.js` | The in-page text editor (served only behind the admin password) |
| `prompts.js` | Review criteria, system prompts and output schemas. **The criteria are a draft: refine them with George.** |
| `public/` | Site pages, styles, scripts and images |

## Environment variables

See `.env.example`. **Stripe setup:** paste the Stripe secret key in `/admin` → Payments. The server checks it with Stripe, creates the webhook (`/api/stripe-webhook`) automatically, and stores both encrypted (AES-256-GCM) in the `settings` table using `SETTINGS_ENCRYPTION_KEY`. Env vars `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` still work as a fallback. Until Stripe is connected the checklist section stays hidden.

Without `ANTHROPIC_API_KEY` the site still works: leads are saved, and the Pitch Check shows a "being set up" message.

## Run locally

```bash
npm install
cp .env.example .env   # fill in values
node --env-file=.env server.js
```
