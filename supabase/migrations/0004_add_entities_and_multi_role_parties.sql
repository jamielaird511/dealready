-- Migration: Add entities table and update deal_parties for multi-role support
-- This migration:
-- 1. Creates public.entities table scoped by organization_id
-- 2. Updates public.deal_parties to reference entities and support roles[]
-- 3. Backfills existing deal_parties rows into entities + roles[]
-- 4. Adds RLS policies for entities

-- Step 1: Create public.entities table
CREATE TABLE IF NOT EXISTS public.entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('person','company','trust','other')),
  display_name text NOT NULL,
  legal_name text,
  email text,
  phone text,
  external_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add index on (organization_id, lower(display_name)) for efficient lookups
CREATE INDEX IF NOT EXISTS idx_entities_org_display_name ON public.entities(organization_id, lower(display_name));

-- Add unique index to prevent duplicate entities per organization
-- This ensures (organization_id, entity_type, display_name) is unique (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_entities_org_type_name_unique
ON public.entities(organization_id, entity_type, lower(display_name));

-- Step 2: Update public.deal_parties
-- Add entity_id column (nullable initially for backfill)
ALTER TABLE public.deal_parties
ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES public.entities(id) ON DELETE SET NULL;

-- Add roles array column
ALTER TABLE public.deal_parties
ADD COLUMN IF NOT EXISTS roles text[] NOT NULL DEFAULT '{}';

-- Add partial unique index on (deal_id, entity_id) where entity_id IS NOT NULL
-- This prevents duplicate entity associations without blocking backfill of NULL entity_id rows
DROP INDEX IF EXISTS public.deal_parties_deal_entity_unique;

CREATE UNIQUE INDEX IF NOT EXISTS deal_parties_deal_entity_unique
ON public.deal_parties(deal_id, entity_id)
WHERE entity_id IS NOT NULL;

-- Step 3: Backfill entities and link deal_parties
-- Get organization_id from deals.organization_id for each deal_parties row

DO $$
DECLARE
  party_record RECORD;
  org_id_val uuid;
  entity_type_val text;
  entity_id_val uuid;
BEGIN
  -- Loop through all existing deal_parties
  FOR party_record IN 
    SELECT dp.id, dp.deal_id, dp.type, dp.name, dp.role, dp.notes
    FROM public.deal_parties dp
    WHERE dp.entity_id IS NULL
  LOOP
    -- Get organization_id from deal
    SELECT d.organization_id
    INTO org_id_val
    FROM public.deals d
    WHERE d.id = party_record.deal_id;
    
    -- Skip if we can't find organization_id
    IF org_id_val IS NULL THEN
      CONTINUE;
    END IF;
    
    -- Map type to entity_type
    entity_type_val := CASE 
      WHEN party_record.type = 'person' THEN 'person'
      WHEN party_record.type IN ('company', 'trust') THEN party_record.type
      ELSE 'other'
    END;
    
    -- Find or create entity
    SELECT id INTO entity_id_val
    FROM public.entities
    WHERE organization_id = org_id_val
      AND lower(display_name) = lower(trim(party_record.name))
      AND entity_type = entity_type_val
    LIMIT 1;
    
    -- Create entity if not found
    IF entity_id_val IS NULL THEN
      INSERT INTO public.entities (organization_id, entity_type, display_name, legal_name)
      VALUES (org_id_val, entity_type_val, trim(party_record.name), trim(party_record.name))
      RETURNING id INTO entity_id_val;
    END IF;
    
    -- Update deal_parties with entity_id and roles
    UPDATE public.deal_parties
    SET 
      entity_id = entity_id_val,
      roles = CASE 
        WHEN party_record.role IS NOT NULL AND party_record.role != '' THEN ARRAY[party_record.role]
        ELSE '{}'
      END
    WHERE id = party_record.id;
  END LOOP;
END $$;

-- Step 4: Enable RLS on entities
ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can select entities in their organization" ON public.entities;
DROP POLICY IF EXISTS "Users can insert entities in their organization" ON public.entities;
DROP POLICY IF EXISTS "Users can update entities in their organization" ON public.entities;
DROP POLICY IF EXISTS "Users can delete entities in their organization" ON public.entities;

-- RLS: Users can select entities in their organization
CREATE POLICY "Users can select entities in their organization"
ON public.entities
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_members.organization_id = entities.organization_id
      AND organization_members.user_id = auth.uid()
  )
);

-- RLS: Users can insert entities in their organization
CREATE POLICY "Users can insert entities in their organization"
ON public.entities
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_members.organization_id = entities.organization_id
      AND organization_members.user_id = auth.uid()
  )
);

-- RLS: Users can update entities in their organization
CREATE POLICY "Users can update entities in their organization"
ON public.entities
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_members.organization_id = entities.organization_id
      AND organization_members.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_members.organization_id = entities.organization_id
      AND organization_members.user_id = auth.uid()
  )
);

-- RLS: Users can delete entities in their organization
CREATE POLICY "Users can delete entities in their organization"
ON public.entities
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_members.organization_id = entities.organization_id
      AND organization_members.user_id = auth.uid()
  )
);

-- Note: deal_parties RLS should already work with entity_id joins since we're checking through deals
-- If deal_parties RLS needs updating, it should check that the deal's organization matches the user's organization
-- This is typically done through deals.broker_id -> organization_members or deals.organization_id
