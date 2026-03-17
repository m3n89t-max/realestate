-- Add on-site observation fields to projects table
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS building_condition TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS floor_composition  TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS rental_status      TEXT DEFAULT NULL;

COMMENT ON COLUMN projects.building_condition IS '건물 상태: 신축/양호/보통/노후';
COMMENT ON COLUMN projects.floor_composition  IS '층별 구성 (예: 1층: 편의점, 2층: 사무실)';
COMMENT ON COLUMN projects.rental_status      IS '임대 현황 (예: 1층 월세 150/1000, 계약만료 2026.06)';
