-- Allow joined org writers to clean up failed uploads, replacing the old admin-only rule.
DROP POLICY IF EXISTS "org_admin_storage_delete" ON storage.objects;
DROP POLICY IF EXISTS "org_writer_storage_delete" ON storage.objects;

CREATE POLICY "org_writer_storage_delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'project-assets'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.user_id = auth.uid()
      AND m.joined_at IS NOT NULL
      AND m.role IN ('owner', 'admin', 'editor')
      AND m.org_id::text = (storage.foldername(name))[1]
  )
);
