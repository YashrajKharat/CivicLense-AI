-- CivicLense 0011 — the rework loop, richer profiles, and follow-up answers
--
-- Three gaps this closes.
--
-- 1. A resident could reject a fix, but nothing happened afterwards. The
--    complaint reopened and sat there: the officer was never told why, could
--    not upload fresh evidence, and no administrator saw that a rejected proof
--    had been submitted. A rejection has to start a visible cycle, not just
--    flip a status.
--
-- 2. Profiles held a name and nothing else, so nobody could be contacted and
--    residents had no way to identify themselves in person at a ward office.
--
-- 3. A photograph alone often cannot answer what an officer needs to know —
--    how long has it been there, is it blocking the road. Those answers should
--    come from the resident at the time of reporting, in their own language.

-- ============================================================
-- 1. Rework cycles
-- ============================================================
alter table resolution_proofs
  add column if not exists attempt int not null default 1,
  add column if not exists rejected boolean not null default false,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejection_reason text,
  add column if not exists superseded_by bigint references resolution_proofs(id);

-- A complaint can now be worked more than once, and every attempt is kept.
-- Deleting the rejected one would hide exactly the history that matters.
drop index if exists resolution_proofs_complaint_id_key;
create index if not exists resolution_proofs_complaint
  on resolution_proofs(complaint_id, attempt desc);

alter table complaints
  add column if not exists rework_count int not null default 0,
  add column if not exists last_rejection_reason text,
  add column if not exists last_rejected_at timestamptz;

-- Officers whose work keeps coming back are a management signal, not a
-- punishment — the cause is often an impossible job, not a careless one.
create or replace view officer_rework as
select o.id as officer_id,
       p.full_name,
       o.department_id,
       count(*) filter (where c.rework_count > 0)::int          as jobs_returned,
       coalesce(sum(c.rework_count), 0)::int                    as total_rejections,
       count(*) filter (where c.status = 'resolved')::int       as resolved,
       round(100.0 * count(*) filter (where c.rework_count > 0)
             / nullif(count(*), 0), 1)                          as return_rate
from officers o
join profiles p on p.id = o.id
left join complaints c on c.assigned_officer = o.id
group by o.id, p.full_name, o.department_id;

-- ============================================================
-- 2. Profiles
-- ============================================================
alter table profiles
  add column if not exists avatar_path text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists area text,
  add column if not exists pincode text,
  add column if not exists citizen_ref text;

-- A short human-quotable identifier. Someone at a ward counter needs something
-- they can read aloud; a UUID is not that.
create sequence if not exists citizen_ref_seq start 1000;

create or replace function assign_citizen_ref() returns trigger
language plpgsql as $$
begin
  if new.citizen_ref is null then
    new.citizen_ref := 'CIT-' || lpad(nextval('citizen_ref_seq')::text, 6, '0');
  end if;
  return new;
end $$;

drop trigger if exists profiles_citizen_ref on profiles;
create trigger profiles_citizen_ref before insert on profiles
  for each row execute function assign_citizen_ref();

update profiles
set citizen_ref = 'CIT-' || lpad(nextval('citizen_ref_seq')::text, 6, '0')
where citizen_ref is null;

do $$ begin
  alter table profiles add constraint profiles_citizen_ref_unique unique (citizen_ref);
exception when duplicate_table or duplicate_object then null;
end $$;

-- ============================================================
-- 3. Follow-up answers
-- ============================================================
-- Questions live in the database rather than in code, so a department can add
-- one for its own category without a deploy. Prompts are stored per language
-- because a resident answering in Marathi should read Marathi.
create table if not exists followup_questions (
  id serial primary key,
  category_id int references categories(id) on delete cascade,
  position int not null default 0,
  prompt jsonb not null,        -- { en, hi, mr }
  options jsonb not null,       -- [{ value, label: { en, hi, mr }, severity_delta }]
  active boolean not null default true
);
create index if not exists followup_by_category on followup_questions(category_id, position);

create table if not exists complaint_followups (
  id bigserial primary key,
  complaint_id bigint references complaints(id) on delete cascade,
  question_id int references followup_questions(id),
  answer_value text not null,
  severity_delta int not null default 0,
  at timestamptz default now()
);
create index if not exists followups_by_complaint on complaint_followups(complaint_id);

-- Seed a general set that applies to any category, plus a few specific ones.
-- severity_delta is added to the model's score, so a resident saying a pothole
-- is blocking the road actually moves the priority rather than being decoration.
insert into followup_questions (category_id, position, prompt, options) values
  (null, 1,
   '{"en":"How long has this been here?","hi":"यह कब से है?","mr":"हे किती दिवसांपासून आहे?"}',
   '[{"value":"today","label":{"en":"Since today","hi":"आज से","mr":"आजपासून"},"severity_delta":0},
     {"value":"week","label":{"en":"About a week","hi":"लगभग एक हफ्ता","mr":"साधारण एक आठवडा"},"severity_delta":5},
     {"value":"month","label":{"en":"A month or more","hi":"एक महीना या ज़्यादा","mr":"एक महिना किंवा जास्त"},"severity_delta":12},
     {"value":"unsure","label":{"en":"Not sure","hi":"पता नहीं","mr":"माहीत नाही"},"severity_delta":0}]'),

  (null, 2,
   '{"en":"Is it blocking people or traffic?","hi":"क्या इससे लोगों या ट्रैफ़िक को रुकावट है?","mr":"यामुळे लोकांना किंवा वाहतुकीला अडथळा होतो आहे का?"}',
   '[{"value":"no","label":{"en":"No","hi":"नहीं","mr":"नाही"},"severity_delta":0},
     {"value":"partly","label":{"en":"Partly","hi":"थोड़ा","mr":"थोडेसे"},"severity_delta":10},
     {"value":"fully","label":{"en":"Yes, completely","hi":"हाँ, पूरी तरह","mr":"होय, पूर्णपणे"},"severity_delta":22}]'),

  (null, 3,
   '{"en":"Is anyone at risk of getting hurt?","hi":"क्या किसी को चोट लगने का ख़तरा है?","mr":"कोणाला दुखापत होण्याचा धोका आहे का?"}',
   '[{"value":"no","label":{"en":"No","hi":"नहीं","mr":"नाही"},"severity_delta":0},
     {"value":"maybe","label":{"en":"Possibly","hi":"शायद","mr":"कदाचित"},"severity_delta":14},
     {"value":"yes","label":{"en":"Yes — children or elderly pass here","hi":"हाँ — यहाँ बच्चे या बुज़ुर्ग आते-जाते हैं","mr":"होय — इथून मुले किंवा वृद्ध जातात"},"severity_delta":28}]')
on conflict do nothing;

insert into followup_questions (category_id, position, prompt, options)
select c.id, 4,
  '{"en":"Is water still flowing?","hi":"क्या पानी अब भी बह रहा है?","mr":"पाणी अजूनही वाहत आहे का?"}',
  '[{"value":"stopped","label":{"en":"Stopped","hi":"रुक गया","mr":"थांबले"},"severity_delta":0},
    {"value":"slow","label":{"en":"Slowly","hi":"धीरे-धीरे","mr":"हळूहळू"},"severity_delta":8},
    {"value":"heavy","label":{"en":"Heavily","hi":"तेज़ी से","mr":"जोरात"},"severity_delta":20}]'
from categories c where c.code in ('LEAK','PIPELINE','CONTAMINATED')
on conflict do nothing;

insert into followup_questions (category_id, position, prompt, options)
select c.id, 4,
  '{"en":"How many households does this affect?","hi":"इससे कितने घर प्रभावित हैं?","mr":"याचा किती घरांवर परिणाम होतो?"}',
  '[{"value":"few","label":{"en":"Just a few","hi":"कुछ ही","mr":"काहीच"},"severity_delta":0},
    {"value":"street","label":{"en":"The whole street","hi":"पूरी गली","mr":"संपूर्ण गल्ली"},"severity_delta":12},
    {"value":"area","label":{"en":"The whole area","hi":"पूरा इलाक़ा","mr":"संपूर्ण परिसर"},"severity_delta":24}]'
from categories c where c.code in ('GARBAGE','NOWATER','FLOOD','DRAINBLOCK')
on conflict do nothing;

-- ============================================================
-- 4. Account deletion
-- ============================================================
-- A resident may delete their account, but their complaints are public civic
-- records and other people's reports are grouped with them. The reports stay;
-- the person is detached from them.
create or replace function anonymise_citizen(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update complaints
  set citizen_id = null, description_original = null, description_translated = null
  where citizen_id = p_user;

  update complaint_feedback set citizen_id = null where citizen_id = p_user;
  update complaint_reviews  set citizen_id = null where citizen_id = p_user;

  delete from notifications where user_id = p_user;
  delete from reward_events where citizen_id = p_user;
  delete from citizen_badges where citizen_id = p_user;

  insert into audit_logs (actor, action, entity, entity_id, after)
  values (p_user, 'account.deleted', 'profiles', p_user::text,
          jsonb_build_object('note', 'Reports retained and detached from the person'));

  delete from profiles where id = p_user;
end $$;

alter table complaints
  drop constraint if exists complaints_citizen_id_fkey;
alter table complaints
  add constraint complaints_citizen_id_fkey
  foreign key (citizen_id) references profiles(id) on delete set null;

-- The language a resident answered in is kept alongside the answer. A
-- translated paraphrase is not the same thing as what they actually chose.
alter table complaint_followups
  add column if not exists language char(2) not null default 'en';
