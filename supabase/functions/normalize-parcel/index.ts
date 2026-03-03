import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors } from '../_shared/cors.ts'
import { getAuthenticatedUser, getOrgId } from '../_shared/auth.ts'
import { ok, err } from '../_shared/response.ts'

function extractSigunguCode(bCode: string): string {
  return bCode?.slice(0, 5) ?? ''
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const { user, supabaseClient } = await getAuthenticatedUser(req)
    const orgId = await getOrgId(supabaseClient, user.id)

    const { parcel_input, project_id } = await req.json()
    if (!parcel_input) throw new Error('parcel_input이 필요합니다')
    if (!project_id) throw new Error('project_id가 필요합니다')

    const { data: project, error: projectError } = await supabaseClient
      .from('projects')
      .select('id, org_id')
      .eq('id', project_id)
      .single()
    if (projectError || !project) throw new Error('프로젝트를 찾을 수 없습니다')

    const kakaoKey = Deno.env.get('KAKAO_REST_API_KEY')
    if (!kakaoKey) throw new Error('KAKAO_REST_API_KEY가 설정되지 않았습니다')

    const kakaoRes = await fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(parcel_input)}`,
      { headers: { Authorization: `KakaoAK ${kakaoKey}` } }
    )
    if (!kakaoRes.ok) throw new Error(`카카오 API 오류: ${kakaoRes.status}`)

    const kakaoData = await kakaoRes.json()
    if (!kakaoData.documents?.length) {
      throw new Error('주소를 찾을 수 없습니다. 지번 또는 도로명주소를 확인해주세요.')
    }

    const doc = kakaoData.documents[0]
    const addr = doc.address ?? doc.road_address
    const roadAddr = doc.road_address

    const address_name: string = doc.address_name ?? parcel_input
    const lat: number = parseFloat(doc.y)
    const lng: number = parseFloat(doc.x)

    const region_1depth_name: string = addr?.region_1depth_name ?? roadAddr?.region_1depth_name ?? ''
    const region_2depth_name: string = addr?.region_2depth_name ?? roadAddr?.region_2depth_name ?? ''
    const region_3depth_name: string = addr?.region_3depth_name ?? roadAddr?.region_3depth_name ?? ''

    const bCode: string = addr?.b_code ?? ''
    const sigungu_code: string = extractSigunguCode(bCode)
    const legal_dong: string = region_3depth_name
    const normalized_address: string = roadAddr?.address_name ?? addr?.address_name ?? address_name

    await supabaseClient
      .from('projects')
      .update({ address: normalized_address, lat, lng })
      .eq('id', project_id)

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: createdTasks, error: taskError } = await adminClient
      .from('tasks')
      .insert([
        {
          org_id: project.org_id,
          project_id,
          type: 'location_analyze',
          status: 'pending',
          payload: { project_id, normalized_address, lat, lng },
        },
        {
          org_id: project.org_id,
          project_id,
          type: 'download_building_register',
          status: 'pending',
          payload: { project_id, normalized_address, sigungu_code, legal_dong },
        },
      ])
      .select('id, type')

    if (taskError) throw taskError

    const task_ids: string[] = (createdTasks ?? []).map((t: { id: string }) => t.id)

    return ok(
      { normalized_address, lat, lng, sigungu_code, legal_dong,
        region_1depth_name, region_2depth_name, region_3depth_name, task_ids },
      { org_id: orgId }
    )

  } catch (error) {
    console.error('[normalize-parcel]', error)
    const message = error instanceof Error ? error.message : '주소 정규화에 실패했습니다'
    return err(message, 400)
  }
})
