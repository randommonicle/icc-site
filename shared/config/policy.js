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

module.exports = { RECLEAN, DEPOSIT, reCleanSentence, depositSentence };
