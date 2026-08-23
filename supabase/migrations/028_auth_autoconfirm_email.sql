-- ============================================================
-- Migration: 028_auth_autoconfirm_email.sql
-- A안: 이메일 인증 없이 즉시 가입 완료
-- (Supabase 대시보드 Authentication > Email > "Confirm email" OFF 와 동일 효과)
--
-- 신규 auth.users INSERT 시 email_confirmed_at을 즉시 설정 → 확인 메일 없이 바로 로그인 가능.
-- confirmed_at은 생성컬럼(GENERATED ALWAYS)이므로 email_confirmed_at만 설정한다.
-- ============================================================
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
