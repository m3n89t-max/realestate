import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const POI_CATEGORIES: Record<string, string> = {
  subway: 'SW8',
  mart: 'MT1',
  hospital: 'HP8',
  school: 'SC4',
  convenience: 'CS2',
  pharmacy: 'PM9',
  bank: 'BK9',
  culture: 'CT1',
  cafe: 'CE7',
  restaurant: 'FD6',
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '인증되지 않은 요청입니다' }, { status: 401 })

    const { project_id } = await req.json()
    if (!project_id) return NextResponse.json({ error: 'project_id가 필요합니다' }, { status: 400 })

    const { data: project } = await supabase
      .from('projects')
      .select('lat, lng')
      .eq('id', project_id)
      .single()

    if (!project?.lat || !project?.lng) {
      return NextResponse.json({ error: '프로젝트 좌표가 없습니다. 좌표를 먼저 수집해주세요.' }, { status: 400 })
    }

    const apiKey = process.env.KAKAO_REST_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'KAKAO_REST_API_KEY가 설정되지 않았습니다' }, { status: 500 })

    const collected: Record<string, any[]> = {}

    await Promise.allSettled(
      Object.entries(POI_CATEGORIES).map(async ([key, code]) => {
        try {
          const url = `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=${code}&radius=1000&x=${project.lng}&y=${project.lat}&size=5`
          const res = await fetch(url, { headers: { Authorization: `KakaoAK ${apiKey}` } })
          if (!res.ok) return
          const data = await res.json()
          if (data.documents?.length > 0) {
            collected[key] = data.documents.map((d: any) => ({
              name: d.place_name,
              distance_m: parseInt(d.distance) || null,
              address: d.road_address_name || d.address_name,
              lat: parseFloat(d.y),
              lng: parseFloat(d.x),
            }))
          }
        } catch { /* 개별 실패 무시 */ }
      })
    )

    if (Object.keys(collected).length === 0) {
      return NextResponse.json({ error: '수집된 주변 시설 데이터가 없습니다.' }, { status: 404 })
    }

    const { error: updateErr } = await supabase
      .from('projects')
      .update({ poi_data: collected })
      .eq('id', project_id)

    if (updateErr) throw new Error(updateErr.message)

    return NextResponse.json({ success: true, poi_data: collected })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'POI 데이터 수집에 실패했습니다'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
