# Intelligent Carpet Cleaning (ICC) Platform

Premium carpet and upholstery cleaning platform for Mark McClymont, Cheltenham. An AI assistant gives genuine expert advice, quotes (including from photos), and books jobs; an admin platform lets Mark run the operational side of the business.

Currently a working proof of concept on its way to a full platform. See [docs/DESIGN.md](docs/DESIGN.md) for the product brief and [ROADMAP.md](ROADMAP.md) for the phased plan.

## Stack (Phase 0)

- Static site on **Netlify** (`index.html`, `admin.html`)
- **Netlify serverless functions** (`netlify/functions/`) for the AI proxy, bookings, email, and PDF job cards
- **Netlify Blobs** for booking storage (migrates to Supabase in Phase 2)
- **Claude API** (Anthropic) for the assistant, **Resend** for email

## Quick start (local dev)

```bash
npm install
cp .env.example .env        # then fill in the values
npx netlify dev             # serves the site + functions locally
```

Functions are exposed under `/api/*` via the redirects in `netlify.toml`. The site needs `ANTHROPIC_API_KEY` (chat), `RESEND_API_KEY` (booking email), and `ADMIN_SECRET` (admin dashboard) to be functional.

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
