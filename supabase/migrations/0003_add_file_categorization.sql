-- Add display_name and category columns to submission_files
ALTER TABLE public.submission_files ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.submission_files ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'other';

-- Backfill display_name for existing rows
UPDATE public.submission_files SET display_name = original_filename WHERE display_name IS NULL;

-- Add CHECK constraint for category
ALTER TABLE public.submission_files DROP CONSTRAINT IF EXISTS submission_files_category_check;
ALTER TABLE public.submission_files
  ADD CONSTRAINT submission_files_category_check
  CHECK (category IN ('financials','forecasts','business_plan','broker_app','security','other'));

-- Add index on (submission_id, category)
CREATE INDEX IF NOT EXISTS idx_submission_files_submission_category ON public.submission_files (submission_id, category);
