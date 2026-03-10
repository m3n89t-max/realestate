import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export async function getAuthenticatedUser(req: Request) {
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {
      global: {
        headers: { Authorization: req.headers.get('Authorization') ?? '' },
      },
    }
  )

  const { data: { user }, error } = await supabaseClient.auth.getUser()
  if (error || !user) throw new Error('인증되지 않은 요청입니다')

  return { user, supabaseClient }
}

export async function getOrgId(supabaseClient: ReturnType<typeof createClient>, userId: string): Promise<string> {
  const { data, error } = await supabaseClient
    .from('memberships')
    .select('org_id')
    .eq('user_id', userId)
    .not('joined_at', 'is', null)
    .limit(1)
    .single()

  if (error || !data) throw new Error('조직 정보를 찾을 수 없습니다')
  return data.org_id
}

export async function checkQuota(
  supabaseClient: ReturnType<typeof createClient>,
  orgId: string,
  type: string
): Promise<void> {
  const { data, error } = await supabaseClient
    .rpc('check_quota', { p_org_id: orgId, p_type: type })

  if (error) {
    console.warn('[checkQuota] RPC 오류 (무시):', error.message)
    return // quota 체크 실패 시 통과
  }
  if (data?.exceeded) {
    throw new Error(`월간 ${type} 한도를 초과했습니다. 요금제를 업그레이드하세요.`)
  }
}
