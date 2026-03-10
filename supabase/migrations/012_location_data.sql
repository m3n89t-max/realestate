-- POI 데이터, 토지이용규제, 국토부 실거래가 컬럼 추가
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS poi_data       jsonb,
  ADD COLUMN IF NOT EXISTS land_use_data  jsonb,
  ADD COLUMN IF NOT EXISTS real_price_data jsonb;
