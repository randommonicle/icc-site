# MTD & Accounting — plain-English brief

**Status:** Working note, 18 August 2026. **This is not tax advice.** The dates and thresholds below come from general web sources (ICAEW and similar), **not** the in-force legislation, and HMRC has moved these dates more than once. Mark's accountant must confirm them and confirm which apply to him. Verify on GOV.UK and legislation.gov.uk before relying on any figure here.

This note exists because MTD is the reason the old plan leaned on FreeAgent (D-024), and understanding it plainly is what let us set that aside (D-026).

---

## What MTD is, in one paragraph

"Making Tax Digital for Income Tax" (MTD for ITSA — Income Tax Self Assessment) is HMRC's plan to replace the once-a-year Self Assessment return with **digital record-keeping plus quarterly updates sent from compatible software**. If you are "in scope", you must keep your business income and expenses in software HMRC recognises, and submit updates every quarter instead of one return each January.

## What "which wave" means

MTD for ITSA is being switched on in stages — "waves" — by income level. Which wave you are in = which start date applies to you, and that is set by your income:

| From | In scope if your qualifying income is over… |
|------|------|
| 6 April 2026 | £50,000 |
| 6 April 2027 | £30,000 |
| 6 April 2028 | £20,000 |

**"Qualifying income" is the catch.** It is the individual's **combined gross income** (turnover *before* expenses) from **all** their sole-trader businesses plus any property income — not per business.

## Why this matters to ICC

Mark runs **Regency Cleaning and ICC as the same individual**. So his MTD wave is decided by **Regency + ICC (+ any property) combined**, not by ICC on its own. ICC being brand new does **not** automatically keep him out: if Regency already pushes his combined turnover over the relevant threshold, he is (or soon will be) in scope, and **ICC's records would then need to be in MTD-compatible software too**.

## What we decided (D-026), and what it means here

The ICC platform **does invoicing, not tax filing**. It creates, sends and tracks invoices (on Stripe) and holds the operational record. It does **not** file MTD updates and does not need to — MTD is Mark's duty across his whole income, handled **once** (by him or his accountant), not something ICC's invoicing must own. The platform will **export / feed** its invoice and payment data to whatever MTD tool he uses, kept deliberately swappable behind an adapter.

This is cheaper and simpler than the old plan (a second FreeAgent subscription just for ICC — see D-026): ICC needs no accounting subscription of its own for invoicing, just a free Stripe account.

## Urgent actions (for Mark / his accountant)

1. **Ask the accountant which MTD wave Mark is in**, based on his *combined* Regency + ICC (+ property) gross income. This one fact decides everything below.
2. **If he is in scope now (or from April 2026 / 2027):** pick the *one* MTD-compatible tool that covers his whole income (could be FreeAgent kept for Regency only, Xero, or a cheaper option) and confirm ICC's figures can flow into it — our export feeds this.
3. **If he is not yet in scope:** nothing urgent for ICC accounting; the platform's invoicing, records and export are enough for his current Self Assessment. Revisit before his wave starts.
4. Either way, **the ICC invoicing build (D-026) proceeds regardless** — it does not depend on the answer.
