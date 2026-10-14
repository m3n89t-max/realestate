import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, corsHeaders } from '../_shared/cors.ts'
import { getAuthenticatedUser } from '../_shared/auth.ts'

/**
 * 지적도 다운로드 Edge Function
 * VWorld WMS API로 지적도 이미지 생성 후 Supabase Storage에 저장
 *
 * WMS 방식: 표준 OGC WMS GetMap 요청 → PNG 이미지 수신
 * - lp_pa_cbnd_jibun : 지번 경계 (지적도)
 * - 배경: StaticMap API white 레이어
 */
Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const { supabaseClient } = await getAuthenticatedUser(req)
    const body = await req.json()
    const task       = body.record ?? body
    const task_id    = task.id
    const payload    = task.payload ?? {}
    const project_id = payload.project_id ?? task.project_id

    if (!project_id) throw new Error('project_id가 없습니다')

    const vworldKey = Deno.env.get('VWORLD_API_KEY')
    if (!vworldKey) throw new Error('VWORLD_API_KEY 환경변수가 설정되지 않았습니다')

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 프로젝트 좌표 조회
    const { data: project, error: projectError } = await supabaseClient
      .from('projects')
      .select('lat, lng, address, org_id')
      .eq('id', project_id)
      .single()

    if (projectError || !project) throw new Error('프로젝트를 찾을 수 없습니다')
    if (!project.lat || !project.lng) throw new Error('좌표 정보가 없습니다. 주소 정규화를 먼저 실행하세요.')

    const lat = Number(project.lat)
    const lng = Number(project.lng)

    if (task_id) {
      const { error: taskStartError } = await adminClient.from('tasks').update({
        status: 'running',
        started_at: new Date().toISOString(),
      }).eq('id', task_id).eq('org_id', project.org_id)
      if (taskStartError) throw new Error('작업 상태를 갱신하지 못했습니다')
    }

    // ── BBox 계산 (중심 좌표 기준 ±반경) ──────────────────────
    // zoom 17 기준: 약 500m 반경 표시
    const dLat = 0.0045
    const dLng = 0.006
    const minLat = lat - dLat
    const maxLat = lat + dLat
    const minLng = lng - dLng
    const maxLng = lng + dLng

    const savedDocs: { type: string; url: string }[] = []

    // ── 1. 지적도 WMS (지번경계) ──────────────────────────────
    const wmsParams = new URLSearchParams({
      SERVICE:     'WMS',
      REQUEST:     'GetMap',
      VERSION:     '1.3.0',
      LAYERS:      'lp_pa_cbnd_jibun',
      STYLES:      '',
      CRS:         'EPSG:4326',
      BBOX:        `${minLat},${minLng},${maxLat},${maxLng}`,  // WMS 1.3.0: lat,lng 순서
      WIDTH:       '800',
      HEIGHT:      '700',
      FORMAT:      'image/png',
      TRANSPARENT: 'FALSE',
      KEY:         vworldKey,
    })
    const wmsUrl = `https://api.vworld.kr/req/wms?${wmsParams.toString()}`

    const wmsRes = await fetch(wmsUrl)
    console.log('[download-cadastral-map] WMS status:', wmsRes.status, 'content-type:', wmsRes.headers.get('content-type'))

    if (wmsRes.ok && (wmsRes.headers.get('content-type') ?? '').includes('image')) {
      const buf = await wmsRes.arrayBuffer()
      const fileName = `${project.org_id}/${project_id}/cadastral_${crypto.randomUUID()}.png`
      const { error: uploadErr } = await adminClient.storage
        .from('documents')
        .upload(fileName, buf, { contentType: 'image/png', upsert: false })
      if (uploadErr) throw new Error('지적도 파일을 저장하지 못했습니다')

      const { error: documentError } = await adminClient.from('documents').upsert({
        project_id,
        org_id:     project.org_id,
        type:       'cadastral_map',
        status:     'completed',
        file_url:   fileName,
        file_name:  `지적도_${new Date().toLocaleDateString('ko-KR')}.png`,
        raw_data:   { map_type: 'cadastral_wms', center: { lat, lng }, bbox: { minLat, maxLat, minLng, maxLng }, address: project.address },
        summary:    `지적도 — ${project.address} 지번 경계`,
        fetched_at: new Date().toISOString(),
      }, { onConflict: 'project_id,type' })
      if (documentError) {
        const { error: cleanupError } = await adminClient.storage.from('documents').remove([fileName])
        if (cleanupError) console.error('[download-cadastral-map] orphan cleanup failed')
        throw new Error('지적도 정보를 저장하지 못했습니다')
      }
      savedDocs.push({ type: 'cadastral', url: fileName })
    } else {
      console.error('[download-cadastral-map] WMS 응답 오류:', wmsRes.status)
      throw new Error('지적도 이미지 생성에 실패했습니다')
    }

    // ── 2. 배경지도 StaticMap (white) ─────────────────────────
    const staticParams = new URLSearchParams({
      service: 'image',
      request: 'getmap',
      version: '2.0.0',
      crs:     'EPSG:4326',
      center:  `${lng},${lat}`,
      zoom:    '17',
      size:    '800,700',
      layers:  'white',
      styles:  '',
      format:  'image/png',
      key:     vworldKey,
    })
    const staticUrl = `https://api.vworld.kr/req/image?${staticParams.toString()}`

    const staticRes = await fetch(staticUrl)
    console.log('[download-cadastral-map] StaticMap status:', staticRes.status, 'content-type:', staticRes.headers.get('content-type'))

    if (staticRes.ok && (staticRes.headers.get('content-type') ?? '').includes('image')) {
      const buf = await staticRes.arrayBuffer()
      const fileName = `${project.org_id}/${project_id}/basemap_${crypto.randomUUID()}.png`
      const { error: uploadErr } = await adminClient.storage
        .from('documents')
        .upload(fileName, buf, { contentType: 'image/png', upsert: false })

      if (uploadErr) {
        console.warn('[download-cadastral-map] optional basemap upload failed')
      } else {
        savedDocs.push({ type: 'basemap', url: fileName })
      }
    }

    if (savedDocs.length === 0) {
      throw new Error('지적도 이미지 생성에 실패했습니다. VWorld API 응답을 확인해주세요.')
    }

    if (task_id) {
      const { error: taskCompleteError } = await adminClient.from('tasks').update({
        status: 'success',
        result: { maps: savedDocs },
        completed_at: new Date().toISOString(),
      }).eq('id', task_id).eq('org_id', project.org_id)
      if (taskCompleteError) throw new Error('작업 완료 상태를 저장하지 못했습니다')
    }

    return new Response(JSON.stringify({ success: true, maps: savedDocs }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[download-cadastral-map]', err)
    return new Response(JSON.stringify({ error: '지적도 다운로드를 처리하지 못했습니다' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
