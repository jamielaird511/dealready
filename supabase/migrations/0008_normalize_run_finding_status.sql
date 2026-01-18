-- Migration: Normalize submission_run_findings lifecycle fields to workflow semantics
-- This migration:
-- 1. Renames status column to workflow_state with standardized workflow terminology
-- 2. Adds state_changed_at to track workflow state transitions
-- 3. Maps existing status values to workflow_state values

-- Step 1: Add workflow_state column with workflow-standard values
ALTER TABLE public.submission_run_findings
ADD COLUMN IF NOT EXISTS workflow_state text DEFAULT 'open' CHECK (workflow_state IN ('open', 'acknowledged', 'resolved', 'dismissed'));

-- Step 2: Migrate existing status values to workflow_state (if status column exists)
-- Map: 'new' -> 'open', 'acknowledged' -> 'acknowledged', 'resolved' -> 'resolved', 'ignored' -> 'dismissed'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'submission_run_findings' 
    AND column_name = 'status'
  ) THEN
    UPDATE public.submission_run_findings
    SET workflow_state = CASE 
      WHEN status = 'new' THEN 'open'
      WHEN status = 'acknowledged' THEN 'acknowledged'
      WHEN status = 'resolved' THEN 'resolved'
      WHEN status = 'ignored' THEN 'dismissed'
      ELSE 'open'
    END
    WHERE status IS NOT NULL;
  END IF;
END $$;

-- Step 3: Add state_changed_at column to track workflow state transitions
ALTER TABLE public.submission_run_findings
ADD COLUMN IF NOT EXISTS state_changed_at timestamptz DEFAULT now();

-- Step 4: Initialize state_changed_at from existing timestamp columns if available
UPDATE public.submission_run_findings
SET state_changed_at = COALESCE(
  resolved_at,
  acknowledged_at,
  updated_at,
  created_at
)
WHERE state_changed_at = now() OR state_changed_at IS NULL;

-- Step 5: Add index on workflow_state for efficient filtering
CREATE INDEX IF NOT EXISTS idx_submission_run_findings_workflow_state ON public.submission_run_findings(workflow_state);
