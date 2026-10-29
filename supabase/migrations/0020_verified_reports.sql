-- CivicLense 0020 — telling a verified report from an unverified one
--
-- A public feed where every report looks equally solid is worth less than one
-- that distinguishes them. Somebody reading it should be able to see which
-- reports the city has actually acted on and which are one person's word so far.
--
-- No new judgement is invented. Everything below already happened; it is simply
-- being stated rather than left for the reader to infer from a status enum.

drop view if exists public_reports;

create view public_reports as
select
  c.ref,
  cat.name                                        as category,
  d.name                                          as department,
  c.severity,
  c.status,
  w.code                                          as ward_code,
  w.name                                          as ward_name,
  round(st_y(c.location::geometry)::numeric, 3)   as lat,
  round(st_x(c.location::geometry)::numeric, 3)   as lng,
  c.created_at,
  c.resolved_at,
  c.comment_count,
  c.corroboration_count,
  c.dispute_count,
  c.rework_count,
  c.anonymous,
  (c.sla_deadline < now() and c.resolved_at is null) as overdue,
  (c.assigned_officer is not null)                   as assigned,
  ct.agency                                          as agency,

  -- How much this report has been stood behind, in the order that matters.
  --
  -- A resident confirming the fix is the strongest signal there is: they went
  -- back and looked. An officer being sent is weaker but real — somebody
  -- decided it was worth a visit. Neighbours agreeing is weaker still, though
  -- several independent people is meaningfully different from one.
  --
  -- "unverified" is not an accusation. It means nobody has been yet, which is
  -- true of every report in its first hour.
  case
    when exists (
      select 1 from complaint_feedback f
      where f.complaint_id = c.id and f.resolved
    )                              then 'confirmed_by_resident'
    when c.status = 'resolved'     then 'closed_by_officer'
    when c.assigned_officer is not null then 'officer_assigned'
    when c.corroboration_count >= 3     then 'confirmed_by_neighbours'
    when c.corroboration_count >= 1     then 'seen_by_others'
    else 'unverified'
  end as verification,

  -- Disputed separately, because it is not a lower rung of the same ladder.
  -- A report three people confirm and two say is already fixed is genuinely
  -- ambiguous, and flattening that into one score would hide the disagreement
  -- rather than show it.
  (c.dispute_count > 0)            as disputed

from complaints c
left join categories cat on cat.id = c.category_id
left join departments d on d.id = c.department_id
left join wards w on w.id = c.ward_id
left join contracts ct on ct.id = c.contract_id
where c.status not in ('withdrawn', 'rejected')
  and c.location is not null;
