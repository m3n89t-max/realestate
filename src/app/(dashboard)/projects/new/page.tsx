'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ImageIcon, MapPin, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import AssetUploader, { type AssetUploadResult } from '@/components/ui/AssetUploader'
import { StepperHeader, StepperNav } from '@/components/ui/StepperForm'
import { buildProjectDraftWrite } from '@/lib/project-draft'
import { MINIMAL_ENTRY_FIELDS } from '@/lib/jipporter-flow'
import {
  formatKoreanPrice,
  parseOptionalNumber,
  parsePositivePrice,
  validateMinimalEntry,
  validateOptionalNumbers,
  validateOptionalPrice,
} from '@/lib/property-form'
import { createClient } from '@/lib/supabase/client'
import { uploadProjectAssets } from '@/lib/project-asset-upload'
import type { PropertyType, PriceValueType } from '@/lib/types'
import { PRICE_VALUE_TYPES, checkPriceSource } from '@/lib/price-source'

const [ADDRESS_FIELD, PHOTO_FIELD, FEATURE_FIELD] = MINIMAL_ENTRY_FIELDS

const STEPS = [
  { id: 'address', title: ADDRESS_FIELD.label, description: '도로명 또는 지번' },
  { id: 'photos', title: PHOTO_FIELD.label, description: '나중에 추가 가능' },
  { id: 'features', title: FEATURE_FIELD.label, description: '알리고 싶은 점' },
]

const TYPES: { value: PropertyType; label: string }[] = [
  { value: 'apartment', label: '아파트' }, { value: 'officetel', label: '오피스텔' },
  { value: 'oneroom', label: '원룸' }, { value: 'villa', label: '빌라/다세대' },
  { value: 'multi_unit', label: '다가구주택' }, { value: 'house', label: '단독주택' },
  { value: 'mixed_use', label: '상가주택' }, { value: 'commercial', label: '상가/사무실' },
  { value: 'knowledge_industry', label: '지식산업센터' }, { value: 'factory', label: '공장/창고' },
  { value: 'land', label: '토지' }, { value: 'forest', label: '임야' },
]
const FEATURES = ['역세권', '학군우수', '신축', '주차가능', '남향', '조용한', '뷰좋음', '풀옵션', '관리비저렴', '대단지', '커뮤니티시설', '공원인접', '상권인접', '즉시입주']
const WHOLE_BUILDING_FEATURE = '건물전체'
const DIRECTIONS = ['', '남향', '남동향', '남서향', '동향', '서향', '북향', '북동향', '북서향']

type TextField = 'address' | 'property_category' | 'main_use' | 'price' | 'monthly_rent' | 'deposit' | 'key_money' | 'source_name' | 'source_date' | 'source_channel' | 'area' | 'land_area' | 'total_area' | 'floor' | 'total_floors' | 'rooms_count' | 'bathrooms_count' | 'direction' | 'approval_date' | 'parking_legal' | 'parking_actual' | 'move_in_date' | 'management_fee_detail' | 'building_condition' | 'floor_composition' | 'rental_status' | 'note'
type Form = Record<TextField, string> & { property_type: PropertyType | ''; transaction_type: 'sale' | 'lease' | 'rent'; whole_building: boolean; features: string[]; value_type: PriceValueType }

const initial: Form = {
  address: '', property_type: '', property_category: '', main_use: '', transaction_type: 'sale', price: '', monthly_rent: '', deposit: '', key_money: '', value_type: '중개사 제공', source_name: '', source_date: '', source_channel: '', area: '', land_area: '', total_area: '', floor: '', whole_building: false, total_floors: '', rooms_count: '', bathrooms_count: '', direction: '', approval_date: '', parking_legal: '', parking_actual: '', move_in_date: '', management_fee_detail: '', features: [], building_condition: '', floor_composition: '', rental_status: '', note: '',
}

export default function NewProjectPage() {
  const router = useRouter()
  const supabase = createClient()
  const [form, setForm] = useState<Form>(initial)
  const [step, setStep] = useState(0)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [customFeature, setCustomFeature] = useState('')
  const [normalizationStatus, setNormalizationStatus] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const refs = useRef<Record<string, HTMLElement | null>>({})
  const normalizationPromise = useRef<Promise<void> | null>(null)

  const set = <Key extends keyof Form>(key: Key, value: Form[Key]) => {
    setForm((previous) => ({ ...previous, [key]: value }))
    setErrors((previous) => {
      const next = { ...previous }
      delete next[key]
      return next
    })
  }

  const toggleWholeBuilding = (checked: boolean) => {
    setForm((previous) => ({
      ...previous,
      whole_building: checked,
      floor: checked ? '' : previous.floor,
      features: checked
        ? [...new Set([...previous.features, WHOLE_BUILDING_FEATURE])]
        : previous.features.filter((feature) => feature !== WHOLE_BUILDING_FEATURE),
    }))
  }

  const toggleFeature = (feature: string) => {
    set('features', form.features.includes(feature)
      ? form.features.filter((value) => value !== feature)
      : [...form.features, feature])
  }

  const addCustomFeature = () => {
    const value = customFeature.trim()
    if (!value || form.features.includes(value)) {
      setCustomFeature('')
      return
    }
    set('features', [...form.features, value])
    setCustomFeature('')
  }

  /**
   * 주소 단계 검증. 주소만 필수이고, 선택 항목은 입력된 것만 형식을 확인한다.
   * 가격·면적·매물종류를 처음부터 요구하지 않는 것이 이 화면의 요점이다.
   */
  const validateAddressStep = () => {
    const optionalPrices: Array<[TextField, string]> = [
      ['price', '매매가'], ['deposit', '보증금'], ['monthly_rent', '월세'], ['key_money', '권리금'],
    ]
    const priceErrors: Record<string, string> = {}
    for (const [key, label] of optionalPrices) {
      const message = validateOptionalPrice(form[key], label)
      if (message) priceErrors[key] = message
    }

    const next = {
      ...validateMinimalEntry({ address: form.address, features: form.features }),
      ...priceErrors,
      ...validateOptionalNumbers({
        area: form.area, land_area: form.land_area, total_area: form.total_area,
        floor: form.whole_building ? '' : form.floor, total_floors: form.total_floors,
        rooms_count: form.rooms_count, bathrooms_count: form.bathrooms_count,
        parking_legal: form.parking_legal, parking_actual: form.parking_actual,
      }),
    }
    setErrors(next)
    const first = Object.keys(next)[0]
    if (first) refs.current[first]?.focus()
    return !first
  }

  const startNormalization = (address: string, id: string) => {
    setNormalizationStatus('주소 정보를 확인하는 중입니다. 잠시만 기다려 주세요.')
    normalizationPromise.current = supabase.functions.invoke('normalize-parcel', { body: { parcel_input: address, project_id: id } })
      .then(({ error }) => setNormalizationStatus(error ? '주소 정보를 확인하지 못했습니다. 홍보물 생성은 계속할 수 있습니다.' : '주소 정보 확인이 완료되었습니다.'))
      .catch(() => setNormalizationStatus('주소 정보를 확인하지 못했습니다. 홍보물 생성은 계속할 수 있습니다.'))
  }

  const persist = async (extra: Record<string, unknown> = {}) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error('로그인이 필요합니다.'); return null }
    const { data: membership } = await supabase.from('memberships').select('org_id').eq('user_id', user.id).not('joined_at', 'is', null).limit(1).single()
    if (!membership) { toast.error('계정을 준비하지 못했습니다. 다시 로그인해 주세요.'); return null }

    const money = (value: string) => {
      const parsed = parsePositivePrice(value)
      return parsed === null ? null : parsed * 10000
    }
    const values = {
      address: form.address.trim(), property_type: form.property_type || null,
      property_category: form.property_category || null, main_use: form.main_use || null, transaction_type: form.transaction_type,
      price: money(form.price), monthly_rent: money(form.monthly_rent), deposit: money(form.deposit), key_money: money(form.key_money),
      value_type: form.value_type, source_name: form.source_name.trim() || null,
      source_date: form.source_date || null, source_channel: form.source_channel.trim() || null,
      area: parseOptionalNumber(form.area, { decimal: true }), land_area: parseOptionalNumber(form.land_area, { decimal: true }), total_area: parseOptionalNumber(form.total_area, { decimal: true }),
      floor: form.whole_building ? null : parseOptionalNumber(form.floor, { signed: true }), total_floors: parseOptionalNumber(form.total_floors),
      rooms_count: parseOptionalNumber(form.rooms_count), bathrooms_count: parseOptionalNumber(form.bathrooms_count), direction: form.direction || null,
      approval_date: form.approval_date || null, parking_legal: parseOptionalNumber(form.parking_legal), parking_actual: parseOptionalNumber(form.parking_actual),
      move_in_date: form.move_in_date || null, management_fee_detail: form.management_fee_detail || null, features: form.features,
      building_condition: form.building_condition || null, floor_composition: form.floor_composition || null, rental_status: form.rental_status || null,
      note: form.note || null, status: 'draft', ...extra,
    }
    const write = buildProjectDraftWrite(projectId, values, { orgId: membership.org_id, userId: user.id })
    const query = write.operation === 'insert'
      ? supabase.from('projects').insert(write.values)
      : supabase.from('projects').update(write.values).eq('id', write.projectId)
    const { data, error } = await query.select().single()
    if (error || !data) { toast.error('저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'); return null }
    return data
  }

  const saveAddress = async () => {
    if (!validateAddressStep()) return false
    setLoading(true)
    try {
      const isFirstSave = !projectId
      const saved = await persist()
      if (!saved) return false
      setProjectId(saved.id)
      if (isFirstSave) startNormalization(form.address.trim(), saved.id)
      toast.success(isFirstSave ? '주소를 저장했습니다. 이어서 사진을 올려 주세요.' : '수정한 정보를 저장했습니다.')
      return true
    } catch {
      toast.error('저장하지 못했습니다. 잠시 후 다시 시도해 주세요.')
      return false
    } finally { setLoading(false) }
  }

  const upload = async (files: File[]): Promise<AssetUploadResult[]> => {
    if (!projectId) return files.map((file) => ({ file, success: false, error: '먼저 주소를 저장해 주세요.' }))
    let membership: { org_id: string } | null = null
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase.from('memberships').select('org_id').eq('user_id', user.id).not('joined_at', 'is', null).limit(1).single()
        membership = data
      }
    } catch {
      return files.map((file) => ({ file, success: false, error: '계정 정보를 확인하지 못했습니다. 다시 시도해 주세요.' }))
    }
    if (!membership) return files.map((file) => ({ file, success: false, error: '계정 정보를 찾을 수 없습니다.' }))

    return uploadProjectAssets(files, {
      makePath: (file) => `${membership.org_id}/${projectId}/${crypto.randomUUID()}_${file.name}`,
      upload: async (path, file) => !(await supabase.storage.from('project-assets').upload(path, file)).error,
      publicUrl: (path) => supabase.storage.from('project-assets').getPublicUrl(path).data.publicUrl,
      registerAsset: async ({ file, url }) => {
        const { data, error } = await supabase.rpc('register_project_asset', {
          p_org_id: membership.org_id,
          p_project_id: projectId,
          p_file_name: file.name,
          p_file_url: url,
          p_file_size: file.size,
          p_mime_type: file.type,
          p_type: file.type.startsWith('video/') ? 'video' : 'image',
        }).single()
        if (error || !data) return null
        const registered = data as { asset_id: string; is_cover: boolean }
        return { assetId: registered.asset_id, isCover: registered.is_cover }
      },
      deleteStorage: async (path) => !(await supabase.storage.from('project-assets').remove([path])).error,
    })
  }

  const next = async () => {
    if (uploading) return
    if (step === 0 && !(await saveAddress())) return
    setStep((value) => value + 1)
  }

  const goToStep = async (target: number) => {
    if (uploading || target === step) return
    if (step === 0 && target > 0 && !(await saveAddress())) return
    setStep(target)
  }

  const finish = async () => {
    if (!projectId || uploading) return
    setSubmitting(true)
    try {
      if (normalizationPromise.current) {
        setNormalizationStatus('주소 정보 확인이 끝날 때까지 기다리고 있습니다.')
        await normalizationPromise.current
      }
      // 마지막 단계에서 고른 특징까지 함께 저장한 뒤 활성 상태로 바꾼다.
      const saved = await persist({ status: 'active' })
      if (!saved) return
      const { error: analyzeError } = await supabase.functions.invoke('analyze-location', { body: { project_id: projectId } })
      toast[analyzeError ? 'error' : 'success'](analyzeError ? '매물은 등록됐습니다. 입지 분석은 매물 상세에서 다시 시작해 주세요.' : '매물을 등록하고 홍보물 준비를 시작했습니다.')
      router.push(`/projects/${projectId}?tab=analysis`)
    } catch {
      toast.error('완료하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally { setSubmitting(false) }
  }

  const input = (key: TextField, label: string, type = 'text') => (
    <label className="block text-sm font-semibold text-slate-800">
      {label}
      <input ref={(node) => { refs.current[key] = node }} type={type} value={form[key]} onChange={(event) => set(key, event.target.value)} className="input mt-2" />
      {errors[key] && <span role="alert" className="mt-1 block text-sm text-red-700">{errors[key]}</span>}
    </label>
  )
  const priceKey: TextField = form.transaction_type === 'sale' ? 'price' : form.transaction_type === 'lease' ? 'deposit' : 'monthly_rent'
  const priceLabel = form.transaction_type === 'sale' ? '매매가 (만원)' : form.transaction_type === 'lease' ? '전세 보증금 (만원)' : '월세 (만원)'

  return <div className="mx-auto max-w-3xl animate-fade-in">
    <h1 className="text-2xl font-bold">새 매물 입력</h1>
    <p className="mt-2 text-sm leading-6 text-slate-600">주소만 있으면 시작할 수 있습니다. 사진과 특징은 비워 두고 나중에 채워도 됩니다.</p>
    <div className="card mt-6 p-4"><StepperHeader steps={STEPS} currentStep={step} onStepClick={(target) => { void goToStep(target) }} disabled={uploading || loading} /></div>
    <div className="card mt-5 p-5">
      {step === 0 && <AddressStep form={form} errors={errors} input={input} set={set} toggleWholeBuilding={toggleWholeBuilding} priceKey={priceKey} priceLabel={priceLabel} />}
      {step === 1 && <PhotoStep upload={upload} uploading={uploading} setStep={setStep} setUploading={setUploading} />}
      {step === 2 && <FeatureStep
        selected={form.features}
        onToggle={toggleFeature}
        customFeature={customFeature}
        setCustomFeature={setCustomFeature}
        onAddCustom={addCustomFeature}
        normalizationStatus={normalizationStatus}
      />}
      {uploading && <p className="mt-5 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-900" role="status">사진을 올리는 중입니다</p>}
      <StepperNav currentStep={step} totalSteps={STEPS.length} onPrev={() => setStep((value) => value - 1)} onNext={next} onSubmit={finish} isSubmitting={submitting} isNextLoading={loading} disabled={uploading} nextLabel="다음" submitLabel="홍보물 준비 시작" canNext />
    </div>
  </div>
}

type InputRenderer = (key: TextField, label: string, type?: string) => JSX.Element

function AddressStep({ form, errors, input, set, toggleWholeBuilding, priceKey, priceLabel }: { form: Form; errors: Record<string, string>; input: InputRenderer; set: <Key extends keyof Form>(key: Key, value: Form[Key]) => void; toggleWholeBuilding: (checked: boolean) => void; priceKey: TextField; priceLabel: string }) {
  const priceSourceCheck = checkPriceSource({ value_type: form.value_type, source_name: form.source_name, source_date: form.source_date, source_channel: form.source_channel }, 'card_news')
  const sourceRequired = form.value_type === '실거래' || form.value_type === '호가'
  return <div className="space-y-7">
    <section>
      <div className="flex items-start gap-3">
        <MapPin className="mt-0.5 shrink-0 text-brand-700" size={22} />
        <div>
          <h2 className="text-lg font-bold">{ADDRESS_FIELD.label}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">{ADDRESS_FIELD.hint}</p>
        </div>
      </div>
      <div className="mt-5">{input('address', '주소')}</div>
    </section>

    <details className="rounded-xl border border-slate-300 p-4">
      <summary className="min-h-11 cursor-pointer pt-2 font-semibold">가격·면적 입력 (선택)</summary>
      <p className="mt-2 text-sm leading-6 text-slate-600">광고에 가격이나 면적을 쓰려면 필요합니다. 아직 모르면 비워 두세요. 검토 단계에서 다시 안내합니다.</p>
      <div className="mt-5 space-y-5">
        <fieldset>
          <legend className="text-sm font-semibold">매물 종류</legend>
          <div className="mt-2 flex flex-wrap gap-2">{TYPES.map((type) => <button key={type.value} type="button" onClick={() => { set('property_type', type.value); set('property_category', type.label) }} className={`min-h-11 rounded-lg border px-3 text-sm ${form.property_type === type.value ? 'border-brand-600 bg-brand-50' : 'border-slate-300'}`}>{type.label}</button>)}</div>
        </fieldset>
        <label className="block text-sm font-semibold">거래 방식<select value={form.transaction_type} onChange={(event) => set('transaction_type', event.target.value as Form['transaction_type'])} className="input mt-2"><option value="sale">매매</option><option value="lease">전세</option><option value="rent">월세</option></select></label>
        {form.transaction_type === 'rent' && input('deposit', '보증금 (만원)', 'number')}
        {input(priceKey, priceLabel, 'number')}
        <p className="text-sm font-medium text-brand-800">{formatKoreanPrice(form[priceKey])}</p>
        <fieldset className="rounded-xl border border-slate-300 p-4">
          <legend className="px-1 text-sm font-bold">이 가격은 어디서 온 값인가요?</legend>
          <div className="mt-1 flex flex-wrap gap-2">{PRICE_VALUE_TYPES.map((vt) => <button key={vt} type="button" onClick={() => set('value_type', vt)} aria-pressed={form.value_type === vt} className={`min-h-11 rounded-lg border px-4 text-sm ${form.value_type === vt ? 'border-brand-600 bg-brand-50 font-bold text-brand-900' : 'border-slate-300'}`}>{vt}</button>)}</div>
          <p className="mt-2 text-sm text-slate-700">직접 확인한 값이면 <b>중개사 제공</b>을 그대로 두세요. <b>실거래</b>나 <b>호가</b>를 고르면 출처명과 기준일을 반드시 입력해야 카드뉴스·블로그를 만들 수 있습니다.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">{input('source_name', `출처명${sourceRequired ? ' (필수)' : ' (선택)'}`)}{input('source_date', `기준일${sourceRequired ? ' (필수)' : ' (선택)'}`, 'date')}<div className="sm:col-span-2">{input('source_channel', '수집경로 (선택)')}</div></div>
          {priceSourceCheck.ok ? null : <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-800">⚠ {priceSourceCheck.message}</p>}
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          {input('area', '전용면적 (㎡)', 'number')}{input('land_area', '대지면적 (㎡)', 'number')}{input('total_area', '연면적 (㎡)', 'number')}
          {form.whole_building ? <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-600">건물 전체 매물은 해당 층을 입력하지 않습니다.</p> : input('floor', '해당 층', 'number')}
          {input('total_floors', '전체 층', 'number')}
        </div>
      </div>
    </details>

    <details className="rounded-xl border border-slate-300 p-4">
      <summary className="min-h-11 cursor-pointer pt-2 font-semibold">상세 정보 더 입력 (선택)</summary>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{input('main_use', '주용도')}{input('approval_date', '사용승인일', 'date')}{input('rooms_count', '방 개수', 'number')}{input('bathrooms_count', '화장실 개수', 'number')}<label className="text-sm font-semibold">방향<select value={form.direction} onChange={(event) => set('direction', event.target.value)} className="input mt-2">{DIRECTIONS.map((direction) => <option key={direction} value={direction}>{direction || '선택 안 함'}</option>)}</select></label>{input('move_in_date', '입주 가능일', 'date')}{input('parking_legal', '대장상 주차', 'number')}{input('parking_actual', '실주차', 'number')}{input('key_money', '권리금 (만원)', 'number')}<label className="flex min-h-11 items-center gap-2 text-sm font-semibold sm:col-span-2"><input type="checkbox" checked={form.whole_building} onChange={(event) => toggleWholeBuilding(event.target.checked)} className="size-5" />건물 전체 매물</label>{input('building_condition', '건물 상태')}<TextArea label="관리비" value={form.management_fee_detail} onChange={(value) => set('management_fee_detail', value)} /><TextArea label="층별 구성" value={form.floor_composition} onChange={(value) => set('floor_composition', value)} /><TextArea label="임대 현황" value={form.rental_status} onChange={(value) => set('rental_status', value)} /><TextArea label="메모" value={form.note} onChange={(value) => set('note', value)} /></div>
    </details>

    <p className="rounded-lg bg-brand-50 p-4 text-sm leading-6 text-brand-900">다음을 누르면 임시 저장됩니다. 나중에 이어서 입력할 수 있습니다.</p>
  </div>
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="text-sm font-semibold sm:col-span-2">{label}<textarea value={value} onChange={(event) => onChange(event.target.value)} className="input mt-2 min-h-24" /></label>
}

function PhotoStep({ upload, uploading, setStep, setUploading }: { upload: (files: File[]) => Promise<AssetUploadResult[]>; uploading: boolean; setStep: React.Dispatch<React.SetStateAction<number>>; setUploading: (value: boolean) => void }) {
  return <div className="space-y-5">
    <div className="flex items-start gap-3">
      <ImageIcon className="mt-0.5 shrink-0 text-brand-700" size={22} />
      <div>
        <h2 className="text-lg font-bold">{PHOTO_FIELD.label}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">{PHOTO_FIELD.hint}</p>
      </div>
    </div>
    <AssetUploader maxFiles={30} maxSize={100 * 1024 * 1024} onUpload={upload} onUploadingChange={setUploading} />
    <button type="button" disabled={uploading} onClick={() => setStep(2)} className="min-h-11 text-sm font-semibold text-brand-700">사진은 나중에 추가</button>
  </div>
}

function FeatureStep({ selected, onToggle, customFeature, setCustomFeature, onAddCustom, normalizationStatus }: { selected: string[]; onToggle: (feature: string) => void; customFeature: string; setCustomFeature: (value: string) => void; onAddCustom: () => void; normalizationStatus: string }) {
  const custom = selected.filter((feature) => !FEATURES.includes(feature) && feature !== WHOLE_BUILDING_FEATURE)
  return <div className="space-y-6">
    <div className="flex items-start gap-3">
      <Sparkles className="mt-0.5 shrink-0 text-brand-700" size={22} />
      <div>
        <h2 className="text-lg font-bold">{FEATURE_FIELD.label}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">{FEATURE_FIELD.hint}</p>
      </div>
    </div>

    <fieldset>
      <legend className="text-sm font-semibold">자주 쓰는 특징</legend>
      <div className="mt-3 flex flex-wrap gap-2">
        {FEATURES.map((feature) => (
          <button
            key={feature}
            type="button"
            aria-pressed={selected.includes(feature)}
            onClick={() => onToggle(feature)}
            className={`min-h-11 rounded-lg border px-3.5 text-sm ${selected.includes(feature) ? 'border-brand-600 bg-brand-50 font-bold text-brand-900' : 'border-slate-300 text-slate-700'}`}
          >
            {feature}
          </button>
        ))}
      </div>
    </fieldset>

    <div>
      <label className="block text-sm font-semibold text-slate-800">
        직접 추가
        <div className="mt-2 flex gap-2">
          <input
            value={customFeature}
            onChange={(event) => setCustomFeature(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); onAddCustom() } }}
            placeholder="예: 리모델링 완료"
            className="input"
          />
          <button type="button" onClick={onAddCustom} className="btn-secondary shrink-0">추가</button>
        </div>
      </label>
      {custom.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {custom.map((feature) => (
            <button key={feature} type="button" onClick={() => onToggle(feature)} className="min-h-11 rounded-lg border border-brand-600 bg-brand-50 px-3.5 text-sm font-bold text-brand-900">
              {feature} ✕
            </button>
          ))}
        </div>
      )}
    </div>

    <p className="rounded-lg bg-brand-50 p-4 text-sm leading-6 text-brand-900">
      완료를 누르면 주변 정보를 준비하고 홍보물 초안을 만들 수 있습니다. 발행 전에는 중개사가 직접 검토합니다.
    </p>
    {normalizationStatus && <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700" aria-live="polite">{normalizationStatus}</p>}
  </div>
}
