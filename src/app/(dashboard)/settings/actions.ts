'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function generateAgentKey(orgId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    // is_org_admin check is done natively by RLS on insert
    const agentKey = `agent-${crypto.randomUUID()}`

    const { error } = await supabase
        .from('agent_connections')
        .insert([
            {
                org_id: orgId,
                agent_key: agentKey,
                name: `Local Agent (${new Date().toLocaleDateString('ko-KR')})`,
                platform: 'windows',
                version: '1.0.0',
                status: 'offline'
            }
        ])

    if (error) {
        console.error('Agent Key Generation Error', error)
        throw new Error('에이전트 연결키 발급에 실패했습니다.')
    }

    revalidatePath('/settings')
    return { success: true, key: agentKey }
}

export async function deleteAgentKey(agentId: string, orgId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const { error } = await supabase
        .from('agent_connections')
        .delete()
        .eq('id', agentId)
        .eq('org_id', orgId)

    if (error) throw new Error('삭제에 실패했습니다.')

    revalidatePath('/settings')
    return { success: true }
}
