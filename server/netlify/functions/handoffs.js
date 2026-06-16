// Slice 5e / 5e-2 (D-020) — the admin handoff queue and its draft -> send
// lifecycle. GET lists the human_handoff rows (5e, read-only). POST drives the
// lifecycle (5e-2): draft an AI-suggested reply, send Mark's edited reply to the
// customer, or mark a handoff handled. Same constant-time Bearer gate as
// bookings.js (safeEqual, imported, not duplicated).
//
// AI-surface discipline (the draft action):
//   - Input minimisation: the model receives ONLY the captured question, never
//     the customer name / contact / transcript that live in body (UK GDPR
//     Art.5(1)(c)).
//   - Output discipline: grounded in the vetted KB + the L-009 claim rules
//     (guardrailsBlock); the model may decline; the draft is labelled AI-drafted
//     and Mark edits it.
//   - Human gate: drafting and sending are separate. The model never sends; Mark
//     reviews, edits and triggers the send. damage_risk / customer_request are
//     NEVER auto-drafted (D-020 / isDraftableReason).
//   - Fail-closed send: a row is only marked 'sent' after Resend accepts it (an
//     unsent "sent" is the L-008/L-004 failure), and never without a real email.

const { requireAdmin } = require("./adminAuth.js");
const { getSupabaseAdmin } = require("./supabaseClient.js");
const { isDraftableReason, extractEmail } = require("../../../shared/messages.js");
const models = require("../../../shared/config/models.js");
const knowledge = require("../../../shared/config/knowledge.js");

const HANDOFF_COLS =
  "id,created_at,subject,body,status,channel,handoff_reason,customer_contact,handoff_question,draft_reply,approved_at,sent_at";

// Cap on a manually-typed/edited reply (defence-in-depth; Resend would reject an
// oversized body, but bound it before we store or send it).
const MAX_REPLY_CHARS = 50000;

// Pull the handoff queue from Supabase, newest first, as a plain shape the admin
// renders as inert text. supabase === null (env not set) -> not configured, so the
// dashboard degrades cleanly instead of erroring.
async function fetchHandoffs(supabase, limit = 100) {
  if (!supabase) return { handoffs: [], total: 0, configured: false };
  const { data, error } = await supabase
    .from("messages")
    .select(HANDOFF_COLS)
    .eq("kind", "human_handoff")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const handoffs = data || [];
  return { handoffs, total: handoffs.length, configured: true };
}

// Load a single handoff by id. The kind filter is a hard guard: this endpoint can
// only ever read/mutate human_handoff rows, never a booking_confirmation or other
// customer comm, even if handed that row's id.
async function loadHandoffRow(supabase, id) {
  const { data, error } = await supabase
    .from("messages")
    .select(HANDOFF_COLS + ",kind")
    .eq("id", id)
    .eq("kind", "human_handoff")
    .limit(1);
  if (error) throw new Error(error.message);
  return (data && data[0]) || null;
}

// Update a handoff row, hard-guarded to kind='human_handoff'. Returns the number
// of rows changed so the caller can detect a lost race. opts.onlyIfNotSent adds a
// status<>'sent' guard so a row already sent by a concurrent request is not
// re-recorded. (The residual window where two simultaneous operators both pass the
// pre-send check and both email is accepted for the single-operator admin; the
// full fix is a 'sending' claim state, which needs a new message_status value.)
async function updateHandoff(supabase, id, fields, opts = {}) {
  let q = supabase
    .from("messages")
    .update(fields)
    .eq("id", id)
    .eq("kind", "human_handoff");
  if (opts.onlyIfNotSent) q = q.neq("status", "sent");
  const { data, error } = await q.select("id");
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data.length : 0;
}

// The draft generator's system prompt. Static (no per-request data), so it is
// hoisted and exported for the test. The voice rules mirror the live chat
// assistant (chat.js): standard British English and no dashes as sentence
// breaks, so a drafted reply reads in ICC's voice, not an automated one.
function draftSystemPrompt() {
  return `You are drafting a reply on behalf of Intelligent Carpet Cleaning, a premium carpet and upholstery cleaning company in Cheltenham, for the owner Mark to review and edit before he sends it.

${knowledge.guardrailsBlock()}

REFERENCE FACTS (this is the reference referred to above):
${knowledge.knowledgeBlock()}

DRAFTING RULES:
- Write a concise, warm, professional reply answering the customer's question, grounded only in the reference facts and the claim rules above. A few short paragraphs at most.
- Use clear, standard British English. Never use a dash of any kind as a mid-sentence break or to introduce a clause (no em dash, no en dash, no " - " with spaces); use a comma, full stop, or brackets instead. Dashes make the message feel automated.
- This is a DRAFT for Mark to check and edit, not a sent message. There is no tool to call and no other document; the reference is the facts above.
- Do not address the customer by name, and do not invent any price, date, availability, or commitment.
- If the reference does not let you answer confidently and safely, do NOT guess. Briefly say Mark will follow up personally and suggest he calls. An honest "we'll come back to you" beats a wrong answer.
- Never give advice that could risk damaging a carpet or fabric.
- Output only the reply text itself: no preamble, no subject line, no sign-off name, no quotation marks around it.`;
}

// Draft a customer reply from ONLY the question, grounded in the vetted KB and
// bound by the L-009 claim rules. Throws on any API failure so the caller fails
// closed (no draft rather than a bad one).
async function draftReplyForHandoff(question, anthropicKey) {
  const system = draftSystemPrompt();

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: models.text,
      max_tokens: 800,
      system,
      // The question is untrusted data, delimited and never in an instruction
      // position; the claim rules above explicitly override a customer's message.
      messages: [
        { role: "user", content: `The customer asked:\n\n"""\n${String(question || "")}\n"""\n\nDraft Mark's reply.` },
      ],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Anthropic ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = (data.content || [])
    .filter((b) => b && b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  if (!text) throw new Error("empty draft");
  return text;
}

function escHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ICC sign-off appended to every customer reply so the recipient can see who sent
// it and how to reach us (review finding A4). Service-area only, no street address
// (D-016). The phone/email mirror chat.js + the PDF job card; a shared
// contact-config could dedupe them later.
const ICC_SIGN_OFF_LINES = ["Intelligent Carpet Cleaning", "Cheltenham, Gloucestershire", "01242 279590", "hello@intelligentclean.co.uk"];

// Public site origin used to build the privacy-notice link in the email. Env
// overridable so the link tracks the domain at cutover with no code change; it
// defaults to the production domain. For a pre-domain smoke, set PUBLIC_SITE_URL
// to the live .netlify.app URL so the link resolves.
const PUBLIC_SITE_URL = process.env.PUBLIC_SITE_URL || "https://www.intelligentclean.co.uk";

function privacyNoticeUrl(siteUrl) {
  const base = String(siteUrl || PUBLIC_SITE_URL).replace(/\/+$/, "");
  return `${base}/privacy`;
}

// Build the customer reply email body. Pure (the privacy URL is injectable) and
// exported for the test. The reply is escaped for the HTML part (L-003); the
// sign-off plus the privacy-notice link identify the controller and where to find
// its data handling (review finding A4; UK GDPR Arts.13/14).
// TODO(prelaunch/email-identity): the code-side identity is in place. Before live
// traffic, set CUSTOMER_FROM (verified domain) and PUBLIC_SITE_URL in Netlify, and
// Mark must complete the privacy-notice controller details (ICO reg, retention).
function buildHandoffEmail(replyText, opts = {}) {
  const privacyUrl = privacyNoticeUrl(opts.siteUrl);
  const body = escHtml(replyText).replace(/\n/g, "<br>");
  const sigHtml = ICC_SIGN_OFF_LINES
    .map((l, i) => (i === 0 ? `<strong>${escHtml(l)}</strong>` : escHtml(l)))
    .join("<br>");
  // privacyUrl is a trusted env/constant, never customer input; escaped anyway.
  const privacyHtml =
    `<div style="margin-top:10px;font-size:12px;color:#888;">` +
    `How we handle your data: <a href="${escHtml(privacyUrl)}" style="color:#888;">our privacy notice</a>.` +
    `</div>`;
  const html =
    `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;font-size:14px;color:#1a1a2e;line-height:1.6;">${body}` +
    `<div style="margin-top:16px;padding-top:12px;border-top:1px solid #e0e0e0;font-size:13px;color:#555;">${sigHtml}</div>` +
    privacyHtml +
    `</div>`;
  const text = `${replyText}\n\n${ICC_SIGN_OFF_LINES.join("\n")}\n\nHow we handle your data: ${privacyUrl}`;
  return { html, text };
}

// Email Mark's approved reply to the customer from the ICC customer address.
// Throws unless Resend accepts the message (fail-closed; "accepted" is still not
// "delivered", L-004, but a non-2xx is a hard failure we must not mark sent on).
async function sendHandoffReply(toEmail, replyText, resendKey) {
  const customerFrom = process.env.CUSTOMER_FROM || "Intelligent Carpet Cleaning <onboarding@resend.dev>";
  // A real, monitored Reply-To so a customer's reply reaches ICC even when the
  // From is a send-only or sandbox address (review finding A4).
  const replyTo = process.env.CUSTOMER_REPLY_TO || "hello@intelligentclean.co.uk";
  const { html, text } = buildHandoffEmail(replyText);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${resendKey}` },
    body: JSON.stringify({
      from: customerFrom,
      reply_to: replyTo,
      to: toEmail,
      subject: "Re: your enquiry to Intelligent Carpet Cleaning",
      html,
      text,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${detail.slice(0, 200)}`);
  }
  return res.json().catch(() => ({}));
}

function json(statusCode, headers, obj) {
  return { statusCode, headers, body: JSON.stringify(obj) };
}

// POST dispatcher: draft / send / handle. draftFn and sendFn are injectable so
// the unit tests exercise the routing and the safety gates without any network.
async function handlePost(event, headers, deps) {
  const { supabase, anthropicKey, resendKey } = deps;
  const draftFn = deps.draftFn || draftReplyForHandoff;
  const sendFn = deps.sendFn || sendHandoffReply;

  if (!supabase) return json(503, headers, { error: "Supabase not configured" });

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, headers, { error: "Invalid JSON" }); }
  const action = body.action;
  const id = body.id;
  if (!id || typeof id !== "string") return json(400, headers, { error: "Missing handoff id" });

  const row = await loadHandoffRow(supabase, id);
  if (!row) return json(404, headers, { error: "Handoff not found" });
  if (row.status === "sent") return json(409, headers, { error: "This handoff has already been sent" });

  if (action === "draft") {
    // Hard safety gate: damage_risk / customer_request / unknown reason are never
    // auto-drafted. Checked BEFORE any model call (no spend, no leak).
    if (!isDraftableReason(row.handoff_reason)) {
      return json(400, headers, { error: "This handoff is not eligible for an AI draft. Reply manually." });
    }
    if (!row.handoff_question) return json(400, headers, { error: "No question was captured to draft from." });
    if (!anthropicKey) return json(502, headers, { error: "AI drafting is unavailable." });
    let draft;
    try {
      draft = await draftFn(row.handoff_question, anthropicKey);
    } catch (e) {
      console.log("Handoff draft failed for", id, "-", e.message); // id + timestamp, no PII
      return json(502, headers, { error: "Could not generate a draft." });
    }
    await updateHandoff(supabase, id, { draft_reply: draft });
    console.log("Handoff draft generated for", id);
    return json(200, headers, { draft });
  }

  if (action === "send") {
    const reply = typeof body.reply === "string" ? body.reply.trim() : "";
    if (!reply) return json(400, headers, { error: "Reply text is required." });
    if (reply.length > MAX_REPLY_CHARS) return json(400, headers, { error: "Reply is too long." });
    const toEmail = extractEmail(row.customer_contact);
    if (!toEmail) return json(400, headers, { error: "No sendable email address for this customer. Reply manually." });
    if (!resendKey) return json(502, headers, { error: "Email sending is unavailable." });
    try {
      await sendFn(toEmail, reply, resendKey);
    } catch (e) {
      console.log("Handoff send failed for", id, "-", e.message);
      return json(502, headers, { error: "Could not send the email." });
    }
    // Only now, after Resend accepted it, record it as sent (fail-closed). The
    // onlyIfNotSent guard makes the mark conditional, so a concurrent send is
    // detected (0 rows changed) rather than silently double-recorded.
    const marked = await updateHandoff(
      supabase, id,
      { status: "sent", sent_at: new Date().toISOString(), draft_reply: reply },
      { onlyIfNotSent: true }
    );
    if (!marked) {
      console.log("Handoff send: already marked sent by a concurrent request -", id);
      return json(409, headers, { error: "This handoff has already been sent." });
    }
    console.log("Handoff reply sent for", id);
    return json(200, headers, { ok: true, status: "sent" });
  }

  if (action === "handle") {
    // Mark dealt with it himself (the only path for damage_risk / no-email rows).
    await updateHandoff(supabase, id, { status: "approved", approved_at: new Date().toISOString() });
    return json(200, headers, { ok: true, status: "approved" });
  }

  return json(400, headers, { error: "Unknown action" });
}

exports.handler = async function (event) {
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  // Slice 5d: per-user Supabase Auth (replaces the shared ADMIN_SECRET Bearer).
  const auth = await requireAdmin(event);
  if (!auth.ok) {
    return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };
  }

  const supabase = getSupabaseAdmin();

  if (event.httpMethod === "GET") {
    try {
      return json(200, headers, await fetchHandoffs(supabase));
    } catch (e) {
      console.log("Handoff GET error:", e.message);
      return json(500, headers, { handoffs: [], total: 0, error: "Could not load handoffs." });
    }
  }

  if (event.httpMethod === "POST") {
    try {
      return await handlePost(event, headers, {
        supabase,
        anthropicKey: process.env.ANTHROPIC_API_KEY,
        resendKey: process.env.RESEND_API_KEY,
      });
    } catch (e) {
      console.log("Handoff POST error:", e.message);
      return json(500, headers, { error: "Something went wrong handling this handoff." });
    }
  }

  return { statusCode: 405, headers, body: "Method Not Allowed" };
};

// Exported for unit tests (test/handoffs.test.js).
exports.fetchHandoffs = fetchHandoffs;
exports.handlePost = handlePost;
exports.loadHandoffRow = loadHandoffRow;
exports.updateHandoff = updateHandoff;
exports.draftSystemPrompt = draftSystemPrompt;
exports.buildHandoffEmail = buildHandoffEmail;
exports.sendHandoffReply = sendHandoffReply;
