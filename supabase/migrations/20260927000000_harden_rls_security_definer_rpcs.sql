-- Close tenant privilege-escalation paths left by historical policies and RPCs.
-- This is intentionally forward-only so deployed databases receive the hardening.

-- Membership roles and organization assignment may only be changed by an org admin.
DROP POLICY IF EXISTS "memberships_update" ON public.memberships;
DROP POLICY IF EXISTS "memberships_delete" ON public.memberships;

CREATE POLICY "memberships_update" ON public.memberships
  FOR UPDATE
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

CREATE POLICY "memberships_delete" ON public.memberships
  FOR DELETE
  USING (public.is_org_admin(org_id));

-- Agent keys may only be created or rotated by an org admin or the service role.
CREATE OR REPLACE FUNCTION public.generate_agent_key(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_key text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT public.is_org_admin(p_org_id) THEN
    RAISE EXCEPTION 'Not authorized to generate an agent key for this organization'
      USING ERRCODE = '42501';
  END IF;

  new_key := 'rak_' || encode(extensions.gen_random_bytes(32), 'hex');

  UPDATE public.agent_connections
  SET agent_key = new_key,
      updated_at = now()
  WHERE org_id = p_org_id;

  IF NOT FOUND THEN
    INSERT INTO public.agent_connections (org_id, agent_key, status)
    VALUES (p_org_id, new_key, 'offline');
  END IF;

  RETURN new_key;
END;
$$;

-- Harden usage mutation. Direct RPC access is limited to service_role below;
-- the function owner retains execution for database-internal trigger calls.
CREATE OR REPLACE FUNCTION public.increment_usage(
  p_org_id uuid,
  p_type text,
  p_amount bigint DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_year integer := EXTRACT(YEAR FROM now())::integer;
  v_month integer := EXTRACT(MONTH FROM now())::integer;
BEGIN
  INSERT INTO public.usage_logs (org_id, year, month)
  VALUES (p_org_id, v_year, v_month)
  ON CONFLICT (org_id, year, month) DO NOTHING;

  CASE p_type
    WHEN 'project' THEN
      UPDATE public.usage_logs
      SET project_count = project_count + p_amount
      WHERE org_id = p_org_id AND year = v_year AND month = v_month;
    WHEN 'generation' THEN
      UPDATE public.usage_logs
      SET generation_count = generation_count + p_amount
      WHERE org_id = p_org_id AND year = v_year AND month = v_month;
    WHEN 'token' THEN
      UPDATE public.usage_logs
      SET token_usage = token_usage + p_amount
      WHERE org_id = p_org_id AND year = v_year AND month = v_month;
    WHEN 'video_render' THEN
      UPDATE public.usage_logs
      SET video_render_count = video_render_count + p_amount
      WHERE org_id = p_org_id AND year = v_year AND month = v_month;
    WHEN 'doc_download' THEN
      UPDATE public.usage_logs
      SET doc_download_count = doc_download_count + p_amount
      WHERE org_id = p_org_id AND year = v_year AND month = v_month;
    ELSE
      RAISE EXCEPTION 'Unknown usage type: %', p_type;
  END CASE;
END;
$$;

-- Harden usage reads while preserving authenticated same-org and service-role access.
CREATE OR REPLACE FUNCTION public.get_org_usage(
  p_org_id uuid,
  p_year integer DEFAULT NULL,
  p_month integer DEFAULT NULL
)
RETURNS TABLE (
  org_id uuid,
  year integer,
  month integer,
  project_count integer,
  generation_count integer,
  token_usage bigint,
  video_render_count integer,
  doc_download_count integer,
  plan_type text,
  monthly_project_limit integer
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_year integer := COALESCE(p_year, EXTRACT(YEAR FROM now())::integer);
  v_month integer := COALESCE(p_month, EXTRACT(MONTH FROM now())::integer);
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT public.is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'Not authorized to read usage for this organization'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT ul.org_id,
         ul.year,
         ul.month,
         ul.project_count,
         ul.generation_count,
         ul.token_usage,
         ul.video_render_count,
         ul.doc_download_count,
         o.plan_type,
         o.monthly_project_limit
  FROM public.usage_logs AS ul
  JOIN public.organizations AS o ON o.id = ul.org_id
  WHERE ul.org_id = p_org_id
    AND ul.year = v_year
    AND ul.month = v_month;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT p_org_id,
           v_year,
           v_month,
           0::integer,
           0::integer,
           0::bigint,
           0::integer,
           0::integer,
           o.plan_type,
           o.monthly_project_limit
    FROM public.organizations AS o
    WHERE o.id = p_org_id;
  END IF;
END;
$$;

-- Harden quota reads with the same tenant boundary as get_org_usage.
CREATE OR REPLACE FUNCTION public.check_quota(
  p_org_id uuid,
  p_type text DEFAULT 'project'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org public.organizations%ROWTYPE;
  v_year integer := EXTRACT(YEAR FROM now())::integer;
  v_month integer := EXTRACT(MONTH FROM now())::integer;
  v_usage public.usage_logs%ROWTYPE;
  v_limit integer;
  v_current integer;
  v_plan_limits jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT public.is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'Not authorized to read quota for this organization'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_org
  FROM public.organizations
  WHERE id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found: %', p_org_id;
  END IF;

  v_plan_limits := CASE v_org.plan_type
    WHEN 'free' THEN '{"project":20,"generation":50,"token":500000,"video_render":5,"doc_download":20}'::jsonb
    WHEN 'pro' THEN '{"project":100,"generation":500,"token":5000000,"video_render":50,"doc_download":200}'::jsonb
    WHEN 'premium' THEN '{"project":-1,"generation":-1,"token":-1,"video_render":-1,"doc_download":-1}'::jsonb
    ELSE '{"project":0,"generation":0,"token":0,"video_render":0,"doc_download":0}'::jsonb
  END;

  SELECT * INTO v_usage
  FROM public.usage_logs
  WHERE org_id = p_org_id
    AND year = v_year
    AND month = v_month;

  v_limit := (v_plan_limits ->> p_type)::integer;
  v_current := CASE p_type
    WHEN 'project' THEN COALESCE(v_usage.project_count, 0)
    WHEN 'generation' THEN COALESCE(v_usage.generation_count, 0)
    WHEN 'token' THEN COALESCE(v_usage.token_usage, 0)::integer
    WHEN 'video_render' THEN COALESCE(v_usage.video_render_count, 0)
    WHEN 'doc_download' THEN COALESCE(v_usage.doc_download_count, 0)
    ELSE 0
  END;

  RETURN jsonb_build_object(
    'org_id', p_org_id,
    'plan_type', v_org.plan_type,
    'type', p_type,
    'current', v_current,
    'limit', v_limit,
    'exceeded', CASE WHEN v_limit = -1 THEN false ELSE v_current >= v_limit END,
    'remaining', CASE WHEN v_limit = -1 THEN -1 ELSE GREATEST(0, v_limit - v_current) END
  );
END;
$$;

-- Lock down function ACLs explicitly; SECURITY DEFINER functions are executable by
-- PUBLIC by default unless their privileges are revoked.
REVOKE ALL ON FUNCTION public.generate_agent_key(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_agent_key(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.increment_usage(uuid, text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_usage(uuid, text, bigint) TO service_role;

REVOKE ALL ON FUNCTION public.get_org_usage(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_org_usage(uuid, integer, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.check_quota(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_quota(uuid, text) TO authenticated, service_role;
