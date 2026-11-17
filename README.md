# Gatherable website

Marketing site for Gatherable, LLC (https://gatherablehub.com) with two AI features:

- **Smart intake** (`/#contact`): a four-step inquiry form. Each lead is saved to Postgres and, when an Anthropic API key is set, Claude writes George a short pre-meeting brief.
- **Free Pitch Check** (`/pitch-check`): visitors upload a PDF deck or RFP response and get a scorecard on seven criteria, the top three fixes and likely client questions. The PDF is sent to Claude for analysis and is never stored.
- **Admin** (`/admin`, HTTP Basic auth with `ADMIN_PASSWORD`): lists leads, AI briefs and Pitch Check results, with a status per lead.

## Stack

- Node.js 22, no framework (`server.js`), dependencies: `@anthropic-ai/sdk`, `pg`
- Neon Postgres (project `gatherable`, Galinsky Labs org). Tables are created on startup.
- Claude Opus 5.5 via the Anthropic SDK, structured JSON output, server-side refusal fallback enabled
- Hosted on Render (web service, auto-deploys from `main`)

## Files

| Path | What it is |
|---|---|
| `server.js` | HTTP server: static files, `/api/intake`, `/api/review`, `/admin`, `/api/health` |
| `prompts.js` | Review criteria, system prompts and output schemas. **The criteria are a draft: refine them with George.** |
| `public/` | Site pages, styles, scripts and images |

## Environment variables

See `.env.example`. Without `ANTHROPIC_API_KEY` the site still works: leads are saved, and the Pitch Check shows a "being set up" message.

## Run locally

```bash
npm install
cp .env.example .env   # fill in values
node --env-file=.env server.js
```
