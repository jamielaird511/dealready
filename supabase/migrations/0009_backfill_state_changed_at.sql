-- Backfill state_changed_at for existing rows created before the column existed
update public.submission_run_findings
set state_changed_at = updated_at
where state_changed_at is null;
