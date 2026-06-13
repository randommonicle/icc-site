-- Slice 4e (D-020) — add the human_handoff message kind.
--
-- Escalations (the escalate_to_human tool, Slice 4b) become rows in `messages` so
-- they share the draft -> approved -> sent lifecycle Mark reviews, instead of
-- living only in his inbox. Kept in its OWN migration to isolate the
-- ALTER TYPE ... ADD VALUE (Postgres will not let a newly-added enum value be
-- USED as an enum literal in the same transaction it is added). The follow-on
-- migration's constraint sidesteps that anyway by comparing kind::text.
alter type message_kind add value if not exists 'human_handoff';
