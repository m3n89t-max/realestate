-- 무료 공공 데이터 레이어 수집 결과 저장.
-- 레이어별 status/value/collectedAt/sourceAsOf를 담는다.
-- provenance(출처·기준기간·공간단위·의미)가 없는 값은 UI에서 렌더링하지 않는다.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS public_data_layers jsonb DEFAULT NULL;

COMMENT ON COLUMN projects.public_data_layers IS '무료 공공 데이터 레이어 수집 결과 (서울 실시간 상권현황, 지역사랑상품권 업종별 결제 등). 레이어별 status와 provenance를 포함한다.';
