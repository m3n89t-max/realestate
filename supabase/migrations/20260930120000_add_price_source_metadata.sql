-- projects 테이블에 '값 출처 메타 4필드' 추가
--
-- 배경: price / monthly_rent / deposit / key_money 는 값만 저장되고
-- 그 값이 어디서 왔는지(출처명·기준일·수집경로·값유형)를 나타내는 메타 컬럼이 없었다.
-- 실거래가와 호가를 중개사 제공값과 구분할 수 없으면 카드뉴스·블로그·쇼츠에
-- 근거 없는 금액이 그대로 실린다. 이 마이그레이션은 그 구분을 DB 차원에서 강제한다.
--
-- 값유형 3종:
--   '중개사 제공' — 공인중개사가 직접 입력한 값 (기본값)
--   '실거래'      — 국토교통부 실거래가 등 공공데이터로 확인된 값
--   '호가'        — 매도인/임대인이 부른 값, 광고 게시가 등

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS source_name    TEXT,
  ADD COLUMN IF NOT EXISTS source_date    DATE,
  ADD COLUMN IF NOT EXISTS source_channel TEXT,
  ADD COLUMN IF NOT EXISTS value_type     TEXT DEFAULT '중개사 제공';

COMMENT ON COLUMN public.projects.source_name    IS '출처명: 가격 값의 출처 이름 (예: 국토교통부 실거래가, 매도인 제시, 네이버 부동산)';
COMMENT ON COLUMN public.projects.source_date    IS '기준일: 가격 값이 유효한 기준 날짜 (실거래는 계약일, 호가는 확인일)';
COMMENT ON COLUMN public.projects.source_channel IS '수집경로: 값을 어떻게 얻었는지 (예: 공공데이터 API, 전화 확인, 방문 확인, 중개사 직접 입력)';
COMMENT ON COLUMN public.projects.value_type     IS '값유형: 중개사 제공 / 실거래 / 호가 — 콘텐츠 생성 시 근거 강도를 판단하는 기준';

-- 값유형은 합의된 3종만 허용한다.
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_value_type_check;

ALTER TABLE public.projects ADD CONSTRAINT projects_value_type_check
  CHECK (value_type IS NULL OR value_type = ANY (ARRAY[
    '중개사 제공',
    '실거래',
    '호가'
  ]::text[]));

-- ── 기존 데이터 백필 ────────────────────────────────────────────────────────
-- 이 마이그레이션 이전에 등록된 모든 매물의 가격은 중개사가 직접 입력한 값이다.
-- 따라서 value_type / source_name 을 '중개사 제공'으로 채운다.
-- (수집경로도 같은 근거로 채워 화면에 빈칸이 노출되지 않게 한다.)
UPDATE public.projects
SET
  value_type     = COALESCE(value_type, '중개사 제공'),
  source_name    = COALESCE(NULLIF(TRIM(source_name), ''), '중개사 제공'),
  source_channel = COALESCE(NULLIF(TRIM(source_channel), ''), '중개사 직접 입력')
WHERE value_type IS NULL
   OR NULLIF(TRIM(source_name), '') IS NULL
   OR NULLIF(TRIM(source_channel), '') IS NULL;

-- 앞으로 들어오는 행도 기본값이 '중개사 제공'이 되도록 NOT NULL + DEFAULT 고정.
-- (source_name/source_date/source_channel 은 '실거래'/'호가'일 때만 필수이므로
--  DB NOT NULL 대신 애플리케이션 렌더 게이트에서 검증한다 — src/lib/price-source.ts)
ALTER TABLE public.projects
  ALTER COLUMN value_type SET DEFAULT '중개사 제공';

UPDATE public.projects SET value_type = '중개사 제공' WHERE value_type IS NULL;

ALTER TABLE public.projects
  ALTER COLUMN value_type SET NOT NULL;

-- 값유형별 조회(실거래만 모아보기 등)를 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_projects_value_type ON public.projects (value_type);
