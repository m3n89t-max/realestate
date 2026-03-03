'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  Building2, Bell, Menu, X, ChevronDown, LogOut,
  LayoutDashboard, FolderOpen, Wand2, FileText, ListTodo, Settings, BarChart3
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItem {
  href: string
  label: string
  icon?: React.ReactNode
}

const mainNav: NavItem[] = [
  { href: '/dashboard', label: '대시보드' },
  { href: '/projects', label: '매물관리' },
  { href: '/studio', label: '콘텐츠' },
  { href: '/docs', label: '서류' },
  { href: '/tasks', label: '작업' },
  { href: '/settings', label: '설정' },
]

const mobileNav: NavItem[] = [
  { href: '/dashboard', label: '대시보드', icon: <LayoutDashboard size={18} /> },
  { href: '/projects', label: '매물관리', icon: <FolderOpen size={18} /> },
  { href: '/studio', label: '콘텐츠', icon: <Wand2 size={18} /> },
  { href: '/docs', label: '서류', icon: <FileText size={18} /> },
  { href: '/tasks', label: '작업', icon: <ListTodo size={18} /> },
  { href: '/usage', label: '사용량', icon: <BarChart3 size={18} /> },
  { href: '/settings', label: '설정', icon: <Settings size={18} /> },
]

interface AppShellProps {
  children: React.ReactNode
  agentStatus?: 'online' | 'offline' | 'busy'
  orgName?: string
}

export default function AppShell({ children, agentStatus = 'offline', orgName = '' }: AppShellProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 모바일 오버레이 */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ────────── 상단 네비게이션 바 ────────── */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-[1440px] mx-auto px-4 lg:px-6">
          <div className="flex items-center justify-between h-16">
            {/* 좌측: 로고 + 네비 */}
            <div className="flex items-center gap-8">
              {/* 로고 */}
              <Link href="/dashboard" className="flex items-center gap-2.5 flex-shrink-0">
                <div className="w-9 h-9 bg-gradient-to-br from-brand-500 to-brand-700 rounded-xl flex items-center justify-center shadow-md shadow-brand-200">
                  <Building2 size={18} className="text-white" />
                </div>
                <div className="hidden sm:block">
                  <span className="text-[15px] font-bold text-gray-900 tracking-tight">부동산 AI</span>
                  {orgName && (
                    <span className="ml-1.5 text-xs text-gray-400 font-medium">{orgName}</span>
                  )}
                </div>
              </Link>

              {/* 데스크탑 네비게이션 */}
              <nav className="hidden lg:flex items-center gap-1">
                {mainNav.map(item => {
                  const isActive = pathname.startsWith(item.href)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                        isActive
                          ? 'text-brand-700 bg-brand-50'
                          : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                      )}
                    >
                      {item.label}
                    </Link>
                  )
                })}
              </nav>
            </div>

            {/* 우측: 알림 + 프로필 */}
            <div className="flex items-center gap-3">
              {/* 에이전트 상태 (데스크탑) */}
              <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-50 border border-gray-100">
                <span className={cn(
                  'w-2 h-2 rounded-full',
                  agentStatus === 'online' ? 'bg-emerald-400 animate-pulse' :
                    agentStatus === 'busy' ? 'bg-amber-400 animate-pulse' :
                      'bg-gray-300'
                )} />
                <span className="text-xs text-gray-500 font-medium">
                  {agentStatus === 'online' ? '에이전트 연결됨' : agentStatus === 'busy' ? '작업 중' : '오프라인'}
                </span>
              </div>

              {/* 알림 */}
              <button className="relative p-2 rounded-xl hover:bg-gray-50 transition-colors">
                <Bell size={18} className="text-gray-500" />
              </button>

              {/* 프로필 */}
              <button className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl hover:bg-gray-50 transition-colors">
                <div className="w-8 h-8 bg-gradient-to-br from-brand-400 to-brand-600 rounded-full flex items-center justify-center shadow-sm">
                  <span className="text-xs font-bold text-white">나</span>
                </div>
                <ChevronDown size={14} className="text-gray-400 hidden sm:block" />
              </button>

              {/* 모바일 햄버거 */}
              <button
                className="lg:hidden p-2 rounded-xl hover:bg-gray-100 transition-colors"
                onClick={() => setMobileOpen(!mobileOpen)}
              >
                {mobileOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ────────── 모바일 사이드 패널 ────────── */}
      <div className={cn(
        'fixed right-0 top-0 z-50 h-full w-72 bg-white shadow-2xl transform transition-transform duration-300 lg:hidden',
        mobileOpen ? 'translate-x-0' : 'translate-x-full'
      )}>
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <span className="font-semibold text-gray-900">메뉴</span>
          <button onClick={() => setMobileOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>
        <nav className="p-3 space-y-0.5">
          {mobileNav.map(item => {
            const isActive = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-gray-600 hover:bg-gray-50'
                )}
              >
                {item.icon}
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-100">
          <button className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-gray-500 hover:bg-gray-50 w-full">
            <LogOut size={16} />
            로그아웃
          </button>
        </div>
      </div>

      {/* ────────── 메인 콘텐츠 ────────── */}
      <main className="max-w-[1440px] mx-auto">
        {children}
      </main>
    </div>
  )
}
