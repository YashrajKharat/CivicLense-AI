-- CivicLense — agentic operations layer.
--
-- Every run, every step and every proposed change is persisted. An agent that
-- cannot be reconstructed after the fact has no place in a system whose whole
-- claim is an unbroken audit trail.

create type agent_status as enum ('running','done','failed','timeout','exhausted');
create type proposal_status as enum ('pending','approved','rejected','expired');

create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references profiles(id),
  department_id int references departments(id),   -- null = global scope
  task text not null,
  status agent_status not null default 'running',
  answer jsonb,
  error text,
  steps_used int default 0,
  duration_ms int,
  created_at timestamptz default now(),
  finished_at timestamptz
);
create index agent_runs_recent on agent_runs (created_at desc);

create table agent_steps (
  id bigserial primary key,
  run_id uuid references agent_runs(id) on delete cascade,
  step_no int not null,
  kind text not null,                              -- call | proposal | answer | error
  tool text,
  thought text,
  args jsonb,
  result jsonb,
  error text,
  at timestamptz default now()
);
create index agent_steps_run on agent_steps (run_id, step_no);

create table agent_proposals (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references agent_runs(id) on delete cascade,
  proposed_by uuid references profiles(id),        -- the human who asked, not the agent
  tool text not null,
  args jsonb not null,
  preview jsonb not null,
  status proposal_status not null default 'pending',
  decided_by uuid references profiles(id),
  decided_at timestamptz,
  decision_note text,
  outcome jsonb,
  created_at timestamptz default now()
);
create index agent_proposals_pending on agent_proposals (status, created_at desc)
  where status = 'pending';

-- A proposal is a suggestion with a shelf life. One left sitting for a day was
-- reasoned about against data that has since moved, so it stops being actionable
-- rather than silently ageing into a bad decision.
create or replace function expire_agent_proposals() returns void
language sql as $$
  update agent_proposals
  set status = 'expired'
  where status = 'pending' and created_at < now() - interval '24 hours';
$$;

-- ============ access ============
alter table agent_runs enable row level security;
alter table agent_steps enable row level security;
alter table agent_proposals enable row level security;

create policy "admins read runs in scope" on agent_runs for select
  using (exists (
    select 1 from profiles p
    left join officers o on o.id = p.id
    where p.id = auth.uid()
      and p.role in ('dept_admin','global_admin')
      and (p.role = 'global_admin' or o.department_id = agent_runs.department_id)
  ));

create policy "admins read steps in scope" on agent_steps for select
  using (exists (select 1 from agent_runs r where r.id = agent_steps.run_id));

create policy "admins read proposals in scope" on agent_proposals for select
  using (exists (select 1 from agent_runs r where r.id = agent_proposals.run_id));

-- No update or delete policy exists for agent_steps. The trace is append-only
-- for the same reason audit_logs is: a record you can edit is not a record.
