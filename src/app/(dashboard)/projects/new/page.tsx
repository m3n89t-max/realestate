'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { StepperHeader, StepperNav } from '@/components/ui/StepperForm'
import AssetUploader from '@/components/ui/AssetUploader'
import { MapPin, Home } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import type { PropertyType } from '@/lib/types'

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global { interface Window { kakao: any } }

/** 카카오 JS SDK를 이용한 클라이언트 사이드 지오코딩 (서버 REST API 키 불필요) */
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number; jibun_address: string | null } | null> {
  const apiKey = process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY
  if (!apiKey) return null

  // SDK 로드 (아직 로드되지 않은 경우)
  if (!window.kakao?.maps?.services) {
    await new Promise<void>((resolve, reject) => {
      if (document.querySelector('script[src*="dapi.kakao.com"]')) {
        // 이미 스크립트 태그는 있지만 로딩 중
        const check = setInterval(() => {
          if (window.kakao?.maps?.services) { clearInterval(check); resolve() }
        }, 100)
        setTimeout(() => { clearInterval(check); reject(new Error('SDK timeout')) }, 10000)
        return
      }
      const script = document.createElement('script')
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${apiKey}&autoload=false&libraries=services`
      script.onload = () => window.kakao.maps.load(resolve)
      script.onerror = reject
      document.head.appendChild(script)
    })
  }

  return new Promise((resolve) => {
    const geocoder = new window.kakao.maps.services.Geocoder()
    geocoder.addressSearch(address, (result: any[], status: string) => {
      if (status === window.kakao.maps.services.Status.OK && result.length > 0) {
        const r = result[0]
        resolve({
          lat: parseFloat(r.y),
          lng: parseFloat(r.x),
          jibun_address: r.address?.address_name ?? null,
        })
      } else {
        // 주소 검색 실패 시 키워드 검색으로 fallback
        const places = new window.kakao.maps.services.Places()
        places.keywordSearch(address, (kResult: any[], kStatus: string) => {
          if (kStatus === window.kakao.maps.services.Status.OK && kResult.length > 0) {
            resolve({
              lat: parseFloat(kResult[0].y),
              lng: parseFloat(kResult[0].x),
              jibun_address: kResult[0].address_name ?? null,
            })
          } else {
            resolve(null)
          }
        })
      }
    })
  })
}

const STEPS = [
  { id: 'basic', title: '기본 정보', description: '주소 및 매물 유형' },
  { id: 'photos', title: '사진/동영상', description: '매물 사진 · 동영상 추가' },
  { id: 'analysis', title: '입지 분석', description: 'AI 입지 분석 실행' },
]

const PROPERTY_TYPES: { value: PropertyType; label: string; icon: string }[] = [
  { value: 'apartment', label: '아파트', icon: '' },
  { value: 'officetel', label: '오피스텔', icon: '' },
  { value: 'villa', label: '빌라/다세대', icon: '' },
  { value: 'commercial', label: '상가/사무실', icon: '' },
  { value: 'land', label: '토지', icon: '' },
  { value: 'house', label: '단독주택', icon: '' },
]

const DIRECTIONS = ['남향', '남동향', '남서향', '동향', '서향', '북향', '북동향', '북서향']

const COMMON_FEATURES = [
  '역세권', '학군우수', '신축', '주차가능', '남향', '조용한', '뷰좋음',
  '풀옵션', '관리비저렴', '대단지', '커뮤니티시설', '공원인접', '상권인접', '즉시입주',
]

interface FormData {
  address: string
  property_type: PropertyType | ''
  price: string
  monthly_rent: string
  deposit: string
  key_money: string
  area: string
  floor: string
  total_floors: string
  direction: string
  features: string[]
  building_condition: string
  floor_composition: string
  rental_status: string
  note: string
}

export default function NewProjectPage() {
  const router = useRouter()
  const supabase = createClient()
  const [currentStep, setCurrentStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [projectId, setProjectId] = useState<string | null>(null)

  const [form, setForm] = useState<FormData>({
    address: '',
    property_type: '',
    price: '',
    monthly_rent: '',
    deposit: '',
    key_money: '',
    area: '',
    floor: '',
    total_floors: '',
    direction: '',
    features: [],
    building_condition: '',
    floor_composition: '',
    rental_status: '',
    note: '',
  })

  const handleChange = (field: keyof FormData, value: string | string[]) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const toggleFeature = (feature: string) => {
    setForm(prev => ({
      ...prev,
      features: prev.features.includes(feature)
        ? prev.features.filter(f => f !== feature)
        : [...prev.features, feature],
    }))
  }

  const canNext = (): boolean => {
    if (currentStep === 0) return form.address.length > 0 && form.property_type !== ''
    return true
  }

  const handleNext = async () => {
    if (currentStep === 0 && !projectId) {
      // 1단계 완료 시 프로젝트 생성
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          toast.error('로그인이 필요합니다')
          return
        }

        let { data: membership } = await supabase
          .from('memberships')
          .select('org_id')
          .eq('user_id', user.id)
          .not('joined_at', 'is', null)
          .limit(1)
          .single()

        // 조직이 없으면 자동 생성
        if (!membership) {
          const displayName = user.email?.split('@')[0] ?? '사용자'
          const { data: newOrg, error: orgErr } = await supabase
            .from('organizations')
            .insert({ name: `${displayName}의 중개사무소`, plan_type: 'free' })
            .select('id')
            .single()
          if (orgErr || !newOrg) {
            toast.error(`조직 생성 실패: ${orgErr?.message ?? '알 수 없는 오류'}`)
            return
          }
          const { error: memErr } = await supabase
            .from('memberships')
            .insert({ org_id: newOrg.id, user_id: user.id, role: 'owner', joined_at: new Date().toISOString() })
          if (memErr) {
            toast.error(`멤버십 생성 실패: ${memErr.message}`)
            return
          }
          membership = { org_id: newOrg.id }
        }

        // 주소를 좌표로 변환 (카카오 JS SDK 클라이언트 사이드 지오코딩)
        let lat: number | null = null
        let lng: number | null = null
        let jibunAddress: string | null = null
        try {
          const geoResult = await geocodeAddress(form.address)
          if (geoResult) {
            lat = geoResult.lat
            lng = geoResult.lng
            jibunAddress = geoResult.jibun_address
          } else {
            toast('주소 좌표를 찾지 못했습니다. 지도 마커가 표시되지 않을 수 있습니다.', { duration: 5000 })
            console.warn('지오코딩 결과 없음:', form.address)
          }
        } catch (geoErr) {
          toast('주소 좌표 변환 중 오류가 발생했습니다.', { duration: 5000 })
          console.warn('지오코딩 실패 (계속 진행):', geoErr)
        }

        const { data, error } = await supabase
          .from('projects')
          .insert({
            org_id: membership.org_id,
            created_by: user.id,
            address: form.address,
            jibun_address: jibunAddress,
            lat,
            lng,
            property_type: form.property_type || null,
            price: form.price ? parseInt(form.price.replace(/,/g, '')) * 10000 : null,
            monthly_rent: form.monthly_rent ? parseInt(form.monthly_rent.replace(/,/g, '')) * 10000 : null,
            deposit: form.deposit ? parseInt(form.deposit.replace(/,/g, '')) * 10000 : null,
            key_money: form.key_money ? parseInt(form.key_money.replace(/,/g, '')) * 10000 : null,
            area: form.area ? parseFloat(form.area) : null,
            floor: form.floor ? parseInt(form.floor) : null,
            total_floors: form.total_floors ? parseInt(form.total_floors) : null,
            direction: form.direction || null,
            features: form.features,
            building_condition: form.building_condition || null,
            floor_composition: form.floor_composition || null,
            rental_status: form.rental_status || null,
            note: form.note || null,
            status: 'draft',
          })
          .select()
          .single()

        if (error) throw error
        const newProjectId = data.id
        setProjectId(newProjectId)

        // normalize-parcel: 주소 정규화 + POI + 토지이용규제 + 실거래가 수집
        try {
          await supabase.functions.invoke('normalize-parcel', {
            body: { parcel_input: form.address, project_id: newProjectId },
          })
        } catch (normErr) {
          console.warn('[normalize-parcel] 비필수 오류 (계속 진행):', normErr)
        }

        toast.success('기본 정보 및 주변 데이터 수집이 완료되었습니다')
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        toast.error(`저장 실패: ${msg}`)
        console.error(err)
        return
      }
    }
    setCurrentStep(prev => prev + 1)
  }

  const handleSubmit = async () => {
    if (!projectId) return
    setSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: membership } = await supabase
        .from('memberships')
        .select('org_id')
        .eq('user_id', user.id)
        .not('joined_at', 'is', null)
        .limit(1)
        .single()

      if (!membership) return

      // 상태 active로 업데이트
      await supabase.from('projects').update({ status: 'active' }).eq('id', projectId)

      // analyze-location 직접 호출 (실제 POI/토지이용/실거래가 데이터 활용)
      toast('AI 입지 분석 중... 잠시 기다려주세요', { duration: 8000 })
      const { error: analyzeErr } = await supabase.functions.invoke('analyze-location', {
        body: { project_id: projectId },
      })
      if (analyzeErr) console.warn('[analyze-location] 오류:', analyzeErr)

      toast.success('매물 등록 및 입지 분석이 완료되었습니다!')
      router.push(`/projects/${projectId}`)
    } catch (err) {
      toast.error('완료 처리에 실패했습니다')
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpload = async (files: File[]) => {
    if (!projectId) return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      toast.error('사용자 인증 정보를 찾을 수 없습니다.')
      return
    }

    const { data: membership, error: memError } = await supabase
      .from('memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .not('joined_at', 'is', null)
      .limit(1)
      .single()

    if (memError || !membership) {
      console.error('Membership fetch failed:', memError)
      toast.error('조직 정보를 불러오지 못했습니다.')
      return
    }

    let firstUploadedUrl: string | null = null
    let uploadSuccessCount = 0

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const ext = file.name.split('.').pop()
      const fileName = `${Math.random().toString(36).substring(2, 10)}_${Date.now()}.${ext}`
      const filePath = `${membership.org_id}/${projectId}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('project-assets')
        .upload(filePath, file)

      if (uploadError) {
        console.error('File upload failed detailed error:', {
          error: uploadError,
          path: filePath,
          fileName: file.name,
          bucket: 'project-assets'
        })
        toast.error(`${file.name} 업로드 실패: ${uploadError.message} (권한 또는 스토리지 설정을 확인하세요)`)
        continue
      }

      const { data: urlData } = supabase.storage
        .from('project-assets')
        .getPublicUrl(filePath)

      const fileUrl = urlData.publicUrl

      if (!firstUploadedUrl) {
        firstUploadedUrl = fileUrl
      }

      const { error: insertError } = await supabase.from('assets').insert({
        project_id: projectId,
        org_id: membership.org_id,
        type: file.type.startsWith('video/') ? 'video' : 'image',
        file_name: file.name,
        file_url: fileUrl,
        file_size: file.size,
        mime_type: file.type,
        is_cover: i === 0,
        sort_order: i
      })

      if (insertError) {
        console.error('Asset insert error:', insertError)
        toast.error(`${file.name} 저장 실패: ${insertError.message}`)
      } else {
        uploadSuccessCount++
      }
    }

    if (firstUploadedUrl) {
      const { data: projectData } = await supabase.from('projects').select('cover_image_url').eq('id', projectId).single()
      if (!projectData?.cover_image_url) {
        const { error: updateError } = await supabase.from('projects').update({ cover_image_url: firstUploadedUrl }).eq('id', projectId)
        if (updateError) {
          console.error('Project cover image update failed:', updateError)
        }
      }
    }

    if (uploadSuccessCount > 0) {
      toast.success(`${uploadSuccessCount}개의 파일이 업로드되었습니다.`)
    }
  }

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      <div className="mb-8">
        <h1 className="text-xl font-bold text-gray-900">새 매물 등록</h1>
        <p className="text-sm text-gray-500 mt-1">매물 정보를 입력하면 AI가 자동으로 마케팅 콘텐츠를 생성합니다</p>
      </div>

      {/* 스텝 인디케이터 */}
      <div className="card p-6 mb-6">
        <StepperHeader steps={STEPS} currentStep={currentStep} />
      </div>

      {/* 스텝 콘텐츠 */}
      <div className="card p-6">
        {/* Step 1: 기본 정보 */}
        {currentStep === 0 && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-brand-600 mb-4">
              <MapPin size={18} />
              <h2 className="font-semibold">기본 정보 입력</h2>
            </div>

            {/* 주소 */}
            <div>
              <label className="label">주소 *</label>
              <input
                value={form.address}
                onChange={e => handleChange('address', e.target.value)}
                placeholder="서울시 강남구 역삼동 123 역삼 래미안 101동 1503호"
                className="input"
              />
            </div>

            {/* 매물 유형 */}
            <div>
              <label className="label">매물 유형 *</label>
              <div className="grid grid-cols-3 gap-2">
                {PROPERTY_TYPES.map(type => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => handleChange('property_type', type.value)}
                    className={`p-3 rounded-lg border-2 text-sm font-medium transition-colors flex flex-col items-center gap-1 ${form.property_type === type.value
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-gray-200 hover:border-gray-300 text-gray-600'
                      }`}
                  >
                    <span className="text-xl">{type.icon}</span>
                    {type.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 가격 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">매매가 (만원)</label>
                <input
                  value={form.price}
                  onChange={e => handleChange('price', e.target.value)}
                  placeholder="85000"
                  className="input"
                  type="number"
                />
              </div>
              <div>
                <label className="label">보증금 (만원, 해당시)</label>
                <input
                  value={form.deposit}
                  onChange={e => handleChange('deposit', e.target.value)}
                  placeholder="5000"
                  className="input"
                  type="number"
                />
              </div>
              <div>
                <label className="label">월세 (만원, 해당시)</label>
                <input
                  value={form.monthly_rent}
                  onChange={e => handleChange('monthly_rent', e.target.value)}
                  placeholder="150"
                  className="input"
                  type="number"
                />
              </div>
              <div>
                <label className="label">권리금 (만원, 해당시)</label>
                <input
                  value={form.key_money}
                  onChange={e => handleChange('key_money', e.target.value)}
                  placeholder="3000"
                  className="input"
                  type="number"
                />
              </div>
            </div>

            {/* 면적 및 층수 */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="label">전용면적 (㎡)</label>
                <input
                  value={form.area}
                  onChange={e => handleChange('area', e.target.value)}
                  placeholder="84.92"
                  className="input"
                  type="number"
                  step="0.01"
                />
              </div>
              <div>
                <label className="label">해당 층</label>
                <input
                  value={form.floor}
                  onChange={e => handleChange('floor', e.target.value)}
                  placeholder="15"
                  className="input"
                  type="number"
                />
              </div>
              <div>
                <label className="label">전체 층수</label>
                <input
                  value={form.total_floors}
                  onChange={e => handleChange('total_floors', e.target.value)}
                  placeholder="25"
                  className="input"
                  type="number"
                />
              </div>
            </div>

            {/* 방향 */}
            <div>
              <label className="label">방향</label>
              <div className="flex flex-wrap gap-2">
                {DIRECTIONS.map(dir => (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => handleChange('direction', form.direction === dir ? '' : dir)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${form.direction === dir
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'border-gray-200 text-gray-600 hover:border-brand-300'
                      }`}
                  >
                    {dir}
                  </button>
                ))}
              </div>
            </div>

            {/* 특징 */}
            <div>
              <label className="label">매물 특징 (복수 선택)</label>
              <div className="flex flex-wrap gap-2">
                {COMMON_FEATURES.map(feature => (
                  <button
                    key={feature}
                    type="button"
                    onClick={() => toggleFeature(feature)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${form.features.includes(feature)
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'border-gray-200 text-gray-600 hover:border-brand-300'
                      }`}
                  >
                    {feature}
                  </button>
                ))}
              </div>
            </div>

            {/* 현장 관찰 메모 */}
            <div className="border-t pt-5">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-base">📋</span>
                <h3 className="font-semibold text-gray-800">현장 관찰 메모</h3>
                <span className="text-xs text-gray-400 ml-1">현장 방문 후 직접 확인한 내용 - AI 콘텐츠 품질에 직결됩니다</span>
              </div>

              {/* 건물 상태 */}
              <div className="mb-4">
                <label className="label">건물 상태</label>
                <div className="flex gap-2 flex-wrap">
                  {['신축', '양호', '보통', '노후'].map(cond => (
                    <button
                      key={cond}
                      type="button"
                      onClick={() => handleChange('building_condition', form.building_condition === cond ? '' : cond)}
                      className={`px-4 py-2 rounded-lg text-sm border transition-colors ${form.building_condition === cond
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'border-gray-200 text-gray-600 hover:border-brand-300'
                        }`}
                    >
                      {cond}
                    </button>
                  ))}
                </div>
              </div>

              {/* 층별 구성 */}
              <div className="mb-4">
                <label className="label">층별 구성</label>
                <textarea
                  value={form.floor_composition}
                  onChange={e => handleChange('floor_composition', e.target.value)}
                  placeholder={`예시:\n1층: 편의점 (임대중, 보증금 1000/월세 150)\n2층: 사무실 (공실)\n3층: 주택`}
                  rows={3}
                  className="input resize-none text-sm"
                />
              </div>

              {/* 임대 현황 */}
              <div className="mb-4">
                <label className="label">임대 현황</label>
                <textarea
                  value={form.rental_status}
                  onChange={e => handleChange('rental_status', e.target.value)}
                  placeholder={`예시:\n1층 편의점 임대중 - 보증금 1000만/월세 150만, 계약만료 2026.06\n2층 공실 (전 입주자 이사 완료)\n수익률: 약 4.5% 예상`}
                  rows={3}
                  className="input resize-none text-sm"
                />
              </div>

              {/* 현장 종합 메모 */}
              <div>
                <label className="label">현장 종합 메모</label>
                <textarea
                  value={form.note}
                  onChange={e => handleChange('note', e.target.value)}
                  placeholder={`현장에서 직접 보고 느낀 것을 자유롭게 적어주세요.\n\n예시:\n- 건물 외관: 외벽 도색 상태 양호, 주차 4대 가능\n- 내부 상태: 전체 리모델링 완료 (2023년), 신규 욕실/주방\n- 주변 환경: 이면도로 위치, 유동인구 적당, 맞은편 공원\n- 장점: 대로변 접근 용이, 버스정류장 30m\n- 주의사항: 3층 누수 흔적 있음 (수리 완료 확인 필요)`}
                  rows={5}
                  className="input resize-none text-sm"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: 사진 업로드 */}
        {currentStep === 1 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-brand-600 mb-4">
              <Home size={18} />
              <h2 className="font-semibold">사진 &amp; 동영상 업로드</h2>
            </div>
            <p className="text-sm text-gray-500">
              사진과 동영상을 함께 업로드하세요. AI가 실제 매물 이미지를 분석하여 카드뉴스 · 쇼츠 스크립트 품질을 높입니다.
            </p>
            <div className="flex gap-3 text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
              <span className="text-blue-500 font-medium">사진</span> 카드뉴스 배경 · AI 비전 분석
              <span className="mx-1">·</span>
              <span className="text-purple-500 font-medium">동영상</span> 쇼츠 편집 소스 · 장면 구성 참고
            </div>
            <AssetUploader
              accept={{
                'image/*': ['.jpg', '.jpeg', '.png', '.webp'],
                'video/*': ['.mp4', '.mov', '.avi', '.webm'],
              }}
              maxFiles={30}
              maxSize={200 * 1024 * 1024}
              onUpload={handleUpload}
            />
          </div>
        )}

        {/* Step 3: 입지 분석 */}
        {currentStep === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-brand-600 mb-4">
              <MapPin size={18} />
              <h2 className="font-semibold">입지 분석</h2>
            </div>
            <div className="bg-brand-50 rounded-xl p-5">
              <p className="text-sm font-medium text-brand-800">AI 입지 분석 준비됨</p>
              <p className="text-sm text-brand-600 mt-1">
                &quot;완료&quot; 버튼을 누르면 아래 항목이 자동 분석됩니다:
              </p>
              <ul className="mt-3 space-y-1.5">
                {[
                  '교통 (도보/차량 시간 기반)',
                  '학군 (학교 위치 및 거리)',
                  '상권 (마트/병원/공원 등)',
                  '입지 장점 7가지 자동 생성',
                  '추천 타겟 3종 분석',
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-brand-700">
                    <span className="w-5 h-5 bg-brand-200 rounded-full flex items-center justify-center text-xs font-bold text-brand-700">
                      {i + 1}
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-gray-400">
              * 분석에는 약 10~30초가 소요됩니다. 등록 후 프로젝트 상세 페이지에서 확인하세요.
            </p>
          </div>
        )}

        {/* 네비게이션 */}
        <StepperNav
          currentStep={currentStep}
          totalSteps={STEPS.length}
          onPrev={() => setCurrentStep(prev => prev - 1)}
          onNext={handleNext}
          onSubmit={handleSubmit}
          isSubmitting={submitting}
          nextLabel="다음 단계"
          submitLabel="매물 등록 완료"
          canNext={canNext()}
        />
      </div>
    </div>
  )
}
