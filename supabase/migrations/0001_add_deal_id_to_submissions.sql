-- Add deal_id column to submissions table
ALTER TABLE public.submissions
ADD COLUMN IF NOT EXISTS deal_id UUID REFERENCES public.deals(id) ON DELETE CASCADE;

-- Add index on deal_id for better query performance
CREATE INDEX IF NOT EXISTS submissions_deal_id_idx ON public.submissions(deal_id);

-- Update RLS policy to allow brokers to select/insert/update only submissions
-- where the parent deal belongs to them
DROP POLICY IF EXISTS "Brokers can manage submissions for their deals" ON public.submissions;

CREATE POLICY "Brokers can manage submissions for their deals"
ON public.submissions
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.deals
    WHERE deals.id = submissions.deal_id
    AND deals.broker_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.deals
    WHERE deals.id = submissions.deal_id
    AND deals.broker_id = auth.uid()
  )
);
