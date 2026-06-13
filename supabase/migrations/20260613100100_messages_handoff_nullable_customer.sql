-- Slice 4e (D-020) — a human_handoff is a lead with no customer row yet, so the
-- message may have no customer. Allow a null customer_id, but ONLY for that kind:
-- every outbound customer comm (booking_confirmation / review_request /
-- invoice_chase / reengagement) still requires a customer. The lead's name,
-- contact and question are captured in the message subject/body for now.
--
-- The check compares kind::text (not the enum literal), so creating it never
-- requires the freshly-added 'human_handoff' value to be committed in this
-- transaction, whatever order/batching the migration runner uses.
alter table messages alter column customer_id drop not null;
alter table messages add constraint messages_customer_or_handoff
  check (customer_id is not null or kind::text = 'human_handoff');
