-- ============================================================
-- Migration: 029_security_queue_hardening.sql
-- 테넌트 권한 상승 차단, RPC 권한 고정, 작업 상태 표준화
-- ============================================================

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 운영에서 이메일 소유권 확인을 우회하던 트리거를 제거합니다.
DROP TRIGGER IF EXISTS auth_autoconfirm_email_trigger ON auth.users;
DROP FUNCTION IF EXISTS public.auth_autoconfirm_email();

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

-- 큐 상태는 queued를 단일 대기 상태로 사용
UPDATE public.tasks SET status = 'queued' WHERE status = 'pending';
ALTER TABLE public.tasks ALTER COLUMN status SET DEFAULT 'queued';
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check CHECK (
  status IN ('queued', 'running', 'success', 'failed', 'retrying', 'cancelled')
);

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
UPDATE public.agent_connections
SET agent_key = 'revoked_' || encode(extensions.gen_random_bytes(32), 'hex'),
    status = 'offline',
    updated_at = now()
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
BEGIN;
  IF auth.uid() IS NULL OR NOT public.is_org_admin(p_org_id) THEN
    RAISE EXCEPTION '조직 관리자만 에이전트 키를 발급할 수 있습니다';
  END IF;

  new_key := 'rak_' || encode(extensions.gen_random_bytes(32), 'hex');

  UPDATE public.agent_connections
  SET agent_key = new_key, updated_at = now()
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
