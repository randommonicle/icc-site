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
  };
}

module.exports = { escalationToMessageDraft, transcriptSnippet, HANDOFF_REASON_LABELS };
