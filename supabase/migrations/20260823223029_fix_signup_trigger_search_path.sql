-- ============================================================
-- 이 파일은 운영 DB에 이미 적용된 마이그레이션을 로컬로 복원한 것입니다.
-- 출처: supabase_migrations.schema_migrations 의 version='20260823223029'
--       (name='fix_signup_trigger_search_path') 에 기록된 statements 원문.
--
-- ★ 중요: 현재 운영 회원가입이 정상 동작하는 근거가 이 파일입니다.
--   auth_autoconfirm_email_trigger 를 "의도적으로" 재도입한 최종 결정이므로,
--   029_security_queue_hardening.sql 이 이 트리거를 DROP 하면 회원가입이 깨집니다.
--   (그 DROP 2줄은 029에서 제거했습니다 — supabase/migrations/README.md 참고)
-- ============================================================
-- 회원가입 실패("Database error saving new user") 근본 수정:
-- 트리거 함수가 테이블을 스키마 없이 참조 → GoTrue(supabase_auth_admin) 실행 시
-- search_path 때문에 public.users가 아닌 auth.users로 해석되어 INSERT 실패.
-- 해결: search_path 고정(public) + 모든 테이블 스키마 명시.
CREATE OR REPLACE FUNCTION public.trigger_create_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id uuid;
    v_display_name text;
BEGIN
    INSERT INTO public.users (id, email, full_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')
    )
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        avatar_url = EXCLUDED.avatar_url;

    IF EXISTS (SELECT 1 FROM public.memberships WHERE user_id = NEW.id LIMIT 1) THEN
        RETURN NEW;
    END IF;

    v_display_name := COALESCE(
        NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
        split_part(NEW.email, '@', 1)
    );

    INSERT INTO public.organizations (name, plan_type)
    VALUES (v_display_name || '의 중개사무소', 'free')
    RETURNING id INTO v_org_id;

    INSERT INTO public.memberships (org_id, user_id, role, joined_at)
    VALUES (v_org_id, NEW.id, 'owner', now());

    RETURN NEW;
END;
$$;

-- A안 자동확인 트리거 복구 (앞서 격리 테스트로 제거했던 것)
CREATE OR REPLACE FUNCTION public.auth_autoconfirm_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NULL THEN
    NEW.email_confirmed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auth_autoconfirm_email_trigger ON auth.users;
CREATE TRIGGER auth_autoconfirm_email_trigger
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.auth_autoconfirm_email();
