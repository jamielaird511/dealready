-- Migration: Add submission_runs and submission_run_findings tables for DealSense processing
-- This migration:
-- 1. Creates public.submission_runs table to track DealSense run executions
-- 2. Creates public.submission_run_findings table to store findings from each run
-- 3. Adds RLS policies for both tables

-- Step 1: Create public.submission_runs table
CREATE TABLE IF NOT EXISTS public.submission_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add index on submission_id for efficient lookups
CREATE INDEX IF NOT EXISTS idx_submission_runs_submission_id ON public.submission_runs(submission_id);

-- Add index on status for filtering
CREATE INDEX IF NOT EXISTS idx_submission_runs_status ON public.submission_runs(status);

-- Step 2: Create public.submission_run_findings table
CREATE TABLE IF NOT EXISTS public.submission_run_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.submission_runs(id) ON DELETE CASCADE,
  severity text NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  category text NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add index on run_id for efficient lookups
CREATE INDEX IF NOT EXISTS idx_submission_run_findings_run_id ON public.submission_run_findings(run_id);

-- Add index on severity for filtering
CREATE INDEX IF NOT EXISTS idx_submission_run_findings_severity ON public.submission_run_findings(severity);

-- Step 3: Enable RLS
ALTER TABLE public.submission_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_run_findings ENABLE ROW LEVEL SECURITY;

-- Step 4: RLS policies for submission_runs
-- Users can read runs for submissions they have access to
DROP POLICY IF EXISTS "Users can read submission_runs for their organization's submissions" ON public.submission_runs;
DROP POLICY IF EXISTS "Users can read submission_runs for their organization's submiss" ON public.submission_runs;
CREATE POLICY "runs_select_org"
  ON public.submission_runs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.submissions s
      WHERE s.id = submission_runs.submission_id
      AND s.org_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
      )
    )
  );

-- Users can create runs for submissions they have access to
DROP POLICY IF EXISTS "Users can create submission_runs for their organization's submissions" ON public.submission_runs;
DROP POLICY IF EXISTS "Users can create submission_runs for their organization's submiss" ON public.submission_runs;
CREATE POLICY "runs_insert_org"
  ON public.submission_runs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.submissions s
      WHERE s.id = submission_runs.submission_id
      AND s.org_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
      )
    )
  );

-- Users can update runs for submissions they have access to
DROP POLICY IF EXISTS "Users can update submission_runs for their organization's submissions" ON public.submission_runs;
DROP POLICY IF EXISTS "Users can update submission_runs for their organization's submiss" ON public.submission_runs;
CREATE POLICY "runs_update_org"
  ON public.submission_runs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.submissions s
      WHERE s.id = submission_runs.submission_id
      AND s.org_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
      )
    )
  );

-- Step 5: RLS policies for submission_run_findings
-- Users can read findings for runs they have access to
DROP POLICY IF EXISTS "Users can read submission_run_findings for their organization's runs" ON public.submission_run_findings;
DROP POLICY IF EXISTS "Users can read submission_run_findings for their organization's" ON public.submission_run_findings;
CREATE POLICY "findings_select_org"
  ON public.submission_run_findings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.submission_runs sr
      JOIN public.submissions s ON s.id = sr.submission_id
      WHERE sr.id = submission_run_findings.run_id
      AND s.org_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
      )
    )
  );

-- Users can create findings for runs they have access to
DROP POLICY IF EXISTS "Users can create submission_run_findings for their organization's runs" ON public.submission_run_findings;
DROP POLICY IF EXISTS "Users can create submission_run_findings for their organization's" ON public.submission_run_findings;
CREATE POLICY "findings_insert_org"
  ON public.submission_run_findings
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.submission_runs sr
      JOIN public.submissions s ON s.id = sr.submission_id
      WHERE sr.id = submission_run_findings.run_id
      AND s.org_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
      )
    )
  );
