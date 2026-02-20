-- Persist wizard state on deal for document checklist, tax, and parties
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS wizard_state jsonb DEFAULT NULL;
