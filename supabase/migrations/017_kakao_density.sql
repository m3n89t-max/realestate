-- Add Kakao Local API density analysis result to projects
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS kakao_density JSONB DEFAULT NULL;

COMMENT ON COLUMN projects.kakao_density IS '카카오 Local API 업종 밀집도 분석 (반경 500m 기준)';
