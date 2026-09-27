import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { assertNoSupabaseError, authorizeDocumentDownloadRequest, markOwnedTaskFailed } from '../_shared/document-download-auth.ts'

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

  let adminClient:
    | Awaited<
      ReturnType<typeof authorizeDocumentDownloadRequest>
    >['adminClient']
    | null = null
  let orgId = ''
  let projectId = ''
  let taskId: string | null = null

  try {
    const body = await req.json()
    const authorization = await authorizeDocumentDownloadRequest(
      req,
      body,
      ['download_cadastral_map'],
    )
    adminClient = authorization.adminClient
    orgId = authorization.orgId
    projectId = authorization.projectId
    taskId = authorization.taskId

    const vworldKey = Deno.env.get('VWORLD_API_KEY')
    if (!vworldKey) {
      throw new Error('VWORLD_API_KEY 환경변수가 설정되지 않았습니다')
    }

    // 프로젝트 좌표 조회
    const { data: project, error: projectError } = await adminClient
      .from('projects')
      .select('lat, lng, address, org_id')
      .eq('id', projectId)
      .eq('org_id', orgId)
      .single()

    assertNoSupabaseError(projectError, '프로젝트 조회 실패')
    if (!project) throw new Error('프로젝트를 찾을 수 없습니다')
    if (!project.lat || !project.lng) {
      throw new Error('좌표 정보가 없습니다. 주소 정규화를 먼저 실행하세요.')
    }

    const lat = Number(project.lat)
    const lng = Number(project.lng)

    if (taskId) {
      const { data, error } = await adminClient.from('tasks').update({
        status: 'running',
        started_at: new Date().toISOString(),
      })
        .eq('id', taskId)
        .eq('org_id', orgId)
        .eq('project_id', projectId)
        .select('id')
        .single()
      assertNoSupabaseError(error, '작업 실행 상태 저장 실패')
      if (!data) throw new Error('실행할 소유 작업을 찾을 수 없습니다')
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
      SERVICE: 'WMS',
      REQUEST: 'GetMap',
      VERSION: '1.3.0',
      LAYERS: 'lp_pa_cbnd_jibun',
      STYLES: '',
      CRS: 'EPSG:4326',
      BBOX: `${minLat},${minLng},${maxLat},${maxLng}`, // WMS 1.3.0: lat,lng 순서
      WIDTH: '800',
      HEIGHT: '700',
      FORMAT: 'image/png',
      TRANSPARENT: 'FALSE',
      KEY: vworldKey,
    })
    const wmsUrl = `https://api.vworld.kr/req/wms?${wmsParams.toString()}`

    const wmsRes = await fetch(wmsUrl)
    console.log(
      '[download-cadastral-map] WMS status:',
      wmsRes.status,
      'content-type:',
      wmsRes.headers.get('content-type'),
    )

    if (
      !wmsRes.ok ||
      !(wmsRes.headers.get('content-type') ?? '').includes('image')
    ) {
      throw new Error(`VWorld WMS 이미지 응답 오류 (${wmsRes.status})`)
    }

    const wmsBuffer = await wmsRes.arrayBuffer()
    const cadastralFileName = `${orgId}/${projectId}/cadastral_${Date.now()}.png`
    const { error: cadastralUploadError } = await adminClient.storage
      .from('documents')
      .upload(cadastralFileName, wmsBuffer, {
        contentType: 'image/png',
        upsert: true,
      })
    assertNoSupabaseError(cadastralUploadError, '지적도 Storage 업로드 실패')

    const { data: cadastralUrlData } = adminClient.storage.from('documents')
      .getPublicUrl(cadastralFileName)
    if (!cadastralUrlData.publicUrl) {
      throw new Error('지적도 공개 URL 생성 실패')
    }
    savedDocs.push({ type: 'cadastral', url: cadastralUrlData.publicUrl })

    // ── 2. 배경지도 StaticMap (white) ─────────────────────────
    const staticParams = new URLSearchParams({
      service: 'image',
      request: 'getmap',
      version: '2.0.0',
      crs: 'EPSG:4326',
      center: `${lng},${lat}`,
      zoom: '17',
      size: '800,700',
      layers: 'white',
      styles: '',
      format: 'image/png',
      key: vworldKey,
    })
    const staticUrl = `https://api.vworld.kr/req/image?${staticParams.toString()}`

    const staticRes = await fetch(staticUrl)
    console.log(
      '[download-cadastral-map] StaticMap status:',
      staticRes.status,
      'content-type:',
      staticRes.headers.get('content-type'),
    )

    if (
      !staticRes.ok ||
      !(staticRes.headers.get('content-type') ?? '').includes('image')
    ) {
      throw new Error(`VWorld 배경지도 이미지 응답 오류 (${staticRes.status})`)
    }

    const staticBuffer = await staticRes.arrayBuffer()
    const basemapFileName = `${orgId}/${projectId}/basemap_${Date.now()}.png`
    const { error: basemapUploadError } = await adminClient.storage
      .from('documents')
      .upload(basemapFileName, staticBuffer, {
        contentType: 'image/png',
        upsert: true,
      })
    assertNoSupabaseError(basemapUploadError, '배경지도 Storage 업로드 실패')

    const { data: basemapUrlData } = adminClient.storage.from('documents')
      .getPublicUrl(basemapFileName)
    if (!basemapUrlData.publicUrl) {
      throw new Error('배경지도 공개 URL 생성 실패')
    }
    savedDocs.push({ type: 'basemap', url: basemapUrlData.publicUrl })

    const documentValues = {
      project_id: projectId,
      org_id: orgId,
      type: 'cadastral_map',
      status: 'completed',
      file_url: cadastralUrlData.publicUrl,
      file_name: `지적도_${new Date().toLocaleDateString('ko-KR')}.png`,
      raw_data: {
        map_type: 'cadastral_wms',
        center: { lat, lng },
        bbox: { minLat, maxLat, minLng, maxLng },
        address: project.address,
      },
      summary: `지적도 — ${project.address} 지번 경계`,
      fetched_at: new Date().toISOString(),
    }
    const { data: existingDocument, error: documentReadError } = await adminClient
      .from('documents')
      .select('id')
      .eq('project_id', projectId)
      .eq('org_id', orgId)
      .eq('type', 'cadastral_map')
      .maybeSingle()
    assertNoSupabaseError(documentReadError, '기존 지적도 문서 조회 실패')

    const documentWrite = existingDocument
      ? adminClient.from('documents').update(documentValues)
        .eq('id', existingDocument.id)
        .eq('project_id', projectId)
        .eq('org_id', orgId)
        .select('id')
        .single()
      : adminClient.from('documents').insert(documentValues).select('id')
        .single()
    const { data: savedDocument, error: documentWriteError } = await documentWrite
    assertNoSupabaseError(documentWriteError, '지적도 문서 저장 실패')
    if (!savedDocument) throw new Error('지적도 문서 저장 결과가 없습니다')

    if (taskId) {
      const { data, error } = await adminClient.from('tasks').update({
        status: 'success',
        result: { maps: savedDocs },
        completed_at: new Date().toISOString(),
      })
        .eq('id', taskId)
        .eq('org_id', orgId)
        .eq('project_id', projectId)
        .select('id')
        .single()
      assertNoSupabaseError(error, '작업 성공 상태 저장 실패')
      if (!data) throw new Error('완료할 소유 작업을 찾을 수 없습니다')
    }

    return new Response(JSON.stringify({ success: true, maps: savedDocs }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : '지적도 다운로드 실패'
    console.error('[download-cadastral-map]', msg)

    if (adminClient && taskId) {
      try {
        await markOwnedTaskFailed(adminClient, taskId, orgId, projectId, msg)
      } catch (taskError) {
        console.error(
          '[download-cadastral-map] 실패 작업 상태 저장 오류:',
          taskError instanceof Error ? taskError.message : '알 수 없는 오류',
        )
      }
    }
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
