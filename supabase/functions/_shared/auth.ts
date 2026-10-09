// deno-lint-ignore no-explicit-any
import { createClient, type SupabaseClient as SupabaseClientGeneric } from 'https://esm.sh/@supabase/supabase-js@2'

// deno-lint-ignore no-explicit-any
type SupabaseClient = SupabaseClientGeneric<any, any, any, any, any>

/**
 * 이 리포에는 Supabase 생성 타입(Database)이 없어 createClient가 모든 테이블·RPC를
 * never로 추론한다. 런타임 동작은 정상이므로 호출 지점에서 쓰는 모양만 좁혀 둔다.
 * 생성 타입을 도입하면 아래 보조 타입은 제거한다.
 */
interface MembershipOrgRow {
  org_id: string
}

interface QuotaCheckResult {
  exceeded?: boolean
}

/**
 * ReturnType<typeof createClient>는 제네릭 인자가 비어 'never' 스키마로 고정되어
 * 각 함수가 실제로 만든 클라이언트를 받지 못한다(TS2345). any로 열면 호출 지점의
 * 오타까지 통과하므로, 이 헬퍼가 실제로 호출하는 메서드만 구조적으로 요구한다.
 */
/**
 * 구조적 인터페이스로 좁히면 supabase-js의 재귀 제네릭이 전개되어
 * TS2589(타입 전개가 과도하게 깊음)가 난다. 공용 헬퍼는 호출자가 만든
 * 클라이언트 타입을 그대로 받고, 내부에서만 응답 모양을 명시한다.
 */
export type SupabaseLike = SupabaseClient

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
  )

  if (error) {
    console.error('[checkQuota] RPC 오류:', error.message)
    throw new Error('사용량 한도를 확인할 수 없습니다. 잠시 후 다시 시도해주세요.')
  }
  if (data?.exceeded) {
    throw new Error(`월간 ${type} 한도를 초과했습니다. 요금제를 업그레이드하세요.`)
  }
}
