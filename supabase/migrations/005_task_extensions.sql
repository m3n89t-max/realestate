-- ============================================================
-- Migration: 005_task_extensions.sql
-- Task table extensions: progress_pct, new task types, watchdog, agent key gen
-- ============================================================

-- Add progress_pct to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS progress_pct INTEGER DEFAULT 0
  CHECK (progress_pct BETWEEN 0 AND 100);

-- Add updated_at to tasks if missing
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tasks_updated_at ON tasks;
CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_tasks_updated_at();

-- Extend task type constraint to include new types
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_type_check;

ALTER TABLE tasks ADD CONSTRAINT tasks_type_check CHECK (type IN (
  'naver_upload',
  'youtube_upload',
  'building_register',
  'seumteo_api',
  'video_render',
  'pdf_merge',
  'normalize_parcel',
  'location_analyze',
  'download_building_register',
  'download_cadastral_map',
  'summarize_documents',
  'generate_blog',
  'generate_cards_instagram',
  'generate_cards_kakao',
  'generate_shorts_script',
  'render_shorts_video',
  'upload_naver_blog',
  'upload_youtube'
));

-- Watchdog: 10분 이상 running 상태인 작업을 failed로 처리
CREATE OR REPLACE FUNCTION reset_stale_tasks()
RETURNS INTEGER AS $$
DECLARE affected INTEGER;
BEGIN
  UPDATE tasks
  SET status = 'failed',
      error_message = 'Task timed out after 10 minutes',
      updated_at = NOW()
  WHERE status = 'running'
    AND updated_at < NOW() - INTERVAL '10 minutes';
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$ LANGUAGE plpgsql;

-- Agent key generation RPC
CREATE OR REPLACE FUNCTION generate_agent_key(p_org_id UUID)
RETURNS TEXT AS $$
DECLARE
  new_key TEXT;
BEGIN
  new_key := 'rak_' || encode(gen_random_bytes(32), 'hex');
  UPDATE agent_connections
  SET agent_key = new_key, updated_at = NOW()
  WHERE org_id = p_org_id;
  IF NOT FOUND THEN
    INSERT INTO agent_connections (org_id, agent_key, status)
    VALUES (p_org_id, new_key, 'offline');
  END IF;
  RETURN new_key;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- agent_connections에 updated_at 추가
ALTER TABLE agent_connections ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 인덱스: watchdog 쿼리 최적화
CREATE INDEX IF NOT EXISTS idx_tasks_running_updated ON tasks(updated_at)
  WHERE status = 'running';
