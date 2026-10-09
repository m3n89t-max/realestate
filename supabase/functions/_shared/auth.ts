import { createClient, type SupabaseClient as SupabaseClientGeneric } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * 이 리포에는 Supabase 생성 타입(Database)이 없어 ReturnType<typeof createClient>가
 * 모든 테이블·RPC를 never로 추론한다(TS2345). 구조적 인터페이스로 좁히면
 * supabase-js의 재귀 제네릭이 전개되어 TS2589가 난다. 그래서 공용 헬퍼는
 * 호출자가 만든 클라이언트를 그대로 받고, 응답 모양은 호출 지점에서 명시하며
 * 그 모양이 어긋나면 fail-closed로 막는다.
 *
 * 후속: `supabase gen types`로 Database 타입을 생성하면
 * SupabaseClientGeneric<Database>로 교체하고 아래 보조 타입을 제거한다.
 */
// deno-lint-ignore no-explicit-any
export type SupabaseLike = SupabaseClientGeneric<any, any, any, any, any>

interface MembershipOrgRow {
  org_id: string
}

interface QuotaCheckResult {
  exceeded?: boolean
}

interface QuotaCheckResponse {
  data: QuotaCheckResult | null
  error: { message: string } | null
}

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

export async function getOrgId(supabaseClient: SupabaseLike, userId: string): Promise<string> {
  const { data, error } = await supabaseClient
    .from('memberships')
    .select('org_id')
    .eq('user_id', userId)
    .not('joined_at', 'is', null)
    .limit(1)
    .single<MembershipOrgRow>()

  if (error || !data) throw new Error('조직 정보를 찾을 수 없습니다')
  return data.org_id
}

export async function checkQuota(
  supabaseClient: SupabaseLike,
  orgId: string,
  type: string
): Promise<void> {
  // 생성된 DB 타입이 없어 createClient는 스키마를 never로 추론한다.
  // rpc 인자·반환을 여기서 명시해 호출 지점의 타입을 복구한다.
  const { data, error } = await supabaseClient.rpc(
    'check_quota',
    { p_org_id: orgId, p_type: type },
  ) as QuotaCheckResponse

  if (error) {
    console.error('[checkQuota] RPC 오류:', error.message)
    throw new Error('사용량 한도를 확인할 수 없습니다. 잠시 후 다시 시도해주세요.')
  }
  // 응답 모양이 예상과 다르면 '한도 초과 아님'으로 넘기지 않는다. 쿼터는
  // 과금·남용 경계이므로 판단 불가 시 막는 쪽이 맞다(fail-closed).
  if (typeof data?.exceeded !== 'boolean') {
    console.error('[checkQuota] 예상 밖 응답 모양')
    throw new Error('사용량 한도를 확인할 수 없습니다. 잠시 후 다시 시도해주세요.')
  }
  if (data.exceeded) {
    throw new Error(`월간 ${type} 한도를 초과했습니다. 요금제를 업그레이드하세요.`)
  }
}
