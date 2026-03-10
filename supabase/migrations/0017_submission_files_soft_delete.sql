-- Soft delete for submission_files
ALTER TABLE public.submission_files
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Index to exclude soft-deleted files when querying by submission
CREATE INDEX IF NOT EXISTS submission_files_submission_id_not_deleted_idx
  ON public.submission_files (submission_id)
  WHERE is_deleted = false;
