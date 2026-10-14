export type CardPlatform = 'instagram' | 'kakao'
export type CardLayout = 'cover' | 'location' | 'composition' | 'investment' | 'interior' | 'cta'

export interface SpecGridItem {
  label: string
  value: string
}

export interface CardSlideData {
  order: number
  platform: CardPlatform
  layout: CardLayout
  title: string
  subtitle?: string
  body?: string
  highlight?: string
  price_badge?: string
  address?: string
  checkpoints?: string[]
  points?: string[]
  spec_grid?: SpecGridItem[]
  hashtags?: string[]
  cta?: string
  phone?: string
  kakao_id?: string
}

const LAYOUT_BY_ORDER: Record<number, CardLayout> = {
  1: 'cover',
  2: 'location',
  3: 'composition',
  4: 'investment',
  5: 'interior',
  6: 'cta',
}

const stringList = (value: unknown, max: number): string[] | undefined => {
  if (!Array.isArray(value)) return undefined
  const values = value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, max)
  return values.length ? values : undefined
}

export function normalizeCardSlide(raw: Record<string, unknown>, index: number, platform: CardPlatform): CardSlideData {
  const orderValue = raw.order ?? raw.card_number ?? index + 1
  const order = typeof orderValue === 'number' ? orderValue : Number(orderValue) || index + 1
  const inferredLayout = LAYOUT_BY_ORDER[order] ?? 'cover'
  const rawLayout = typeof raw.layout === 'string' ? raw.layout : inferredLayout
  const layout = (Object.values(LAYOUT_BY_ORDER) as string[]).includes(rawLayout)
    ? rawLayout as CardLayout
    : inferredLayout
  const title = String(raw.title ?? raw.headline ?? raw.section ?? `카드 ${index + 1}`)
  const grid = Array.isArray(raw.spec_grid)
    ? raw.spec_grid.flatMap(item => {
      if (!item || typeof item !== 'object') return []
      const candidate = item as Record<string, unknown>
      const label = String(candidate.label ?? '').trim()
      const value = String(candidate.value ?? '').trim()
      return label || value ? [{ label, value }] : []
    }).slice(0, 2)
    : undefined
  const checkpointSource = platform === 'kakao' && (layout === 'location' || layout === 'interior')
    ? raw.checkpoints ?? raw.points
    : raw.checkpoints

  return {
    order,
    platform,
    layout,
    title,
    subtitle: typeof raw.subtitle === 'string' ? raw.subtitle : undefined,
    body: typeof raw.body === 'string' ? raw.body : undefined,
    highlight: typeof raw.highlight === 'string' ? raw.highlight : undefined,
    price_badge: typeof (raw.price_badge ?? raw.price) === 'string' ? String(raw.price_badge ?? raw.price) : undefined,
    address: typeof (raw.address ?? raw.location) === 'string' ? String(raw.address ?? raw.location) : undefined,
    checkpoints: stringList(checkpointSource, layout === 'cover' ? 3 : 4),
    points: stringList(raw.points, layout === 'investment' ? 2 : 4),
    spec_grid: grid?.length ? grid : undefined,
    hashtags: stringList(raw.hashtags, 8),
    cta: typeof raw.cta === 'string' ? raw.cta : undefined,
    phone: typeof raw.phone === 'string' ? raw.phone : undefined,
    kakao_id: typeof raw.kakao_id === 'string' ? raw.kakao_id : undefined,
  }
}
