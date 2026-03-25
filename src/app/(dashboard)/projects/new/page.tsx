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

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number; jibun_address: string | null } | null> {
  const apiKey = process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY
  if (!apiKey) return null
  if (!window.kakao?.maps?.services) {
    await new Promise<void>((resolve, reject) => {
      if (document.querySelector('script[src*="dapi.kakao.com"]')) {
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
        resolve({ lat: parseFloat(r.y), lng: parseFloat(r.x), jibun_address: r.address?.address_name ?? null })
      } else {
        const places = new window.kakao.maps.services.Places()
        places.keywordSearch(address, (kResult: any[], kStatus: string) => {
          if (kStatus === window.kakao.maps.services.Status.OK && kResult.length > 0) {
            resolve({ lat: parseFloat(kResult[0].y), lng: parseFloat(kResult[0].x), jibun_address: kResult[0].address_name ?? null })
          } else { resolve(null) }
        })
      }
    })
  })
}

const STEPS = [
  { id: 'basic', title: '매물 정보표', description: '공인중개사 확인·설명서 기준' },
  { id: 'photos', title: '사진/동영상', description: '매물 사진 · 동영상 추가' },
  { id: 'analysis', title: '입지 분석', description: 'AI 입지 분석 실행' },
]

const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
  { value: 'apartment', label: '아파트' },
  { value: 'officetel', label: '오피스텔' },
  { value: 'villa', label: '빌라/다세대' },
  { value: 'commercial', label: '상가/사무실' },
  { value: 'land', label: '토지' },
  { value: 'house', label: '단독주택' },
]

const DIRECTIONS = ['남향', '남동향', '남서향', '동향', '서향', '북향', '북동향', '북서향']

const COMMON_FEATURES = [
  '역세권', '학군우수', '신축', '주차가능', '남향', '조용한', '뷰좋음',
  '풀옵션', '관리비저렴', '대단지', '커뮤니티시설', '공원인접', '상권인접', '즉시입주',
]

interface FormData {
  address: string
  property_type: PropertyType | ''
  property_category: string
  main_use: string
  transaction_type: 'sale' | 'lease' | 'rent'
  price: string
  monthly_rent: string
  deposit: string
  key_money: string
  area: string
  land_area: string
  total_area: string
  floor: string
  whole_building: boolean   // UI전용: 건물 전체 여부
  total_floors: string
  rooms_count: string
  bathrooms_count: string
  direction: string
  approval_date: string
  parking_legal: string
  parking_actual: string
  move_in_date: string
  management_fee_detail: string
  features: string[]
  building_condition: string
  floor_composition: string
  rental_status: string
  note: string
}

function TLabel({ children }: { children: React.ReactNode }) {
  return (
    <td className="border border-gray-300 bg-blue-50 px-3 py-2 text-xs font-semibold text-gray-700 whitespace-nowrap align-middle w-28">
      {children}
    </td>
  )
}
function TCell({ children, colSpan }: { children: React.ReactNode; colSpan?: number }) {
  return (
    <td className="border border-gray-300 px-2 py-1.5 align-middle" colSpan={colSpan}>
      {children}
    </td>
  )
}
function TInput({ value, onChange, placeholder, type = 'text', className = '', disabled }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; className?: string; disabled?: boolean
}) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      type={type}
      disabled={disabled}
      className={`w-full text-sm border-0 outline-none bg-transparent px-1 py-0.5 placeholder:text-gray-300 disabled:text-gray-400 ${className}`}
    />
  )
}

export default function NewProjectPage() {
  const router = useRouter()
  const supabase = createClient()
  const [currentStep, setCurrentStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [nextLoading, setNextLoading] = useState(false)
  const [projectId, setProjectId] = useState<string | null>(null)

  const [form, setForm] = useState<FormData>({
    address: '',
    property_type: '',
    property_category: '',
    main_use: '',
    transaction_type: 'sale',
    price: '',
    monthly_rent: '',
    deposit: '',
    key_money: '',
    area: '',
    land_area: '',
    total_area: '',
    floor: '',
    whole_building: false,
    total_floors: '',
    rooms_count: '',
    bathrooms_count: '',
    direction: '',
    approval_date: '',
    parking_legal: '',
    parking_actual: '',
    move_in_date: '',
    management_fee_detail: '',
    features: [],
    building_condition: '',
    floor_composition: '',
    rental_status: '',
    note: '',
  })

  const set = (field: keyof FormData, value: string | string[] | boolean) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const toggleFeature = (f: string) =>
    setForm(prev => ({
      ...prev,
      features: prev.features.includes(f) ? prev.features.filter(x => x !== f) : [...prev.features, f],
    }))

  const toggleWholeBuilding = () => {
    setForm(prev => {
      const next = !prev.whole_building
      const features = next
        ? prev.features.includes('건물전체') ? prev.features : [...prev.features, '건물전체']
        : prev.features.filter(f => f !== '건물전체')
      return { ...prev, whole_building: next, floor: next ? '' : prev.floor, features }
    })
  }

  const canNext = () => {
    if (currentStep === 0) return form.address.length > 0
    return true
  }

  const handleNext = async () => {
    if (currentStep === 0 && !projectId) {
      setNextLoading(true)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { toast.error('로그인이 필요합니다'); return }

        let { data: membership } = await supabase
          .from('memberships').select('org_id').eq('user_id', user.id)
          .not('joined_at', 'is', null).limit(1).single()

        if (!membership) {
          const displayName = user.email?.split('@')[0] ?? '사용자'
          const { data: newOrg, error: orgErr } = await supabase
            .from('organizations').insert({ name: `${displayName}의 중개사무소`, plan_type: 'free' })
            .select('id').single()
          if (orgErr || !newOrg) { toast.error(`조직 생성 실패: ${orgErr?.message}`); return }
          await supabase.from('memberships').insert({
            org_id: newOrg.id, user_id: user.id, role: 'owner', joined_at: new Date().toISOString()
          })
          membership = { org_id: newOrg.id }
        }

        let lat: number | null = null, lng: number | null = null, jibunAddress: string | null = null
        try {
          const geo = await geocodeAddress(form.address)
          if (geo) { lat = geo.lat; lng = geo.lng; jibunAddress = geo.jibun_address }
          else toast('주소 좌표를 찾지 못했습니다.', { duration: 5000 })
        } catch { toast('주소 좌표 변환 오류', { duration: 5000 }) }

        const { data, error } = await supabase.from('projects').insert({
          org_id: membership.org_id,
          created_by: user.id,
          address: form.address,
          jibun_address: jibunAddress,
          lat, lng,
          property_type: form.property_type || null,
          property_category: form.property_category || null,
          main_use: form.main_use || null,
          transaction_type: form.transaction_type,
          price: form.price ? parseInt(form.price) * 10000 : null,
          monthly_rent: form.monthly_rent ? parseInt(form.monthly_rent) * 10000 : null,
          deposit: form.deposit ? parseInt(form.deposit) * 10000 : null,
          key_money: form.key_money ? parseInt(form.key_money) * 10000 : null,
          area: form.area ? parseFloat(form.area) : null,
          land_area: form.land_area ? parseFloat(form.land_area) : null,
          total_area: form.total_area ? parseFloat(form.total_area) : null,
          // 건물 전체이면 floor=null
          floor: form.whole_building ? null : (form.floor ? parseInt(form.floor) : null),
          total_floors: form.total_floors ? parseInt(form.total_floors) : null,
          rooms_count: form.rooms_count ? parseInt(form.rooms_count) : null,
          bathrooms_count: form.bathrooms_count ? parseInt(form.bathrooms_count) : null,
          direction: form.direction || null,
          approval_date: form.approval_date || null,
          parking_legal: form.parking_legal ? parseInt(form.parking_legal) : null,
          parking_actual: form.parking_actual ? parseInt(form.parking_actual) : null,
          move_in_date: form.move_in_date || null,
          management_fee_detail: form.management_fee_detail || null,
          features: form.features,
          building_condition: form.building_condition || null,
          floor_composition: form.floor_composition || null,
          rental_status: form.rental_status || null,
          note: form.note || null,
          status: 'draft',
        }).select().single()

        if (error) throw error
        setProjectId(data.id)

        try {
          await supabase.functions.invoke('normalize-parcel', {
            body: { parcel_input: form.address, project_id: data.id },
          })
        } catch { /* non-critical */ }

        toast.success('기본 정보가 저장되었습니다')
      } catch (err: unknown) {
        toast.error(`저장 실패: ${err instanceof Error ? err.message : String(err)}`)
        return
      } finally {
        setNextLoading(false)
      }
    }
    setCurrentStep(prev => prev + 1)
  }

  const handleSubmit = async () => {
    if (!projectId) return
    setSubmitting(true)
    try {
      await supabase.from('projects').update({ status: 'active' }).eq('id', projectId)
      toast('AI 입지 분석 중... 잠시 기다려주세요', { duration: 8000 })
      const { error: analyzeErr } = await supabase.functions.invoke('analyze-location', {
        body: { project_id: projectId },
      })
      if (analyzeErr) console.warn('[analyze-location]', analyzeErr)
      toast.success('매물 등록 완료!')
      router.push(`/projects/${projectId}`)
    } catch { toast.error('완료 처리 실패') } finally { setSubmitting(false) }
  }

  const handleUpload = async (files: File[]) => {
    if (!projectId) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error('사용자 인증 정보를 찾을 수 없습니다.'); return }
    const { data: membership, error: memError } = await supabase
      .from('memberships').select('org_id').eq('user_id', user.id)
      .not('joined_at', 'is', null).limit(1).single()
    if (memError || !membership) { toast.error('조직 정보를 불러오지 못했습니다.'); return }

    let firstUrl: string | null = null
    let count = 0
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const ext = file.name.split('.').pop()
      const filePath = `${membership.org_id}/${projectId}/${Math.random().toString(36).slice(2)}_${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('project-assets').upload(filePath, file)
      if (uploadError) { toast.error(`${file.name} 업로드 실패`); continue }
      const { data: urlData } = supabase.storage.from('project-assets').getPublicUrl(filePath)
      if (!firstUrl) firstUrl = urlData.publicUrl
      const { error: insertError } = await supabase.from('assets').insert({
        project_id: projectId, org_id: membership.org_id,
        type: file.type.startsWith('video/') ? 'video' : 'image',
        file_name: file.name, file_url: urlData.publicUrl,
        file_size: file.size, mime_type: file.type,
        is_cover: i === 0, sort_order: i,
      })
      if (!insertError) count++
    }
    if (firstUrl) {
      const { data: pd } = await supabase.from('projects').select('cover_image_url').eq('id', projectId).single()
      if (!pd?.cover_image_url) await supabase.from('projects').update({ cover_image_url: firstUrl }).eq('id', projectId)
    }
    if (count > 0) toast.success(`${count}개의 파일이 업로드되었습니다.`)
  }

  /* ── 거래형태별 가격 행 ── */
  const priceSections = () => {
    if (form.transaction_type === 'rent') return (
      <tr>
        <TLabel>보 증 금<br /><span className="font-normal text-gray-400">(만원)</span></TLabel>
        <TCell><TInput value={form.deposit} onChange={v => set('deposit', v)} placeholder="7000" /></TCell>
        <TLabel>월 임 대 료<br /><span className="font-normal text-gray-400">(만원)</span></TLabel>
        <TCell><TInput value={form.monthly_rent} onChange={v => set('monthly_rent', v)} placeholder="500" className="text-red-600 font-bold" /></TCell>
      </tr>
    )
    if (form.transaction_type === 'lease') return (
      <tr>
        <TLabel>전세보증금<br /><span className="font-normal text-gray-400">(만원)</span></TLabel>
        <TCell colSpan={3}><TInput value={form.deposit} onChange={v => set('deposit', v)} placeholder="30000" className="text-red-600 font-bold" /></TCell>
      </tr>
    )
    return (
      <tr>
        <TLabel>매 매 가<br /><span className="font-normal text-gray-400">(만원)</span></TLabel>
        <TCell colSpan={3}><TInput value={form.price} onChange={v => set('price', v)} placeholder="100000" className="text-red-600 font-bold" /></TCell>
      </tr>
    )
  }

  const chipBtn = (label: string, active: boolean, onClick: () => void) => (
    <button key={label} type="button" onClick={onClick}
      className={`px-2.5 py-1 rounded text-xs border transition-colors ${active ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-600 hover:border-brand-300'}`}>
      {label}
    </button>
  )

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">새 매물 등록</h1>
        <p className="text-sm text-gray-500 mt-1">공인중개사 확인·설명서 기준으로 입력하면 AI가 자동으로 마케팅 콘텐츠를 생성합니다</p>
      </div>

      <div className="card p-5 mb-5">
        <StepperHeader steps={STEPS} currentStep={currentStep} />
      </div>

      <div className="card p-5">

        {/* ── Step 1: 매물 정보표 ── */}
        {currentStep === 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-brand-600 mb-3">
              <MapPin size={16} />
              <h2 className="font-semibold text-sm">매물 확인·설명서 정보 입력</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-400 text-xs">
                <tbody>

                  {/* Row 1: 소재지 + 중개대상물 종류 */}
                  <tr>
                    <TLabel>소 재 지 *</TLabel>
                    <TCell colSpan={3}>
                      <input
                        value={form.address}
                        onChange={e => set('address', e.target.value)}
                        placeholder="화성시 만세구 향남읍 하길리 123"
                        className="w-full text-sm border-0 outline-none bg-transparent px-1 py-0.5 placeholder:text-gray-300"
                      />
                    </TCell>
                    <TLabel>중개대상물 종류</TLabel>
                    <TCell>
                      <TInput value={form.property_category} onChange={v => set('property_category', v)} placeholder="일반상가" />
                    </TCell>
                  </tr>

                  {/* Row 2: 주용도 / 해당층·총층·건물전체 / 거래형태 */}
                  <tr>
                    <TLabel>주 용 도</TLabel>
                    <TCell>
                      <TInput value={form.main_use} onChange={v => set('main_use', v)} placeholder="제2종근생" />
                    </TCell>
                    <TLabel>해당층/총층</TLabel>
                    <TCell>
                      <div className="flex items-center gap-1 flex-wrap">
                        <TInput
                          value={form.whole_building ? '전체' : form.floor}
                          onChange={v => set('floor', v)}
                          placeholder="1"
                          type={form.whole_building ? 'text' : 'number'}
                          disabled={form.whole_building}
                          className="w-10"
                        />
                        <span className="text-gray-400">층 /</span>
                        <TInput value={form.total_floors} onChange={v => set('total_floors', v)} placeholder="2" type="number" className="w-10" />
                        <span className="text-gray-400">층</span>
                        <button
                          type="button"
                          onClick={toggleWholeBuilding}
                          className={`ml-1 px-2 py-0.5 rounded text-[11px] border transition-colors ${form.whole_building ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 text-gray-500 hover:border-brand-400'}`}
                        >
                          건물전체
                        </button>
                      </div>
                    </TCell>
                    <TLabel>거 래 형 태</TLabel>
                    <TCell>
                      <select
                        value={form.transaction_type}
                        onChange={e => set('transaction_type', e.target.value)}
                        className="text-sm border-0 outline-none bg-transparent w-full"
                      >
                        <option value="sale">매매</option>
                        <option value="lease">전세</option>
                        <option value="rent">임대</option>
                      </select>
                    </TCell>
                  </tr>

                  {/* Row 4: 대지면적 / 사용승인일 / 연면적 */}
                  <tr>
                    <TLabel>대지면적(㎡)</TLabel>
                    <TCell>
                      <TInput value={form.land_area} onChange={v => set('land_area', v)} placeholder="1428" type="number" />
                    </TCell>
                    <TLabel>사용승인일</TLabel>
                    <TCell>
                      <TInput value={form.approval_date} onChange={v => set('approval_date', v)} placeholder="2025.08" />
                    </TCell>
                    <TLabel>연 면 적(㎡)</TLabel>
                    <TCell>
                      <TInput value={form.total_area} onChange={v => set('total_area', v)} placeholder="285" type="number" />
                    </TCell>
                  </tr>

                  {/* Row 5: 전용면적 / 입주가능일 / 방·화장실 */}
                  <tr>
                    <TLabel>전용면적(㎡)</TLabel>
                    <TCell>
                      <TInput value={form.area} onChange={v => set('area', v)} placeholder="285" type="number" />
                    </TCell>
                    <TLabel>입주가능일</TLabel>
                    <TCell>
                      <TInput value={form.move_in_date} onChange={v => set('move_in_date', v)} placeholder="즉시입주가능" />
                    </TCell>
                    <TLabel>방 / 화장실</TLabel>
                    <TCell>
                      <div className="flex items-center gap-1">
                        <TInput value={form.rooms_count} onChange={v => set('rooms_count', v)} placeholder="0" type="number" className="w-10" />
                        <span className="text-gray-400"> / </span>
                        <TInput value={form.bathrooms_count} onChange={v => set('bathrooms_count', v)} placeholder="1" type="number" className="w-10" />
                      </div>
                    </TCell>
                  </tr>

                  {/* Row 5b: 주차대수 */}
                  <tr>
                    <TLabel>주 차 대 수</TLabel>
                    <TCell colSpan={5}>
                      <div className="flex gap-4">
                        <div className="flex items-center gap-1 text-xs">
                          <span className="text-gray-500">대장상</span>
                          <TInput value={form.parking_legal} onChange={v => set('parking_legal', v)} placeholder="12" type="number" className="w-12" />
                          <span className="text-gray-400">대</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs">
                          <span className="text-gray-500">실주차</span>
                          <TInput value={form.parking_actual} onChange={v => set('parking_actual', v)} placeholder="20" type="number" className="w-12" />
                          <span className="text-gray-400">대</span>
                        </div>
                      </div>
                    </TCell>
                  </tr>

                  {/* Row 6: 가격 (거래형태별) */}
                  {priceSections()}

                  {/* Row 7: 권리금 / 관리비 */}
                  <tr>
                    <TLabel>권 리 금<br /><span className="font-normal text-gray-400">(만원)</span></TLabel>
                    <TCell>
                      <TInput value={form.key_money} onChange={v => set('key_money', v)} placeholder="무권리=0" />
                    </TCell>
                    <TLabel>관 리 비</TLabel>
                    <TCell colSpan={3}>
                      <textarea
                        value={form.management_fee_detail}
                        onChange={e => set('management_fee_detail', e.target.value)}
                        placeholder={`없음.\n실비(전기,수도가스,인터넷 실사용 부과)`}
                        rows={2}
                        className="w-full text-xs border-0 outline-none bg-transparent px-1 py-0.5 resize-none placeholder:text-gray-300"
                      />
                    </TCell>
                  </tr>

                  {/* Row 8: 방향 */}
                  <tr>
                    <TLabel>방 향<br /><span className="font-normal text-gray-400">(주출입구)</span></TLabel>
                    <TCell colSpan={5}>
                      <div className="flex flex-wrap gap-1.5 py-0.5">
                        {DIRECTIONS.map(dir => chipBtn(dir, form.direction === dir, () => set('direction', form.direction === dir ? '' : dir)))}
                      </div>
                    </TCell>
                  </tr>

                  {/* Row 9: 특장점 */}
                  <tr>
                    <TLabel>특 장 점<br /><span className="font-normal text-gray-400">(복수 선택)</span></TLabel>
                    <TCell colSpan={5}>
                      <div className="flex flex-wrap gap-1.5 py-0.5">
                        {COMMON_FEATURES.map(f => chipBtn(f, form.features.includes(f), () => toggleFeature(f)))}
                      </div>
                    </TCell>
                  </tr>

                  {/* Row 10: 건물 상태 */}
                  <tr>
                    <TLabel>건 물 상 태</TLabel>
                    <TCell colSpan={5}>
                      <div className="flex gap-2 py-0.5">
                        {['신축', '양호', '보통', '노후'].map(c => chipBtn(c, form.building_condition === c, () => set('building_condition', form.building_condition === c ? '' : c)))}
                      </div>
                    </TCell>
                  </tr>

                  {/* Row 11: 층별 구성 */}
                  <tr>
                    <TLabel>층 별 구 성</TLabel>
                    <TCell colSpan={5}>
                      <textarea
                        value={form.floor_composition}
                        onChange={e => set('floor_composition', e.target.value)}
                        placeholder={`1층: 편의점 (임대중, 보증금 1000/월세 150)\n2층: 사무실 (공실)`}
                        rows={2}
                        className="w-full text-xs border-0 outline-none bg-transparent px-1 py-0.5 resize-none placeholder:text-gray-300"
                      />
                    </TCell>
                  </tr>

                  {/* Row 12: 임대 현황 */}
                  <tr>
                    <TLabel>임 대 현 황</TLabel>
                    <TCell colSpan={5}>
                      <textarea
                        value={form.rental_status}
                        onChange={e => set('rental_status', e.target.value)}
                        placeholder="계약만료일, 수익률, 공실 현황 등"
                        rows={2}
                        className="w-full text-xs border-0 outline-none bg-transparent px-1 py-0.5 resize-none placeholder:text-gray-300"
                      />
                    </TCell>
                  </tr>

                </tbody>
              </table>
            </div>

            {/* 현장 관찰 메모 - 표 외부 */}
            <div className="border-t pt-4">
              <div className="flex items-center gap-2 mb-2">
                <span>📋</span>
                <h3 className="font-semibold text-gray-800 text-sm">현장 관찰 메모</h3>
                <span className="text-xs text-gray-400">AI 콘텐츠 품질에 직결됩니다</span>
              </div>
              <textarea
                value={form.note}
                onChange={e => set('note', e.target.value)}
                placeholder={`현장에서 직접 보고 느낀 것을 자유롭게 적어주세요.\n- 외관 상태, 주변 환경, 장단점, 주의사항 등`}
                rows={3}
                className="input resize-none text-sm w-full"
              />
            </div>
          </div>
        )}

        {/* ── Step 2: 사진/동영상 ── */}
        {currentStep === 1 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-brand-600 mb-4">
              <Home size={18} />
              <h2 className="font-semibold">사진 &amp; 동영상 업로드</h2>
            </div>
            <p className="text-sm text-gray-500">
              사진과 동영상을 함께 업로드하세요. AI가 실제 매물 이미지를 분석하여 카드뉴스 · 쇼츠 스크립트 품질을 높입니다.<br />
              <strong className="text-brand-600 mt-1 inline-block">※ 첫 번째로 업로드하는 파일(사진/동영상)이 대표 썸네일로 자동 지정됩니다.</strong>
            </p>
            <div className="flex gap-3 text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
              <span className="text-blue-500 font-medium">사진</span> 카드뉴스 배경 · AI 비전 분석
              <span className="mx-1">·</span>
              <span className="text-purple-500 font-medium">동영상</span> 쇼츠 편집 소스 · 장면 구성 참고
            </div>
            <AssetUploader
              accept={{ 'image/*': ['.jpg', '.jpeg', '.png', '.webp'], 'video/*': ['.mp4', '.mov', '.avi', '.webm'] }}
              maxFiles={30}
              maxSize={200 * 1024 * 1024}
              onUpload={handleUpload}
            />
          </div>
        )}

        {/* ── Step 3: 입지 분석 ── */}
        {currentStep === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-brand-600 mb-4">
              <MapPin size={18} />
              <h2 className="font-semibold">입지 분석</h2>
            </div>
            <div className="bg-brand-50 rounded-xl p-5">
              <p className="text-sm font-medium text-brand-800">AI 입지 분석 준비됨</p>
              <p className="text-sm text-brand-600 mt-1">&quot;완료&quot; 버튼을 누르면 아래 항목이 자동 분석됩니다:</p>
              <ul className="mt-3 space-y-1.5">
                {['교통 (도보/차량 시간 기반)', '학군 (학교 위치 및 거리)', '상권 (마트/병원/공원 등)', '입지 장점 7가지 자동 생성', '추천 타겟 3종 분석'].map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-brand-700">
                    <span className="w-5 h-5 bg-brand-200 rounded-full flex items-center justify-center text-xs font-bold text-brand-700">{i + 1}</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-gray-400">* 분석에는 약 10~30초가 소요됩니다.</p>
          </div>
        )}

        <StepperNav
          currentStep={currentStep}
          totalSteps={STEPS.length}
          onPrev={() => setCurrentStep(prev => prev - 1)}
          onNext={handleNext}
          onSubmit={handleSubmit}
          isSubmitting={submitting}
          isNextLoading={nextLoading}
          nextLabel="다음 단계"
          submitLabel="매물 등록 완료"
          canNext={canNext()}
        />
      </div>
    </div>
  )
}
