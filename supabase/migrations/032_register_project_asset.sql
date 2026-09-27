-- Register an already-uploaded object and its cover state in one database
-- transaction. Storage is deliberately handled before this RPC by the client.
CREATE OR REPLACE FUNCTION public.register_project_asset(
  p_org_id uuid,
  p_project_id uuid,
  p_file_name text,
  p_file_url text,
  p_file_size bigint,
  p_mime_type text,
  p_type text
)
RETURNS TABLE(asset_id uuid, is_cover boolean)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_asset public.assets%ROWTYPE;
  v_asset_found boolean;
  v_is_cover boolean;
  v_sort_order integer;
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

  SELECT COALESCE(MAX(a.sort_order), -1) + 1
  INTO v_sort_order
  FROM public.assets AS a
  WHERE a.project_id = p_project_id;

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
  v_asset_found := FOUND;

  -- Partial unique indexes are checked per statement, so release the previous
  -- cover before setting the new one. The project lock serializes this gap.
  IF v_is_cover THEN
    UPDATE public.assets AS a
    SET is_cover = false
    WHERE a.project_id = p_project_id
      AND a.is_cover;
  END IF;

  IF v_asset_found THEN
    UPDATE public.assets AS a
    SET file_name = p_file_name,
        file_size = p_file_size,
        mime_type = p_mime_type,
        type = p_type,
        is_cover = v_is_cover
    WHERE a.id = v_asset.id
    RETURNING a.id, a.is_cover INTO asset_id, is_cover;
  ELSE
    INSERT INTO public.assets AS a (
      project_id, org_id, type, file_name, file_url, file_size, mime_type, is_cover, sort_order
    ) VALUES (
      p_project_id, p_org_id, p_type, p_file_name, p_file_url, p_file_size, p_mime_type, v_is_cover, v_sort_order
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

-- Normalize legacy rows before enforcing one cover per project. Prefer the URL
-- already stored on projects, then an existing cover, then the earliest image.
UPDATE public.assets
SET is_cover = false
WHERE is_cover
  AND type IS DISTINCT FROM 'image';

WITH ranked AS (
  SELECT a.id,
    row_number() OVER (
      PARTITION BY a.project_id
      ORDER BY CASE WHEN a.file_url = p.cover_image_url THEN 0 WHEN a.is_cover THEN 1 ELSE 2 END,
        a.created_at, a.id
    ) AS position
  FROM public.assets AS a
  JOIN public.projects AS p ON p.id = a.project_id
  WHERE a.type = 'image'
)
UPDATE public.assets AS a
SET is_cover = (ranked.position = 1)
FROM ranked
WHERE a.id = ranked.id
  AND a.is_cover IS DISTINCT FROM (ranked.position = 1);

WITH ranked AS (
  SELECT a.project_id, a.file_url,
    row_number() OVER (PARTITION BY a.project_id ORDER BY CASE WHEN a.is_cover THEN 0 ELSE 1 END, a.created_at, a.id) AS position
  FROM public.assets AS a
  WHERE a.type = 'image'
)
UPDATE public.projects AS p
SET cover_image_url = ranked.file_url
FROM ranked
WHERE p.id = ranked.project_id AND ranked.position = 1
  AND p.cover_image_url IS DISTINCT FROM ranked.file_url;

UPDATE public.projects AS p
SET cover_image_url = NULL
WHERE p.cover_image_url IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.assets AS a
    WHERE a.project_id = p.id AND a.type = 'image'
  );

CREATE UNIQUE INDEX IF NOT EXISTS assets_one_cover_per_project_idx
ON public.assets (project_id)
WHERE is_cover;

REVOKE ALL ON FUNCTION public.register_project_asset(uuid, uuid, text, text, bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_project_asset(uuid, uuid, text, text, bigint, text, text) TO authenticated;
