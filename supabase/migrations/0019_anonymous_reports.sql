-- CivicLense 0019 — reporting without your name on it
--
-- Some reports are uncomfortable to put your name to. An unlicensed stall
-- belonging to a neighbour, a contractor cutting corners, rubbish dumped by
-- somebody on your own street. A resident who would report those under a
-- pseudonym and not under their name is a resident whose report the city
-- otherwise never receives.
--
-- Anonymous here means the name is withheld from public view, not that the
-- record is untraceable. The complaint is still linked to the account, so:
--
--   · the reporter can still track it and confirm the fix
--   · they still earn the points and badges
--   · an officer can still ask a question through the app
--   · someone filing malicious reports can still be found
--
-- An untraceable report would be a free hand to anyone with a grudge, and a
-- report nobody can follow up is worth less to everyone including the person
-- who filed it.

alter table complaints
  add column if not exists anonymous boolean not null default false;

-- The public view already withheld the reporter's name from everyone. This is
-- about the people who can see it: an officer and an administrator see who
-- filed a report, and for an anonymous one they should not.
create or replace view complaint_reporter as
select
  c.id,
  c.ref,
  c.anonymous,
  case when c.anonymous then null else p.full_name end   as reporter_name,
  case when c.anonymous then null else p.phone end       as reporter_phone,
  case when c.anonymous then null else p.email end       as reporter_email,
  -- Always available, so a notification still reaches them and the audit trail
  -- is unbroken. Withheld from display, not from the system.
  c.citizen_id
from complaints c
left join profiles p on p.id = c.citizen_id;

comment on column complaints.anonymous is
  'Withholds the reporter''s name from officers, administrators and the public. '
  'The complaint remains linked to the account for tracking, rewards and accountability.';
