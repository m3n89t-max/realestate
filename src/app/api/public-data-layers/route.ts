import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { collectPublicDataLayers, extractSigungu, type CollectorTarget } from '@/lib/public-data-collectors'
import {
  extractSido,
  hasActivePublicDataCollectionLock,
  isFreshPublicDataLayerPayload,
  type PublicDataCollectionTarget,
} from '@/lib/public-data-layers'
import { findNearestSeoulHotspot } from '@/lib/seoul-hotspots'

/**
 * 무료 공공 데이터 레이어 수집.
 *
 * 각 수집기는 독립 실행되며, API 키 부재는 실패가 아니라 '준비 중' 상태로 반환한다.
 * 지역 전용 데이터는 해당 지역 매물에만 붙는다.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

    const { project_id } = await req.json()
    if (!project_id) return NextResponse.json({ error: 'project_id가 필요합니다' }, { status: 400 })

    const { data: project } = await supabase
      .from('projects')
      .select('id, org_id, address, jibun_address, lat, lng, sigungu_code, bjdong_code, public_data_layers')
      .eq('id', project_id)
      .single()

    if (!project) return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다' }, { status: 404 })

    // 쓰기 권한을 먼저 확인한다. viewer는 select가 통과하므로,
    // 확인 없이 진행하면 외부 API 쿼터만 소모하고 저장 단계에서 실패한다.
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', project.org_id)
      .not('joined_at', 'is', null)
      .maybeSingle()

    const canWrite = membership != null && ['owner', 'admin', 'editor'].includes(membership.role)
    if (!canWrite) {
      return NextResponse.json({ error: '이 프로젝트를 수정할 권한이 없습니다' }, { status: 403 })
    }

    // projects 테이블에 road_address 컬럼은 없다. address가 정본이다.
    const address: string | null = project.address ?? project.jibun_address ?? null
    const lat: number | null = project.lat ?? null
    const lng: number | null = project.lng ?? null

    const collectionTarget: PublicDataCollectionTarget = {
      address,
      lat,
      lng,
      sigunguCode: project.sigungu_code ?? null,
      bjdongCode: project.bjdong_code ?? null,
    }

    // 주소·좌표·법정동코드가 완전히 같은 최근 결과만 재사용한다.
    if (isFreshPublicDataLayerPayload(
      project.public_data_layers,
      Date.now(),
      5 * 60 * 1_000,
      collectionTarget,
    )) {
      return NextResponse.json({
        success: true,
        public_data_layers: project.public_data_layers,
        reused: true,
      })
    }
    if (hasActivePublicDataCollectionLock(project.public_data_layers, collectionTarget)) {
      return NextResponse.json({ error: '같은 위치의 공공 자료를 이미 불러오는 중입니다.' }, { status: 409 })
    }

    // 작은 revision 값만 비교해 잠금을 원자적으로 선점한다. JSON 전체를 URL 필터에
    // 넣지 않으므로 K-apt 단지 목록이 커져도 URI 길이 제한에 걸리지 않는다.
    const previousPayload = project.public_data_layers
    const previousObject = previousPayload && typeof previousPayload === 'object' && !Array.isArray(previousPayload)
      ? previousPayload as Record<string, unknown>
      : {}
    const lockToken = crypto.randomUUID()
    const previousRevision = typeof previousObject.collection_revision === 'string'
      ? previousObject.collection_revision
      : null
    const lockPayload = {
      ...previousObject,
      collection_revision: lockToken,
      collection_lock: {
        token: lockToken,
        started_at: new Date().toISOString(),
        target: {
          address,
          lat,
          lng,
          sigungu_code: collectionTarget.sigunguCode,
          bjdong_code: collectionTarget.bjdongCode,
        },
      },
    }
    let claimQuery = supabase
      .from('projects')
      .update({ public_data_layers: lockPayload })
      .eq('id', project_id)
    claimQuery = previousPayload == null
      ? claimQuery.is('public_data_layers', null)
      : previousRevision == null
        ? claimQuery.is('public_data_layers->>collection_revision', null)
        : claimQuery.eq('public_data_layers->>collection_revision', previousRevision)
    const { data: claimedProject, error: claimErr } = await claimQuery.select('id').maybeSingle()
    if (claimErr) {
      console.error('[public-data-layers] lock failed', claimErr.message)
      return NextResponse.json({ error: '공공 자료 수집을 시작하지 못했습니다.' }, { status: 500 })
    }
    if (!claimedProject) {
      return NextResponse.json({ error: '공공 자료를 이미 불러오는 중입니다.' }, { status: 409 })
    }

    // 서울 실시간 상권 API는 장소명으로만 조회되므로 좌표로 가장 가까운 공식 장소를 찾는다.
    const nearest = lat != null && lng != null ? findNearestSeoulHotspot(lat, lng) : null
    const target: CollectorTarget = {
      address,
      lat,
      lng,
      seoulPlaceName: nearest?.place.area_nm ?? null,
      sigunguName: extractSigungu(address),
      sidoName: extractSido(address),
      sigunguCode: project.sigungu_code ?? null,
      bjdongCode: project.bjdong_code ?? null,
    }
    const results = await collectPublicDataLayers(target, {
      seoulOpenApiKey: process.env.SEOUL_OPENAPI_KEY ?? null,
      dataGoKrKey: process.env.LOCAL_GIFT_CARD_API_KEY ?? null,
      residentRegistrationApiKey: process.env.RESIDENT_REGISTRATION_API_KEY ?? null,
      kaptListApiKey: process.env.KAPT_APT_LIST_API_KEY ?? null,
      kaptBasicApiKey: process.env.KAPT_APT_BASIC_API_KEY ?? null,
    })

    const payload = {
      collection_revision: lockToken,
      collected_at: new Date().toISOString(),
      region_address: address,
      region_location: { lat, lng },
      region_codes: {
        sigungu_code: project.sigungu_code ?? null,
        bjdong_code: project.bjdong_code ?? null,
      },
      seoul_nearest_place: nearest
        ? { area_nm: nearest.place.area_nm, area_cd: nearest.place.area_cd, distance_m: nearest.distanceM }
        : null,
      results,
    }

    // 수집 중 위치가 바뀌었으면 과거 위치 결과를 덮어쓰지 않는다.
    let updateQuery = supabase
      .from('projects')
      .update({ public_data_layers: payload })
      .eq('id', project_id)
      .eq('public_data_layers->>collection_revision', lockToken)

    updateQuery = project.address == null
      ? updateQuery.is('address', null)
      : updateQuery.eq('address', project.address)
    updateQuery = project.jibun_address == null
      ? updateQuery.is('jibun_address', null)
      : updateQuery.eq('jibun_address', project.jibun_address)
    updateQuery = project.sigungu_code == null
      ? updateQuery.is('sigungu_code', null)
      : updateQuery.eq('sigungu_code', project.sigungu_code)
    updateQuery = project.bjdong_code == null
      ? updateQuery.is('bjdong_code', null)
      : updateQuery.eq('bjdong_code', project.bjdong_code)
    updateQuery = project.lat == null ? updateQuery.is('lat', null) : updateQuery.eq('lat', project.lat)
    updateQuery = project.lng == null ? updateQuery.is('lng', null) : updateQuery.eq('lng', project.lng)

    const { data: updatedProject, error: updateErr } = await updateQuery.select('id').maybeSingle()

    // 저장 실패를 성공으로 보고하지 않는다.
    if (updateErr) {
      // 원문은 서버 로그로만 보낸다. Postgres/RLS 메시지를 사용자에게 노출하지 않는다.
      console.error('[public-data-layers] update failed', updateErr.message)
      return NextResponse.json({ error: '수집 결과 저장에 실패했습니다' }, { status: 500 })
    }
    if (!updatedProject) {
      return NextResponse.json(
        { error: '수집 중 매물 위치가 변경되었습니다. 다시 불러와 주세요.' },
        { status: 409 },
      )
    }

    return NextResponse.json({ success: true, public_data_layers: payload })
  } catch (e) {
    // 내부 오류 원문(URL·키가 실릴 수 있다)을 사용자에게 반환하지 않는다.
    console.error('[public-data-layers] collect failed', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: '공공 데이터 수집에 실패했습니다' }, { status: 500 })
  }
}
