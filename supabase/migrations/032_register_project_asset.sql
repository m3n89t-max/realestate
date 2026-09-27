-- Register an already-uploaded object and its cover state in one database
-- transaction. Storage is deliberately handled before this RPC by the client.
CREATE OR REPLACE FUNCTION public.register_project_asset(
  p_org_id uuid,
  p_project_id uuid,
  p_file_name text,
  p_file_url text,
  p_file_size bigint,
  p_mime_type text,
  p_type text,
  p_sort_order integer
)
RETURNS TABLE(asset_id uuid, is_cover boolean)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_asset public.assets%ROWTYPE;
  v_is_cover boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  IF p_file_url IS NULL OR btrim(p_file_url) = '' OR p_file_name IS NULL OR btrim(p_file_name) = ''
    OR p_file_size IS NULL OR p_file_size < 0 OR p_type NOT IN ('image', 'video', 'document', 'card_news') THEN
    RAISE EXCEPTION '유효하지 않은 파일 정보입니다';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.memberships AS m
    WHERE m.org_id = p_org_id
      AND m.user_id = auth.uid()
      AND m.joined_at IS NOT NULL
      AND m.role IN ('owner', 'admin', 'editor')
  ) THEN
    RAISE EXCEPTION '이 매물에 파일을 추가할 권한이 없습니다';
  END IF;

  -- Serialise registrations for this project before choosing its first cover.
  SELECT p.* INTO v_project
  FROM public.projects AS p
  WHERE p.id = p_project_id AND p.org_id = p_org_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '매물을 찾을 수 없습니다';
  END IF;

  v_is_cover := p_type = 'image'
    AND (v_project.cover_image_url IS NULL OR v_project.cover_image_url = p_file_url);

  -- Retrying the same storage object is idempotent even if the original RPC
  -- response was lost. The project-row lock prevents concurrent duplicates.
  SELECT a.* INTO v_asset
  FROM public.assets AS a
  WHERE a.project_id = p_project_id AND a.file_url = p_file_url
  ORDER BY a.created_at, a.id
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.assets AS a
    SET file_name = p_file_name,
        file_size = p_file_size,
        mime_type = p_mime_type,
        type = p_type,
        sort_order = p_sort_order,
        is_cover = v_is_cover
    WHERE a.id = v_asset.id
    RETURNING a.id, a.is_cover INTO asset_id, is_cover;
  ELSE
    INSERT INTO public.assets AS a (
      project_id, org_id, type, file_name, file_url, file_size, mime_type, is_cover, sort_order
    ) VALUES (
      p_project_id, p_org_id, p_type, p_file_name, p_file_url, p_file_size, p_mime_type, v_is_cover, p_sort_order
    )
    RETURNING a.id, a.is_cover INTO asset_id, is_cover;
  END IF;

  IF is_cover THEN
    UPDATE public.projects AS p
    SET cover_image_url = p_file_url
    WHERE p.id = p_project_id;
  END IF;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.register_project_asset(uuid, uuid, text, text, bigint, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_project_asset(uuid, uuid, text, text, bigint, text, text, integer) TO authenticated;
