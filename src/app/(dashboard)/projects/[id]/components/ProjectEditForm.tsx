'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import type { Project, PropertyType } from '@/lib/types'

const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
  { value: 'apartment', label: '아파트' },
  { value: 'officetel', label: '오피스텔' },
  { value: 'oneroom', label: '원룸' },
  { value: 'villa', label: '빌라/다세대' },
  { value: 'multi_unit', label: '다가구주택' },
  { value: 'house', label: '단독주택' },
  { value: 'mixed_use', label: '상가주택' },
  { value: 'commercial', label: '상가/사무실' },
  { value: 'knowledge_industry', label: '지식산업센터' },
  { value: 'factory', label: '공장/창고' },
  { value: 'land', label: '토지' },
  { value: 'forest', label: '임야' },
]
const DIRECTIONS = ['남향', '남동향', '남서향', '동향', '서향', '북향', '북동향', '북서향']
const COMMON_FEATURES = [
  '역세권', '학군우수', '신축', '주차가능', '남향', '조용한', '뷰좋음',
  '풀옵션', '관리비저렴', '대단지', '커뮤니티시설', '공원인접', '상권인접', '즉시입주',
]

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

// 원 → 만원 문자열 변환
function wonToMan(won: number | null | undefined): string {
  if (!won) return ''
  return String(Math.round(won / 10000))
}

export default function ProjectEditForm({ project }: { project: Project }) {
  const router = useRouter()
  const supabase = createClient()
  const [saving, setSaving] = useState(false)

  const wholeBuilding = (project.features ?? []).includes('건물전체')

  const [form, setForm] = useState({
    address: project.address ?? '',
    property_type: (project.property_type ?? '') as PropertyType | '',
    property_category: project.property_category ?? '',
    main_use: project.main_use ?? '',
    transaction_type: (project.transaction_type ?? 'sale') as 'sale' | 'lease' | 'rent',
    price: wonToMan(project.price),
    monthly_rent: wonToMan(project.monthly_rent),
    deposit: wonToMan(project.deposit),
    key_money: wonToMan(project.key_money),
    area: project.area ? String(project.area) : '',
    land_area: project.land_area ? String(project.land_area) : '',
    total_area: project.total_area ? String(project.total_area) : '',
    floor: project.floor ? String(project.floor) : '',
    whole_building: wholeBuilding,
    total_floors: project.total_floors ? String(project.total_floors) : '',
    rooms_count: project.rooms_count ? String(project.rooms_count) : '',
    bathrooms_count: project.bathrooms_count ? String(project.bathrooms_count) : '',
    direction: project.direction ?? '',
    approval_date: project.approval_date ?? '',
    parking_legal: project.parking_legal ? String(project.parking_legal) : '',
    parking_actual: project.parking_actual ? String(project.parking_actual) : '',
    move_in_date: project.move_in_date ?? '',
    management_fee_detail: project.management_fee_detail ?? '',
    features: (project.features ?? []) as string[],
    building_condition: project.building_condition ?? '',
    floor_composition: project.floor_composition ?? '',
    rental_status: project.rental_status ?? '',
    note: project.note ?? '',
  })

  const set = (field: keyof typeof form, value: string | string[] | boolean) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const toggleFeature = (f: string) =>
    setForm(prev => ({
      ...prev,
      features: prev.features.includes(f) ? prev.features.filter(x => x !== f) : [...prev.features, f],
    }))

  const toggleWholeBuilding = () =>
    setForm(prev => {
      const next = !prev.whole_building
      const features = next
        ? prev.features.includes('건물전체') ? prev.features : [...prev.features, '건물전체']
        : prev.features.filter(f => f !== '건물전체')
      return { ...prev, whole_building: next, floor: next ? '' : prev.floor, features }
    })

  const handleSave = async () => {
    setSaving(true)
    try {
      const { error } = await supabase.from('projects').update({
        address: form.address,
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
      }).eq('id', project.id)

      if (error) throw new Error(`[${error.code}] ${error.message}`)
      toast.success('매물 정보가 저장되었습니다.')
      router.refresh()
    } catch (err: unknown) {
      toast.error(`저장 실패: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="section-title flex items-center gap-2">매물 확인·설명서 정보 입력</h3>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary text-sm px-5 disabled:opacity-50"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <tbody>
              {/* 소재지 */}
              <tr>
                <TLabel>소재지 *</TLabel>
                <TCell colSpan={5}>
                  <TInput value={form.address} onChange={v => set('address', v)} placeholder="화성시 만세구 항남읍 하길리 123" />
                </TCell>
              </tr>

              {/* 중개대상물 종류 — 가로 탭 */}
              <tr>
                <TLabel>중개대상물 종류</TLabel>
                <TCell colSpan={5}>
                  <div className="flex gap-1 py-0.5 flex-wrap">
                    {PROPERTY_TYPES.map(pt => (
                      <button
                        key={pt.value}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, property_type: pt.value, property_category: pt.label }))}
                        className={`px-3 py-1 rounded-full text-[11px] border transition-colors whitespace-nowrap ${form.property_type === pt.value ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 text-gray-500 hover:border-brand-400'}`}
                      >
                        {pt.label}
                      </button>
                    ))}
                  </div>
                </TCell>
              </tr>

              {/* 주용도 + 층 + 거래형태 */}
              <tr>
                <TLabel>주 용 도</TLabel>
                <TCell>
                  <TInput value={form.main_use} onChange={v => set('main_use', v)} placeholder="제2종" />
                </TCell>
                <TLabel>해당층/총층</TLabel>
                <TCell>
                  <div className="flex items-center gap-1">
                    <input
                      value={form.whole_building ? '전체' : form.floor}
                      onChange={e => set('floor', e.target.value)}
                      placeholder="1"
                      disabled={form.whole_building}
                      className="w-12 text-sm border-0 outline-none bg-transparent px-1 py-0.5 placeholder:text-gray-300 disabled:text-gray-400"
                    />
                    <span className="text-gray-400 text-xs">층 /</span>
                    <input
                      value={form.total_floors}
                      onChange={e => set('total_floors', e.target.value)}
                      placeholder="2"
                      className="w-12 text-sm border-0 outline-none bg-transparent px-1 py-0.5 placeholder:text-gray-300"
                    />
                    <span className="text-gray-400 text-xs">층</span>
                    <label className="flex items-center gap-1 ml-2 text-xs text-gray-500 cursor-pointer whitespace-nowrap">
                      <input type="checkbox" checked={form.whole_building} onChange={toggleWholeBuilding} className="w-3.5 h-3.5" />
                      건물전체
                    </label>
                  </div>
                </TCell>
                <TLabel>거 래 형 태</TLabel>
                <TCell>
                  <select value={form.transaction_type} onChange={e => set('transaction_type', e.target.value as 'sale' | 'lease' | 'rent')}
                    className="w-full text-sm border-0 outline-none bg-transparent">
                    <option value="sale">매매</option>
                    <option value="lease">전세</option>
                    <option value="rent">임대</option>
                  </select>
                </TCell>
              </tr>

              {/* 대지면적 + 사용승인일 + 면적 */}
              <tr>
                <TLabel>대지면적(㎡)</TLabel>
                <TCell>
                  <TInput value={form.land_area} onChange={v => set('land_area', v)} placeholder="14" type="number" />
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

              {/* 전용면적 + 입주가능일 + 방/화장실 */}
              <tr>
                <TLabel>전용면적(㎡)</TLabel>
                <TCell>
                  <TInput value={form.area} onChange={v => set('area', v)} placeholder="28" type="number" />
                </TCell>
                <TLabel>입주가능일</TLabel>
                <TCell>
                  <TInput value={form.move_in_date} onChange={v => set('move_in_date', v)} placeholder="즉시입주가능" />
                </TCell>
                <TLabel>방 / 화장실</TLabel>
                <TCell>
                  <div className="flex items-center gap-1">
                    <TInput value={form.rooms_count} onChange={v => set('rooms_count', v)} placeholder="0" className="w-10" type="number" />
                    <span className="text-gray-400 text-xs">/</span>
                    <TInput value={form.bathrooms_count} onChange={v => set('bathrooms_count', v)} placeholder="1" className="w-10" type="number" />
                  </div>
                </TCell>
              </tr>

              {/* 주차대수 */}
              <tr>
                <TLabel>주 차 대 수</TLabel>
                <TCell colSpan={5}>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-gray-500">대장상</span>
                    <TInput value={form.parking_legal} onChange={v => set('parking_legal', v)} placeholder="12" className="w-16" type="number" />
                    <span className="text-xs text-gray-500">대</span>
                    <span className="text-xs text-gray-500 ml-4">실주차</span>
                    <TInput value={form.parking_actual} onChange={v => set('parking_actual', v)} placeholder="20" className="w-16" type="number" />
                    <span className="text-xs text-gray-500">대</span>
                  </div>
                </TCell>
              </tr>

              {/* 가격 */}
              {form.transaction_type === 'sale' && (
                <tr>
                  <TLabel>매 매 가<br />(만원)</TLabel>
                  <TCell colSpan={5}>
                    <TInput value={form.price} onChange={v => set('price', v)} placeholder="100000" type="number" />
                  </TCell>
                </tr>
              )}
              {form.transaction_type === 'lease' && (
                <tr>
                  <TLabel>전세보증금<br />(만원)</TLabel>
                  <TCell colSpan={5}>
                    <TInput value={form.deposit} onChange={v => set('deposit', v)} placeholder="30000" type="number" />
                  </TCell>
                </tr>
              )}
              {form.transaction_type === 'rent' && (
                <>
                  <tr>
                    <TLabel>보 증 금<br />(만원)</TLabel>
                    <TCell colSpan={2}>
                      <TInput value={form.deposit} onChange={v => set('deposit', v)} placeholder="1000" type="number" />
                    </TCell>
                    <TLabel>월 세<br />(만원)</TLabel>
                    <TCell colSpan={2}>
                      <TInput value={form.monthly_rent} onChange={v => set('monthly_rent', v)} placeholder="150" type="number" />
                    </TCell>
                  </tr>
                  <tr>
                    <TLabel>권 리 금<br />(만원)</TLabel>
                    <TCell colSpan={2}>
                      <TInput value={form.key_money} onChange={v => set('key_money', v)} placeholder="무권리" />
                    </TCell>
                    <TLabel>관 리 비</TLabel>
                    <TCell colSpan={2}>
                      <TInput value={form.management_fee_detail} onChange={v => set('management_fee_detail', v)} placeholder="없음. 실비(전기,수도가스,인터넷 실사용 부과)" />
                    </TCell>
                  </tr>
                </>
              )}

              {/* 방향 */}
              <tr>
                <TLabel>방 향<br />(주출입구)</TLabel>
                <TCell colSpan={5}>
                  <div className="flex flex-wrap gap-1.5">
                    {DIRECTIONS.map(d => (
                      <button key={d} type="button"
                        onClick={() => set('direction', form.direction === d ? '' : d)}
                        className={`px-2.5 py-1 rounded text-xs border transition-colors ${form.direction === d ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 text-gray-600 hover:border-brand-400'}`}>
                        {d}
                      </button>
                    ))}
                  </div>
                </TCell>
              </tr>

              {/* 특장점 */}
              <tr>
                <TLabel>특 장 점<br />(복수 선택)</TLabel>
                <TCell colSpan={5}>
                  <div className="flex flex-wrap gap-1.5">
                    {COMMON_FEATURES.map(f => (
                      <button key={f} type="button"
                        onClick={() => toggleFeature(f)}
                        className={`px-2.5 py-1 rounded text-xs border transition-colors ${form.features.includes(f) ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 text-gray-600 hover:border-brand-400'}`}>
                        {f}
                      </button>
                    ))}
                  </div>
                </TCell>
              </tr>

              {/* 건물상태 */}
              <tr>
                <TLabel>건 물 상 태</TLabel>
                <TCell colSpan={5}>
                  <div className="flex gap-1.5">
                    {['신축', '양호', '보통', '노후'].map(s => (
                      <button key={s} type="button"
                        onClick={() => set('building_condition', form.building_condition === s ? '' : s)}
                        className={`px-2.5 py-1 rounded text-xs border transition-colors ${form.building_condition === s ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 text-gray-600 hover:border-brand-400'}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </TCell>
              </tr>

              {/* 층별구성 */}
              <tr>
                <TLabel>층 별 구 성</TLabel>
                <TCell colSpan={5}>
                  <TInput value={form.floor_composition} onChange={v => set('floor_composition', v)}
                    placeholder="1층: 편의점 (임대중, 보증금 1000/월세 150) / 2층: 사무실 (공실)" />
                </TCell>
              </tr>

              {/* 임대현황 */}
              <tr>
                <TLabel>임 대 현 황</TLabel>
                <TCell colSpan={5}>
                  <TInput value={form.rental_status} onChange={v => set('rental_status', v)}
                    placeholder="계약만료일, 수익률, 공실 현황 등" />
                </TCell>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 매물유형 */}
        <div className="mt-4">
          <p className="text-xs font-semibold text-gray-500 mb-2">매물 유형</p>
          <div className="flex flex-wrap gap-2">
            {PROPERTY_TYPES.map(pt => (
              <button key={pt.value} type="button"
                onClick={() => set('property_type', form.property_type === pt.value ? '' : pt.value)}
                className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${form.property_type === pt.value ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 text-gray-600 hover:border-brand-400'}`}>
                {pt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 현장 관찰 메모 */}
      <div className="card p-5">
        <h3 className="section-title mb-3 flex items-center gap-2">
          <span>📋</span> 현장 관찰 메모
          <span className="text-xs text-brand-600 font-normal">AI 콘텐츠 품질에 직결됩니다</span>
        </h3>
        <textarea
          value={form.note}
          onChange={e => set('note', e.target.value)}
          rows={5}
          placeholder={`현장에서 직접 보고 느낀 것을 자유롭게 적어주세요.\n- 인과 상태, 주변 환경, 장단점, 중의사항 등`}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:border-brand-400 placeholder:text-gray-300"
        />
        <div className="flex justify-end mt-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary text-sm px-6 disabled:opacity-50"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
