/**
 * 집포터의 단일 작업 흐름 정의.
 *
 * 랜딩페이지와 대시보드가 같은 문구·같은 판정을 쓰도록 여기 한 곳에만 둔다.
 * 화면에서 단계 문구를 다시 선언하면 둘이 어긋나므로 반드시 이 모듈을 가져온다.
 */

export type FlowStageId = 'input' | 'generate' | 'review' | 'publish'

export interface FlowStage {
  id: FlowStageId
  number: '01' | '02' | '03' | '04'
  title: string
  description: string
  /** 이 단계에 머물러 있는 매물에 대해 중개사가 할 다음 행동 */
  nextAction: string
  /** 다음 행동으로 이동하는 경로. 매물 상세는 `{id}` 자리표시자를 쓴다. */
  href: string
}

export const FLOW_STAGES: readonly FlowStage[] = [
  {
    id: 'input',
    number: '01',
    title: '한 번 입력',
    description: '주소와 사진, 매물 특징을 입력합니다. 가격·면적은 나중에 필요한 항목만 채웁니다.',
    nextAction: '주소와 사진, 특징을 입력하기',
    href: '/projects/new',
  },
  {
    id: 'generate',
    number: '02',
    title: '홍보물 생성',
    description: '블로그 글과 카드뉴스 초안을 함께 만듭니다.',
    nextAction: '블로그 글과 카드뉴스 초안 만들기',
    href: '/projects/{id}?tab=blog',
  },
  {
    id: 'review',
    number: '03',
    title: '중개사가 최종 검토',
    description: '가격·면적·주소 공개 범위·광고 표현을 중개사가 직접 확인합니다.',
    nextAction: '초안을 검토하고 확인 표시하기',
    href: '/projects/{id}?tab=blog',
  },
  {
    id: 'publish',
    number: '04',
    title: '채널별 발행 준비',
    description: '각 채널이 허용한 방식에 맞춰 파일과 등록 정보를 준비합니다.',
    nextAction: '채널별 등록 자료 내려받기',
    href: '/projects/{id}?tab=channels',
  },
] as const

export interface MinimalEntryField {
  id: 'address' | 'photos' | 'features'
  label: string
  hint: string
  required: boolean
}

/**
 * 매물 등록에 실제로 필요한 최소 입력.
 * 주소만 필수이고 사진·특징은 비워 두고 나중에 채울 수 있다.
 */
export const MINIMAL_ENTRY_FIELDS: readonly MinimalEntryField[] = [
  {
    id: 'address',
    label: '주소',
    hint: '도로명 또는 지번 주소를 입력하면 주변 정보를 함께 준비합니다.',
    required: true,
  },
  {
    id: 'photos',
    label: '사진',
    hint: '대표 사진 한 장만 있어도 시작할 수 있습니다. 나중에 추가해도 됩니다.',
    required: false,
  },
  {
    id: 'features',
    label: '매물 특징',
    hint: '역세권, 신축처럼 알리고 싶은 점을 고르거나 직접 적습니다.',
    required: false,
  },
] as const

export interface ProjectFlowSnapshot {
  address: string
  photoCount: number
  featureCount: number
  /** 생성된 블로그 글·카드뉴스 초안 수 */
  contentCount: number
  /** 중개사가 검토 확인한 초안 수 */
  approvedContentCount: number
  /** 등록 자료가 준비된 채널 수 */
  preparedChannelCount: number
}

export interface ResolvedStage extends FlowStage {
  /** 이 단계까지 할 일을 모두 마쳤는지 */
  done: boolean
}

function stage(id: FlowStageId): FlowStage {
  const found = FLOW_STAGES.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`알 수 없는 단계: ${id}`)
  return found
}

/**
 * 매물의 현재 상태를 보고 머물러 있는 단계와 다음 행동을 돌려준다.
 * 사실값만 본다. 추정하거나 건너뛰지 않는다.
 */
export function resolveProjectStage(snapshot: ProjectFlowSnapshot): ResolvedStage {
  const hasAddress = snapshot.address.trim().length > 0

  if (!hasAddress) {
    return { ...stage('input'), nextAction: '주소를 먼저 입력하기', done: false }
  }

  if (snapshot.photoCount < 1 || snapshot.featureCount < 1) {
    const missing: string[] = []
    if (snapshot.photoCount < 1) missing.push('사진')
    if (snapshot.featureCount < 1) missing.push('특징')
    return { ...stage('input'), nextAction: `${missing.join('과 ')}을 추가하기`, done: false }
  }

  if (snapshot.contentCount < 1) {
    return { ...stage('generate'), done: false }
  }

  if (snapshot.approvedContentCount < snapshot.contentCount) {
    return { ...stage('review'), done: false }
  }

  return { ...stage('publish'), done: snapshot.preparedChannelCount > 0 }
}

/** `03 중개사가 최종 검토` 형태의 짧은 표기 */
export function describeStage(id: FlowStageId): string {
  const found = stage(id)
  return `${found.number} ${found.title}`
}

export interface FlowSummary extends Record<FlowStageId, number> {
  total: number
}

/** 매물 목록을 단계별로 집계한다. */
export function summarizeFlow(snapshots: readonly ProjectFlowSnapshot[]): FlowSummary {
  const summary: FlowSummary = { input: 0, generate: 0, review: 0, publish: 0, total: snapshots.length }
  for (const snapshot of snapshots) {
    summary[resolveProjectStage(snapshot).id] += 1
  }
  return summary
}

/** 매물 상세 경로의 `{id}` 자리표시자를 실제 id로 바꾼다. */
export function stageHref(resolved: FlowStage, projectId?: string): string {
  if (!projectId) return resolved.href.replace('/projects/{id}', '/projects')
  return resolved.href.replace('{id}', projectId)
}
