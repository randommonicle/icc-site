# Consumer-terms legal review — /terms (GATE 0 first-pass)

**Date:** 6 September 2026. **Reviewer:** Claude (agent), directed by Ben.
**Scope:** `site/src/pages/terms.astro` (the new customer Terms), with the
deposit/cancellation and re-clean wording it pulls from `shared/config/policy.js`,
and the same wording as it appears in the booking confirmation email
(`server/netlify/functions/bookingDecision.js` and the T&Cs block in
`server/netlify/functions/chat.js`). Privacy notice is covered separately in
[PRIVACY_REVIEW_2026-09.md](PRIVACY_REVIEW_2026-09.md); only residual points are
noted here.

**What this is and is not.** A structured first-pass to give a solicitor a
worklist and to stop go-live on the wrong footing. It is not legal advice and not
a sign-off. Section and regulation numbers are given to orient the professional
review, and should be confirmed by them. `/terms` already self-declares DRAFT
pending this professional review (GATE 0 in the launch runbook).

**Gating.** None of this blocks the staging deploy (the site is `noindex` and the
page is marked DRAFT). It gates **go-live** (removing `noindex` + the domain
cutover). Priority order for go-live: **T-1**, then **T-2**, then the rest.

**Update (6 September 2026).** Ben decided against a separate solicitor review, so
this first-pass is the owner-approved wording that goes live, not a worklist for a
professional. Status of the findings:
- **T-1 [DONE]** A "Your right to cancel" clause is now single-sourced in
  `shared/config/policy.js` (`cancellationRightParagraphs()`) and rendered on `/terms`
  and in the confirmation email (the reg 16 durable medium), on branch
  `fix/booking-ready-parse`. Covered by `test/policy.test.js`. It states the 14-day
  right, how to cancel, the express-request-to-start route for appointments inside 14
  days, the deposit interaction, and that the statutory right prevails over the
  commercial charge (this also resolves the T-1/T-3 conflict at the wording level).
- **T-2 [DECIDED — accept the gap]** Kept "available on request", at go-live too. Mark's
  home address is the only geographical address available, and publishing it would put a
  home address on /terms and in every confirmation email. Deliberate owner risk-acceptance
  for a small sole trader; implement Mark's address only if challenged. Recorded as a
  D-016 addendum (6 Sep 2026). No code change.
- **T-3/T-4/T-5 [ACCEPTED as-is]** Deposit retention framing kept (10%, "reasonable
  fee"), now subordinate to the T-1 statutory right; ADR line and commercial statutory
  interest not added. Revisit only if a dispute or B2B invoicing makes them live.
- **Deferred mechanism:** to actually charge for part-performed work under reg 36, the
  booking flow would need to capture the customer's express request to start within the
  14 days plus an acknowledgement that the right is lost on completion. The clause
  states it; the flow does not yet capture it. `TODO(T-1/express-request-capture)`.

**T-1 review flag [HIGH, owner-tracked].** A cross-agent review (GEMPRO, 2026-09-06)
pressed that the fourth cancellation paragraph (a charge for part-performed work + loss
of the right on completion) is enforceable only if the booking flow captures the
customer's express request to begin within the 14 days plus an acknowledgement the right
is lost — which it does not. Publishing it as-is therefore overstates ICC's rights and
carries a misleading-action risk (CPUT). **Ben's decision (2026-09-06): keep the wording
as-is, and review it as a HIGH priority within 2 months of go-live** (first live booking) —
by then either build the express-request capture or soften the paragraph. The site is
pre-launch as of 2026-09-06, so the two months run from go-live, not from now; if go-live
is around now that is roughly November 2026. Set an out-of-repo calendar reminder once the
go-live date is fixed (L-007 — a repo note alone is only read on session-open).

**Legal frame (consumer, England & Wales).** Consumer Rights Act 2015 (CRA);
Consumer Contracts (Information, Cancellation and Additional Charges) Regulations
2013 (CCRs); Consumer Protection from Unfair Trading Regulations 2008 (CPUT); ADR
for Consumer Disputes Regulations 2015. ICC is a sole trader selling to consumers
at a distance (bookings concluded online through the assistant), so the CCRs
distance-contract rules apply.

---

## /terms findings

### T-1 [HIGH] No statutory cancellation ("cooling-off") right — CCRs 2013

A booking placed through the assistant is a **distance contract**. The consumer
has a **14-day right to cancel** (CCRs reg 29-30), and the trader must give the
cancellation information **before the consumer is bound** (reg 10/13 and Sch 2).
Failure to disclose the right **extends the cancellation period by up to 12
months** (reg 31).

The current "Deposit and cancellation" section describes only ICC's **own**
cancellation charges (notice periods, deposit retention). It says nothing about
the statutory right. These are different things, and there is a live conflict:

- A booking made, say, 3 days before the appointment is inside the statutory
  14-day window. If the customer then cancels, the terms purport to retain the
  deposit, but the statutory right can override, and before any work is done there
  is nothing to charge for.
- Where the customer wants the clean performed inside the 14 days, the trader
  needs the customer's **express request to begin** within the period (reg 36).
  Only then can the trader charge for services actually supplied if the customer
  cancels part-way, and the right is lost once the service is **fully performed**
  with that prior express request and an acknowledgement that the right would be
  lost on completion (reg 36(1),(6)).

**Action.** Add a "Your right to cancel" clause covering: the 14-day right; how to
cancel (a plain statement is enough, a model form is optional); the express-
request-to-start mechanism for bookings inside 14 days; and how the deposit and
any part-performed work interact with it. This information must also reach the
customer in a **durable medium** (reg 16), i.e. the **confirmation email**, not
only the web page. See the cross-surface note below.

### T-2 [MEDIUM] Geographical address withheld ("available on request") — CCRs Sch 2

For distance contracts the trader must provide the **geographical address at which
the trader is established** before the consumer is bound (CCRs Sch 2). "Available
on request" likely does not satisfy this for the contract (it is more defensible
for the privacy notice, where email + phone are given).

This is in tension with **D-016** (no address on the public site). It is an
owner + solicitor decision, not a code fix. Options: a correspondence/accountant's
address, a virtual-office address, or accept the gap with eyes open. Flagging so
the decision is deliberate.

### T-3 [MEDIUM-LOW] Deposit retention as a possible unfair term — CRA 2015 Part 2

A term that retains the **full** deposit on late cancellation can be challenged as
unfair if it exceeds a genuine pre-estimate of loss (CRA s62; Sch 2 "grey list"
para 5, disproportionately high charges for non-performance). 10% is modest and
the "reasonable fee for the time set aside" framing for a missed appointment is
defensible. Low risk, but once T-1 is drafted, tie any retention to actual or
reasonably estimated loss rather than automatic forfeiture, so the two clauses are
consistent.

### T-4 [LOW] ADR signposting — ADR Regulations 2015

If a complaint is not resolved, the trader must tell the consumer about a
**certified ADR provider** and whether it intends to use it (reg 19). Carpet
cleaning is not a sector obliged to use ADR, so this is a one-line addition to the
Complaints section, optional and low priority.

### T-5 [LOW] Commercial interest — Late Payment of Commercial Debts (Interest) Act 1998

For B2B/commercial invoices, statutory interest is **8% + base rate** plus fixed
recovery costs. "In line with the Bank of England base rate" undersells that
entitlement. The consumer interest wording is fine; consider reserving the
statutory rate for commercial work.

### T-6 [INFO] Already correct (record so it is not lost)

Reasonable care and skill referenced (CRA s49); "does not affect your statutory
rights" present; England & Wales governing law + jurisdiction; VAT status stated;
price varied only with the customer's agreement; liability carve-outs for death,
personal injury, and fraud correct (CRA/UCTA); complaint timescales (3 working
days to acknowledge, 10 to resolve) are good practice.

---

## Privacy notice — residual points (see PRIVACY_REVIEW_2026-09.md)

The privacy notice is in strong shape and was pre-reviewed on 2026-09-04. Residuals:

- **P-1 [tracked]** The SMS Works is not yet listed as a processor, and there is
  no review-request purpose/lawful basis. Already flagged in `privacy.astro` and
  the prior review as required **before the D-025 review engine is switched on**.
  The engine is dormant, so this is correctly gated; confirm before enabling it.
- **P-2 [decision]** Postal address "on request": acceptable for the privacy
  notice (email + phone given); becomes firmer for the /terms contract, see T-2.
- **P-3 [check, evidence not page text]** International-transfer wording cites the
  UK IDTA/Addendum. Confirm the signed DPAs are on file for Anthropic, Resend,
  Netlify, and Google as the evidence behind that statement.
- **P-4 [ok]** The Article 22 automated-decision paragraph is present and
  reasonable: auto-confirming a booking the customer asked for is not an adverse
  solely-automated decision with legal or similarly significant effect, and human
  review is offered.

---

## Cross-surface note (single-source the fix)

The T-1 cancellation clause must appear on **/terms** and in the **confirmation
email** (durable medium). To stop it drifting across the two surfaces, add it to
`shared/config/policy.js` as a `cancellationRightSentence()` (or a short block),
alongside `reCleanSentence()` and `depositSentence()`, and render it from both.
That keeps the D-006 single-source discipline the rest of the policy now follows.

## Suggested worklist for the solicitor

1. Draft the statutory cancellation clause (T-1) and confirm the deposit
   interaction, for both the page and the email.
2. Decide the geographical-address position (T-2) against D-016.
3. Confirm the deposit-retention wording is proportionate (T-3).
4. Optional polish: ADR line (T-4), commercial interest rate (T-5).
5. Confirm processor DPAs are on file (P-3) and the SMS Works additions are ready
   to switch on with the review engine (P-1).
