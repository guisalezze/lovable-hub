-- Add structured_content and translated_content JSONB columns to copy_items
-- structured_content: { hooks: [{headline: string, hook: string}], body: string, cta: string }
-- translated_content: same structure but in English

ALTER TABLE public.copy_items
  ADD COLUMN IF NOT EXISTS structured_content jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS translated_content jsonb DEFAULT NULL;

COMMENT ON COLUMN public.copy_items.structured_content IS 'Structured copy content: { hooks: [{headline, hook}], body (HTML), cta }';
COMMENT ON COLUMN public.copy_items.translated_content IS 'Auto-translated (EN) version of structured_content';
