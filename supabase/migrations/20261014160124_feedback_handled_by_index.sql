-- feedback.handled_by references auth.users ON DELETE SET NULL, so every
-- account deletion looks up feedback rows by handled_by. Index it like
-- feedback_user_id_idx indexes the cascade on user_id.
create index feedback_handled_by_idx on public.feedback (handled_by);
