-- Per-deal document status overrides (pending / not_required)
-- Overrides are stored per (deal_id, doc_id). Status derived from submission_files + overrides.

CREATE TABLE IF NOT EXISTS public.deal_doc_states (
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  doc_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'not_required')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (deal_id, doc_id)
);

CREATE INDEX IF NOT EXISTS idx_deal_doc_states_deal_id ON public.deal_doc_states(deal_id);

ALTER TABLE public.deal_doc_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Brokers can manage deal_doc_states for their deals" ON public.deal_doc_states;
CREATE POLICY "Brokers can manage deal_doc_states for their deals"
  ON public.deal_doc_states
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.deals
      WHERE deals.id = deal_doc_states.deal_id
      AND deals.broker_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.deals
      WHERE deals.id = deal_doc_states.deal_id
      AND deals.broker_id = auth.uid()
    )
  );
