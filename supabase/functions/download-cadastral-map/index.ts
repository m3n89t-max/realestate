import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, corsHeaders } from '../_shared/cors.ts'

/**
 * 지적도 다운로드 Edge Function
 * VWorld WMS API로 지적도 이미지 생성 후 Supabase Storage에 저장
 * Endpoint: https://api.vworld.kr/req/image (Static Map)
 */
Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const body = await req.json()
    const task     = body.record ?? body
    const task_id  = task.id
    const payload  = task.payload ?? {}
    const project_id = payload.project_id ?? task.project_id

    if (!project_id) throw new Error('project_id가 없습니다')

    const vworldKey = Deno.env.get('VWORLD_API_KEY')
    if (!vworldKey) throw new Error('VWORLD_API_KEY 환경변수가 설정되지 않았습니다')

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 프로젝트에서 좌표 조회
    const { data: project } = await adminClient
      .from('projects')
      .select('lat, lng, address, org_id, sigungu_code, bjdong_code')
      .eq('id', project_id)
      .single()

    if (!project) throw new Error('프로젝트를 찾을 수 없습니다')
    if (!project.lat || !project.lng) throw new Error('좌표 정보가 없습니다. 주소 정규화를 먼저 실행하세요.')

    const lat = project.lat
    const lng = project.lng

    // task → running
    if (task_id) {
      await adminClient.from('tasks').update({
        status: 'running',
        started_at: new Date().toISOString(),
      }).eq('id', task_id)
    }

    // ── VWorld Static Map API (지적도 레이어) ─────────────────
    // 지적도(cadastral) + 일반지도 혼합으로 2장 생성
    const maps = [
      {
        type: 'cadastral',
        label: '지적도',
        layers: 'cadastral',
        zoom: 17,
        size: '800,700',
      },
      {
        type: 'hybrid',
        label: '위성+지적도',
        layers: 'Satellite,cadastral',
        zoom: 17,
        size: '800,700',
      },
    ]

    const savedDocs: { type: string; url: string }[] = []

    for (const mapConfig of maps) {
      // VWorld 이미지 API
      const params = new URLSearchParams({
        service: 'image',
        request: 'getmap',
        crs: 'EPSG:4326',
        center: `${lng},${lat}`,
        zoom: String(mapConfig.zoom),
        size: mapConfig.size,
        layers: mapConfig.layers,
        format: 'image/jpeg',
        key: vworldKey,
      })

      const imageUrl = `https://api.vworld.kr/req/image?${params.toString()}`
      console.log(`[download-cadastral-map] ${mapConfig.label} URL:`, imageUrl)

      const imgRes = await fetch(imageUrl)
      if (!imgRes.ok) {
        console.error(`[download-cadastral-map] VWorld 응답 오류 ${imgRes.status}`)
        continue
      }

      const contentType = imgRes.headers.get('content-type') ?? ''
      if (!contentType.includes('image')) {
        const text = await imgRes.text()
        console.error(`[download-cadastral-map] 이미지가 아닌 응답:`, text.slice(0, 200))
        continue
      }

      const imageBuffer = await imgRes.arrayBuffer()

      // Supabase Storage에 업로드
      const fileName = `cadastral/${project_id}/${mapConfig.type}_${Date.now()}.jpg`
      const { data: uploadData, error: uploadError } = await adminClient.storage
        .from('documents')
        .upload(fileName, imageBuffer, {
          contentType: 'image/jpeg',
          upsert: true,
        })

      if (uploadError) {
        console.error(`[download-cadastral-map] 업로드 실패:`, uploadError)
        continue
      }

      const { data: { publicUrl } } = adminClient.storage
        .from('documents')
        .getPublicUrl(fileName)

      savedDocs.push({ type: mapConfig.type, url: publicUrl })

      // documents 테이블에 저장
      await adminClient.from('documents').upsert({
        project_id,
        org_id: project.org_id,
        type: 'cadastral_map',
        status: 'completed',
        file_url: publicUrl,
        file_name: `${mapConfig.label}_${new Date().toLocaleDateString('ko-KR')}.jpg`,
        raw_data: {
          map_type: mapConfig.type,
          center: { lat, lng },
          zoom: mapConfig.zoom,
          address: project.address,
        },
        summary: `${mapConfig.label} — ${project.address} 주변 지적 현황도`,
        fetched_at: new Date().toISOString(),
      }, { onConflict: 'project_id,type' })
    }

    if (savedDocs.length === 0) throw new Error('지적도 이미지 생성에 실패했습니다')

    // task → success
    if (task_id) {
      await adminClient.from('tasks').update({
        status: 'success',
        result: { maps: savedDocs },
        completed_at: new Date().toISOString(),
      }).eq('id', task_id)
    }

    return new Response(JSON.stringify({ success: true, maps: savedDocs }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    const msg = err instanceof Error ? err.message : '지적도 다운로드 실패'
    console.error('[download-cadastral-map]', msg)
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
