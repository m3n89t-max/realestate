import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const KAKAO_CATEGORIES: { code: string; label: string }[] = [
  { code: 'CE7', label: '카페' },
  { code: 'FD6', label: '음식점' },
  { code: 'HP8', label: '병원' },
  { code: 'AC5', label: '학원' },
  { code: 'CS2', label: '편의점' },
  { code: 'AG2', label: '부동산(중개)' },
  { code: 'PM9', label: '약국' },
]

async function fetchCategory(
  code: string,
  label: string,
  lat: number,
  lng: number,
  apiKey: string,
  radius = 500
) {
  const url = `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=${code}&x=${lng}&y=${lat}&radius=${radius}&size=15&sort=distance`
  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${apiKey}` },
  })
  if (!res.ok) {
    console.error(`[kakao-poi] ${code} 요청 실패:`, res.status)
    return { label, total_count: 0, items: [] }
  }
  const data = await res.json()
  const totalCount: number = data.meta?.total_count ?? 0
  const items = (data.documents ?? []).slice(0, 10).map((d: any) => ({
    name: d.place_name,
    address: d.road_address_name || d.address_name || '',
    distance_m: parseInt(d.distance ?? '0', 10),
    phone: d.phone || undefined,
  }))
  return { label, total_count: totalCount, items }
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
      .select('lat, lng, address')
      .eq('id', project_id)
      .single()

    if (!project?.lat || !project?.lng) {
      return NextResponse.json({ error: '프로젝트 좌표가 없습니다. 주소를 다시 확인해주세요.' }, { status: 400 })
    }

    const apiKey = process.env.KAKAO_REST_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'KAKAO_REST_API_KEY가 설정되지 않았습니다' }, { status: 500 })

    // 7개 카테고리 병렬 호출
    const results = await Promise.all(
      KAKAO_CATEGORIES.map(({ code, label }) =>
        fetchCategory(code, label, project.lat!, project.lng!, apiKey)
      )
    )

    const categories: Record<string, { label: string; total_count: number; items: any[] }> = {}
    KAKAO_CATEGORIES.forEach(({ code }, i) => {
      categories[code] = results[i]
    })

    const kakao_density = {
      radius_m: 500,
      collected_at: new Date().toISOString(),
      categories,
    }

    const { error: updateErr } = await supabase
      .from('projects')
      .update({ kakao_density })
      .eq('id', project_id)

    if (updateErr) throw new Error(updateErr.message)

    return NextResponse.json({ success: true, kakao_density })
  } catch (e) {
    const message = e instanceof Error ? e.message : '업종 분석에 실패했습니다'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
