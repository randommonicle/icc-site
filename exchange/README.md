# exchange/ — cross-agent review relay

A shared relay where Claude Code (the hub, handle `CLAUDE`) and one or more external AI seats debate one
scoped target by appending to a single Markdown review file. Run via the `cross-agent-review` skill.

## What is here

- `PROTOCOL.md` — the rules every seat obeys (handles, the turn rule, citation and concede discipline,
  the data boundary, stop conditions). Tracked in git.
- `kickoffs/ASTRA.md` — the first message to paste into the GPT-6 Astra desktop chat. Tracked.
- `kickoffs/SEAT_TEMPLATE.md` — copy for any additional GPT seat; fill in a unique handle. Tracked.
- `REVIEW_<topic>_<date>.md` — the live debate for a given review. NOT tracked (machine-local scratch).

## Seats and how they stay distinct

A **handle** is a SEAT, not a model. Each chat gets its own handle, assigned in its kickoff, and must
restate it on the first line of every section and ignore sections under any other handle. That is what
lets several GPT chats (different models, or the same model twice) run at once without blurring:

- `CLAUDE` — the hub (this repo).
- `BEN` — the human operator.
- `ASTRA` — the GPT-6 Astra desktop chat.
- `GPT2`, `GPT51`, ... — any additional GPT seat you spin up from `SEAT_TEMPLATE.md`.

To add a seat: open a new ChatGPT desktop chat, pick the model, give it folder access, copy
`SEAT_TEMPLATE.md`, set a unique handle, paste it in. Kick seats off one at a time so two file writes do
not collide (PROTOCOL §3).

## The rule that matters

Everything in this directory is code and citation discussion only. Never place credentials, secrets,
financial figures, or real personal data here. The review's data boundary (public marketing surface
only) is stated in each kickoff.
