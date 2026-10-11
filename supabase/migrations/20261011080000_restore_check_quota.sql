-- check_quota 복구
--
-- 장애: 쇼츠·블로그·카드뉴스 생성에서 '사용량 한도를 확인할 수 없습니다' 가 발생했다.
-- 원인: 003_functions.sql 에는 check_quota 정의가 있으나, 실제 운영 DB를 세운
--       000_full_setup.sql 에는 빠져 있었다. 함수가 없으니 RPC 호출이 실패하고,
--       쿼터는 fail-closed(판정 불가 시 차단) 설계라 생성 요청이 전부 막혔다.
--
-- 확인 사실(운영 DB 실측):
--   - usage_logs 컬럼: project_count, generation_count, token_usage,
--     video_render_count, doc_download_count  → 아래 정의와 일치
--   - organizations.plan_type 존재
--   - increment_usage, get_org_usage 는 이미 존재. check_quota 만 없었다
--
-- 정의 자체는 003_functions.sql 과 동일하게 유지한다. 한도 수치를 바꾸면
-- 과금 경계가 달라지므로 이번 복구에서는 건드리지 않는다.
--
-- 추가: SECURITY DEFINER 함수는 search_path 를 고정해야 한다.
-- 029_security_queue_hardening.sql 의 관례(pg_catalog, public)를 따른다.

CREATE OR REPLACE FUNCTION public.check_quota(
    p_org_id uuid,
    p_type   text DEFAULT 'project'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_org               organizations%ROWTYPE;
    v_year              integer := EXTRACT(YEAR FROM now())::integer;
    v_month             integer := EXTRACT(MONTH FROM now())::integer;
    v_usage             usage_logs%ROWTYPE;
    v_limit             integer;
    v_current           integer;
    v_plan_limits       jsonb;
BEGIN
    SELECT * INTO v_org FROM organizations WHERE id = p_org_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Organization not found: %', p_org_id; END IF;

    v_plan_limits := CASE v_org.plan_type
        WHEN 'free'    THEN '{"project":20,"generation":50,"token":500000,"video_render":5,"doc_download":20}'::jsonb
        WHEN 'pro'     THEN '{"project":100,"generation":500,"token":5000000,"video_render":50,"doc_download":200}'::jsonb
        WHEN 'premium' THEN '{"project":-1,"generation":-1,"token":-1,"video_render":-1,"doc_download":-1}'::jsonb
        ELSE '{"project":0,"generation":0,"token":0,"video_render":0,"doc_download":0}'::jsonb
    END;

    SELECT * INTO v_usage FROM usage_logs
    WHERE org_id = p_org_id AND year = v_year AND month = v_month;

    v_limit := (v_plan_limits ->> p_type)::integer;
    v_current := CASE p_type
        WHEN 'project'      THEN COALESCE(v_usage.project_count, 0)
        WHEN 'generation'   THEN COALESCE(v_usage.generation_count, 0)
        WHEN 'token'        THEN COALESCE(v_usage.token_usage, 0)::integer
        WHEN 'video_render' THEN COALESCE(v_usage.video_render_count, 0)
        WHEN 'doc_download' THEN COALESCE(v_usage.doc_download_count, 0)
        ELSE 0
    END;

    RETURN jsonb_build_object(
        'org_id',     p_org_id,
        'plan_type',  v_org.plan_type,
        'type',       p_type,
        'current',    v_current,
        'limit',      v_limit,
        'exceeded',   CASE WHEN v_limit = -1 THEN false ELSE v_current >= v_limit END,
        'remaining',  CASE WHEN v_limit = -1 THEN -1 ELSE GREATEST(0, v_limit - v_current) END
    );
END;
$$;

-- 엣지 함수는 사용자 JWT 로 호출한다. 호출 권한을 명시한다.
-- PUBLIC 기본 EXECUTE 를 먼저 회수한다. SECURITY DEFINER 함수를 비로그인(anon)이
-- 호출할 수 있으면 조직 쿼터 현황이 외부에 노출된다.
REVOKE ALL ON FUNCTION public.check_quota(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_quota(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_quota(uuid, text) TO authenticated, service_role;
