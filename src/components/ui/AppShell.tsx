'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  Building2, Bell, Menu, X, ChevronDown, LogOut,
  LayoutDashboard, FolderOpen, Settings, BarChart3,
  MapPin, Newspaper, LayoutGrid, Video, FileArchive
} from 'lucide-react'
import { cn } from '@/lib/utils'

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
}

export default function AppShell({ children, agentStatus = 'offline', orgName = '' }: AppShellProps) {
  const pathname = usePathname()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  // Prevent background scrolling when mobile menu is open
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
    <div className="flex h-screen overflow-hidden bg-stone-50 font-sans text-stone-900">
      {/* ────────── Mobile Overlay ────────── */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-stone-900/40 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* ────────── Left Sidebar (Desktop & Mobile Slide-over) ────────── */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-stone-200 flex flex-col transition-transform duration-300 ease-in-out lg:static lg:translate-x-0",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Brand / Logo Area */}
        <div className="flex items-center justify-between h-16 px-6 border-b border-stone-100 shrink-0">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="w-8 h-8 bg-stone-900 rounded-lg flex items-center justify-center shrink-0">
              <Building2 size={16} className="text-stone-50" />
            </div>
            <div className="flex flex-col">
              <span className="text-[15px] font-semibold tracking-tight text-stone-900 leading-tight">
                RealEstate AI OS
              </span>
              {orgName && (
                <span className="text-[10px] text-stone-500 font-medium leading-none mt-0.5">
                  {orgName}
                </span>
              )}
            </div>
          </Link>
          <button
            className="lg:hidden p-1.5 rounded-lg text-stone-400 hover:text-stone-900 hover:bg-stone-50"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        {/* Main Navigation */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="space-y-1">
            <p className="px-3 mb-2 text-xs font-semibold text-stone-400 uppercase tracking-wider">
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
                          ? "bg-stone-100 text-stone-900"
                          : "text-stone-500 hover:text-stone-900 hover:bg-stone-50"
                      )}
                    >
                      <span className={cn("shrink-0 transition-colors", isParentActive ? "text-stone-900" : "text-stone-400 group-hover:text-stone-600")}>
                        {item.icon}
                      </span>
                      {item.label}
                    </Link>
                    {/* Sub-items: always visible */}
                    <div className="ml-3 mt-0.5 mb-1 border-l-2 border-stone-100 pl-3 space-y-0.5">
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
                                ? "bg-stone-100 text-stone-900"
                                : "text-stone-400 hover:text-stone-700 hover:bg-stone-50"
                            )}
                          >
                            <span className={cn("shrink-0 transition-colors", isSubActive ? "text-stone-700" : "text-stone-300 group-hover:text-stone-500")}>
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

              const isActive = pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group",
                    isActive
                      ? "bg-stone-100 text-stone-900"
                      : "text-stone-500 hover:text-stone-900 hover:bg-stone-50"
                  )}
                >
                  <span className={cn("shrink-0 transition-colors", isActive ? "text-stone-900" : "text-stone-400 group-hover:text-stone-600")}>
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              )
            })}
          </div>
        </div>

        {/* Bottom Actions Area */}
        <div className="p-4 border-t border-stone-100 flex flex-col gap-2 shrink-0 bg-stone-50/50">
          {/* Agent Status */}
          <div className="flex items-center gap-2.5 px-3 py-2 mb-2 rounded-xl bg-white border border-stone-200 shadow-sm">
            <span className={cn(
              'w-2 h-2 rounded-full shrink-0',
              agentStatus === 'online' ? 'bg-green-500 animate-pulse' :
                agentStatus === 'busy' ? 'bg-amber-500 animate-pulse' :
                  'bg-stone-300'
            )} />
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider leading-none">Local Agent</span>
              <span className="text-[13px] font-medium text-stone-900 mt-1">
                {agentStatus === 'online' ? 'Connected' : agentStatus === 'busy' ? 'Working...' : 'Offline'}
              </span>
            </div>
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
                    ? "bg-stone-100 text-stone-900"
                    : "text-stone-500 hover:text-stone-900 hover:bg-white"
                )}
              >
                <span className={cn("shrink-0 transition-colors", isActive ? "text-stone-900" : "text-stone-400 group-hover:text-stone-600")}>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            )
          })}

          <button className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-stone-500 hover:text-stone-900 hover:bg-white transition-all duration-200 w-full text-left group">
            <span className="shrink-0 text-stone-400 group-hover:text-stone-600 transition-colors">
              <LogOut size={20} />
            </span>
            로그아웃
          </button>
        </div>
      </aside>

      {/* ────────── Main Content Area ────────── */}
      <div className="flex-1 flex flex-col min-w-0 bg-stone-50">

        {/* Top Header */}
        <header className="h-16 flex items-center justify-between px-4 lg:px-8 border-b border-stone-100 bg-white/70 backdrop-blur-md sticky top-0 z-20 shrink-0">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden p-2 -ml-2 rounded-md text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu size={20} />
            </button>
          </div>

          <div className="flex items-center gap-4">
            <button className="relative p-2 rounded-full text-stone-400 hover:text-stone-800 hover:bg-stone-100 transition-colors">
              <Bell size={20} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 border-2 border-white"></span>
            </button>

            <button className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full hover:bg-stone-100 transition-colors border border-transparent hover:border-stone-200">
              <div className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center shrink-0">
                <span className="text-xs font-semibold text-stone-600">나</span>
              </div>
              <ChevronDown size={14} className="text-stone-400 hidden sm:block" />
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
