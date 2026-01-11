-- Enable RLS on submission_files table if not already enabled
ALTER TABLE public.submission_files ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Brokers can select submission files for their submissions" ON public.submission_files;
DROP POLICY IF EXISTS "Brokers can insert submission files for their submissions" ON public.submission_files;

-- Allow brokers to SELECT submission_files where the parent submission belongs to them
CREATE POLICY "Brokers can select submission files for their submissions"
ON public.submission_files
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.submissions
    JOIN public.deals ON deals.id = submissions.deal_id
    WHERE submissions.id = submission_files.submission_id
    AND deals.broker_id = auth.uid()
  )
);

-- Allow brokers to INSERT submission_files where the parent submission belongs to them
CREATE POLICY "Brokers can insert submission files for their submissions"
ON public.submission_files
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.submissions
    JOIN public.deals ON deals.id = submissions.deal_id
    WHERE submissions.id = submission_files.submission_id
    AND deals.broker_id = auth.uid()
  )
);
