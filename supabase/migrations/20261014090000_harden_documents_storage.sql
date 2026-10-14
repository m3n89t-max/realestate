-- Make document files private and replace the original bucket-wide policies.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,
  52428800,
  ARRAY['image/jpeg','image/png','image/webp','application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

UPDATE storage.buckets
SET public = false
WHERE id = 'documents';

-- Tie each agent-produced document to the claimed task for idempotency and completion checks.
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS source_task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_source_task_id
  ON public.documents(source_task_id)
  WHERE source_task_id IS NOT NULL;

-- Columns the download functions and the 서류 UI already write/read but no local migration created.
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS raw_data jsonb,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS fetched_at timestamptz;

-- `onConflict: 'project_id,type'` upserts need this unique index to resolve instead of erroring.
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_project_type_unique
  ON public.documents(project_id, type);

DROP POLICY IF EXISTS "documents_public_read" ON storage.objects;
DROP POLICY IF EXISTS "documents_auth_insert" ON storage.objects;
DROP POLICY IF EXISTS "documents_auth_update" ON storage.objects;
DROP POLICY IF EXISTS "documents_auth_delete" ON storage.objects;
DROP POLICY IF EXISTS "documents_org_member_read" ON storage.objects;
DROP POLICY IF EXISTS "documents_org_writer_insert" ON storage.objects;
DROP POLICY IF EXISTS "documents_org_admin_delete" ON storage.objects;

-- Object names are always {org_id}/{project_id}/{server-generated filename}.
CREATE POLICY "documents_org_member_read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND (storage.foldername(name))[2] IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.memberships m
    JOIN public.projects p
      ON p.id::text = (storage.foldername(name))[2]
     AND p.org_id = m.org_id
    WHERE m.user_id = auth.uid()
      AND m.joined_at IS NOT NULL
      AND m.org_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "documents_org_writer_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND (storage.foldername(name))[2] IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.memberships m
    JOIN public.projects p
      ON p.id::text = (storage.foldername(name))[2]
     AND p.org_id = m.org_id
    WHERE m.user_id = auth.uid()
      AND m.joined_at IS NOT NULL
      AND m.role IN ('owner', 'admin', 'editor')
      AND m.org_id::text = (storage.foldername(name))[1]
  )
);

-- No UPDATE policy: neither authenticated users nor anon can overwrite document objects.
CREATE POLICY "documents_org_admin_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND (storage.foldername(name))[2] IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.memberships m
    JOIN public.projects p
      ON p.id::text = (storage.foldername(name))[2]
     AND p.org_id = m.org_id
    WHERE m.user_id = auth.uid()
      AND m.joined_at IS NOT NULL
      AND m.role IN ('owner', 'admin')
      AND m.org_id::text = (storage.foldername(name))[1]
  )
);
