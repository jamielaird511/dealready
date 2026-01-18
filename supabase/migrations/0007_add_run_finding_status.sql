-- Migration: Add status tracking columns to submission_run_findings
-- This migration:
-- 1. Adds status column to track finding lifecycle (new, acknowledged, resolved, ignored)
-- 2. Adds updated_at column to track when finding was last modified
-- 3. Adds resolved_at column to track when finding was resolved
-- 4. Adds acknowledged_at column to track when finding was acknowledged

-- Add status tracking columns to submission_run_findings
ALTER TABLE public.submission_run_findings
ADD COLUMN IF NOT EXISTS status text DEFAULT 'new' CHECK (status IN ('new', 'acknowledged', 'resolved', 'ignored')),
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz;

-- Add index on status for efficient filtering
CREATE INDEX IF NOT EXISTS idx_submission_run_findings_status ON public.submission_run_findings(status);
