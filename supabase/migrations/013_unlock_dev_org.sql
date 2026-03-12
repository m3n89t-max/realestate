-- 개발/테스트용: 모든 기존 조직을 premium으로 업그레이드 (한도 해제)
UPDATE organizations
SET
    plan_type = 'premium',
    monthly_project_limit = -1
WHERE plan_type = 'free';

-- usage_logs의 project_count도 초기화 (한도 초과 오류 해제)
UPDATE usage_logs
SET project_count = 0
WHERE year = EXTRACT(YEAR FROM now())::integer
  AND month = EXTRACT(MONTH FROM now())::integer;
