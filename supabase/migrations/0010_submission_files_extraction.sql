-- Add PDF extraction columns to submission_files
ALTER TABLE public.submission_files ADD COLUMN IF NOT EXISTS extraction_status text NOT NULL DEFAULT 'queued';
ALTER TABLE public.submission_files ADD COLUMN IF NOT EXISTS extracted_text text;
ALTER TABLE public.submission_files ADD COLUMN IF NOT EXISTS extraction_error text;
ALTER TABLE public.submission_files ADD COLUMN IF NOT EXISTS extracted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_submission_files_extraction_status ON public.submission_files (extraction_status);
