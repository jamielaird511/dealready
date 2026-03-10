-- Latest submission run per deal for dashboard (run id, created_at, doc_completeness_snapshot)
create or replace view public.deal_latest_run as
select
  d.id as deal_id,
  sr.id as run_id,
  sr.created_at as run_created_at,
  sr.doc_completeness_snapshot as doc_completeness_snapshot
from public.deals d
join lateral (
  select s.id
  from public.submissions s
  where s.deal_id = d.id
  order by s.created_at desc
  limit 1
) s on true
left join lateral (
  select sr.id, sr.created_at, sr.doc_completeness_snapshot
  from public.submission_runs sr
  where sr.submission_id = s.id
  order by sr.created_at desc
  limit 1
) sr on true;
