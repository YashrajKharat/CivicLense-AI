-- CivicLense 0008 — categories become editable
--
-- The taxonomy was seeded once and never touched again, which is wrong: a
-- corporation adds a category when a new kind of problem starts arriving, and
-- that should not need a developer or a deploy.

alter table categories
  add column if not exists active boolean not null default true,
  add column if not exists description text,
  add column if not exists created_by uuid references profiles(id),
  add column if not exists updated_at timestamptz default now();

-- A category in use cannot be deleted without orphaning complaints, so it is
-- deactivated instead: existing reports keep their history, and residents stop
-- being offered it.
create index if not exists categories_active on categories(active) where active;

-- Codes are referenced by the seed and by jurisdictions, so they must stay unique.
do $$ begin
  alter table categories add constraint categories_code_unique unique (code);
exception when duplicate_table or duplicate_object then null;
end $$;

create or replace function touch_category() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists categories_touch on categories;
create trigger categories_touch before update on categories
  for each row execute function touch_category();

-- How many complaints depend on each category. The admin screen shows this so
-- nobody deactivates something carrying half the ward's backlog by accident.
create or replace view category_usage as
select c.id,
       count(cp.id)::int                                                   as total,
       count(cp.id) filter (where cp.status not in ('resolved','rejected'))::int as open,
       max(cp.created_at)                                                  as last_used
from categories c
left join complaints cp on cp.category_id = c.id
group by c.id;

-- Category changes are administrative acts and belong in the audit trail.
create or replace function log_category_change() returns trigger
language plpgsql as $$
begin
  insert into audit_logs (actor, action, entity, entity_id, before, after)
  values (
    coalesce(new.created_by, old.created_by),
    case when tg_op = 'INSERT' then 'category.created' else 'category.updated' end,
    'categories',
    coalesce(new.code, old.code),
    case when tg_op = 'UPDATE' then to_jsonb(old) end,
    to_jsonb(new)
  );
  return new;
end $$;

drop trigger if exists categories_audit on categories;
create trigger categories_audit after insert or update on categories
  for each row execute function log_category_change();
