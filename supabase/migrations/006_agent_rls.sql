-- ============================================================
-- Migration: 006_agent_rls.sql
-- Agent RLS policies: agent_key 기반 인증 (JWT 없이)
-- ============================================================

ALTER TABLE agent_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_read_tasks" ON tasks;
DROP POLICY IF EXISTS "agent_update_tasks" ON tasks;
DROP POLICY IF EXISTS "agent_read_own_connection" ON agent_connections;
DROP POLICY IF EXISTS "agent_update_own_heartbeat" ON agent_connections;

-- 에이전트는 x-agent-key 헤더로 자신의 조직 작업을 조회/수정 가능
CREATE POLICY "agent_read_tasks" ON tasks
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM agent_connections
      WHERE agent_key = current_setting('request.headers', true)::json->>'x-agent-key'
    )
  );

CREATE POLICY "agent_update_tasks" ON tasks
  FOR UPDATE
  USING (
    org_id IN (
      SELECT org_id FROM agent_connections
      WHERE agent_key = current_setting('request.headers', true)::json->>'x-agent-key'
    )
  );

CREATE POLICY "agent_read_own_connection" ON agent_connections
  FOR SELECT
  USING (
    agent_key = current_setting('request.headers', true)::json->>'x-agent-key'
  );

CREATE POLICY "agent_update_own_heartbeat" ON agent_connections
  FOR UPDATE
  USING (
    agent_key = current_setting('request.headers', true)::json->>'x-agent-key'
  );

-- anon 키 + x-agent-key 헤더 조합으로 접근 허용
GRANT SELECT ON agent_connections TO anon;
GRANT SELECT, UPDATE ON tasks TO anon;
