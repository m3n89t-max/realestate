'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { 
  Users, UserPlus, Shield, MoreVertical, 
  Mail, Calendar, Trash2, ShieldCheck, 
  User, Check, X, Loader2 
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

interface Member {
  id: string
  org_id: string
  user_id: string
  role: 'owner' | 'admin' | 'editor' | 'viewer'
  joined_at: string
  user: {
    email: string
    full_name: string | null
    avatar_url: string | null
  }
}

export default function MembersPage() {
  const supabase = createClient()
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [currentMember, setCurrentMember] = useState<any>(null)
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      // 1. 현재 사용자 정보 조회
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUser(user)

      if (!user) return

      // 2. 가입된 멤버십 정보 조회 (어떤 조직에 속해있는지 + 역할 확인)
      const { data: membership } = await supabase
        .from('memberships')
        .select('*, organization:organizations(name)')
        .eq('user_id', user.id)
        .limit(1)
        .single()
      
      setCurrentMember(membership)

      if (membership) {
        // 3. 조직의 모든 멤버 조회
        const { data: membersList, error } = await supabase
          .from('memberships')
          .select(`
            *,
            user:users (
              email,
              full_name,
              avatar_url
            )
          `)
          .eq('org_id', membership.org_id)
          .order('joined_at', { ascending: true })

        if (error) throw error
        setMembers(membersList as any)
      }
    } catch (err: any) {
      console.error('Error fetching members:', err)
      toast.error('회원 목록을 불러오는 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateRole = async (memberId: string, newRole: 'admin' | 'editor' | 'viewer') => {
    setUpdatingId(memberId)
    try {
      const { error } = await supabase
        .from('memberships')
        .update({ role: newRole })
        .eq('id', memberId)

      if (error) throw error
      
      toast.success('역할이 변경되었습니다.')
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m))
      setEditingRoleId(null)
    } catch (err: any) {
      toast.error('역할 변경에 실패했습니다.')
    } finally {
      setUpdatingId(null)
    }
  }

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!confirm(`${memberName}님을 조직에서 제외하시겠습니까?`)) return

    setUpdatingId(memberId)
    try {
      const { error } = await supabase
        .from('memberships')
        .delete()
        .eq('id', memberId)

      if (error) throw error
      
      toast.success('회원을 제외했습니다.')
      setMembers(prev => prev.filter(m => m.id !== memberId))
    } catch (err: any) {
      toast.error('회원 제외에 실패했습니다.')
    } finally {
      setUpdatingId(null)
    }
  }

  const canManage = currentMember?.role === 'owner' || currentMember?.role === 'admin'

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin mb-4" />
        <p className="text-slate-500 font-medium">회원 정보를 불러오고 있습니다...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Search & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">구성원 관리</h1>
          <p className="text-slate-500 mt-1">조직의 모든 구성원을 확인하고 역할을 관리합니다.</p>
        </div>
        <button 
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-medium transition-all shadow-sm shadow-brand-200"
          onClick={() => toast('구성원 초대 기능은 준비 중입니다.')}
        >
          <UserPlus size={18} />
          구성원 초대
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-4 mb-3">
            <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-600">
              <Users size={20} />
            </div>
            <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider">전체 구성원</span>
          </div>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold text-slate-900">{members.length}</span>
            <span className="text-slate-400 mb-1">명</span>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-4 mb-3">
            <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center text-brand-600">
              <ShieldCheck size={20} />
            </div>
            <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider">관리자</span>
          </div>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold text-slate-900">
              {members.filter(m => m.role === 'owner' || m.role === 'admin').length}
            </span>
            <span className="text-slate-400 mb-1">명</span>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-4 mb-3">
            <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600">
              <Calendar size={20} />
            </div>
            <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider">신규 가입 (이번 달)</span>
          </div>
          <div className="flex items-end gap-2 text-3xl font-bold text-slate-900">
            <span>0</span>
            <span className="text-slate-400 text-sm font-normal mb-1">명</span>
          </div>
        </div>
      </div>

      {/* Members Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">구성원</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">역할</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">가입일</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">설정</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.map((member) => (
                <tr key={member.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden border border-slate-200">
                        {member.user.avatar_url ? (
                          <img src={member.user.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <User size={20} className="text-slate-400" />
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-semibold text-slate-900">{member.user.full_name || '이름 없음'}</span>
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Mail size={12} />
                          {member.user.email}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {editingRoleId === member.id && member.role !== 'owner' ? (
                      <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-left-2 transition-all">
                        <select
                          className="text-xs font-medium px-2 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                          defaultValue={member.role}
                          onChange={(e) => handleUpdateRole(member.id, e.target.value as any)}
                          disabled={updatingId === member.id}
                        >
                          <option value="admin">관리자 (Admin)</option>
                          <option value="editor">편집자 (Editor)</option>
                          <option value="viewer">조회자 (Viewer)</option>
                        </select>
                        <button 
                          onClick={() => setEditingRoleId(null)}
                          className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className={`
                          px-2 py-1 rounded-lg text-[11px] font-bold uppercase tracking-tight
                          ${member.role === 'owner' ? 'bg-slate-900 text-white' : 
                            member.role === 'admin' ? 'bg-brand-50 text-brand-700' :
                            member.role === 'editor' ? 'bg-slate-100 text-slate-700' :
                            'bg-slate-50 text-slate-500'}
                        `}>
                          {member.role === 'owner' ? '소유자' : 
                           member.role === 'admin' ? '관리자' : 
                           member.role === 'editor' ? '편집자' : '조회자'}
                        </span>
                        {canManage && member.role !== 'owner' && (
                          <button 
                            onClick={() => setEditingRoleId(member.id)}
                            className="p-1 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity hover:text-slate-600"
                          >
                            <Shield size={14} />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {member.joined_at ? format(new Date(member.joined_at), 'yyyy. MM. dd', { locale: ko }) : '-'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {canManage && member.role !== 'owner' && member.user_id !== currentUser?.id && (
                      <button 
                         onClick={() => handleRemoveMember(member.id, member.user.full_name || member.user.email)}
                         disabled={updatingId === member.id}
                         className="p-2 text-slate-400 hover:text-red-500 rounded-xl hover:bg-red-50 transition-colors"
                      >
                        {updatingId === member.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Policy Note */}
      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6">
        <div className="flex gap-3">
          <Shield size={20} className="text-slate-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-slate-700">권한 및 보안 정책</h4>
            <p className="text-sm text-slate-500 leading-relaxed">
              * 소유자(Owner) 역할은 양도할 수 없으며 시스템 관리자에게 문의해야 합니다.<br />
              * 관리자(Admin)는 구성원의 역할을 변경하거나 제거할 수 있습니다.<br />
              * 편집자(Editor)는 콘텐츠 및 프로젝트를 수정할 수 있으나 설정 및 구성원 관리는 불가능합니다.<br />
              * 조회자(Viewer)는 모든 데이터를 열람만 가능합니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
