-- ============================================================
-- RealEstate AI OS - 유틸리티 함수 및 트리거
-- Migration: 003_functions.sql
-- ============================================================

-- 1. increment_usage
CREATE OR REPLACE FUNCTION increment_usage(
    p_org_id  uuid,
    p_type    text,
    p_amount  bigint DEFAULT 1
)
RETURNS void AS $$
DECLARE
    v_year  integer := EXTRACT(YEAR FROM now())::integer;
    v_month integer := EXTRACT(MONTH FROM now())::integer;
BEGIN
    INSERT INTO usage_logs (org_id, year, month)
    VALUES (p_org_id, v_year, v_month)
    ON CONFLICT (org_id, year, month) DO NOTHING;

    CASE p_type
        WHEN 'project' THEN
            UPDATE usage_logs SET project_count = project_count + p_amount
            WHERE org_id = p_org_id AND year = v_year AND month = v_month;
        WHEN 'generation' THEN
            UPDATE usage_logs SET generation_count = generation_count + p_amount
            WHERE org_id = p_org_id AND year = v_year AND month = v_month;
        WHEN 'token' THEN
            UPDATE usage_logs SET token_usage = token_usage + p_amount
            WHERE org_id = p_org_id AND year = v_year AND month = v_month;
        WHEN 'video_render' THEN
            UPDATE usage_logs SET video_render_count = video_render_count + p_amount
            WHERE org_id = p_org_id AND year = v_year AND month = v_month;
        WHEN 'doc_download' THEN
            UPDATE usage_logs SET doc_download_count = doc_download_count + p_amount
            WHERE org_id = p_org_id AND year = v_year AND month = v_month;
        ELSE
            RAISE EXCEPTION 'Unknown usage type: %', p_type;
    END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. get_org_usage
CREATE OR REPLACE FUNCTION get_org_usage(
    p_org_id uuid,
    p_year   integer DEFAULT NULL,
    p_month  integer DEFAULT NULL
)
RETURNS TABLE (
    org_id              uuid,
    year                integer,
    month               integer,
    project_count       integer,
    generation_count    integer,
    token_usage         bigint,
    video_render_count  integer,
    doc_download_count  integer,
    plan_type           text,
    monthly_project_limit integer
) AS $$
DECLARE
    v_year  integer := COALESCE(p_year, EXTRACT(YEAR FROM now())::integer);
    v_month integer := COALESCE(p_month, EXTRACT(MONTH FROM now())::integer);
BEGIN
    RETURN QUERY
    SELECT ul.org_id, ul.year, ul.month,
           ul.project_count, ul.generation_count, ul.token_usage,
           ul.video_render_count, ul.doc_download_count,
           o.plan_type, o.monthly_project_limit
    FROM usage_logs ul
    JOIN organizations o ON o.id = ul.org_id
    WHERE ul.org_id = p_org_id AND ul.year = v_year AND ul.month = v_month;

    IF NOT FOUND THEN
        RETURN QUERY
        SELECT p_org_id, v_year, v_month,
               0::integer, 0::integer, 0::bigint, 0::integer, 0::integer,
               o.plan_type, o.monthly_project_limit
        FROM organizations o WHERE o.id = p_org_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 3. check_quota
CREATE OR REPLACE FUNCTION check_quota(
    p_org_id uuid,
    p_type   text DEFAULT 'project'
)
RETURNS jsonb AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. agent_heartbeat
CREATE OR REPLACE FUNCTION agent_heartbeat(
    p_agent_key text,
    p_status    text DEFAULT 'online',
    p_version   text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
    v_agent agent_connections%ROWTYPE;
BEGIN
    UPDATE agent_connections
    SET status = p_status, last_seen_at = now(),
        version = COALESCE(p_version, version)
    WHERE agent_key = p_agent_key
    RETURNING * INTO v_agent;

    IF NOT FOUND THEN RAISE EXCEPTION 'Agent not found: %', p_agent_key; END IF;

    RETURN jsonb_build_object(
        'agent_id',     v_agent.id,
        'org_id',       v_agent.org_id,
        'status',       v_agent.status,
        'last_seen_at', v_agent.last_seen_at
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. updated_at 자동 트리거
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_projects_updated_at
    BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_generated_contents_updated_at
    BEFORE UPDATE ON generated_contents FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_organizations_updated_at
    BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- 6. 프로젝트 생성 시 자동 초기화 트리거
CREATE OR REPLACE FUNCTION trigger_project_after_insert()
RETURNS trigger AS $$
BEGIN
    -- 사용량 카운터 증가
    PERFORM increment_usage(NEW.org_id, 'project', 1);
    -- 입지분석 행 초기화
    INSERT INTO location_analyses (project_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_project_created
    AFTER INSERT ON projects
    FOR EACH ROW EXECUTE FUNCTION trigger_project_after_insert();

-- 7. Supabase Auth 신규 유저 프로필 자동 생성
CREATE OR REPLACE FUNCTION trigger_create_user_profile()
RETURNS trigger AS $$
BEGIN
    INSERT INTO users (id, email, full_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')
    )
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, avatar_url = EXCLUDED.avatar_url;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION trigger_create_user_profile();
