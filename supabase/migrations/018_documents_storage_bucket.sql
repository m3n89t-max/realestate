-- ── documents Storage 버킷 생성 ────────────────────────────────
-- 지적도, 건축물대장 PDF 등 서류 파일 저장용

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  true,                          -- public (CDN URL로 직접 접근 가능)
  52428800,                      -- 50MB 제한
  ARRAY['image/jpeg','image/png','image/webp','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- ── RLS 정책 ────────────────────────────────────────────────────

-- 1. 공개 읽기 (지적도 이미지 표시용)
CREATE POLICY "documents_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'documents');

-- 2. 인증된 사용자 업로드 (Edge Function service role 포함)
CREATE POLICY "documents_auth_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'documents');

-- 3. 인증된 사용자 업데이트
CREATE POLICY "documents_auth_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'documents');

-- 4. 인증된 사용자 삭제
CREATE POLICY "documents_auth_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'documents');
