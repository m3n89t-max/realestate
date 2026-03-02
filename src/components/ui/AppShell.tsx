'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard, FolderOpen, Wand2, FileText, BookTemplate,
  ListTodo, BarChart3, Settings, ChevronLeft, ChevronRight,
  Building2, Wifi, WifiOff, LogOut, Bell, Menu, X
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  badge?: number
}

const navItems: NavItem[] = [
  { href: '/dashboard',  label: '대시보드',    icon: <LayoutDashboard size={18} /> },
  { href: '/projects',   label: '프로젝트',    icon: <FolderOpen size={18} /> },
  { href: '/studio',     label: '생성 스튜디오', icon: <Wand2 size={18} /> },
  { href: '/docs',       label: '서류 자동화',  icon: <FileText size={18} /> },
  { href: '/templates',  label: '템플릿',      icon: <BookTemplate size={18} /> },
  { href: '/tasks',      label: '작업 로그',   icon: <ListTodo size={18} /> },
  { href: '/usage',      label: '사용량/결제',  icon: <BarChart3 size={18} /> },
  { href: '/settings',   label: '설정',       icon: <Settings size={18} /> },
]

interface AppShellProps {
  children: React.ReactNode
  agentStatus?: 'online' | 'offline' | 'busy'
  orgName?: string
}

export default function AppShell({ children, agentStatus = 'offline', orgName = '' }: AppShellProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const AgentIcon = agentStatus === 'online' ? Wifi : WifiOff
  const agentColor = agentStatus === 'online'
    ? 'text-green-500'
    : agentStatus === 'busy'
      ? 'text-yellow-500'
      : 'text-gray-400'

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* 모바일 오버레이 */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* 사이드바 */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-30 h-full bg-white border-r border-gray-200 flex flex-col transition-all duration-200',
          'lg:relative lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          collapsed ? 'w-16' : 'w-60'
        )}
      >
        {/* 로고 */}
        <div className={cn(
          'flex items-center gap-3 px-4 py-4 border-b border-gray-100',
          collapsed && 'justify-center px-2'
        )}>
          <div className="flex-shrink-0 w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
            <Building2 size={16} className="text-white" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">부동산 AI OS</p>
              {orgName && <p className="text-xs text-gray-400 truncate">{orgName}</p>}
            </div>
          )}
        </div>

        {/* 에이전트 상태 배너 */}
        {!collapsed && agentStatus === 'offline' && (
          <div className="mx-3 mt-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs text-amber-700 font-medium">에이전트 미연결</p>
            <Link href="/settings" className="text-xs text-amber-600 underline">
              설치 안내 보기
            </Link>
          </div>
        )}

        {/* 네비게이션 */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'sidebar-link',
                  isActive && 'active',
                  collapsed && 'justify-center px-2'
                )}
                title={collapsed ? item.label : undefined}
              >
                <span className="flex-shrink-0">{item.icon}</span>
                {!collapsed && (
                  <span className="flex-1 truncate">{item.label}</span>
                )}
                {!collapsed && item.badge && (
                  <span className="ml-auto bg-brand-100 text-brand-700 text-xs px-1.5 py-0.5 rounded-full">
                    {item.badge}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* 하단 영역 */}
        <div className="border-t border-gray-100 p-2 space-y-1">
          {/* 에이전트 상태 */}
          <div className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg text-xs',
            collapsed && 'justify-center px-2'
          )}>
            <AgentIcon size={14} className={agentColor} />
            {!collapsed && (
              <span className="text-gray-500">
                에이전트{' '}
                {agentStatus === 'online' ? '연결됨' : agentStatus === 'busy' ? '작업중' : '오프라인'}
              </span>
            )}
          </div>

          {/* 로그아웃 */}
          <button className={cn(
            'w-full sidebar-link text-gray-500',
            collapsed && 'justify-center px-2'
          )}>
            <LogOut size={16} />
            {!collapsed && <span>로그아웃</span>}
          </button>
        </div>

        {/* 사이드바 토글 (데스크탑) */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex absolute -right-3 top-20 w-6 h-6 bg-white border border-gray-200 rounded-full items-center justify-center shadow-sm hover:bg-gray-50 transition-colors"
        >
          {collapsed
            ? <ChevronRight size={12} className="text-gray-500" />
            : <ChevronLeft size={12} className="text-gray-500" />
          }
        </button>
      </aside>

      {/* 메인 영역 */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* 상단 바 */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0">
          <button
            className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          <div className="flex-1" />

          <div className="flex items-center gap-2">
            <button className="p-2 rounded-lg hover:bg-gray-100 relative">
              <Bell size={16} className="text-gray-500" />
            </button>
            <div className="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center">
              <span className="text-xs font-medium text-brand-700">나</span>
            </div>
          </div>
        </header>

        {/* 페이지 콘텐츠 */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
