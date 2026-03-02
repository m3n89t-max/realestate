-- ============================================================
-- RealEstate AI OS - RLS 정책
-- Migration: 002_rls_policies.sql
-- ============================================================

-- Helper Functions
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

-- RLS 활성화
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

-- organizations
CREATE POLICY "org_select" ON organizations FOR SELECT USING (is_org_member(id));
CREATE POLICY "org_insert" ON organizations FOR INSERT WITH CHECK (true);
CREATE POLICY "org_update" ON organizations FOR UPDATE USING (is_org_admin(id));
CREATE POLICY "org_delete" ON organizations FOR DELETE USING (get_user_role(id) = 'owner');

-- users
CREATE POLICY "users_select" ON users FOR SELECT
    USING (
        id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM memberships m1
            JOIN memberships m2 ON m1.org_id = m2.org_id
            WHERE m1.user_id = auth.uid() AND m2.user_id = users.id
              AND m1.joined_at IS NOT NULL AND m2.joined_at IS NOT NULL
        )
    );
CREATE POLICY "users_insert" ON users FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "users_update" ON users FOR UPDATE USING (id = auth.uid());
CREATE POLICY "users_delete" ON users FOR DELETE USING (id = auth.uid());

-- memberships
CREATE POLICY "memberships_select" ON memberships FOR SELECT
    USING (is_org_member(org_id) OR user_id = auth.uid());
CREATE POLICY "memberships_insert" ON memberships FOR INSERT WITH CHECK (is_org_admin(org_id));
CREATE POLICY "memberships_update" ON memberships FOR UPDATE
    USING (is_org_admin(org_id) OR user_id = auth.uid());
CREATE POLICY "memberships_delete" ON memberships FOR DELETE
    USING (is_org_admin(org_id) OR user_id = auth.uid());

-- projects
CREATE POLICY "projects_select" ON projects FOR SELECT USING (is_org_member(org_id));
CREATE POLICY "projects_insert" ON projects FOR INSERT WITH CHECK (can_write_to_org(org_id));
CREATE POLICY "projects_update" ON projects FOR UPDATE USING (can_write_to_org(org_id));
CREATE POLICY "projects_delete" ON projects FOR DELETE USING (is_org_admin(org_id));

-- assets
CREATE POLICY "assets_select" ON assets FOR SELECT USING (is_org_member(org_id));
CREATE POLICY "assets_insert" ON assets FOR INSERT WITH CHECK (can_write_to_org(org_id));
CREATE POLICY "assets_update" ON assets FOR UPDATE USING (can_write_to_org(org_id));
CREATE POLICY "assets_delete" ON assets FOR DELETE USING (can_write_to_org(org_id));

-- generated_contents
CREATE POLICY "gc_select" ON generated_contents FOR SELECT USING (is_org_member(org_id));
CREATE POLICY "gc_insert" ON generated_contents FOR INSERT WITH CHECK (can_write_to_org(org_id));
CREATE POLICY "gc_update" ON generated_contents FOR UPDATE USING (can_write_to_org(org_id));
CREATE POLICY "gc_delete" ON generated_contents FOR DELETE USING (is_org_admin(org_id));

-- location_analyses
CREATE POLICY "la_select" ON location_analyses FOR SELECT
    USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND is_org_member(p.org_id)));
CREATE POLICY "la_insert" ON location_analyses FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND can_write_to_org(p.org_id)));
CREATE POLICY "la_update" ON location_analyses FOR UPDATE
    USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND can_write_to_org(p.org_id)));

-- documents
CREATE POLICY "docs_select" ON documents FOR SELECT USING (is_org_member(org_id));
CREATE POLICY "docs_insert" ON documents FOR INSERT WITH CHECK (can_write_to_org(org_id));
CREATE POLICY "docs_update" ON documents FOR UPDATE USING (can_write_to_org(org_id));
CREATE POLICY "docs_delete" ON documents FOR DELETE USING (is_org_admin(org_id));

-- tasks
CREATE POLICY "tasks_select" ON tasks FOR SELECT USING (is_org_member(org_id));
CREATE POLICY "tasks_insert" ON tasks FOR INSERT WITH CHECK (can_write_to_org(org_id));
CREATE POLICY "tasks_update" ON tasks FOR UPDATE USING (can_write_to_org(org_id));
CREATE POLICY "tasks_delete" ON tasks FOR DELETE USING (is_org_admin(org_id));

-- task_logs
CREATE POLICY "tl_select" ON task_logs FOR SELECT
    USING (EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND is_org_member(t.org_id)));
CREATE POLICY "tl_insert" ON task_logs FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND can_write_to_org(t.org_id)));
CREATE POLICY "tl_delete" ON task_logs FOR DELETE
    USING (EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND is_org_admin(t.org_id)));

-- usage_logs
CREATE POLICY "ul_select" ON usage_logs FOR SELECT USING (is_org_member(org_id));
CREATE POLICY "ul_insert" ON usage_logs FOR INSERT WITH CHECK (is_org_admin(org_id));
CREATE POLICY "ul_update" ON usage_logs FOR UPDATE USING (is_org_admin(org_id));

-- templates
CREATE POLICY "tmpl_select" ON templates FOR SELECT
    USING (org_id IS NULL OR is_public = true OR is_org_member(org_id));
CREATE POLICY "tmpl_insert" ON templates FOR INSERT
    WITH CHECK (org_id IS NOT NULL AND can_write_to_org(org_id));
CREATE POLICY "tmpl_update" ON templates FOR UPDATE
    USING (org_id IS NOT NULL AND is_org_admin(org_id));
CREATE POLICY "tmpl_delete" ON templates FOR DELETE
    USING (org_id IS NOT NULL AND get_user_role(org_id) = 'owner');

-- agent_connections
CREATE POLICY "agent_select" ON agent_connections FOR SELECT USING (is_org_admin(org_id));
CREATE POLICY "agent_insert" ON agent_connections FOR INSERT WITH CHECK (is_org_admin(org_id));
CREATE POLICY "agent_update" ON agent_connections FOR UPDATE USING (is_org_admin(org_id));
CREATE POLICY "agent_delete" ON agent_connections FOR DELETE USING (get_user_role(org_id) = 'owner');
