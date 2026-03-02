-- ============================================================
-- RealEstate AI OS - 초기 스키마
-- Migration: 001_initial_schema.sql
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- 1. organizations (테넌트/중개사무소)
-- ============================================================
CREATE TABLE organizations (
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

COMMENT ON TABLE organizations IS '중개사무소(테넌트) 정보. 멀티테넌시 최상위 단위.';
COMMENT ON COLUMN organizations.plan_type IS '요금제: free(월20건)/pro(월100건)/premium(무제한)';

CREATE INDEX idx_organizations_plan_type ON organizations(plan_type);

-- ============================================================
-- 2. users (Supabase Auth 연동)
-- ============================================================
CREATE TABLE users (
    id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email       text NOT NULL,
    full_name   text,
    avatar_url  text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE users IS 'Supabase Auth 연동 사용자 프로필';

CREATE INDEX idx_users_email ON users(email);

-- ============================================================
-- 3. memberships (조직-유저 다대다)
-- ============================================================
CREATE TABLE memberships (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role        text NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
    invited_at  timestamptz NOT NULL DEFAULT now(),
    joined_at   timestamptz,
    UNIQUE (org_id, user_id)
);

COMMENT ON TABLE memberships IS '조직-사용자 다대다. 역할 기반 접근제어.';

CREATE INDEX idx_memberships_org_id ON memberships(org_id);
CREATE INDEX idx_memberships_user_id ON memberships(user_id);
CREATE INDEX idx_memberships_user_org ON memberships(user_id, org_id);

-- ============================================================
-- 4. projects (매물 프로젝트)
-- ============================================================
CREATE TABLE projects (
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

COMMENT ON TABLE projects IS '매물 프로젝트. 모든 매물 정보의 루트 엔티티.';

CREATE INDEX idx_projects_org_id ON projects(org_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_org_status ON projects(org_id, status);
CREATE INDEX idx_projects_created_at ON projects(created_at DESC);
CREATE INDEX idx_projects_address_gin ON projects USING gin(to_tsvector('simple', address));

-- ============================================================
-- 5. assets (파일 자산)
-- ============================================================
CREATE TABLE assets (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    type        text NOT NULL CHECK (type IN ('image', 'video', 'document', 'card_news')),
    category    text, -- 거실/주방/방/욕실/외관/뷰/주차
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

COMMENT ON COLUMN assets.alt_text IS 'SEO 이미지 대체 텍스트';

CREATE INDEX idx_assets_project_id ON assets(project_id);
CREATE INDEX idx_assets_org_id ON assets(org_id);
CREATE INDEX idx_assets_project_type ON assets(project_id, type);
CREATE INDEX idx_assets_is_cover ON assets(project_id, is_cover) WHERE is_cover = true;

-- ============================================================
-- 6. generated_contents (AI 생성 콘텐츠)
-- ============================================================
CREATE TABLE generated_contents (
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

COMMENT ON COLUMN generated_contents.seo_score IS 'SEO 점수: {keyword_in_title, min_length, has_faq, total_score}';

CREATE INDEX idx_generated_contents_project_id ON generated_contents(project_id);
CREATE INDEX idx_generated_contents_org_type ON generated_contents(org_id, type);

-- ============================================================
-- 7. location_analyses (입지 분석)
-- ============================================================
CREATE TABLE location_analyses (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    advantages          text[],
    recommended_targets jsonb,
    nearby_facilities   jsonb,
    analysis_text       text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE(project_id)
);

CREATE INDEX idx_location_analyses_project_id ON location_analyses(project_id);

-- ============================================================
-- 8. documents (서류 & AI 분석)
-- ============================================================
CREATE TABLE documents (
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

CREATE INDEX idx_documents_project_id ON documents(project_id);
CREATE INDEX idx_documents_org_id ON documents(org_id);

-- ============================================================
-- 9. tasks (에이전트 작업 큐)
-- ============================================================
CREATE TABLE tasks (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id    uuid REFERENCES projects(id) ON DELETE SET NULL,
    type          text NOT NULL CHECK (type IN (
                      'naver_upload', 'youtube_upload', 'building_register',
                      'seumteo_api', 'video_render', 'pdf_merge'
                  )),
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
    scheduled_at  timestamptz NOT NULL DEFAULT now(),
    started_at    timestamptz,
    completed_at  timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_org_id ON tasks(org_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_pending_scheduled ON tasks(scheduled_at ASC)
    WHERE status IN ('pending', 'retrying');

-- ============================================================
-- 10. task_logs (작업 로그)
-- ============================================================
CREATE TABLE task_logs (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id     uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    level       text NOT NULL CHECK (level IN ('info', 'warn', 'error')),
    message     text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_logs_task_id ON task_logs(task_id);

-- ============================================================
-- 11. usage_logs (월별 사용량)
-- ============================================================
CREATE TABLE usage_logs (
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

CREATE INDEX idx_usage_logs_org_id ON usage_logs(org_id);
CREATE INDEX idx_usage_logs_org_year_month ON usage_logs(org_id, year DESC, month DESC);

-- ============================================================
-- 12. templates (콘텐츠 템플릿)
-- ============================================================
CREATE TABLE templates (
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

COMMENT ON COLUMN templates.org_id IS 'NULL이면 시스템 전체 공유 템플릿';

CREATE INDEX idx_templates_org_id ON templates(org_id);
CREATE INDEX idx_templates_public ON templates(is_public, type) WHERE is_public = true;

-- ============================================================
-- 13. agent_connections (로컬 에이전트)
-- ============================================================
CREATE TABLE agent_connections (
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

CREATE INDEX idx_agent_connections_org_id ON agent_connections(org_id);
CREATE INDEX idx_agent_connections_status ON agent_connections(status);
