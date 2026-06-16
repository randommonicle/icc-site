# Intelligent Carpet Cleaning (ICC) Platform

Premium carpet and upholstery cleaning platform for Mark McClymont, Cheltenham. An AI assistant gives genuine expert advice, quotes (including from photos), and books jobs; an admin platform lets Mark run the operational side of the business.

The Phase 1 public site is live and most of the Phase 2 operational backend is built and live (see [NEXT_SESSION.md](NEXT_SESSION.md) for the current state). See [docs/DESIGN.md](docs/DESIGN.md) for the product brief and [ROADMAP.md](ROADMAP.md) for the phased plan.

## Stack

- Multi-page **Astro** site on **Netlify** (`site/`, live since 15 June 2026); an `admin.html` dashboard behind Supabase Auth. The old single-page `index.html` is retained as a rollback only.
- **Netlify serverless functions** (`server/netlify/functions/`) for the AI proxy, bookings, handoffs, email, and PDF job cards
- **Supabase Postgres** for booking and handoff storage; Netlify Blobs now holds only rate-limit windows and legacy bookings
- **Claude API** (Anthropic) for the assistant, **Resend** (verified `intelligentclean.co.uk`) for email

## Quick start (local dev)

```bash
npm install
cp .env.example .env        # then fill in the values
npx netlify dev             # serves the site + functions locally
```

Functions are exposed under `/api/*` via the redirects in `netlify.toml`. The site needs `ANTHROPIC_API_KEY` (chat), `RESEND_API_KEY` (booking email), and the `SUPABASE_*` vars (bookings, handoffs, and admin auth) to be functional. The legacy `ADMIN_SECRET` is no longer read by the app (admin sign-in moved to Supabase Auth in Slice 5d).

## Where to look

| File | What it is |
|------|------------|
| [CLAUDE.md](CLAUDE.md) | Developer guide and conventions — read first |
| [NEXT_SESSION.md](NEXT_SESSION.md) | Live handover: current state and next task |
| [ROADMAP.md](ROADMAP.md) | Phased forward plan (RAG status) |
| [DECISIONS.md](DECISIONS.md) | Architectural decision records |
| [LESSONS_LEARNED.md](LESSONS_LEARNED.md) | Gotchas and fixes |
| [docs/DESIGN.md](docs/DESIGN.md) | The agreed product brief |

## Discipline

Work on branches off `main`; never push straight to `main`; deploys (Netlify auto-deploys `main`) happen by deliberate merge, not while the site is taking live bookings without sign-off. Keep the doc set current. Full detail in [CLAUDE.md](CLAUDE.md).
