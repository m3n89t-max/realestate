-- ============================================================
-- Migration: 029_security_queue_hardening.sql
-- 테넌트 권한 상승 차단, RPC 권한 고정, 작업 상태 표준화
-- ============================================================
--
-- ★ 2026-09-30 안전성 정리 (운영 사고 예방)
-- 이 파일은 운영 DB에 적용되지 않은 상태로 오래 남아 있었고, 그동안 운영에는
-- 더 나중의 결정들이 들어갔다. 그래서 원본 그대로 `supabase db push` 하면
-- 운영 회원가입이 깨지고 중간 실패 상태가 남았다. 아래 3가지를 수정했다.
--
--  1) auth_autoconfirm_email 트리거/함수 DROP 2줄 제거
--     → 후속 마이그레이션 20260823222430(auth_autoconfirm_email_on_signup) 과
--       20260823223029(fix_signup_trigger_search_path) 가 이 트리거를 "의도적으로"
--       재도입했다. 029가 되돌리면 신규 회원가입 이메일 자동확인이 사라져
--       가입 직후 로그인이 막힌다. 029는 그 결정보다 앞선 시점의 의도이므로 폐기한다.
--
--  2) tasks status 를 pending → queued 로 바꾸는 4줄 제거
--     → 이미 007_schema_fixes.sql 이 같은 변경을 담당한다(007:23-32). 007은 운영에
--       기록돼 있으나 실제로는 반영되지 않아 운영 DB가 여전히 'pending' 이다.
--       즉 이것은 029가 아니라 007의 미반영 문제이며, 앱 코드는 이미 전부 'queued'를
--       쓰고 있어 별도 수정 마이그레이션으로 다뤄야 한다(README.md 참고).
--       029에 섞어두면 "보안 강화"와 "큐 상태 정정"이 한 파일에서 동시에 터진다.
--
--  3) generate_agent_key 의 `BEGIN;` → `BEGIN` 문법 오류 수정
--     → plpgsql 블록의 BEGIN 에 세미콜론을 붙이면 함수 생성이 실패하고,
--       그 앞까지만 적용된 중간 상태가 남는다.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- [제거됨] 이메일 자동확인 트리거 DROP
--   원본 029는 아래 2줄을 실행했다.
--     DROP TRIGGER IF EXISTS auth_autoconfirm_email_trigger ON auth.users;
--     DROP FUNCTION IF EXISTS public.auth_autoconfirm_email();
--   후속 20260823222430 / 20260823223029 가 이 트리거를 다시 만든 것이 현재 운영의
--   정식 동작이다. 되돌리면 회원가입이 깨지므로 실행하지 않는다.
--   이메일 소유권 확인을 다시 켜야 한다면 별도 마이그레이션 + 앱 가입 플로우 수정으로
--   진행해야 한다.

-- 일반 사용자가 자신의 membership role을 바꾸지 못하도록 관리자만 수정 허용
DROP POLICY IF EXISTS "memberships_update" ON public.memberships;
CREATE POLICY "memberships_update" ON public.memberships
FOR UPDATE
USING (public.is_org_admin(org_id))
WITH CHECK (public.is_org_admin(org_id));

-- 탈퇴는 본인 또는 관리자에게 허용하되 다른 조직/사용자로 행을 바꾸는 UPDATE와 분리
DROP POLICY IF EXISTS "memberships_delete" ON public.memberships;
CREATE POLICY "memberships_delete" ON public.memberships
FOR DELETE
USING (public.is_org_admin(org_id) OR user_id = auth.uid());

-- [제거됨] tasks status pending → queued 전환
--   원본 029는 아래를 실행했다.
--     UPDATE public.tasks SET status = 'queued' WHERE status = 'pending';
--     ALTER TABLE public.tasks ALTER COLUMN status SET DEFAULT 'queued';
--     ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
--     ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check CHECK (...);
--   이 변경 자체는 앱 코드와 맞는 방향이다(코드는 전부 'queued' 사용).
--   그러나 원래 담당은 007_schema_fixes.sql 이고, 이 파일은 보안 강화 마이그레이션이다.
--   한 파일에서 데이터 UPDATE 와 보안 정책 변경을 같이 하면 실패 시 원인 추적이 어렵다.
--   007 미반영 문제는 전용 마이그레이션으로 분리한다(README.md 참고).

-- 기존 불일치 작업은 실행되지 않도록 실패 상태로 격리합니다.
UPDATE public.tasks t
SET status = 'failed',
    error_code = 'ORG_PROJECT_MISMATCH',
    error_message = '작업과 프로젝트의 조직이 일치하지 않아 격리되었습니다',
    completed_at = now()
WHERE t.project_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = t.project_id AND p.org_id = t.org_id
  );

-- task.org_id와 연결 project.org_id가 항상 일치하도록 DB에서 강제합니다.
CREATE OR REPLACE FUNCTION public.enforce_task_project_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.project_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = NEW.project_id AND p.org_id = NEW.org_id
  ) THEN
    RAISE EXCEPTION '작업과 프로젝트의 조직이 일치하지 않습니다';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_task_project_org() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_enforce_task_project_org ON public.tasks;
CREATE TRIGGER trg_enforce_task_project_org
BEFORE INSERT OR UPDATE OF org_id, project_id ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.enforce_task_project_org();

DROP POLICY IF EXISTS "tasks_insert" ON public.tasks;
CREATE POLICY "tasks_insert" ON public.tasks
FOR INSERT WITH CHECK (
  public.can_write_to_org(org_id)
  AND (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = tasks.project_id AND p.org_id = tasks.org_id
    )
  )
);

DROP POLICY IF EXISTS "tasks_update" ON public.tasks;
CREATE POLICY "tasks_update" ON public.tasks
FOR UPDATE
USING (public.can_write_to_org(org_id))
WITH CHECK (
  public.can_write_to_org(org_id)
  AND (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = tasks.project_id AND p.org_id = tasks.org_id
    )
  )
);

-- 004 시드가 이미 적용된 환경에서도 공개된 개발 키만 즉시 폐기합니다.
-- (2026-09-30 수정: 원본은 updated_at = now() 도 설정했으나 agent_connections 에는
--  updated_at 컬럼이 존재한 적이 없다 — 001_initial_schema.sql:290-300 은 last_seen_at /
--  created_at 만 정의한다. 운영 실측에서도 없어 42703 으로 실패했다. 해당 대입을 제거한다.)
UPDATE public.agent_connections
SET agent_key = 'revoked_' || encode(extensions.gen_random_bytes(32), 'hex'),
    status = 'offline'
WHERE id = 'c0000000-0000-0000-0000-000000000001'
  AND encode(extensions.digest(agent_key, 'sha256'), 'hex') = 'f85a8a02f6768e2211c9b7c1b9944b115b6fc05901be6f0b660ebfc65c29a7b6';

-- 과거 010 migration이 이미 적용된 운영 DB에도 queued 조건을 반영합니다.
CREATE OR REPLACE FUNCTION public.trg_on_location_analyze_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.type = 'location_analyze' AND NEW.status = 'queued' THEN
    PERFORM extensions.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/analyze-location',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := jsonb_build_object('record', row_to_json(NEW))::text
    );
  END IF;
  RETURN NEW;
END;
$$;

-- 에이전트 키 생성은 해당 조직 관리자만 실행 가능
CREATE OR REPLACE FUNCTION public.generate_agent_key(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  new_key text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_org_admin(p_org_id) THEN
    RAISE EXCEPTION '조직 관리자만 에이전트 키를 발급할 수 있습니다';
  END IF;

  new_key := 'rak_' || encode(extensions.gen_random_bytes(32), 'hex');

  -- (2026-09-30 수정: agent_connections 에 updated_at 컬럼이 없다. 위 주석 참고.)
  UPDATE public.agent_connections
  SET agent_key = new_key
  WHERE org_id = p_org_id;

  IF NOT FOUND THEN
    INSERT INTO public.agent_connections (org_id, agent_key, status)
    VALUES (p_org_id, new_key, 'offline');
  END IF;

  RETURN new_key;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_agent_key(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_agent_key(uuid) TO authenticated;

-- 기존 SECURITY DEFINER RLS helper의 객체 탐색 경로 고정
ALTER FUNCTION public.get_user_role(uuid) SET search_path = pg_catalog, public;
ALTER FUNCTION public.is_org_member(uuid) SET search_path = pg_catalog, public;
ALTER FUNCTION public.can_write_to_org(uuid) SET search_path = pg_catalog, public;
ALTER FUNCTION public.is_org_admin(uuid) SET search_path = pg_catalog, public;
