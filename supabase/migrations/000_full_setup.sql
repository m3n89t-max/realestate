-- ============================================================
-- RealEstate AI OS - 전체 DB 셋업 (001 + 002 + 003 + 008 합본)
-- SQL Editor에 전체 붙여넣고 Run 하세요
-- ============================================================

-- ============================================================
-- [001] 테이블 생성
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

CREATE TABLE IF NOT EXISTS organizations (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                  text NOT NULL,
    logo_url              text,
    phone                 text,
    address               text,
    business_number       text,
    plan_type             text NOT NULL DEFAULT 'free'
                            CHECK (plan_type IN ('free', 'pro', 'premium')),
    plan_expires_at       timestamptz,
    monthly_project_limit integer NOT NULL DEFAULT 20,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
    id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email       text NOT NULL,
    full_name   text,
    avatar_url  text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memberships (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role        text NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
    invited_at  timestamptz NOT NULL DEFAULT now(),
    joined_at   timestamptz,
    UNIQUE (org_id, user_id)
);

CREATE TABLE IF NOT EXISTS projects (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by       uuid REFERENCES users(id) ON DELETE SET NULL,
    address          text NOT NULL,
    jibun_address    text,
    lat              decimal(10, 7),
    lng              decimal(10, 7),
    property_type    text CHECK (property_type IN (
                         'apartment', 'officetel', 'villa',
                         'commercial', 'land', 'house'
                     )),
    price            bigint,
    monthly_rent     bigint,
    area             decimal(8, 2),
    floor            integer,
    total_floors     integer,
    direction        text,
    features         text[],
    status           text NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft', 'active', 'completed', 'archived')),
    cover_image_url  text,
    note             text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assets (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    type        text NOT NULL CHECK (type IN ('image', 'video', 'document', 'card_news')),
    category    text,
    file_name   text,
    file_url    text NOT NULL,
    file_size   bigint,
    mime_type   text,
    width       integer,
    height      integer,
    alt_text    text,
    is_cover    boolean NOT NULL DEFAULT false,
    sort_order  integer NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS generated_contents (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id       uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    org_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    type             text NOT NULL CHECK (type IN (
                         'blog', 'card_news', 'video_script',
                         'location_analysis', 'doc_summary'
                     )),
    title            text,
    content          text NOT NULL,
    meta_description text,
    tags             text[],
    seo_score        jsonb,
    faq              jsonb,
    version          integer NOT NULL DEFAULT 1,
    is_published     boolean NOT NULL DEFAULT false,
    published_url    text,
    template_id      uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS location_analyses (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    advantages          text[],
    recommended_targets jsonb,
    nearby_facilities   jsonb,
    analysis_text       text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE(project_id)
);

CREATE TABLE IF NOT EXISTS documents (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    type        text NOT NULL CHECK (type IN (
                    'building_register', 'floor_plan', 'permit_history',
                    'risk_report', 'package_pdf'
                )),
    file_url    text,
    file_name   text,
    raw_text    text,
    summary     jsonb,
    risk_items  jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id    uuid REFERENCES projects(id) ON DELETE SET NULL,
    type          text NOT NULL,
    status        text NOT NULL DEFAULT 'pending'
                      CHECK (status IN (
                          'pending', 'running', 'success',
                          'failed', 'retrying', 'cancelled'
                      )),
    payload       jsonb,
    result        jsonb,
    error_code    text,
    error_message text,
    retry_count   integer NOT NULL DEFAULT 0,
    max_retries   integer NOT NULL DEFAULT 3,
    agent_id      text,
    progress_pct  integer DEFAULT 0,
    scheduled_at  timestamptz NOT NULL DEFAULT now(),
    started_at    timestamptz,
    completed_at  timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS task_logs (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id     uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    level       text NOT NULL CHECK (level IN ('info', 'warn', 'error')),
    message     text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usage_logs (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    year                integer NOT NULL,
    month               integer NOT NULL CHECK (month BETWEEN 1 AND 12),
    project_count       integer NOT NULL DEFAULT 0,
    generation_count    integer NOT NULL DEFAULT 0,
    token_usage         bigint NOT NULL DEFAULT 0,
    video_render_count  integer NOT NULL DEFAULT 0,
    doc_download_count  integer NOT NULL DEFAULT 0,
    UNIQUE (org_id, year, month)
);

CREATE TABLE IF NOT EXISTS templates (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      uuid REFERENCES organizations(id) ON DELETE CASCADE,
    type        text NOT NULL CHECK (type IN ('blog', 'card_news', 'video')),
    name        text NOT NULL,
    description text,
    structure   jsonb,
    variables   text[],
    is_default  boolean NOT NULL DEFAULT false,
    is_public   boolean NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_connections (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    agent_key    text UNIQUE NOT NULL,
    name         text,
    platform     text NOT NULL DEFAULT 'windows',
    version      text,
    status       text NOT NULL DEFAULT 'offline'
                     CHECK (status IN ('online', 'offline', 'busy')),
    last_seen_at timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- [002] RLS 정책
-- ============================================================
CREATE OR REPLACE FUNCTION get_user_role(org uuid)
RETURNS text AS $$
    SELECT role FROM memberships
    WHERE org_id = org AND user_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_org_member(org uuid)
RETURNS boolean AS $$
    SELECT EXISTS (
        SELECT 1 FROM memberships
        WHERE org_id = org AND user_id = auth.uid() AND joined_at IS NOT NULL
    )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION can_write_to_org(org uuid)
RETURNS boolean AS $$
    SELECT EXISTS (
        SELECT 1 FROM memberships
        WHERE org_id = org AND user_id = auth.uid()
          AND joined_at IS NOT NULL
          AND role IN ('owner', 'admin', 'editor')
    )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_org_admin(org uuid)
RETURNS boolean AS $$
    SELECT EXISTS (
        SELECT 1 FROM memberships
        WHERE org_id = org AND user_id = auth.uid()
          AND joined_at IS NOT NULL
          AND role IN ('owner', 'admin')
    )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

ALTER TABLE organizations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships         ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects            ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets              ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_contents  ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_analyses   ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks               ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates           ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_connections   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_select" ON organizations FOR SELECT USING (is_org_member(id));
CREATE POLICY "org_insert" ON organizations FOR INSERT WITH CHECK (true);
CREATE POLICY "org_update" ON organizations FOR UPDATE USING (is_org_admin(id));
CREATE POLICY "org_delete" ON organizations FOR DELETE USING (get_user_role(id) = 'owner');

CREATE POLICY "users_select" ON users FOR SELECT
    USING (id = auth.uid() OR EXISTS (
        SELECT 1 FROM memberships m1
        JOIN memberships m2 ON m1.org_id = m2.org_id
        WHERE m1.user_id = auth.uid() AND m2.user_id = users.id
          AND m1.joined_at IS NOT NULL AND m2.joined_at IS NOT NULL
    ));
CREATE POLICY "users_insert" ON users FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "users_update" ON users FOR UPDATE USING (id = auth.uid());
CREATE POLICY "users_delete" ON users FOR DELETE USING (id = auth.uid());

CREATE POLICY "memberships_select" ON memberships FOR SELECT
    USING (is_org_member(org_id) OR user_id = auth.uid());
CREATE POLICY "memberships_insert" ON memberships FOR INSERT WITH CHECK (true);
CREATE POLICY "memberships_update" ON memberships FOR UPDATE
    USING (is_org_admin(org_id) OR user_id = auth.uid());
CREATE POLICY "memberships_delete" ON memberships FOR DELETE
    USING (is_org_admin(org_id) OR user_id = auth.uid());

CREATE POLICY "projects_select" ON projects FOR SELECT USING (is_org_member(org_id));
CREATE POLICY "projects_insert" ON projects FOR INSERT WITH CHECK (can_write_to_org(org_id));
CREATE POLICY "projects_update" ON projects FOR UPDATE USING (can_write_to_org(org_id));
CREATE POLICY "projects_delete" ON projects FOR DELETE USING (is_org_admin(org_id));

CREATE POLICY "assets_select" ON assets FOR SELECT USING (is_org_member(org_id));
CREATE POLICY "assets_insert" ON assets FOR INSERT WITH CHECK (can_write_to_org(org_id));
CREATE POLICY "assets_update" ON assets FOR UPDATE USING (can_write_to_org(org_id));
CREATE POLICY "assets_delete" ON assets FOR DELETE USING (can_write_to_org(org_id));

CREATE POLICY "gc_select" ON generated_contents FOR SELECT USING (is_org_member(org_id));
CREATE POLICY "gc_insert" ON generated_contents FOR INSERT WITH CHECK (can_write_to_org(org_id));
CREATE POLICY "gc_update" ON generated_contents FOR UPDATE USING (can_write_to_org(org_id));
CREATE POLICY "gc_delete" ON generated_contents FOR DELETE USING (is_org_admin(org_id));

CREATE POLICY "la_select" ON location_analyses FOR SELECT
    USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND is_org_member(p.org_id)));
CREATE POLICY "la_insert" ON location_analyses FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND can_write_to_org(p.org_id)));
CREATE POLICY "la_update" ON location_analyses FOR UPDATE
    USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND can_write_to_org(p.org_id)));

CREATE POLICY "docs_select" ON documents FOR SELECT USING (is_org_member(org_id));
CREATE POLICY "docs_insert" ON documents FOR INSERT WITH CHECK (can_write_to_org(org_id));
CREATE POLICY "docs_update" ON documents FOR UPDATE USING (can_write_to_org(org_id));
CREATE POLICY "docs_delete" ON documents FOR DELETE USING (is_org_admin(org_id));

CREATE POLICY "tasks_select" ON tasks FOR SELECT USING (is_org_member(org_id));
CREATE POLICY "tasks_insert" ON tasks FOR INSERT WITH CHECK (can_write_to_org(org_id));
CREATE POLICY "tasks_update" ON tasks FOR UPDATE USING (can_write_to_org(org_id));
CREATE POLICY "tasks_delete" ON tasks FOR DELETE USING (is_org_admin(org_id));

CREATE POLICY "tl_select" ON task_logs FOR SELECT
    USING (EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND is_org_member(t.org_id)));
CREATE POLICY "tl_insert" ON task_logs FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND can_write_to_org(t.org_id)));
CREATE POLICY "tl_delete" ON task_logs FOR DELETE
    USING (EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND is_org_admin(t.org_id)));

CREATE POLICY "ul_select" ON usage_logs FOR SELECT USING (is_org_member(org_id));
CREATE POLICY "ul_insert" ON usage_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "ul_update" ON usage_logs FOR UPDATE USING (is_org_admin(org_id));

CREATE POLICY "tmpl_select" ON templates FOR SELECT
    USING (org_id IS NULL OR is_public = true OR is_org_member(org_id));
CREATE POLICY "tmpl_insert" ON templates FOR INSERT
    WITH CHECK (org_id IS NOT NULL AND can_write_to_org(org_id));
CREATE POLICY "tmpl_update" ON templates FOR UPDATE
    USING (org_id IS NOT NULL AND is_org_admin(org_id));
CREATE POLICY "tmpl_delete" ON templates FOR DELETE
    USING (org_id IS NOT NULL AND get_user_role(org_id) = 'owner');

CREATE POLICY "agent_select" ON agent_connections FOR SELECT USING (is_org_admin(org_id));
CREATE POLICY "agent_insert" ON agent_connections FOR INSERT WITH CHECK (is_org_admin(org_id));
CREATE POLICY "agent_update" ON agent_connections FOR UPDATE USING (is_org_admin(org_id));
CREATE POLICY "agent_delete" ON agent_connections FOR DELETE USING (get_user_role(org_id) = 'owner');

-- ============================================================
-- [003 + 008] 함수 및 트리거 (신규 유저 org 자동 생성 포함)
-- ============================================================
CREATE OR REPLACE FUNCTION increment_usage(p_org_id uuid, p_type text, p_amount bigint DEFAULT 1)
RETURNS void AS $$
DECLARE
    v_year  integer := EXTRACT(YEAR FROM now())::integer;
    v_month integer := EXTRACT(MONTH FROM now())::integer;
BEGIN
    INSERT INTO usage_logs (org_id, year, month)
    VALUES (p_org_id, v_year, v_month)
    ON CONFLICT (org_id, year, month) DO NOTHING;

    CASE p_type
        WHEN 'project'      THEN UPDATE usage_logs SET project_count = project_count + p_amount WHERE org_id = p_org_id AND year = v_year AND month = v_month;
        WHEN 'generation'   THEN UPDATE usage_logs SET generation_count = generation_count + p_amount WHERE org_id = p_org_id AND year = v_year AND month = v_month;
        WHEN 'token'        THEN UPDATE usage_logs SET token_usage = token_usage + p_amount WHERE org_id = p_org_id AND year = v_year AND month = v_month;
        WHEN 'video_render' THEN UPDATE usage_logs SET video_render_count = video_render_count + p_amount WHERE org_id = p_org_id AND year = v_year AND month = v_month;
        WHEN 'doc_download' THEN UPDATE usage_logs SET doc_download_count = doc_download_count + p_amount WHERE org_id = p_org_id AND year = v_year AND month = v_month;
        ELSE RAISE EXCEPTION 'Unknown usage type: %', p_type;
    END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_org_usage(p_org_id uuid, p_year integer DEFAULT NULL, p_month integer DEFAULT NULL)
RETURNS TABLE (org_id uuid, year integer, month integer, project_count integer,
    generation_count integer, token_usage bigint, video_render_count integer,
    doc_download_count integer, plan_type text, monthly_project_limit integer) AS $$
DECLARE
    v_year  integer := COALESCE(p_year, EXTRACT(YEAR FROM now())::integer);
    v_month integer := COALESCE(p_month, EXTRACT(MONTH FROM now())::integer);
BEGIN
    RETURN QUERY
    SELECT ul.org_id, ul.year, ul.month, ul.project_count, ul.generation_count,
           ul.token_usage, ul.video_render_count, ul.doc_download_count,
           o.plan_type, o.monthly_project_limit
    FROM usage_logs ul JOIN organizations o ON o.id = ul.org_id
    WHERE ul.org_id = p_org_id AND ul.year = v_year AND ul.month = v_month;

    IF NOT FOUND THEN
        RETURN QUERY
        SELECT p_org_id, v_year, v_month, 0::integer, 0::integer, 0::bigint, 0::integer, 0::integer,
               o.plan_type, o.monthly_project_limit
        FROM organizations o WHERE o.id = p_org_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_projects_updated_at ON projects;
CREATE TRIGGER set_projects_updated_at
    BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_generated_contents_updated_at ON generated_contents;
CREATE TRIGGER set_generated_contents_updated_at
    BEFORE UPDATE ON generated_contents FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_organizations_updated_at ON organizations;
CREATE TRIGGER set_organizations_updated_at
    BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE OR REPLACE FUNCTION trigger_project_after_insert()
RETURNS trigger AS $$
BEGIN
    PERFORM increment_usage(NEW.org_id, 'project', 1);
    INSERT INTO location_analyses (project_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_project_created ON projects;
CREATE TRIGGER on_project_created
    AFTER INSERT ON projects FOR EACH ROW EXECUTE FUNCTION trigger_project_after_insert();

-- 신규 유저 가입 시 자동으로 조직 + 멤버십 생성 (008 포함)
CREATE OR REPLACE FUNCTION trigger_create_user_profile()
RETURNS trigger AS $$
DECLARE
    v_org_id uuid;
    v_display_name text;
BEGIN
    INSERT INTO users (id, email, full_name, avatar_url)
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

    IF EXISTS (SELECT 1 FROM memberships WHERE user_id = NEW.id LIMIT 1) THEN
        RETURN NEW;
    END IF;

    v_display_name := COALESCE(
        NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
        split_part(NEW.email, '@', 1)
    );

    INSERT INTO organizations (name, plan_type)
    VALUES (v_display_name || '의 중개사무소', 'free')
    RETURNING id INTO v_org_id;

    INSERT INTO memberships (org_id, user_id, role, joined_at)
    VALUES (v_org_id, NEW.id, 'owner', now());

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION trigger_create_user_profile();

-- 기존 가입 유저 소급 적용
DO $$
DECLARE
    rec RECORD;
    v_org_id uuid;
    v_display_name text;
BEGIN
    FOR rec IN
        SELECT au.id, au.email, au.raw_user_meta_data
        FROM auth.users au
        WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = au.id)
    LOOP
        INSERT INTO users (id, email, full_name, avatar_url)
        VALUES (
            rec.id, rec.email,
            COALESCE(rec.raw_user_meta_data->>'full_name', ''),
            COALESCE(rec.raw_user_meta_data->>'avatar_url', '')
        ) ON CONFLICT DO NOTHING;
    END LOOP;

    FOR rec IN
        SELECT u.id, u.email, u.full_name
        FROM users u
        WHERE NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id)
    LOOP
        v_display_name := COALESCE(NULLIF(rec.full_name, ''), split_part(rec.email, '@', 1));

        INSERT INTO organizations (name, plan_type)
        VALUES (v_display_name || '의 중개사무소', 'free')
        RETURNING id INTO v_org_id;

        INSERT INTO memberships (org_id, user_id, role, joined_at)
        VALUES (v_org_id, rec.id, 'owner', now());

        RAISE NOTICE '조직 생성: % → %', rec.email, v_org_id;
    END LOOP;
END;
$$;
