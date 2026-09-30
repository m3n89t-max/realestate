-- ============================================================
-- 이 파일은 운영 DB에 이미 적용된 마이그레이션을 로컬로 복원한 것입니다.
-- 출처: supabase_migrations.schema_migrations 의 version='20260823222430'
--       (name='auth_autoconfirm_email_on_signup') 에 기록된 statements 원문.
-- 028_auth_autoconfirm_email.sql 의 후속이며, 회원가입 이메일 자동확인을
-- 담당하는 트리거를 운영에 도입한 것이 이 마이그레이션입니다.
-- ============================================================
-- A안: 이메일 인증 없이 즉시 가입 완료 (대시보드 "Confirm email" OFF와 동일 효과)
-- 신규 auth.users INSERT 시 email_confirmed_at을 즉시 설정 → 바로 로그인 가능.
-- confirmed_at은 생성컬럼이므로 email_confirmed_at만 설정한다.
CREATE OR REPLACE FUNCTION public.auth_autoconfirm_email()
RETURNS trigger AS $$
BEGIN
  IF NEW.email_confirmed_at IS NULL THEN
    NEW.email_confirmed_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS auth_autoconfirm_email_trigger ON auth.users;
CREATE TRIGGER auth_autoconfirm_email_trigger
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.auth_autoconfirm_email();
