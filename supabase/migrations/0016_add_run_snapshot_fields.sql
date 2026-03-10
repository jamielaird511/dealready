-- Add optional doc completeness snapshot to submission_runs
ALTER TABLE public.submission_runs
  ADD COLUMN IF NOT EXISTS doc_completeness_snapshot jsonb DEFAULT NULL;
