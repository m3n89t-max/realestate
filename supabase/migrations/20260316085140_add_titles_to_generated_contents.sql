-- Add titles array column to generated_contents
ALTER TABLE generated_contents ADD COLUMN IF NOT EXISTS titles text[] DEFAULT '{}';