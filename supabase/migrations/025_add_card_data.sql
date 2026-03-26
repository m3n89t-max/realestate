-- Add card_data column for Jeju Data Hub card usage data
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS card_data jsonb DEFAULT NULL;

COMMENT ON COLUMN projects.card_data IS '제주데이터허브 관광지/상업지구 카드 이용 데이터 (요일별·시간대별)';
