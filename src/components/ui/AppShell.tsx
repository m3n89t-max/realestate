'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  Building2, Bell, Menu, X, ChevronDown, LogOut,
  LayoutDashboard, FolderOpen, Settings, BarChart3,
  MapPin, Newspaper, LayoutGrid, Video, FileArchive,
  Zap, Users
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
}

interface SubNavItem {
  href: string
  label: string
  icon: React.ReactNode
}

interface NavItemWithChildren extends NavItem {
  children?: SubNavItem[]
}

const projectSubItems: SubNavItem[] = [
  { href: '/projects', label: '전체 매물', icon: <FolderOpen size={14} /> },
  { href: '/analysis', label: '입지분석', icon: <MapPin size={14} /> },
  { href: '/blog', label: '블로그자동화', icon: <Newspaper size={14} /> },
  { href: '/cardnews', label: '카드뉴스', icon: <LayoutGrid size={14} /> },
  { href: '/shorts', label: '쇼츠', icon: <Video size={14} /> },
  { href: '/docs', label: '서류', icon: <FileArchive size={14} /> },
]

const navItems: NavItemWithChildren[] = [
  { href: '/dashboard', label: '대시보드', icon: <LayoutDashboard size={20} /> },
  {
    href: '/projects',
    label: '매물관리',
    icon: <FolderOpen size={20} />,
    children: projectSubItems,
  },
  { href: '/usage', label: '사용량', icon: <BarChart3 size={20} /> },
]

const bottomNavItems: NavItem[] = [
  { href: '/settings', label: '설정', icon: <Settings size={20} /> },
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
  userRole = 'viewer'
}: AppShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      toast.success('로그아웃되었습니다')
      router.push('/login')
      router.refresh()
    } catch (err: any) {
      toast.error('로그아웃 중 오류가 발생했습니다')
    }
  }

  const isAdmin = userRole === 'owner' || userRole === 'admin'

  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'auto'
    }
    return () => {
      document.body.style.overflow = 'auto'
    }
  }, [isMobileMenuOpen])

  const isProjectsGroupActive = pathname.startsWith('/projects') ||
    pathname.startsWith('/analysis') ||
    pathname.startsWith('/blog') ||
    pathname.startsWith('/cardnews') ||
    pathname.startsWith('/shorts') ||
    pathname.startsWith('/docs')

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 font-sans text-slate-900">
      {/* ────────── Mobile Overlay ────────── */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* ────────── Left Sidebar ────────── */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 flex flex-col transition-transform duration-300 ease-in-out lg:static lg:translate-x-0",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Brand / Logo Area */}
        <div className="flex items-center justify-between h-16 px-5 border-b border-slate-100 shrink-0">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-brand-500 to-brand-700 rounded-lg flex items-center justify-center shrink-0 shadow-sm">
              <Building2 size={15} className="text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-[14px] font-bold tracking-tight text-slate-900 leading-tight">
                RealEstate <span className="text-brand-600">AI OS</span>
              </span>
              {orgName && (
                <span className="text-[10px] text-slate-400 font-medium leading-none mt-0.5 truncate max-w-[110px]">
                  {orgName}
                </span>
              )}
            </div>
          </Link>
          <button
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-50"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        {/* Main Navigation */}
        <div className="flex-1 overflow-y-auto px-3 py-5">
          <div className="space-y-0.5">
            <p className="px-3 mb-3 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
              Workspace
            </p>
            {navItems.map((item) => {
              if (item.children) {
                const isParentActive = isProjectsGroupActive
                return (
                  <div key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group",
                        isParentActive
                          ? "bg-brand-50 text-brand-700"
                          : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                      )}
                    >
                      <span className={cn("shrink-0 transition-colors", isParentActive ? "text-brand-600" : "text-slate-400 group-hover:text-slate-600")}>
                        {item.icon}
                      </span>
                      {item.label}
                    </Link>
                    {/* Sub-items */}
                    <div className="ml-4 mt-0.5 mb-1 border-l border-slate-100 pl-3 space-y-0.5">
                      {item.children.map((sub) => {
                        const isSubActive = sub.href === '/projects'
                          ? pathname === '/projects' || pathname.startsWith('/projects/')
                          : pathname.startsWith(sub.href)
                        return (
                          <Link
                            key={sub.href}
                            href={sub.href}
                            onClick={() => setIsMobileMenuOpen(false)}
                            className={cn(
                              "flex items-center gap-2 pl-2 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 group",
                              isSubActive
                                ? "bg-brand-50 text-brand-700"
                                : "text-slate-400 hover:text-slate-700 hover:bg-slate-50"
                            )}
                          >
                            <span className={cn("shrink-0 transition-colors", isSubActive ? "text-brand-500" : "text-slate-300 group-hover:text-slate-500")}>
                              {sub.icon}
                            </span>
                            {sub.label}
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                )
              }

              const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group",
                    isActive
                      ? "bg-brand-50 text-brand-700"
                      : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                  )}
                >
                  <span className={cn("shrink-0 transition-colors", isActive ? "text-brand-600" : "text-slate-400 group-hover:text-slate-600")}>
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              )
            })}

            {isAdmin && (
              <>
                <p className="px-3 mt-6 mb-3 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                  Admin
                </p>
                <Link
                  href="/admin/members"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group",
                    pathname.startsWith('/admin/members')
                      ? "bg-brand-50 text-brand-700"
                      : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                  )}
                >
                  <span className={cn("shrink-0 transition-colors", pathname.startsWith('/admin/members') ? "text-brand-600" : "text-slate-400 group-hover:text-slate-600")}>
                    <Users size={20} />
                  </span>
                  회원관리
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Bottom Actions Area */}
        <div className="p-3 border-t border-slate-100 flex flex-col gap-1.5 shrink-0">
          {/* Agent Status Card */}
          <div className={cn(
            "flex items-center gap-2.5 px-3 py-2.5 mb-1 rounded-xl border",
            agentStatus === 'online'
              ? "bg-emerald-50 border-emerald-200"
              : agentStatus === 'busy'
              ? "bg-amber-50 border-amber-200"
              : "bg-slate-50 border-slate-200"
          )}>
            <div className={cn(
              'w-6 h-6 rounded-lg flex items-center justify-center shrink-0',
              agentStatus === 'online' ? 'bg-emerald-100' :
              agentStatus === 'busy' ? 'bg-amber-100' : 'bg-slate-100'
            )}>
              <Zap size={12} className={cn(
                agentStatus === 'online' ? 'text-emerald-600' :
                agentStatus === 'busy' ? 'text-amber-600' : 'text-slate-400'
              )} />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider leading-none">Local Agent</span>
              <span className={cn(
                "text-[12px] font-semibold mt-0.5 leading-none",
                agentStatus === 'online' ? 'text-emerald-700' :
                agentStatus === 'busy' ? 'text-amber-700' : 'text-slate-400'
              )}>
                {agentStatus === 'online' ? 'Connected' : agentStatus === 'busy' ? 'Working...' : 'Offline'}
              </span>
            </div>
            {agentStatus !== 'offline' && (
              <span className={cn(
                'w-1.5 h-1.5 rounded-full animate-pulse ml-auto shrink-0',
                agentStatus === 'online' ? 'bg-emerald-500' : 'bg-amber-500'
              )} />
            )}
          </div>

          {bottomNavItems.map((item) => {
            const isActive = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group",
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                )}
              >
                <span className={cn("shrink-0 transition-colors", isActive ? "text-brand-600" : "text-slate-400 group-hover:text-slate-600")}>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            )
          })}

          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-all duration-200 w-full text-left group"
          >
            <span className="shrink-0 text-slate-400 group-hover:text-slate-600 transition-colors">
              <LogOut size={20} />
            </span>
            로그아웃
          </button>
        </div>
      </aside>

      {/* ────────── Main Content Area ────────── */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50">

        {/* Top Header */}
        <header className="h-16 flex items-center justify-between px-4 lg:px-8 border-b border-slate-200 bg-white sticky top-0 z-20 shrink-0">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden p-2 -ml-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu size={20} />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button className="relative p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
              <Bell size={19} />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-brand-500 border-2 border-white"></span>
            </button>

            <button className="flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-xl hover:bg-slate-100 transition-colors border border-transparent hover:border-slate-200">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shrink-0">
                <span className="text-[11px] font-bold text-white">나</span>
              </div>
              <ChevronDown size={13} className="text-slate-400 hidden sm:block" />
            </button>
          </div>
        </header>

        {/* Scrollable Page Content */}
        <main className="flex-1 overflow-y-auto w-full">
          <div className="w-full h-full p-4 lg:p-8 max-w-[1440px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
