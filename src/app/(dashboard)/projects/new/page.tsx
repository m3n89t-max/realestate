'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Home, MapPin } from 'lucide-react'
import toast from 'react-hot-toast'
import AssetUploader, { type AssetUploadResult } from '@/components/ui/AssetUploader'
import { StepperHeader, StepperNav } from '@/components/ui/StepperForm'
import { buildProjectDraftWrite } from '@/lib/project-draft'
import { formatKoreanPrice, parseOptionalNumber, parsePositivePrice, validateOptionalNumbers, validateOptionalPrice, validatePropertyBasics } from '@/lib/property-form'
import { createClient } from '@/lib/supabase/client'
import { uploadProjectAssets } from '@/lib/project-asset-upload'
import type { PropertyType } from '@/lib/types'

const STEPS = [
  { id: 'basic', title: '기본정보 입력', description: '주소와 가격을 입력해요' },
  { id: 'photos', title: '사진 추가 (선택)', description: '나중에 추가할 수 있어요' },
  { id: 'analysis', title: '입지 분석 시작', description: '주변 정보를 준비해요' },
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

type TextField = 'address' | 'property_category' | 'main_use' | 'price' | 'monthly_rent' | 'deposit' | 'key_money' | 'area' | 'land_area' | 'total_area' | 'floor' | 'total_floors' | 'rooms_count' | 'bathrooms_count' | 'direction' | 'approval_date' | 'parking_legal' | 'parking_actual' | 'move_in_date' | 'management_fee_detail' | 'building_condition' | 'floor_composition' | 'rental_status' | 'note'
type Form = Record<TextField, string> & { property_type: PropertyType | ''; transaction_type: 'sale' | 'lease' | 'rent'; whole_building: boolean; features: string[] }

const initial: Form = {
  address: '', property_type: '', property_category: '', main_use: '', transaction_type: 'sale', price: '', monthly_rent: '', deposit: '', key_money: '', area: '', land_area: '', total_area: '', floor: '', whole_building: false, total_floors: '', rooms_count: '', bathrooms_count: '', direction: '', approval_date: '', parking_legal: '', parking_actual: '', move_in_date: '', management_fee_detail: '', features: [], building_condition: '', floor_composition: '', rental_status: '', note: '',
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

  const validate = () => {
    const keyMoneyError = validateOptionalPrice(form.key_money, '권리금')
    const next = {
      ...validatePropertyBasics({ address: form.address, propertyType: form.property_type, transactionType: form.transaction_type, price: form.price, deposit: form.deposit, monthlyRent: form.monthly_rent }),
      ...(keyMoneyError ? { key_money: keyMoneyError } : {}),
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
      .then(({ error }) => setNormalizationStatus(error ? '주소 정보를 확인하지 못했습니다. 분석은 계속할 수 있습니다.' : '주소 정보 확인이 완료되었습니다.'))
      .catch(() => setNormalizationStatus('주소 정보를 확인하지 못했습니다. 분석은 계속할 수 있습니다.'))
  }

  const saveBasic = async () => {
    if (!validate()) return false
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { toast.error('로그인이 필요합니다.'); return false }
      const { data: membership } = await supabase.from('memberships').select('org_id').eq('user_id', user.id).not('joined_at', 'is', null).limit(1).single()
      if (!membership) { toast.error('계정을 준비하지 못했습니다. 다시 로그인해 주세요.'); return false }

      const money = (value: string) => {
        const parsed = parsePositivePrice(value)
        return parsed === null ? null : parsed * 10000
      }
      const values = {
        address: form.address.trim(), property_type: form.property_type || null,
        property_category: form.property_category || null, main_use: form.main_use || null, transaction_type: form.transaction_type,
        price: money(form.price), monthly_rent: money(form.monthly_rent), deposit: money(form.deposit), key_money: money(form.key_money),
        area: parseOptionalNumber(form.area, { decimal: true }), land_area: parseOptionalNumber(form.land_area, { decimal: true }), total_area: parseOptionalNumber(form.total_area, { decimal: true }),
        floor: form.whole_building ? null : parseOptionalNumber(form.floor, { signed: true }), total_floors: parseOptionalNumber(form.total_floors),
        rooms_count: parseOptionalNumber(form.rooms_count), bathrooms_count: parseOptionalNumber(form.bathrooms_count), direction: form.direction || null,
        approval_date: form.approval_date || null, parking_legal: parseOptionalNumber(form.parking_legal), parking_actual: parseOptionalNumber(form.parking_actual),
        move_in_date: form.move_in_date || null, management_fee_detail: form.management_fee_detail || null, features: form.features,
        building_condition: form.building_condition || null, floor_composition: form.floor_composition || null, rental_status: form.rental_status || null,
        note: form.note || null, status: 'draft',
      }
      const write = buildProjectDraftWrite(projectId, values, { orgId: membership.org_id, userId: user.id })
      const query = write.operation === 'insert'
        ? supabase.from('projects').insert(write.values)
        : supabase.from('projects').update(write.values).eq('id', write.projectId)
      const { data, error } = await query.select().single()
      if (error || !data) { toast.error('저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'); return false }
      setProjectId(data.id)
      startNormalization(form.address.trim(), data.id)
      toast.success(write.operation === 'insert' ? '기본 정보를 임시 저장했습니다.' : '수정한 정보를 저장했습니다.')
      return true
    } catch {
      toast.error('저장하지 못했습니다. 잠시 후 다시 시도해 주세요.')
      return false
    } finally { setLoading(false) }
  }

  const upload = async (files: File[]): Promise<AssetUploadResult[]> => {
    if (!projectId) return files.map((file) => ({ file, success: false, error: '먼저 기본 정보를 저장해 주세요.' }))
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
    if (step === 0 && !(await saveBasic())) return
    setStep((value) => value + 1)
  }

  const goToStep = async (target: number) => {
    if (uploading || target === step) return
    if (step === 0 && target > 0 && !(await saveBasic())) return
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
      const { error } = await supabase.from('projects').update({ status: 'active' }).eq('id', projectId)
      if (error) throw error
      const { error: analyzeError } = await supabase.functions.invoke('analyze-location', { body: { project_id: projectId } })
      toast[analyzeError ? 'error' : 'success'](analyzeError ? '매물은 등록됐습니다. 입지 분석은 매물 상세에서 다시 시작해 주세요.' : '매물을 등록하고 입지 분석을 시작했습니다.')
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
  const priceKey = form.transaction_type === 'sale' ? 'price' : form.transaction_type === 'lease' ? 'deposit' : 'monthly_rent'
  const priceLabel = form.transaction_type === 'sale' ? '매매가 (만원)' : form.transaction_type === 'lease' ? '전세 보증금 (만원)' : '월세 (만원)'

  return <div className="mx-auto max-w-3xl animate-fade-in">
    <h1 className="text-2xl font-bold">새 매물 입력</h1>
    <p className="mt-2 text-sm text-slate-600">쉬운 정보부터 입력하고, 나머지는 나중에 이어서 할 수 있어요.</p>
    <div className="card mt-6 p-4"><StepperHeader steps={STEPS} currentStep={step} onStepClick={(target) => { void goToStep(target) }} disabled={uploading || loading} /></div>
    <div className="card mt-5 p-5">
      {step === 0 && <BasicDetails form={form} errors={errors} input={input} set={set} refs={refs} toggleWholeBuilding={toggleWholeBuilding} priceKey={priceKey} priceLabel={priceLabel} />}
      {step === 1 && <PhotoStep upload={upload} uploading={uploading} setStep={setStep} setUploading={setUploading} />}
      {step === 2 && <AnalysisStep normalizationStatus={normalizationStatus} />}
      {uploading && <p className="mt-5 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-900" role="status">사진을 올리는 중입니다</p>}
      <StepperNav currentStep={step} totalSteps={STEPS.length} onPrev={() => setStep((value) => value - 1)} onNext={next} onSubmit={finish} isSubmitting={submitting} isNextLoading={loading} disabled={uploading} nextLabel="다음" submitLabel="입지 분석 시작" canNext />
    </div>
  </div>
}

type InputRenderer = (key: TextField, label: string, type?: string) => JSX.Element
function BasicDetails({ form, errors, input, set, refs, toggleWholeBuilding, priceKey, priceLabel }: { form: Form; errors: Record<string, string>; input: InputRenderer; set: <Key extends keyof Form>(key: Key, value: Form[Key]) => void; refs: React.MutableRefObject<Record<string, HTMLElement | null>>; toggleWholeBuilding: (checked: boolean) => void; priceKey: TextField; priceLabel: string }) {
  return <div className="space-y-7"><section><h2 className="text-lg font-bold">필수 정보</h2><div className="mt-5 space-y-5">{input('address', '주소')}<fieldset><legend className="text-sm font-semibold">매물 종류</legend><div className="mt-2 flex flex-wrap gap-2">{TYPES.map((type) => <button key={type.value} type="button" ref={(node) => { if (!refs.current.propertyType) refs.current.propertyType = node }} onClick={() => { set('property_type', type.value); set('property_category', type.label) }} className={`min-h-11 rounded-lg border px-3 text-sm ${form.property_type === type.value ? 'border-brand-600 bg-brand-50' : 'border-slate-300'}`}>{type.label}</button>)}</div>{errors.propertyType && <span role="alert" className="text-sm text-red-700">{errors.propertyType}</span>}</fieldset><label className="block text-sm font-semibold">거래 방식<select value={form.transaction_type} onChange={(event) => set('transaction_type', event.target.value as Form['transaction_type'])} className="input mt-2"><option value="sale">매매</option><option value="lease">전세</option><option value="rent">월세</option></select></label>{form.transaction_type === 'rent' && input('deposit', '보증금 (만원)', 'number')}{input(priceKey, priceLabel, 'number')}<p className="text-sm font-medium text-brand-800">{formatKoreanPrice(form[priceKey])}</p></div></section><section><h2 className="text-lg font-bold">매물 크기</h2><div className="mt-4 grid gap-4 sm:grid-cols-2">{input('area', '전용면적 (㎡)', 'number')}{input('land_area', '대지면적 (㎡)', 'number')}{input('total_area', '연면적 (㎡)', 'number')}{form.whole_building ? <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-600">건물 전체 매물은 해당 층을 입력하지 않습니다.</p> : input('floor', '해당 층', 'number')}{input('total_floors', '전체 층', 'number')}</div></section><details className="rounded-xl border p-4"><summary className="min-h-11 cursor-pointer pt-2 font-semibold">상세 정보 더 입력</summary><div className="mt-4 grid gap-4 sm:grid-cols-2">{input('main_use', '주용도')}{input('approval_date', '사용승인일', 'date')}{input('rooms_count', '방 개수', 'number')}{input('bathrooms_count', '화장실 개수', 'number')}<label className="text-sm font-semibold">방향<select value={form.direction} onChange={(event) => set('direction', event.target.value)} className="input mt-2">{DIRECTIONS.map((direction) => <option key={direction} value={direction}>{direction || '선택 안 함'}</option>)}</select></label>{input('move_in_date', '입주 가능일', 'date')}{input('parking_legal', '대장상 주차', 'number')}{input('parking_actual', '실주차', 'number')}{input('key_money', '권리금 (만원)', 'number')}<label className="flex min-h-11 items-center gap-2 text-sm font-semibold sm:col-span-2"><input type="checkbox" checked={form.whole_building} onChange={(event) => toggleWholeBuilding(event.target.checked)} className="size-5" />건물 전체 매물</label><fieldset className="sm:col-span-2"><legend className="text-sm font-semibold">특장점</legend><div className="mt-2 flex flex-wrap gap-2">{FEATURES.map((feature) => <label key={feature} className="flex min-h-11 items-center gap-1 rounded-lg border px-3 text-sm"><input type="checkbox" checked={form.features.includes(feature)} onChange={() => set('features', form.features.includes(feature) ? form.features.filter((value) => value !== feature) : [...form.features, feature])} />{feature}</label>)}</div></fieldset>{input('building_condition', '건물 상태')}<TextArea label="관리비" value={form.management_fee_detail} onChange={(value) => set('management_fee_detail', value)} /><TextArea label="층별 구성" value={form.floor_composition} onChange={(value) => set('floor_composition', value)} /><TextArea label="임대 현황" value={form.rental_status} onChange={(value) => set('rental_status', value)} /><TextArea label="메모" value={form.note} onChange={(value) => set('note', value)} /></div></details><p className="rounded-lg bg-brand-50 p-4 text-sm text-brand-900">다음을 누르면 임시 저장됩니다. 나중에 이어서 입력할 수 있습니다.</p></div>
}
function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="text-sm font-semibold sm:col-span-2">{label}<textarea value={value} onChange={(event) => onChange(event.target.value)} className="input mt-2 min-h-24" /></label> }
function PhotoStep({ upload, uploading, setStep, setUploading }: { upload: (files: File[]) => Promise<AssetUploadResult[]>; uploading: boolean; setStep: React.Dispatch<React.SetStateAction<number>>; setUploading: (value: boolean) => void }) { return <div className="space-y-5"><div><Home className="text-brand-700" /><h2 className="mt-3 text-lg font-bold">사진 추가 (선택)</h2><p className="mt-1 text-sm text-slate-600">사진은 나중에 추가할 수 있어요.</p></div><AssetUploader maxFiles={30} maxSize={100 * 1024 * 1024} onUpload={upload} onUploadingChange={setUploading} /><button type="button" disabled={uploading} onClick={() => setStep(2)} className="min-h-11 text-sm font-semibold text-brand-700">사진은 나중에 추가</button></div> }
function AnalysisStep({ normalizationStatus }: { normalizationStatus: string }) { return <div><MapPin className="text-brand-700" /><h2 className="mt-3 text-lg font-bold">입지 분석 시작</h2><p className="mt-2 text-sm leading-6 text-slate-600">완료를 누르면 주변 교통과 생활 편의시설 정보를 준비합니다.</p>{normalizationStatus && <p className="mt-4 rounded-lg bg-brand-50 p-3 text-sm text-brand-900" aria-live="polite">{normalizationStatus}</p>}</div> }
