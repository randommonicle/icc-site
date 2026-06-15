-- Slice 5e-2 (D-020) — handoff reply: structured columns so Mark can review a
-- handoff, (optionally) have a reply drafted, edit it, and send it to the
-- customer from the admin dashboard.
--
-- Additive + nullable, so the live Slice 5a escalation INSERT keeps working
-- unchanged — it simply populates the new handoff_reason / customer_contact
-- columns now. Existing handoff rows have NULLs here, which the admin treats as
-- "manual only" (no auto-draft) — the safe default.
--
-- handoff_reason    the escalate_to_human reason enum value (out_of_scope /
--                   damage_risk / no_citable_source / customer_request). Stored
--                   structurally so the damage_risk "never auto-draft" gate
--                   (D-020) reads a real value, never a label parsed out of body.
-- customer_contact  the raw contact the assistant captured (may be an email, a
--                   phone, or absent). The send path only emails when a valid
--                   address can be extracted from it; otherwise Mark replies
--                   manually.
-- handoff_question  the customer's question, as the assistant captured it.
--                   Stored on its own so the draft generator can be sent ONLY
--                   the question (input minimisation, UK GDPR Art.5(1)(c)),
--                   never the PII-bearing body / transcript / name / contact.
-- draft_reply       the AI-suggested / Mark-edited customer reply. NULL until a
--                   reply is drafted; it is what gets emailed on send and the
--                   record of what was sent. body keeps the handoff detail.
alter table messages add column if not exists handoff_reason   text;
alter table messages add column if not exists customer_contact text;
alter table messages add column if not exists handoff_question text;
alter table messages add column if not exists draft_reply      text;
