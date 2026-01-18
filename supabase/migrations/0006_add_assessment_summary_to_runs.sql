-- Migration: Add assessment summary fields to submission_runs and rich finding fields to submission_run_findings
-- This migration:
-- 1. Adds score, assessment_status, top_fixes, assessed_at to submission_runs
-- 2. Adds finding_id, title, fix, score_impact, evidence to submission_run_findings

-- Step 1: Add assessment summary columns to submission_runs
ALTER TABLE public.submission_runs
ADD COLUMN IF NOT EXISTS score integer,
ADD COLUMN IF NOT EXISTS assessment_status text,
ADD COLUMN IF NOT EXISTS top_fixes jsonb,
ADD COLUMN IF NOT EXISTS assessed_at timestamptz;

-- Step 2: Add rich finding fields to submission_run_findings
ALTER TABLE public.submission_run_findings
ADD COLUMN IF NOT EXISTS finding_id text,
ADD COLUMN IF NOT EXISTS title text,
ADD COLUMN IF NOT EXISTS fix text,
ADD COLUMN IF NOT EXISTS score_impact integer,
ADD COLUMN IF NOT EXISTS evidence jsonb;
