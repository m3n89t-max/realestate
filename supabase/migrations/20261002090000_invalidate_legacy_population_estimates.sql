-- 거주인구(radius_500m_estimated) 레거시 행 무효화
--
-- 배경
--   운영 projects.population_data 22건은 산정 방법 스탬프(estimation_method)가 없다.
--   당시 엣지 함수에는 계산 경로가 두 갈래 있었다.
--     (가) 읍면동 평균 인구밀도 × 반경 500m 원 면적
--     (나) 집계구 가중 밀도 × 반경 500m 원 면적
--   화면은 둘을 똑같이 '약 N명'으로 보여줬고, 그래서 같은 주소가 수집 시점에 따라
--   다른 값을 냈다(제주시 황새왓길 34: 6,816명 / 11,035명. 애월읍 유수암평화5길 55: 144명 / 461명).
--   같은 연동 안에서도 신대로110 2,846명과 도령로13길 13,891명이 공존했다.
--   저장된 행만 보고는 어느 경로로 계산된 값인지 알 수 없다.
--
--   추가로 3건에는 폐기된 장벽 차감 계수가 남아 있다(25 / 53 / 70). 차감이 값에
--   반영됐는지도 행만 보고는 알 수 없다. 2건은 수집 실패인데 density 0 /
--   total_population 0 을 들고 있어서 '인구 0명'처럼 읽힌다.
--
-- 방침: 숫자를 고치지 않고 '재수집 대상'으로 표시한다.
--   값을 보정하려면 어느 경로로 계산됐는지를 알아야 하는데 알 수 없다. 추정으로
--   숫자를 덮어쓰면 틀린 값을 새 스탬프로 세탁하게 된다. 그래서 파생 수치만
--   떼어내고 원본 통계(총인구/밀도/가구수 등)는 남긴다. 다시 수집하면 지금
--   기준(adm_avg_density_x_circle_500m@1)으로 다시 계산된다.
--
--   표시 계층(src/lib/location-data-truthfulness.ts)은 이 마이그레이션이
--   적용되지 않아도 같은 행을 이미 거부한다. 이 파일은 DB를 화면과 같은 상태로
--   맞춰서, 다음 사람이 DB만 보고 값이 유효하다고 오해하지 않게 하는 목적이다.
--
-- 되돌리기: 이 마이그레이션은 파생 수치를 지운다. 되돌릴 수 없다.
--   값이 필요하면 해당 매물에서 '주변 거주인구 분석'을 다시 실행하면 된다.

BEGIN;

-- 1) 수집 실패 행: 숫자를 전부 떼고 실패 상태만 남긴다.
--    error 키가 있거나, 총인구가 0 이하인 행이 대상이다.
UPDATE public.projects
SET population_data = jsonb_build_object(
      'status', 'failed',
      'source', 'SGIS',
      'failure_reason', COALESCE(population_data->>'error', '수집 실패(레거시 행, 사유 미기록)'),
      'superseded_at', now(),
      'superseded_reason', 'legacy_row_without_method_stamp',
      'collected_at', population_data->>'collected_at'
    )
WHERE population_data IS NOT NULL
  AND population_data->>'estimation_method' IS NULL
  AND (
    population_data ? 'error'
    OR COALESCE((population_data->>'total_population')::numeric, 0) <= 0
  );

-- 2) 폐기된 장벽 차감 계수를 들고 있는 행: 차감이 값에 반영됐는지 알 수 없으므로
--    파생 수치와 차감 계수를 함께 떼어낸다. 원본 통계는 남긴다.
UPDATE public.projects
SET population_data = (population_data
      - 'radius_500m_estimated'
      - 'barrier_coefficient'
      - 'barrier_status'
      - 'barrier_names')
      || jsonb_build_object(
           'status', 'available',
           'superseded_at', now(),
           'superseded_reason', 'deprecated_barrier_coefficient',
           'needs_recollection', true
         )
WHERE population_data IS NOT NULL
  AND population_data->>'estimation_method' IS NULL
  AND population_data ? 'barrier_coefficient';

-- 3) 나머지 레거시 행: 파생 수치만 떼어낸다. 원본 통계는 그대로 쓴다
--    (총인구·밀도·가구수는 SGIS가 준 값이라 산정 방법과 무관하다).
UPDATE public.projects
SET population_data = (population_data - 'radius_500m_estimated')
      || jsonb_build_object(
           'status', 'available',
           'superseded_at', now(),
           'superseded_reason', 'legacy_row_without_method_stamp',
           'needs_recollection', true
         )
WHERE population_data IS NOT NULL
  AND population_data->>'estimation_method' IS NULL;

-- 확인용(적용 후 0이어야 한다):
--   SELECT count(*) FROM public.projects
--   WHERE population_data ? 'radius_500m_estimated'
--     AND population_data->>'estimation_method' IS NULL;

COMMIT;
