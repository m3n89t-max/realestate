-- ============================================================
-- Migration 019: 매물 상세 정보 필드 추가
-- 공인중개사 매물 정보표(확인·설명서) 기준 필드
-- ============================================================

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS property_category    text,           -- 중개대상물 종류 (일반상가, 아파트 등)
  ADD COLUMN IF NOT EXISTS main_use             text,           -- 주용도 (제2종근생, 주거용 등)
  ADD COLUMN IF NOT EXISTS transaction_type     text DEFAULT 'sale',  -- 거래형태: sale/lease/rent
  ADD COLUMN IF NOT EXISTS rooms_count          integer,        -- 방 수
  ADD COLUMN IF NOT EXISTS bathrooms_count      integer,        -- 화장실 수
  ADD COLUMN IF NOT EXISTS land_area            decimal(10,2),  -- 대지면적 (㎡)
  ADD COLUMN IF NOT EXISTS total_area           decimal(10,2),  -- 연면적 (㎡)
  ADD COLUMN IF NOT EXISTS approval_date        text,           -- 사용승인일 (YYYY.MM.DD 텍스트)
  ADD COLUMN IF NOT EXISTS parking_legal        integer,        -- 주차 대장상 대수
  ADD COLUMN IF NOT EXISTS parking_actual       integer,        -- 주차 실제 대수
  ADD COLUMN IF NOT EXISTS move_in_date         text,           -- 입주가능일 (즉시입주가능 등 텍스트)
  ADD COLUMN IF NOT EXISTS management_fee_detail text;          -- 관리비 상세

COMMENT ON COLUMN projects.property_category    IS '중개대상물 종류 (일반상가/집합상가/아파트 등)';
COMMENT ON COLUMN projects.main_use             IS '건축물 주용도 (제1종근생/제2종근생/주거용 등)';
COMMENT ON COLUMN projects.transaction_type     IS '거래형태: sale=매매, lease=전세, rent=임대';
COMMENT ON COLUMN projects.rooms_count          IS '방 수';
COMMENT ON COLUMN projects.bathrooms_count      IS '화장실 수';
COMMENT ON COLUMN projects.land_area            IS '대지면적 (㎡)';
COMMENT ON COLUMN projects.total_area           IS '연면적 (㎡)';
COMMENT ON COLUMN projects.approval_date        IS '건축물 사용승인일';
COMMENT ON COLUMN projects.parking_legal        IS '주차 대장상 대수';
COMMENT ON COLUMN projects.parking_actual       IS '주차 실제 가능 대수';
COMMENT ON COLUMN projects.move_in_date         IS '입주가능일 (즉시입주가능, YYYY.MM.DD 등)';
COMMENT ON COLUMN projects.management_fee_detail IS '관리비 상세 내용';
