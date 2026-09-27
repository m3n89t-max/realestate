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
        // 에이전트 상태 업데이트 + org_id 반환 (직접 UPDATE)
        const { error: updateError } = await adminClient
          .from('agent_connections')
          .update({
            status: data.status ?? 'online',
            last_seen_at: new Date().toISOString(),
            version: data.version ?? agent.id,
          })
          .eq('id', agent.id)
          .eq('org_id', agent.org_id)

        if (updateError) throw new Error(`에이전트 상태 업데이트 실패: ${updateError.message}`)

        return new Response(JSON.stringify({
          success: true,
          event: 'heartbeat',
          agent_id: agent.id,
          org_id: agent.org_id,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'task_started': {
        // 작업 시작
        const { task_id } = data
        if (!task_id) throw new Error('task_id가 필요합니다')

        const { error: updateError } = await adminClient
          .from('tasks')
          .update({
            status: 'running',
            agent_id: agent.id,
            started_at: new Date().toISOString(),
          })
          .eq('id', task_id)
          .eq('org_id', agent.org_id)
          .eq('agent_id', agent.id)
          .eq('status', 'running')
          .select('id')
          .single()
        if (updateError) throw new Error('처리 중인 담당 작업을 찾을 수 없습니다')

        const { error: logError } = await adminClient.from('task_logs').insert({
          task_id,
          level: 'info',
          message: `에이전트 ${agent.id}가 작업을 시작했습니다`,
        })
        if (logError) throw new Error(`작업 로그 저장 실패: ${logError.message}`)
        break
      }

      case 'task_progress': {
        // 작업 진행 로그
        const { task_id, message, level = 'info' } = data
        if (!task_id) throw new Error('task_id가 필요합니다')

        const { error: taskError } = await adminClient
          .from('tasks')
          .select('id')
          .eq('id', task_id)
          .eq('org_id', agent.org_id)
          .eq('agent_id', agent.id)
          .eq('status', 'running')
          .single()
        if (taskError) throw new Error('처리 중인 담당 작업을 찾을 수 없습니다')

        const { error: logError } = await adminClient.from('task_logs').insert({
          task_id,
          level,
          message,
        })
        if (logError) throw new Error(`작업 로그 저장 실패: ${logError.message}`)
        break
      }

      case 'task_completed': {
        // 작업 완료
        const { task_id, result } = data
        if (!task_id) throw new Error('task_id가 필요합니다')

        const { data: task, error: taskError } = await adminClient
          .from('tasks')
          .select('type, project_id')
          .eq('id', task_id)
          .eq('org_id', agent.org_id)
          .eq('agent_id', agent.id)
          .eq('status', 'running')
          .single()
        if (taskError || !task) throw new Error('처리 중인 담당 작업을 찾을 수 없습니다')

        if (task.type === 'building_register' && result?.document_id) {
          const { error: documentError } = await adminClient
            .from('documents')
            .select('id')
            .eq('id', result.document_id)
            .eq('org_id', agent.org_id)
            .eq('project_id', task.project_id)
            .single()
          if (documentError) throw new Error('완료된 문서를 찾을 수 없습니다')
        }

        const { error: updateError } = await adminClient
          .from('tasks')
          .update({
            status: 'success',
            result,
            completed_at: new Date().toISOString(),
          })
          .eq('id', task_id)
          .eq('org_id', agent.org_id)
          .eq('agent_id', agent.id)
          .eq('status', 'running')
          .select('id')
          .single()
        if (updateError) throw new Error(`작업 완료 처리 실패: ${updateError.message}`)

        const { error: logError } = await adminClient.from('task_logs').insert({
          task_id,
          level: 'info',
          message: '작업이 성공적으로 완료되었습니다',
        })
        if (logError) throw new Error(`작업 로그 저장 실패: ${logError.message}`)

        // 서류 수집 완료 시 AI 분석 자동 트리거
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
          const { error: usageError } = await adminClient.rpc('increment_usage', {
            p_org_id: agent.org_id,
            p_type: 'doc_download',
            p_amount: 1,
          })
          if (usageError) throw new Error(`사용량 기록 실패: ${usageError.message}`)
        } else if (task?.type === 'video_render') {
          const { error: usageError } = await adminClient.rpc('increment_usage', {
            p_org_id: agent.org_id,
            p_type: 'video_render',
            p_amount: 1,
          })
          if (usageError) throw new Error(`사용량 기록 실패: ${usageError.message}`)
        }
        break
      }

      case 'task_failed': {
        // 작업 실패
        const { task_id, error_code, error_message, retry } = data
        if (!task_id) throw new Error('task_id가 필요합니다')

        const { data: task, error: taskError } = await adminClient
          .from('tasks')
          .select('retry_count, max_retries')
          .eq('id', task_id)
          .eq('org_id', agent.org_id)
          .eq('agent_id', agent.id)
          .eq('status', 'running')
          .single()
        if (taskError || !task) throw new Error('처리 중인 담당 작업을 찾을 수 없습니다')

        const shouldRetry = retry && task.retry_count < task.max_retries

        const { error: updateError } = await adminClient
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
          .eq('org_id', agent.org_id)
          .eq('agent_id', agent.id)
          .eq('status', 'running')
          .select('id')
          .single()
        if (updateError) throw new Error(`작업 실패 처리 실패: ${updateError.message}`)

        const { error: logError } = await adminClient.from('task_logs').insert({
          task_id,
          level: 'error',
          message: `[${error_code}] ${error_message}`,
        })
        if (logError) throw new Error(`작업 로그 저장 실패: ${logError.message}`)
        break
      }

      case 'document_uploaded': {
        // 에이전트가 문서를 Supabase Storage에 업로드 완료
        const { project_id, document_type, file_url, file_name, raw_text } = data

        const { data: project, error: projectError } = await adminClient
          .from('projects')
          .select('org_id')
          .eq('id', project_id)
          .eq('org_id', agent.org_id)
          .single()
        if (projectError || !project) throw new Error('프로젝트를 찾을 수 없습니다')

        const { error: insertError } = await adminClient.from('documents').insert({
          project_id,
          org_id: agent.org_id,
          type: document_type,
          file_url,
          file_name,
          raw_text,
        })
        if (insertError) throw new Error(`문서 저장 실패: ${insertError.message}`)
        break
      }

      case 'update_content': {
        // 에이전트가 콘텐츠 상태 업데이트 (발행 완료 등)
        const { content_id: ucId, updates } = data
        if (!ucId) throw new Error('content_id가 필요합니다')
        const allowedUpdates = {
          ...(typeof updates?.is_published === 'boolean' ? { is_published: updates.is_published } : {}),
          ...(typeof updates?.published_url === 'string' ? { published_url: updates.published_url } : {}),
        }
        if (Object.keys(allowedUpdates).length === 0) throw new Error('업데이트할 콘텐츠 필드가 없습니다')
        const { error: updateError } = await adminClient
          .from('generated_contents')
          .update(allowedUpdates)
          .eq('id', ucId)
          .eq('org_id', agent.org_id)
          .select('id')
          .single()
        if (updateError) throw new Error(`콘텐츠 업데이트 실패: ${updateError.message}`)
        break
      }

      case 'get_content': {
        // 에이전트가 콘텐츠 조회 (서비스 롤로 RLS 우회)
        const { content_id } = data
        if (!content_id) throw new Error('content_id가 필요합니다')
        const { data: content, error } = await adminClient
          .from('generated_contents')
          .select('id, title, content, tags')
          .eq('id', content_id)
          .eq('org_id', agent.org_id)
          .single()
        if (error || !content) throw new Error(`콘텐츠를 찾을 수 없습니다: ${content_id}`)
        return new Response(JSON.stringify({ success: true, content }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'get_assets': {
        // 에이전트가 에셋 조회 (서비스 롤로 RLS 우회)
        const { project_id: assetProjectId } = data
        if (!assetProjectId) throw new Error('project_id가 필요합니다')
        const { error: projectError } = await adminClient
          .from('projects')
          .select('id')
          .eq('id', assetProjectId)
          .eq('org_id', agent.org_id)
          .single()
        if (projectError) throw new Error(`프로젝트를 찾을 수 없습니다: ${assetProjectId}`)

        const { data: assets, error: assetsError } = await adminClient
          .from('assets')
          .select('file_url, type, is_cover, sort_order')
          .eq('project_id', assetProjectId)
          .eq('org_id', agent.org_id)
          .eq('type', 'image')
          .order('sort_order', { ascending: true })
          .limit(5)
        if (assetsError) throw new Error(`에셋 조회 실패: ${assetsError.message}`)
        return new Response(JSON.stringify({ success: true, assets: assets ?? [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'get_pending_tasks': {
        // 에이전트가 폴링으로 대기 작업 조회 (서비스 롤로 RLS 우회)
        const { data: tasks, error: tasksError } = await adminClient
          .from('tasks')
          .select('*')
          .in('status', ['pending', 'retrying'])
          .lte('scheduled_at', new Date().toISOString())
          .eq('org_id', agent.org_id)
          .order('scheduled_at', { ascending: true })
          .limit(10)
        if (tasksError) throw new Error(`대기 작업 조회 실패: ${tasksError.message}`)
        return new Response(JSON.stringify({ success: true, tasks: tasks ?? [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'get_recent_tasks': {
        const { data: recentTasks, error: tasksError } = await adminClient
          .from('tasks')
          .select('id, type, status, error_code, error_message, created_at, started_at, completed_at')
          .eq('org_id', agent.org_id)
          .order('created_at', { ascending: false })
          .limit(10)
        if (tasksError) throw new Error(`최근 작업 조회 실패: ${tasksError.message}`)
        return new Response(JSON.stringify({ success: true, tasks: recentTasks ?? [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'claim_task': {
        // 작업 claim (Optimistic Lock — 서비스 롤로 RLS 우회)
        const { task_id } = data
        if (!task_id) throw new Error('task_id가 필요합니다')
        const { data: claimed, error: claimError } = await adminClient
          .from('tasks')
          .update({
            status: 'running',
            agent_id: agent.id,
            started_at: new Date().toISOString(),
          })
          .eq('id', task_id)
          .eq('org_id', agent.org_id)
          .in('status', ['pending', 'retrying'])
          .select()
        if (claimError) throw new Error(`작업 선점 실패: ${claimError.message}`)
        return new Response(JSON.stringify({ success: true, claimed: (claimed?.length ?? 0) > 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
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
