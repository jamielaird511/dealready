-- Add DealSense structured transaction summary fields to submission_runs
ALTER TABLE public.submission_runs
  ADD COLUMN IF NOT EXISTS deal_summary_data jsonb,
  ADD COLUMN IF NOT EXISTS deal_summary_text text;

