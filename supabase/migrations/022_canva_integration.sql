-- Canva Connect API integration
-- organizations: store OAuth token per org
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS canva_token jsonb DEFAULT NULL;
  -- { access_token, refresh_token, expires_at, token_type }

-- generated_contents: store Canva design reference
ALTER TABLE generated_contents
  ADD COLUMN IF NOT EXISTS canva_design_id text DEFAULT NULL;
