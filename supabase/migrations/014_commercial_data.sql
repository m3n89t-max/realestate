-- 014_commercial_data.sql
-- 상권 분석 데이터 컬럼 추가 (상가/사무실 매물용)

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS commercial_data JSONB DEFAULT NULL;

COMMENT ON COLUMN projects.commercial_data IS '상권 분석 데이터 (commercial 매물용, 소상공인시장진흥공단 API)';
