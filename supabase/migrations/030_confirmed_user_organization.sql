-- Keep auth-side effects limited to a profile. Organizations are created only
-- after a user has an authenticated, confirmed session.
CREATE OR REPLACE FUNCTION public.trigger_create_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    avatar_url = EXCLUDED.avatar_url;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_user_organization()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_name text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  -- Serialize first-login setup for the same user so retries remain idempotent.
  PERFORM pg_advisory_xact_lock(hashtext(v_user_id::text));

  SELECT m.org_id INTO v_org_id FROM public.memberships m
  WHERE m.user_id = v_user_id AND m.joined_at IS NOT NULL
  LIMIT 1;
  IF v_org_id IS NOT NULL THEN RETURN v_org_id; END IF;

  SELECT COALESCE(NULLIF(u.full_name, ''), split_part(u.email, '@', 1))
  INTO v_name FROM public.users u WHERE u.id = v_user_id;
  IF v_name IS NULL THEN RAISE EXCEPTION '사용자 정보를 찾을 수 없습니다'; END IF;

  INSERT INTO public.organizations (name, plan_type, monthly_project_limit)
  VALUES (v_name || '의 중개사무소', 'free', 20)
  RETURNING id INTO v_org_id;
  INSERT INTO public.memberships (org_id, user_id, role, joined_at)
  VALUES (v_org_id, v_user_id, 'owner', now())
  ON CONFLICT (org_id, user_id) DO NOTHING;
  RETURN v_org_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_user_organization() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_user_organization() TO authenticated;
