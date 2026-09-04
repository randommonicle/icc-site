# Privacy notice pre-review — 4 September 2026

A UK GDPR / PECR accuracy-and-completeness review of the public privacy notice
(`site/src/pages/privacy.astro`), checked against the code's **actual** data flows. This
is a **pre-review to de-risk the outstanding human data-protection professional review**
(ROADMAP go-live item), not a substitute for it. The professional review remains the
authority, especially on the AMBER judgment calls below.

**Method.** Two independent passes reconciled: a primary pass and an independent pass by
the `property-reg-reviewer` agent, each grounding every claim in `file:line` evidence from
the code, then re-derived from source before recording here. Scope confirmed: the Astro
site under `site/` is the live notice (`netlify.toml` publishes `site/dist`); the legacy
root `index.html` privacy text is no longer served.

**Verdict.** Structurally sound. The three RED items are fixed or staged (below); the site
stays `noindex` until the human review is done, which is the correct gate.

---

## RED — go-live blockers

### R1. "Mark personally reviews and confirms every booking" was factually untrue — FIXED

The notice claimed no solely-automated decisions **and** that Mark reviews every booking.
In production (D-021 enabled, D-027 deployed), a booking whose finish is at or before
15:00 is **auto-confirmed with no human step** and the customer gets an immediate
confirmation email; only later-finishing bookings route to Mark.

Evidence: `server/netlify/functions/chat.js:936` (`provisional = usePostgres && finishMinutes > tradingHours.autoConfirmByMinutes()`),
default state `auto_confirmed` in `bookingsStore.js`, the 15:00 line in `shared/config/tradingHours.js`,
the non-provisional confirmation email path around `chat.js:1156`.

Regulation: UK GDPR Art 5(1)(a) (accuracy/transparency of the notice); Art 13(2)(f) / Art 22
(automated decision-making). Whether auto-confirming a customer's own booking request meets
the Art 22(1) "legal or similarly significant effect" threshold is arguable and is flagged
for the professional (see Q1); regardless, the statement had to be made accurate.

**Applied wording** (replaces the old sentence in the "Our AI assistant" section):

> Standard daytime bookings are confirmed automatically by our system as soon as you book.
> Bookings that would finish later in the day are held and reviewed by Mark personally, who
> confirms or declines them. No decision producing a legal or similarly significant effect
> is made about you by solely automated means, and you can ask for a person to review any
> automated confirmation by contacting us.

The added human-review offer is a deliberate safeguard in case the professional treats the
auto-confirmation as an Art 22(2)(a) contract-exception decision.

### R2. Visible editorial placeholder + incomplete transfer list — FIXED

The international-transfers paragraph contained the literal string
`[to confirm: review the transfer position with each provider before go-live.]`, which would
render verbatim on the public page, and it omitted Google (a US processor) from the
US-based list.

Regulation: UK GDPR Art 13(1)(f) / Arts 44–46.

**Applied wording** (replaces the transfers sentence):

> Some of these providers (for example Anthropic, Resend, Netlify, and Google) are based in
> the United States and may process data outside the UK. Where they do, the transfer is
> covered by appropriate safeguards under each provider's data processing agreement, such as
> the UK International Data Transfer Agreement or the UK Addendum to the EU Standard
> Contractual Clauses.

**Ben confirmed (2026-09-04)** this wording is acceptable for UK use. **Evidence to retain:**
this statement is only true if each provider's signed DPA actually carries the UK IDTA /
Addendum. Anthropic, Resend, Netlify and Google all publish such DPAs; keep a copy of each
on file so the claim is substantiated (substantiate-outward-claims).

### R3. Review engine (D-025) undisclosed — STAGED for STEP 6 (not a current breach)

The post-job Google-review request sends to the customer by **email (Resend)** and **SMS
(The SMS Works)**, using their name/phone/email. The notice names neither The SMS Works as
a processor nor the review-request purpose/lawful basis.

Evidence: `reviewRequest.js` (imports `sendSms`, selects `customers(name,phone,email)`),
`smsProvider.js` (POSTs to `api.thesmsworks.co.uk`), `shared/reviewMessages.js`,
`.env.example` (`GOOGLE_REVIEW_URL`, `SMSWORKS_API_KEY`). The engine is **dormant** until
those env vars are set, so this is a go-live blocker, not a live breach.

**Fix 3 — apply before switching the engine on** (runbook STEP 6):

Add to "Who we share it with":

> The SMS Works, which sends a review-request text message after your appointment (only if
> we have your mobile number).

Add to "How we use it, and our lawful basis":

> After we have completed your appointment, to send you a one-off request to leave a Google
> review, by email and (if we have your mobile number) by text message, on the basis of our
> legitimate interest in growing the business through genuine customer feedback. This is a
> single message per completed job, is never sent to anyone who has not been a customer, and
> is not part of any marketing campaign.

If the professional treats this as marketing rather than transactional (see Q2), add an
opt-out line to the review email and SMS and gate on the D-008 soft opt-in.

---

## AMBER — for the human data-protection professional

- **Q1 — Art 22 characterisation.** Does auto-confirming a customer's own booking request
  count as a solely-automated decision with a "legal or similarly significant effect"? If
  yes, disclose the Art 22(2)(a) contract exception and the right to human review explicitly
  (the applied R1 wording already offers human review as a safeguard).
- **Q2 — PECR classification of the review request.** The code marks it transactional
  (`reviewRequest.js:100` `requires_consent: false`), but the copy "helps other people in
  the area find us" (`shared/reviewMessages.js`) has a promotional flavour. Confirm
  transactional vs marketing (PECR reg 22). If marketing: opt-out + consent per Q2/R3 above.
- **Q3 — 6-year financial retention not enforced.** The notice promises deletion after
  ~6 years, but `shared/config/retention.js:6-8` states booking/financial records are "kept
  deliberately, not purged" (only the 6-month lead purge is automated). Document a manual
  periodic-deletion step, or soften the wording. Low urgency (no record is near 6 years).
- **Q4 — Erasure procedure for customer/booking records.** The notice promises erasure
  within a month for all data, but only handoff leads have a coded path (`handoffs.js`
  `deleteHandoff`); customer/`jobs` erasure is manual SQL (service-role), undocumented.
  Document a DSAR erasure procedure so a request can actually be honoured in time.

---

## GREEN — checked and accurate (no change)

- Controller identity, contact route, and ICO number `ZC230232` (D-016; matches `netlify.toml`).
- No advertising/tracking cookies: confirmed. No analytics/pixels/tag manager in `site/`,
  no `Set-Cookie`/`document.cookie` in the public functions; chat state is client-held and
  only POSTed on submit.
- 6-month unconverted-lead retention: enforced and single-sourced
  (`purge-handoffs.js` `@daily`; `retention.js:19` `HANDOFF_LEAD_RETENTION_MONTHS = 6`).
- "We don't keep the conversation unless you book or ask for follow-up": accurate — chat is
  stateless server-side; persistence only on booking or escalation.
- Photos: sent to Anthropic for analysis, not persisted server-side.
- Supabase UK/London hosting; lawful bases, DSAR rights, ICO complaint route present.

---

## Unverified — flagged explicitly

- **Anthropic "does not use them to train its models"**: consistent with Anthropic's
  commercial API terms but not verifiable from this repo. Confirm the account is on
  commercial (not consumer/free) terms and retain the DPA.
- **Actual transfer mechanism per US provider**: confirm each provider's signed DPA carries
  the UK IDTA/Addendum (see R2 evidence-to-retain) before relying on the applied wording.

---

## Changes applied this session (`site/src/pages/privacy.astro`)

- R1 auto-confirm accuracy wording (above).
- R2 transfers wording + Google added to the US list; visible `[to confirm]` placeholder removed.
- "Last updated" bumped to 4 September 2026; the page's frontmatter status comment updated.
- R3 (Fix 3) staged here + wired into `docs/LAUNCH_CUTOVER.md` STEP 6; **not yet in the notice**
  because the engine is dormant.

Not deployed by this change on its own; the notice goes live with the domain cutover
(`docs/LAUNCH_CUTOVER.md` STEP 2/3), still `noindex` until the human review is done.
