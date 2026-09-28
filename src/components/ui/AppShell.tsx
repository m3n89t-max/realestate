'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import {
  BarChart3,
  Bot,
  Building2,
  CircleHelp,
  FolderOpen,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Menu,
  Settings,
  Users,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { BRAND } from '@/lib/brand'
import { getNavigationSections, getPageMeta, isNavigationItemActive, type NavigationItem } from '@/lib/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

const icons = {
  dashboard: LayoutDashboard,
  projects: FolderOpen,
  tasks: ListTodo,
  help: CircleHelp,
  usage: BarChart3,
  members: Users,
}

const mobileNavigation: NavigationItem[] = [
  { href: '/dashboard', label: '홈', icon: 'dashboard' },
  { href: '/projects', label: '내 매물', icon: 'projects' },
  { href: '/tasks', label: '처리 알림', icon: 'tasks' },
  { href: '/projects/new', label: '새 매물', icon: 'projects' },
]

interface AppShellProps {
  children: React.ReactNode
  agentStatus?: 'online' | 'offline' | 'busy'
  orgName?: string
  userRole?: string
}

export default function AppShell({
  children,
  agentStatus = 'offline',
  orgName = '',
  userRole = 'viewer',
}: AppShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [mobileOpen, setMobileOpen] = useState(false)
  const openButtonRef = useRef<HTMLButtonElement>(null)
  const drawerRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const sections = getNavigationSections(userRole)
  const meta = getPageMeta(pathname)

  useEffect(() => {
    if (!mobileOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileOpen(false)
        return
      }

      if (event.key !== 'Tab' || !drawerRef.current) return
      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      )
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
      openButtonRef.current?.focus()
    }
  }, [mobileOpen])

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      toast.success('로그아웃되었습니다')
      router.push('/login')
      router.refresh()
    } catch {
      toast.error('로그아웃 중 오류가 발생했습니다')
    }
  }

  const renderNavItem = (item: NavigationItem) => {
    const Icon = icons[item.icon]
    const active = isNavigationItemActive(pathname, item.href)
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? 'page' : undefined}
        onClick={() => setMobileOpen(false)}
        className={cn(
          'flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
          active
            ? 'bg-brand-50 text-brand-800'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950',
        )}
      >
        <Icon
          size={18}
          aria-hidden="true"
          strokeWidth={active ? 2.25 : 1.8}
          className={active ? 'text-brand-600' : 'text-slate-500'}
        />
        {item.label}
      </Link>
    )
  }

  const sidebarContent = (mobile: boolean) => (
    <>
      <div className="flex h-16 items-center justify-between border-b border-slate-100 px-5">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5"
          onClick={() => setMobileOpen(false)}
        >
          <span className="grid size-8 place-items-center rounded-lg bg-brand-700 text-white">
            <Building2 size={17} aria-hidden="true" />
          </span>
          <span className="text-[15px] font-bold tracking-[-0.03em] text-slate-900">
            {BRAND.name}
          </span>
        </Link>
        {mobile && (
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="메뉴 닫기"
            className="grid size-11 place-items-center rounded-lg text-slate-600 hover:bg-slate-100"
            onClick={() => setMobileOpen(false)}
          >
            <X size={19} aria-hidden="true" />
          </button>
        )}
      </div>

      <nav aria-label="주요 메뉴" className="flex-1 overflow-y-auto px-3 py-5">
        {orgName && <p className="mb-5 truncate px-3 text-xs font-medium text-slate-600">{orgName}</p>}
        <div className="space-y-6">
          {sections.map((section) => (
            <section key={section.label} aria-labelledby={`${mobile ? 'mobile' : 'desktop'}-${section.label}`}>
              <h2
                id={`${mobile ? 'mobile' : 'desktop'}-${section.label}`}
                className="mb-2 px-3 text-xs font-semibold tracking-[0.06em] text-slate-500"
              >
                {section.label}
              </h2>
              <div className="space-y-0.5">{section.items.map(renderNavItem)}</div>
            </section>
          ))}
        </div>
      </nav>

      <div className="border-t border-slate-200 p-3">
        <div
          className={cn(
            'mb-2 flex items-center gap-2.5 rounded-lg border px-3 py-2.5',
            agentStatus === 'online'
              ? 'border-emerald-200 bg-emerald-50'
              : agentStatus === 'busy'
                ? 'border-amber-200 bg-amber-50'
                : 'border-slate-200 bg-slate-50',
          )}
        >
          <Bot
            size={17}
            aria-hidden="true"
            className={
              agentStatus === 'online'
                ? 'text-emerald-700'
                : agentStatus === 'busy'
                  ? 'text-amber-700'
                  : 'text-slate-600'
            }
          />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-600">자동화 연결</p>
            <p className="text-xs font-semibold text-slate-800">
              {agentStatus === 'online' ? '연결됨' : agentStatus === 'busy' ? '작업 중' : '연결이 필요해요'}
            </p>
          </div>
        </div>
        <Link
          href="/settings"
          aria-current={pathname.startsWith('/settings') ? 'page' : undefined}
          onClick={() => setMobileOpen(false)}
          className={cn(
            'flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
            pathname.startsWith('/settings')
              ? 'bg-brand-50 text-brand-800'
              : 'text-slate-600 hover:bg-slate-100',
          )}
        >
          <Settings size={18} aria-hidden="true" className="text-slate-500" />
          설정
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950"
        >
          <LogOut size={18} aria-hidden="true" className="text-slate-500" />
          로그아웃
        </button>
      </div>
    </>
  )

  return (
    <div className="flex h-dvh overflow-hidden bg-[#faf9f5] text-slate-900">
      <a
        href="#main-content"
        className="sr-only z-[70] rounded-md bg-white px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        본문으로 건너뛰기
      </a>

      <aside className="hidden w-[272px] shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        {sidebarContent(false)}
      </aside>

      {mobileOpen && (
        <>
          <button
            type="button"
            aria-label="메뉴 닫기"
            className="fixed inset-0 z-40 bg-slate-950/35 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="모바일 메뉴"
            className="fixed inset-y-0 left-0 z-50 flex w-[min(88vw,320px)] flex-col border-r border-slate-200 bg-white shadow-xl lg:hidden"
          >
            {sidebarContent(true)}
          </aside>
        </>
      )}

      <div
        className="flex min-w-0 flex-1 flex-col"
        inert={mobileOpen ? true : undefined}
        aria-hidden={mobileOpen ? true : undefined}
      >
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-[#fdfcf9] px-4 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              ref={openButtonRef}
              type="button"
              aria-label="메뉴 열기"
              aria-expanded={mobileOpen}
              className="grid size-11 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={20} aria-hidden="true" />
            </button>
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-[0.06em] text-brand-700">{meta.eyebrow}</p>
              <p className="truncate text-base font-bold tracking-[-0.02em] text-slate-900">{meta.title}</p>
            </div>
          </div>
          <span className="grid size-8 place-items-center rounded-lg bg-slate-900 text-xs font-bold text-white" aria-label="내 계정">
            나
          </span>
        </header>
        <main id="main-content" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1440px] p-4 pb-24 lg:p-8">{children}</div>
        </main>
      </div>
      <nav aria-label="모바일 빠른 메뉴" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-slate-200 bg-white/95 px-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur lg:hidden">
        {mobileNavigation.map((item) => {
          const Icon = icons[item.icon]
          const active = isNavigationItemActive(pathname, item.href)
          return <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className={cn('flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-xs font-semibold', active ? 'text-brand-700' : 'text-slate-600')}><Icon size={18} aria-hidden="true" /><span>{item.label}</span></Link>
        })}
      </nav>
    </div>
  )
}
