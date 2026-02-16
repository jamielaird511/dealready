-- Add borrowing purpose to deals for purpose-aware DealSense rules
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS purpose_type TEXT NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS purpose_notes TEXT NULL;

ALTER TABLE public.deals
  DROP CONSTRAINT IF EXISTS deals_purpose_type_check;

ALTER TABLE public.deals
  ADD CONSTRAINT deals_purpose_type_check CHECK (purpose_type IN (
    'business_purchase',
    'startup',
    'refinance',
    'equipment',
    'working_capital',
    'property_purchase',
    'shareholder_buyout',
    'expansion',
    'other'
  ));
