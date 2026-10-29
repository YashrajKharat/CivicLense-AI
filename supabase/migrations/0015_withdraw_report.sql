-- CivicLense 0015 — a resident can withdraw their own report
--
-- Only before anyone has acted on it, and only if it is not grouped with other
-- people's reports. It is a withdrawal rather than a deletion: the row and its
-- history stay, so the audit trail is unbroken, and the report drops out of
-- every queue, count and map.
--
-- Deleting outright would be worse in two ways. An officer who had already
-- opened it would find a dangling reference. And a resident could quietly erase
-- a report after an officer disputed it — which is exactly the hole an audit
-- trail exists to close.

do $$ begin
  alter type complaint_status add value if not exists 'withdrawn';
exception when duplicate_object then null;
end $$;

commit;

create index if not exists complaints_active
  on complaints(status) where status <> 'withdrawn';
