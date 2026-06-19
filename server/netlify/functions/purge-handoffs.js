// Scheduled purge of expired handoff-lead rows — A5 / D-023 (UK GDPR
// Art.5(1)(e) storage limitation). Runs daily (the schedule lives in
// netlify.toml). Deletes messages rows with kind='human_handoff' older than the
// retention period in shared/config/retention.js — the period the public
// privacy notice promises ("no longer than 6 months" for unconverted enquiries).
//
// This is the automated half of D-023. The other half, erasure on request
// (Art.17), is the admin "Erase lead" action in handoffs.js; both reuse the same
// kind-guarded delete. Erasure on request also has a manual second part (Mark
// deleting the escalation email copy), unchanged by this — see D-023.
//
// Safety:
//   - Hard-guarded to kind='human_handoff' (mirrors handoffs.deleteHandoff), so
//     it can only ever remove handoff leads, never a booking_confirmation or any
//     other message, even if the predicate were widened by mistake.
//   - Bounded to created_at < cutoff, so it removes only ALREADY-expired data.
//     The operation is therefore idempotent and safe to trigger at any time: an
//     out-of-schedule call deletes exactly what the next scheduled run would and
//     nothing current, so the endpoint needs no auth gate (Netlify exposes it at
//     /.netlify/functions/purge-handoffs; there is no /api/* redirect to it).
//   - getSupabaseAdmin() null (env unset) -> no-op + log. Fail-safe: it simply
//     does not purge until configured (SUPABASE_* are already set in prod).
//   - Logs a COUNT only, never PII (the rows, incl. contact/question/transcript,
//     are being deleted; there is nothing to keep).
//
// CommonJS to match the functions and the plain-Node `node --test` runner.

const { getSupabaseAdmin } = require("./supabaseClient.js");
const {
  handoffLeadCutoffISO,
  HANDOFF_LEAD_RETENTION_MONTHS,
} = require("../../../shared/config/retention.js");

// Delete handoff leads older than the cutoff. `supabase` and `now` are injected
// so the unit test drives it with a fake client and a fixed clock (no network).
// kind-guarded + created_at strictly before the cutoff. Returns the row count.
async function purgeHandoffLeads(supabase, now) {
  const cutoff = handoffLeadCutoffISO(now);
  const { data, error } = await supabase
    .from("messages")
    .delete()
    .eq("kind", "human_handoff")
    .lt("created_at", cutoff)
    .select("id");
  if (error) throw new Error(error.message);
  return { deleted: Array.isArray(data) ? data.length : 0, cutoff };
}

exports.handler = async function () {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.log("purge-handoffs: Supabase not configured, skipping");
    return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: true }) };
  }
  try {
    const { deleted, cutoff } = await purgeHandoffLeads(supabase, new Date());
    console.log(
      `purge-handoffs: deleted ${deleted} handoff lead(s) older than ${HANDOFF_LEAD_RETENTION_MONTHS} months (created before ${cutoff})`
    );
    return { statusCode: 200, body: JSON.stringify({ ok: true, deleted }) };
  } catch (e) {
    console.log("purge-handoffs error:", e.message);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: "purge failed" }) };
  }
};

// Exported for unit tests (test/retention.test.js).
exports.purgeHandoffLeads = purgeHandoffLeads;
