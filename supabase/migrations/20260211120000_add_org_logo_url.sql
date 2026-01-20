-- Add logo_url to orgs for brand assets.
BEGIN;

ALTER TABLE public.orgs
    ADD COLUMN logo_url text;

COMMIT;
