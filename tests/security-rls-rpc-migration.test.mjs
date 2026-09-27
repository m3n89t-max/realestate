import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migrationPath = new URL(
  '../supabase/migrations/20260927000000_harden_rls_security_definer_rpcs.sql',
  import.meta.url,
)

function functionDefinition(sql, name, nextMarker) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`)
  assert.notEqual(start, -1, `${name} must be replaced by the forward migration`)

  const end = nextMarker ? sql.indexOf(nextMarker, start) : sql.length
  assert.notEqual(end, -1, `could not find the end of ${name}`)
  return sql.slice(start, end)
}

function assertHardenedDefiner(definition, name) {
  assert.match(definition, /SECURITY DEFINER/i, `${name} must remain SECURITY DEFINER`)
  assert.match(
    definition,
    /SET search_path = public, pg_temp/i,
    `${name} must pin a safe search_path`,
  )
}

test('forward migration closes tenant mutation and SECURITY DEFINER RPC escalation paths', () => {
  const sql = readFileSync(migrationPath, 'utf8')

  assert.match(sql, /DROP POLICY IF EXISTS "memberships_update" ON public\.memberships/i)
  assert.match(sql, /DROP POLICY IF EXISTS "memberships_delete" ON public\.memberships/i)
  assert.match(
    sql,
    /CREATE POLICY "memberships_update" ON public\.memberships\s+FOR UPDATE\s+USING \(public\.is_org_admin\(org_id\)\)\s+WITH CHECK \(public\.is_org_admin\(org_id\)\)/i,
  )
  assert.match(
    sql,
    /CREATE POLICY "memberships_delete" ON public\.memberships\s+FOR DELETE\s+USING \(public\.is_org_admin\(org_id\)\)/i,
  )
  assert.doesNotMatch(sql, /memberships_(?:update|delete)[\s\S]{0,250}user_id\s*=\s*auth\.uid/i)

  const generateAgentKey = functionDefinition(sql, 'generate_agent_key', '-- Harden usage mutation')
  assertHardenedDefiner(generateAgentKey, 'generate_agent_key')
  assert.match(generateAgentKey, /auth\.role\(\) IS DISTINCT FROM 'service_role'/i)
  assert.match(generateAgentKey, /public\.is_org_admin\(p_org_id\)/i)
  assert.match(generateAgentKey, /ERRCODE = '42501'/i)

  const incrementUsage = functionDefinition(sql, 'increment_usage', '-- Harden usage reads')
  assertHardenedDefiner(incrementUsage, 'increment_usage')

  const getOrgUsage = functionDefinition(sql, 'get_org_usage', '-- Harden quota reads')
  assertHardenedDefiner(getOrgUsage, 'get_org_usage')
  assert.match(getOrgUsage, /auth\.role\(\) IS DISTINCT FROM 'service_role'/i)
  assert.match(getOrgUsage, /public\.is_org_member\(p_org_id\)/i)
  assert.match(getOrgUsage, /ERRCODE = '42501'/i)

  const checkQuota = functionDefinition(sql, 'check_quota', '-- Lock down function ACLs')
  assertHardenedDefiner(checkQuota, 'check_quota')
  assert.match(checkQuota, /auth\.role\(\) IS DISTINCT FROM 'service_role'/i)
  assert.match(checkQuota, /public\.is_org_member\(p_org_id\)/i)
  assert.match(checkQuota, /ERRCODE = '42501'/i)

  assert.match(sql, /REVOKE ALL ON FUNCTION public\.generate_agent_key\(uuid\) FROM PUBLIC, anon/i)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.generate_agent_key\(uuid\) TO authenticated, service_role/i)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.increment_usage\(uuid, text, bigint\) FROM PUBLIC, anon, authenticated/i)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.increment_usage\(uuid, text, bigint\) TO service_role/i)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.get_org_usage\(uuid, integer, integer\) FROM PUBLIC, anon/i)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.get_org_usage\(uuid, integer, integer\) TO authenticated, service_role/i)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.check_quota\(uuid, text\) FROM PUBLIC, anon/i)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.check_quota\(uuid, text\) TO authenticated, service_role/i)
})
