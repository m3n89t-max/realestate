export type UserRole = 'owner' | 'admin' | 'viewer' | string

export interface NavigationItem {
  href: string
  label: string
  icon: 'dashboard' | 'projects' | 'tasks' | 'analysis' | 'blog' | 'cardnews' | 'shorts' | 'docs' | 'usage' | 'members'
}

export interface NavigationSection {
  label: '업무' | 'AI 콘텐츠' | '관리'
  items: NavigationItem[]
}

const coreSections: NavigationSection[] = [
  {
    label: '업무',
    items: [
      { href: '/dashboard', label: '운영 현황', icon: 'dashboard' },
      { href: '/projects', label: '매물 관리', icon: 'projects' },
      { href: '/tasks', label: '작업 현황', icon: 'tasks' },
    ],
  },
  {
    label: 'AI 콘텐츠',
    items: [
      { href: '/analysis', label: '입지 분석', icon: 'analysis' },
      { href: '/blog', label: '블로그', icon: 'blog' },
      { href: '/cardnews', label: '카드뉴스', icon: 'cardnews' },
      { href: '/shorts', label: '쇼츠', icon: 'shorts' },
      { href: '/docs', label: '서류', icon: 'docs' },
    ],
  },
]

export function getNavigationSections(role: UserRole): NavigationSection[] {
  const managementItems: NavigationItem[] = [
    { href: '/usage', label: '사용량', icon: 'usage' },
  ]

  if (role === 'owner' || role === 'admin') {
    managementItems.push({ href: '/admin/members', label: '회원 관리', icon: 'members' })
  }

  return [...coreSections, { label: '관리', items: managementItems }]
}

const pageMeta = [
  { match: (pathname: string) => pathname === '/projects/new', eyebrow: '매물 관리', title: '새 매물 등록' },
  { match: (pathname: string) => /^\/projects\/[^/]+/.test(pathname), eyebrow: '매물 관리', title: '매물 상세' },
  { match: (pathname: string) => pathname === '/projects', eyebrow: '매물 관리', title: '전체 매물' },
  { match: (pathname: string) => pathname.startsWith('/tasks'), eyebrow: '업무', title: '작업 현황' },
  { match: (pathname: string) => pathname.startsWith('/analysis'), eyebrow: 'AI 콘텐츠', title: '입지 분석' },
  { match: (pathname: string) => pathname.startsWith('/blog'), eyebrow: 'AI 콘텐츠', title: '블로그' },
  { match: (pathname: string) => pathname.startsWith('/cardnews'), eyebrow: 'AI 콘텐츠', title: '카드뉴스' },
  { match: (pathname: string) => pathname.startsWith('/shorts'), eyebrow: 'AI 콘텐츠', title: '쇼츠' },
  { match: (pathname: string) => pathname.startsWith('/docs'), eyebrow: 'AI 콘텐츠', title: '서류' },
  { match: (pathname: string) => pathname.startsWith('/usage'), eyebrow: '관리', title: '사용량' },
  { match: (pathname: string) => pathname.startsWith('/admin/members'), eyebrow: '관리', title: '회원 관리' },
  { match: (pathname: string) => pathname.startsWith('/settings'), eyebrow: '환경 설정', title: '설정' },
]

export function getPageMeta(pathname: string) {
  if (pathname === '/dashboard' || pathname === '/') return { eyebrow: '업무', title: '운영 현황' }
  const entry = pageMeta.find((item) => item.match(pathname))
  return entry ? { eyebrow: entry.eyebrow, title: entry.title } : { eyebrow: 'RealEstate AI OS', title: '업무 공간' }
}
