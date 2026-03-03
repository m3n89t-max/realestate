-- ============================================================
-- Migration: 007_schema_fixes.sql
-- 개발정의서 v3.0 기준 스키마 갭 수정
-- - documents.type: cadastral_map 추가
-- - tasks.status: pending → queued (개발정의서 기준)
-- - generated_contents.type: shorts_script 추가
-- - Storage bucket: project-assets 생성 + RLS
-- ============================================================

-- ============================================================
-- 1. documents.type에 cadastral_map 추가
-- ============================================================
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_type_check;
ALTER TABLE documents ADD CONSTRAINT documents_type_check CHECK (type IN (
    'building_register', 'floor_plan', 'permit_history',
    'risk_report', 'package_pdf', 'cadastral_map'
));

-- ============================================================
-- 2. tasks.status: pending → queued 변경 (개발정의서 v3.0 기준)
-- ============================================================
-- 기존 pending 데이터를 queued로 마이그레이션
UPDATE tasks SET status = 'queued' WHERE status = 'pending';

-- 기존 default 제거 후 새 default 설정
ALTER TABLE tasks ALTER COLUMN status SET DEFAULT 'queued';

-- 제약 조건 교체
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check CHECK (status IN (
    'queued', 'running', 'success', 'failed', 'retrying', 'cancelled'
));

-- pending 기반 인덱스 → queued 기반으로 재생성
DROP INDEX IF EXISTS idx_tasks_pending_scheduled;
CREATE INDEX idx_tasks_queued_scheduled ON tasks(scheduled_at ASC)
    WHERE status IN ('queued', 'retrying');

-- ============================================================
-- 3. generated_contents.type에 shorts_script 추가
-- ============================================================
ALTER TABLE generated_contents DROP CONSTRAINT IF EXISTS generated_contents_type_check;
ALTER TABLE generated_contents ADD CONSTRAINT generated_contents_type_check CHECK (type IN (
    'blog', 'card_news', 'video_script',
    'location_analysis', 'doc_summary', 'shorts_script'
));

-- ============================================================
-- 4. Storage bucket: project-assets
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('project-assets', 'project-assets', false, 104857600)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: org 멤버만 자기 org 파일에 접근
-- 파일 경로 규칙: project-assets/{org_id}/{project_id}/{filename}
CREATE POLICY "org_member_storage_select"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'project-assets'
    AND EXISTS (
        SELECT 1 FROM memberships m
        WHERE m.user_id = auth.uid()
          AND m.joined_at IS NOT NULL
          AND m.org_id::text = (storage.foldername(name))[1]
    )
);

CREATE POLICY "org_writer_storage_insert"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'project-assets'
    AND EXISTS (
        SELECT 1 FROM memberships m
        WHERE m.user_id = auth.uid()
          AND m.joined_at IS NOT NULL
          AND m.role IN ('owner', 'admin', 'editor')
          AND m.org_id::text = (storage.foldername(name))[1]
    )
);

CREATE POLICY "org_writer_storage_update"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'project-assets'
    AND EXISTS (
        SELECT 1 FROM memberships m
        WHERE m.user_id = auth.uid()
          AND m.joined_at IS NOT NULL
          AND m.role IN ('owner', 'admin', 'editor')
          AND m.org_id::text = (storage.foldername(name))[1]
    )
);

CREATE POLICY "org_admin_storage_delete"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'project-assets'
    AND EXISTS (
        SELECT 1 FROM memberships m
        WHERE m.user_id = auth.uid()
          AND m.joined_at IS NOT NULL
          AND m.role IN ('owner', 'admin')
          AND m.org_id::text = (storage.foldername(name))[1]
    )
);
