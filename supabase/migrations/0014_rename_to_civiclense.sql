-- CivicLense 0014 — after the rename
--
-- Optional. Run this only if you seeded the database while the project was
-- still called CivicPulse.
--
-- Two things carry the old name into data rather than code, and code changes do
-- not reach them: the seeded password, and the complaint reference prefix.

-- ============================================================
-- 1. Seeded passwords
-- ============================================================
-- seed.sql hashes the password at insert time. Renaming the string in the file
-- does nothing to accounts already created — they still hold a hash of
-- "CivicPulse@2026", and every demo login would fail against the new one.
--
-- This aligns them. It touches only the seeded accounts; anyone who registered
-- through the app chose their own password and is left alone.
update auth.users
set encrypted_password = crypt('CivicLense@2026', gen_salt('bf'))
where email in (
  'superadmin@mcgm.gov.in', 'roads.head@mcgm.gov.in', 'waste.head@mcgm.gov.in',
  'water.head@mcgm.gov.in', 'health.head@mcgm.gov.in', 'traffic.head@mcgm.gov.in',
  'light.head@mcgm.gov.in',
  'r.kumar@mcgm.gov.in', 'p.nair@mcgm.gov.in', 'v.shinde@mcgm.gov.in',
  'i.shaikh@mcgm.gov.in', 's.gaikwad@mcgm.gov.in', 'm.pawar@mcgm.gov.in',
  'a.deshmukh@mcgm.gov.in', 'k.rane@mcgm.gov.in', 'd.jadhav@mcgm.gov.in',
  'n.fernandes@mcgm.gov.in', 't.more@mcgm.gov.in', 'g.bhosale@mcgm.gov.in',
  'a.borkar@mcgm.gov.in', 'r.pillai@mcgm.gov.in', 's.kale@mcgm.gov.in'
)
or email like '%@example.com';

-- ============================================================
-- 2. Reference prefixes — deliberately unchanged
-- ============================================================
-- The obvious move after a rename is CP- → CL-. It is wrong here, twice over.
--
-- Clusters have always used CL-. Moving complaints onto the same prefix would
-- make "CL-2" ambiguous — a complaint or a group — in error messages, in
-- notifications, and in anything a resident quotes at a ward counter.
--
-- And a reference is how a resident finds their own report. Rewriting history
-- to match a rebrand breaks every reference already shown on a screen or sent
-- in a notification, which is a worse outcome than a prefix that no longer
-- stands for the product name.
--
-- So: CP- reads as "complaint" and CL- as "cluster". Both are now named for
-- what they identify rather than for the product, which is the better scheme
-- anyway and survives the next rename too.

-- ============================================================
-- Summary
-- ============================================================
do $$
declare
  seeded int;
  old_refs int;
begin
  select count(*) into seeded from auth.users where email like '%@mcgm.gov.in';
  select count(*) into old_refs from complaints;

  raise notice E'\n=== rename applied ===\n'
    'Seeded accounts realigned: %\n'
    'Password is now: CivicLense@2026\n\n'
    'Complaints keeping their CP- references: %\n'
    'Prefixes are unchanged — CP- now reads as complaint, CL- as cluster.\n',
    seeded, old_refs;
end $$;
