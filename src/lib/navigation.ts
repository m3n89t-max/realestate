import { BRAND } from './brand'

export type UserRole = 'owner' | 'admin' | 'viewer' | string

export interface NavigationItem {
  href: string
  label: string
  icon: 'dashboard' | 'projects' | 'tasks' | 'help' | 'usage' | 'members'
}

export interface NavigationSection {
  label: '기본 메뉴' | '관리자 메뉴'
  items: NavigationItem[]
}

const coreSections: NavigationSection[] = [
  {
    label: '기본 메뉴',
    items: [
      { href: '/dashboard', label: '홈', icon: 'dashboard' },
      { href: '/projects', label: '내 매물', icon: 'projects' },
      { href: '/tasks', label: '처리 알림', icon: 'tasks' },
      { href: '/help', label: '도움말', icon: 'help' },
    ],
  },
]

export function getNavigationSections(role: UserRole): NavigationSection[] {
  if (role !== 'owner' && role !== 'admin') return coreSections
  return [...coreSections, { label: '관리자 메뉴', items: [
    { href: '/usage', label: '사용량', icon: 'usage' },
    { href: '/admin/members', label: '회원 관리', icon: 'members' },
  ] }]
}

const pageMeta = [
  { match: (pathname: string) => pathname === '/projects/new', eyebrow: '내 매물', title: '새 매물 입력' },
  { match: (pathname: string) => /^\/projects\/[^/]+/.test(pathname), eyebrow: '내 매물', title: '매물 상세' },
  { match: (pathname: string) => pathname === '/projects', eyebrow: '내 매물', title: '내 매물' },
  { match: (pathname: string) => pathname.startsWith('/tasks'), eyebrow: '처리 알림', title: '처리 상태와 문제 해결' },
  { match: (pathname: string) => pathname.startsWith('/help'), eyebrow: '도움말', title: '처음 사용하는 분을 위한 안내' },
  { match: (pathname: string) => pathname.startsWith('/analysis'), eyebrow: 'AI 콘텐츠', title: '입지 분석' },
  { match: (pathname: string) => pathname.startsWith('/blog'), eyebrow: 'AI 콘텐츠', title: '블로그' },
  { match: (pathname: string) => pathname.startsWith('/cardnews'), eyebrow: 'AI 콘텐츠', title: '카드뉴스' },
  { match: (pathname: string) => pathname.startsWith('/shorts'), eyebrow: 'AI 콘텐츠', title: '쇼츠' },
  { match: (pathname: string) => pathname.startsWith('/docs'), eyebrow: 'AI 콘텐츠', title: '서류' },
  { match: (pathname: string) => pathname.startsWith('/usage'), eyebrow: '관리자 메뉴', title: '사용량' },
  { match: (pathname: string) => pathname.startsWith('/admin/members'), eyebrow: '관리자 메뉴', title: '회원 관리' },
  { match: (pathname: string) => pathname.startsWith('/settings'), eyebrow: '환경 설정', title: '설정' },
]

export function getPageMeta(pathname: string) {
  if (pathname === '/dashboard' || pathname === '/') return { eyebrow: '홈', title: '오늘 할 일' }
  const entry = pageMeta.find((item) => item.match(pathname))
  return entry ? { eyebrow: entry.eyebrow, title: entry.title } : { eyebrow: BRAND.name, title: '업무 공간' }
}

export function isNavigationItemActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard'
  // The mobile shortcut is the sole active item while creating a new property.
  if (href === '/projects') return pathname !== '/projects/new' && (pathname === href || pathname.startsWith(`${href}/`))
  return pathname === href || pathname.startsWith(`${href}/`)
}
