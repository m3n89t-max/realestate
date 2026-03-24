-- Add population_data column to projects table
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS population_data jsonb DEFAULT NULL;
