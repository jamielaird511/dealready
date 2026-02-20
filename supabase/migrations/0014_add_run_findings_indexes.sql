-- Indexes to avoid statement timeout when loading DealSense findings
CREATE INDEX IF NOT EXISTS submission_run_findings_run_id_idx
  ON public.submission_run_findings (run_id);

CREATE INDEX IF NOT EXISTS submission_run_findings_run_id_created_at_idx
  ON public.submission_run_findings (run_id, created_at DESC);
