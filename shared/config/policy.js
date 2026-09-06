// Single source of truth for the customer re-clean guarantee and the deposit and
// cancellation policy (D-031). Consumed by the assistant prompt and the booking
// confirmation email (server/netlify/functions/chat.js) and the /terms page
// (site/src/pages/terms.astro), so the policy cannot drift across surfaces again
// (the D-006 single-source rule; see the 2026-09-05 policy-drift entry in
// LESSONS_LEARNED). CommonJS so node --test and the Netlify functions can require
// it and Astro can import the default.

// deposit_rate (the fraction used to compute the actual deposit amount) is the
// single numeric source; the percentage shown to customers is derived from it so
// the words and the charged figure cannot drift (D-006 single-source). Rounded to
// 2dp so any floating-point noise from rate * 100 (e.g. 0.07 * 100) never reaches
// the customer-facing sentence.
const { deposit_rate } = require("./pricing.js");

const RECLEAN = { windowHours: 72, photoRequired: true, visits: 1 };
const DEPOSIT = { percent: Math.round(deposit_rate * 10000) / 100, fullRefundNoticeDays: 7 };

// Canonical customer-facing sentences, defined once and reused verbatim by the
// assistant prompt, the confirmation email, and the /terms page.
function reCleanSentence() {
  return `If you are not happy with your clean, let us know within ${RECLEAN.windowHours} hours of the end of your appointment through our assistant, with a photo of the problem, and we will arrange a single return visit at no charge. This does not cover pre-existing permanent staining that was present before the clean.`;
}

function depositSentence() {
  return `A ${DEPOSIT.percent}% deposit is taken at booking to secure the slot and is applied to your final bill. You receive a full refund if we cancel, or if you cancel with ${DEPOSIT.fullRefundNoticeDays} or more days' notice. If you cancel with less than ${DEPOSIT.fullRefundNoticeDays} days' notice the deposit is retained, and a missed appointment may be charged a reasonable fee for the time set aside.`;
}

// Statutory right to cancel a distance contract (Consumer Contracts Regulations 2013,
// reg 29-30 and reg 36). Bookings are concluded online through the assistant, so the
// distance-selling rules apply. Rendered on /terms and in the confirmation email (the
// reg 16 durable medium), single-sourced here so the two cannot drift (D-006). This is
// owner-approved wording, with no separate solicitor review (Ben, 2026-09-06); see the
// GATE 0 worklist in docs/LEGAL_REVIEW_TERMS_2026-09.md (T-1). The statutoryDays value
// is the single numeric source, so the window and any derived words move together.
const CANCELLATION = { statutoryDays: 14 };

// Paragraphs, so /terms renders one <p> each and the email joins them into one block.
// TODO(T-1/express-request-capture): the fourth paragraph promises a proportionate
// charge for part-performed work if the customer asks us to start inside the 14 days,
// but reg 36 only allows that where the booking flow captured the customer's express
// request to begin + an acknowledgement the right is lost on completion. The flow does
// not capture that yet; wire it into the confirm_booking path before relying on it.
// HIGH PRIORITY REVIEW within 2 months of go-live (Ben, 2026-09-06; cross-agent flag
// GEMPRO): keep the wording as-is until then, then either build the capture above or
// soften this paragraph. See docs/LEGAL_REVIEW_TERMS_2026-09.md T-1.
function cancellationRightParagraphs() {
  const d = CANCELLATION.statutoryDays;
  return [
    `Because you book through our online assistant, this is a distance contract and you have the right to cancel within ${d} days without giving a reason. The ${d} days start the day after your booking is confirmed.`,
    `To cancel, tell us in a clear statement: through the assistant, or by phone or email using the contact details we give you. You can use the model cancellation form if you prefer, but you do not have to.`,
    `If we have not yet started your clean, we refund everything you have paid, including your deposit, within ${d} days of you telling us you want to cancel.`,
    `If you would like your appointment to go ahead within the ${d}-day period, you can ask us to start within it. If you then cancel before the clean is finished, you pay a reasonable amount for the work already done; once the clean has been completed at your request, this right to cancel no longer applies.`,
    `Where this statutory right applies, it takes precedence over the deposit and cancellation charges described above.`,
  ];
}

module.exports = { RECLEAN, DEPOSIT, CANCELLATION, reCleanSentence, depositSentence, cancellationRightParagraphs };
