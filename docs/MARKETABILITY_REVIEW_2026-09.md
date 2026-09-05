# Marketability review — September 2026 (cross-agent, converged)

**What.** A cross-agent marketability review of the ICC public site, run 2026-09-05 via the
`cross-agent-review` skill: Claude (hub) plus GPT-6 Astra (an independent seat), over a shared relay,
three rounds each, converged. The full transcript is machine-local and gitignored at
`exchange/REVIEW_marketability_2026-09-05.md`; this note is the durable summary.

**Scope.** The public marketing surface and the booking funnel (the Astro site), pre-launch. NOT SEO
plumbing (already assessed launch-ready) and NOT the out-of-repo levers (Google Business Profile,
reviews, the phone), which are gated separately in `LAUNCH_CUTOVER.md`.

## Agreed findings, in priority order

1. **A4 — AI-capability and competitor overclaims (High).** The site promised the assistant would
   "identify the fibre and the exact cleaning method" before attendance, made an unconditional "no
   damage after the fact" claim, and generalised about competitors ("most companies treat every floor
   the same", "not standard practice in the industry"). Elevated from the seat's initial Medium to High
   on ASA/CAP substantiation grounds (CAP Code 3.7, 3.9-3.11) and Ben's D-015. **Remediated in full**
   this session across home, about, guides, areas, services and history: reworded to likely-assessment
   with the method confirmed on the day; competitor generalisations and the no-damage promise removed.
2. **A1 + A2 — Proof near the first screen (High, merged).** The hero and first strip centre on the AI;
   practical cleaning benefits sit on Services, and there is little human/credibility proof anywhere
   (the 15-year claim is unattributed; no insurance shown, no accreditation, no operator or work
   photography, no before/after, no reviews). Keep the AI lead, but bring a concrete benefit and
   credible proof near the fold. **Owner-side; see below.**
3. **A3 — Human booking route (Medium; bot-first accepted).** Both hero CTAs go to the assistant, and
   `contact.astro` stated "all bookings are taken through our AI chat assistant" while also inviting a
   call. Ben's decision: bot-first is deliberate and tested (D-032), so the prominent-phone
   recommendation was declined. **Done:** the false universal statement was corrected to a
   preferred-route invitation, the quiet phone/email fallback kept.
4. **A5 — Commercial enquiry path (Medium).** Commercial work is offered with tailored pricing but no
   dedicated next action; the block ends in the same AI quote CTA. Optional: a clearly-labelled
   commercial enquiry into the assistant, respecting the bot-first choice. **Open.**
5. **Brand coherence (Low).** "Intelligent Carpet Cleaning" vs the "Intelligent Clean" domain/email is
   a positioning question, not a defect. No action.

## Actioned this session (committed to `feat/phone-01452-swap`, not yet deployed)

- A4 overclaims softened across all six page types; no-damage and competitor claims removed.
- A3 `contact.astro` wording corrected.
- Satisfaction guarantee, complaints procedure and a `/terms` page created (D-031); the re-clean and
  deposit/cancellation policy single-sourced in `shared/config/policy.js` (L-031); bot-first recorded
  (D-032). The assistant now escalates a post-clean complaint to Mark (paper trail).

## Owner-side / still open (not code)

- **A2 proof gap (highest-value remaining marketing item).** Needs Mark-supplied material: a short
  operator introduction, a real work photo or two, before/after shots when available, then reviews and
  GBP post-launch. Nothing to build; it needs the content.
- **A5 commercial enquiry action** (a labelled commercial route into the assistant). Optional, Medium.
- **Legal/DP review of `/terms` and the privacy notice** before go-live (GATE 0).
- **Insurance / accreditation:** substantiate and add only if held; currently omitted by decision.

## Method note

The independent seat caught two overclaim locations (`services.astro:114`, `history.astro:40`) the
hub's first pass missed, which is the point of the cross-agent approach. Every finding was re-derived
against the page source before acting (findings-are-evidence); competitor observations were the seat's,
not independently verified by the hub, and their prices are not repeated as fact.
