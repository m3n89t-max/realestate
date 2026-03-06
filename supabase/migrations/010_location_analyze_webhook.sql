-- 입지 분석 자동화를 위한 DB Webhook 설정
-- tasks 테이블에 location_analyze 타입의 작업이 삽입되면 analyze-location 에지 함수를 호출합니다.

-- 1. WebHook 호출을 위한 HTTP 확장이 활성화되어 있는지 확인 (일반적으로 Supabase 기본 활성)
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

-- 2. 트리거 함수 생성
CREATE OR REPLACE FUNCTION public.trg_on_location_analyze_task()
RETURNS TRIGGER AS $$
BEGIN
  -- location_analyze 유형의 작업이 'pending' 상태로 들어올 때만 실행
  IF NEW.type = 'location_analyze' AND NEW.status = 'pending' THEN
    PERFORM
      extensions.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/analyze-location',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
        ),
        body := jsonb_build_object(
          'record', row_to_json(NEW)
        )::text
      );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. 트리거 적용
DROP TRIGGER IF EXISTS trg_location_analyze_webhook ON public.tasks;
CREATE TRIGGER trg_location_analyze_webhook
AFTER INSERT ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.trg_on_location_analyze_task();
