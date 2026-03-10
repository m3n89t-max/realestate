import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

// 로컬 에이전트에서 오는 웹훅 처리 (JWT 없이 agent_key로 인증)
Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const body = await req.json()
    const { event, agent_key, ...data } = body

    if (!agent_key) throw new Error('agent_key가 필요합니다')

    // 에이전트 인증
    const { data: agent, error: agentError } = await adminClient
      .from('agent_connections')
      .select('id, org_id, status')
      .eq('agent_key', agent_key)
      .single()

    if (agentError || !agent) throw new Error('유효하지 않은 에이전트 키입니다')

    switch (event) {
      case 'heartbeat': {
        // 에이전트 상태 업데이트 + org_id 반환
        const { data: heartbeatResult } = await adminClient.rpc('agent_heartbeat', {
          p_agent_key: agent_key,
          p_status: data.status ?? 'online',
          p_version: data.version,
        })
        return new Response(JSON.stringify({
          success: true,
          event: 'heartbeat',
          agent_id: heartbeatResult?.agent_id ?? agent.id,
          org_id: heartbeatResult?.org_id ?? agent.org_id,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'task_started': {
        // 작업 시작
        const { task_id } = data
        if (!task_id) throw new Error('task_id가 필요합니다')

        await adminClient
          .from('tasks')
          .update({
            status: 'running',
            agent_id: agent.id,
            started_at: new Date().toISOString(),
          })
          .eq('id', task_id)

        await adminClient.from('task_logs').insert({
          task_id,
          level: 'info',
          message: `에이전트 ${agent.id}가 작업을 시작했습니다`,
        })
        break
      }

      case 'task_progress': {
        // 작업 진행 로그
        const { task_id, message, level = 'info' } = data
        if (!task_id) throw new Error('task_id가 필요합니다')

        await adminClient.from('task_logs').insert({
          task_id,
          level,
          message,
        })
        break
      }

      case 'task_completed': {
        // 작업 완료
        const { task_id, result } = data
        if (!task_id) throw new Error('task_id가 필요합니다')

        await adminClient
          .from('tasks')
          .update({
            status: 'success',
            result,
            completed_at: new Date().toISOString(),
          })
          .eq('id', task_id)

        await adminClient.from('task_logs').insert({
          task_id,
          level: 'info',
          message: '작업이 성공적으로 완료되었습니다',
        })

        // 서류 수집 완료 시 AI 분석 자동 트리거
        const { data: task } = await adminClient
          .from('tasks')
          .select('type, project_id')
          .eq('id', task_id)
          .single()

        if (task?.type === 'building_register' && result?.document_id) {
          // analyze-document Edge Function 비동기 호출
          const supabaseUrl = Deno.env.get('SUPABASE_URL')
          const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
          if (supabaseUrl && serviceKey) {
            fetch(`${supabaseUrl}/functions/v1/analyze-document`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${serviceKey}`,
              },
              body: JSON.stringify({ document_id: result.document_id }),
            }).catch(e => console.warn('자동 분석 호출 실패:', e))
          }
        }

        // 사용량 기록
        if (task?.type === 'building_register' || task?.type === 'seumteo_api') {
          await adminClient.rpc('increment_usage', {
            p_org_id: agent.org_id,
            p_type: 'doc_download',
            p_amount: 1,
          })
        } else if (task?.type === 'video_render') {
          await adminClient.rpc('increment_usage', {
            p_org_id: agent.org_id,
            p_type: 'video_render',
            p_amount: 1,
          })
        }
        break
      }

      case 'task_failed': {
        // 작업 실패
        const { task_id, error_code, error_message, retry } = data
        if (!task_id) throw new Error('task_id가 필요합니다')

        const { data: task } = await adminClient
          .from('tasks')
          .select('retry_count, max_retries')
          .eq('id', task_id)
          .single()

        const shouldRetry = retry && task && task.retry_count < task.max_retries

        await adminClient
          .from('tasks')
          .update({
            status: shouldRetry ? 'retrying' : 'failed',
            error_code,
            error_message,
            retry_count: (task?.retry_count ?? 0) + 1,
            completed_at: shouldRetry ? null : new Date().toISOString(),
            scheduled_at: shouldRetry
              ? new Date(Date.now() + 60000).toISOString() // 1분 후 재시도
              : undefined,
          })
          .eq('id', task_id)

        await adminClient.from('task_logs').insert({
          task_id,
          level: 'error',
          message: `[${error_code}] ${error_message}`,
        })
        break
      }

      case 'document_uploaded': {
        // 에이전트가 문서를 Supabase Storage에 업로드 완료
        const { project_id, document_type, file_url, file_name, raw_text } = data

        const { data: project } = await adminClient
          .from('projects')
          .select('org_id')
          .eq('id', project_id)
          .single()

        await adminClient.from('documents').insert({
          project_id,
          org_id: project?.org_id,
          type: document_type,
          file_url,
          file_name,
          raw_text,
        })
        break
      }

      default:
        throw new Error(`알 수 없는 이벤트: ${event}`)
    }

    return new Response(JSON.stringify({ success: true, event }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[webhook-agent]', err)
    const message = err instanceof Error ? err.message : '웹훅 처리에 실패했습니다'
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
