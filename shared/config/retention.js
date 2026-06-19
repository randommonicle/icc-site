// Retention periods (UK GDPR Art.5(1)(e) storage limitation) — D-008 / D-023.
//
// Single source for how long we keep records, so the period the public privacy
// notice promises and the period the purge enforces never drift (the D-006
// single-source rule). Today this covers only the handoff-lead purge (the
// unconverted-enquiry retention the privacy notice discloses). Booking and
// financial retention (~6 years, HMRC/accounting) is NOT automated here: those
// records live in jobs/customers and are kept deliberately, not purged.
//
// CommonJS to match shared/config and load under the plain-Node `node --test`.

// Maximum age of an unconverted handoff lead (a messages row with
// kind='human_handoff', customer_id null) before it is purged. The public
// privacy notice commits to "no longer than 6 months" for enquiries that do not
// convert (D-023), so this is a PUBLICLY STATED figure: it is safe to shorten
// (more privacy-protective), but do not lengthen it past what the notice says
// without updating the notice in the same change. Pending the data-protection
// review (D-023) — a one-line change here if the agreed period moves.
const HANDOFF_LEAD_RETENTION_MONTHS = 6;

// The cutoff timestamp: a handoff lead with created_at strictly before this is
// expired and may be purged. Calendar-month subtraction (the natural reading of
// "6 months"; setUTCMonth handles the year/negative-month rollover). Computed in
// UTC, never local time: the function runs in UTC on Netlify, and local-time
// month maths would shift the result by an hour across a DST boundary, e.g.
// BST June -> GMT December (the L-005 "compute dates in UTC" rule). `now` is
// injectable so the purge and its test are deterministic.
function handoffLeadCutoffISO(now) {
  const base = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  base.setUTCMonth(base.getUTCMonth() - HANDOFF_LEAD_RETENTION_MONTHS);
  return base.toISOString();
}

module.exports = { HANDOFF_LEAD_RETENTION_MONTHS, handoffLeadCutoffISO };
