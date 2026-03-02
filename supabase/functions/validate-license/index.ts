import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { getAuthenticatedUser, getOrgId } from '../_shared/auth.ts'

const PLAN_FEATURES: Record<string, string[]> = {
  free: ['blog_generation', 'card_news_generation', 'location_analysis'],
  pro: [
    'blog_generation', 'card_news_generation', 'location_analysis',
    'naver_auto_upload', 'building_register', 'seumteo_api',
  ],
  premium: [
    'blog_generation', 'card_news_generation', 'location_analysis',
    'naver_auto_upload', 'building_register', 'seumteo_api',
    'floor_plan_analysis', 'risk_analysis', 'package_pdf', 'video_render',
  ],
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const { user, supabaseClient } = await getAuthenticatedUser(req)
    const orgId = await getOrgId(supabaseClient, user.id)

    const { data: org } = await supabaseClient
      .from('organizations')
      .select('plan_type, plan_expires_at, monthly_project_limit')
      .eq('id', orgId)
      .single()
    if (!org) throw new Error('조직을 찾을 수 없습니다')

    // 만료 여부 확인
    const isExpired = org.plan_expires_at && new Date(org.plan_expires_at) < new Date()
    const effectivePlan = isExpired ? 'free' : (org.plan_type ?? 'free')

    // 사용량 조회
    const { data: usage } = await supabaseClient
      .rpc('get_org_usage', { p_org_id: orgId })
      .single()

    // 할당량 확인
    const { data: quota } = await supabaseClient
      .rpc('check_quota', { p_org_id: orgId, p_type: 'project' })

    return new Response(JSON.stringify({
      org_id: orgId,
      plan_type: effectivePlan,
      plan_expires_at: org.plan_expires_at,
      is_expired: isExpired,
      features_enabled: PLAN_FEATURES[effectivePlan] ?? PLAN_FEATURES.free,
      usage,
      quota,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[validate-license]', err)
    const message = err instanceof Error ? err.message : '라이선스 확인에 실패했습니다'
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
