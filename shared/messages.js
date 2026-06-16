// Message builders for the operational platform (D-020, Slice 4e).
//
// PURE: no DB, no network. Today the live escalation path still emails Mark
// (server/netlify/functions/chat.js -> sendEscalationEmail). This module turns an
// escalate_to_human tool call into the `messages` row that Slice 5 will INSERT
// with the service role, so wiring it live is a small step rather than a rewrite.
//
// CommonJS to match shared/config and load under the plain-Node `node --test`.

// Mirrors the escalate_to_human reason enum (chat.js ESCALATION_TOOL). Kept here
// too so the draft is self-contained; chat.js still has its own copy for the email
// until Slice 5 repoints it at this module (noted in D-020).
const HANDOFF_REASON_LABELS = {
  out_of_scope: "Outside the assistant's knowledge",
  damage_risk: "Possible damage risk - needs a human",
  no_citable_source: "No citable source for the answer",
  customer_request: "Customer asked for a person",
};

// D-020: a customer reply may be AI-drafted ONLY for the soft, no-property-risk
// reasons. damage_risk is NEVER draftable (the assistant escalated precisely
// because it must not answer), and customer_request means the customer asked for
// a person, so Mark replies himself. A null/unknown reason is not draftable —
// the safe default, so an old row with no structured reason never auto-drafts.
const DRAFTABLE_REASONS = new Set(["out_of_scope", "no_citable_source"]);
function isDraftableReason(reason) {
  return DRAFTABLE_REASONS.has(String(reason || ""));
}

// Pull a single sendable email out of the free-text contact the assistant
// captured (it may be an email, a phone number, or prose like "reply in the
// chat"). Returns the lower-cased address, or null when there is no clear one.
// The send path only emails when this is non-null; otherwise Mark handles the
// reply manually, so a false negative is safe (no wrong-address send).
function extractEmail(contact) {
  const m = String(contact || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0].toLowerCase() : null;
}

// Last few turns as a plain-text transcript, defensively handling string or
// block-array content (an image turn carries blocks, not a string).
function transcriptSnippet(messages, turns = 6) {
  const list = Array.isArray(messages) ? messages : [];
  return list
    .slice(-turns)
    .map((m) => {
      const who = m && m.role === "assistant" ? "Assistant" : "Customer";
      let text = "";
      if (m && typeof m.content === "string") text = m.content;
      else if (m && Array.isArray(m.content)) {
        text = m.content.filter((c) => c && c.type === "text").map((c) => c.text).join(" ");
      }
      return text ? `${who}: ${text}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

// Turn an escalate_to_human tool call into a draft `messages` row for Mark to
// review. `input` is the tool input ({ question, reason, customer_name,
// customer_contact }); `context` is { messages } (the conversation so far).
// customer_id stays null — a handoff is a lead with no customer row yet (D-020);
// the messages_customer_or_handoff constraint permits null only for this kind.
// Retention/erasure (review finding A5, D-023): these handoff-lead rows (customer_id
// null) hold contact, question and transcript PII. Erasure is built (the admin
// "erase" action hard-deletes a row; UK GDPR Art.17). TODO(D-008/retention): the
// timed purge (Art.5(1)(e), proposed 6 months, pending Mark/DP confirmation) is not
// wired yet; see D-023.
function escalationToMessageDraft(input, context) {
  const inp = input || {};
  const reasonLabel = HANDOFF_REASON_LABELS[inp.reason]
    || (inp.reason ? String(inp.reason) : "Not specified");
  const name = inp.customer_name ? String(inp.customer_name) : "not given";
  const contact = inp.customer_contact ? String(inp.customer_contact) : "not given";
  const question = inp.question ? String(inp.question) : "(none captured)";
  const transcript = transcriptSnippet(context && context.messages);

  const bodyParts = [
    `Reason: ${reasonLabel}`,
    `Customer name: ${name}`,
    `Contact: ${contact}`,
    "",
    `Question: ${question}`,
  ];
  if (transcript) bodyParts.push("", "Recent conversation:", transcript);

  return {
    kind: "human_handoff",
    status: "draft",
    channel: "email",
    ai_drafted: true,
    requires_consent: false,
    customer_id: null,
    subject: `Website handoff: ${reasonLabel}`,
    body: bodyParts.join("\n"),
    // Slice 5e-2 (D-020): structured so the admin can gate drafting on the real
    // reason and address a reply, without parsing the body prose. draft_reply
    // stays null until Mark has one drafted.
    handoff_reason: inp.reason ? String(inp.reason) : null,
    customer_contact: inp.customer_contact ? String(inp.customer_contact) : null,
    handoff_question: inp.question ? String(inp.question) : null,
  };
}

module.exports = { escalationToMessageDraft, transcriptSnippet, HANDOFF_REASON_LABELS, isDraftableReason, extractEmail };
