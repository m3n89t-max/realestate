-- Add tourism_data column for Korea Tourism Organization API data
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS tourism_data jsonb DEFAULT NULL;

COMMENT ON COLUMN projects.tourism_data IS '한국관광공사 TourAPI 기반 주변 관광시설 데이터';
