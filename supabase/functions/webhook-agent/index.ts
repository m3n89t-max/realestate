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

    const requireOwnedTask = async (taskId: string) => {
      const { data: task, error } = await adminClient
        .from('tasks')
        .select('id, type, project_id, retry_count, max_retries')
        .eq('id', taskId)
        .eq('org_id', agent.org_id)
        .maybeSingle()
      if (error || !task) throw new Error('작업을 찾을 수 없습니다')
      return task
    }

    const requireOwnedProject = async (projectId: string) => {
      const { data: project, error } = await adminClient
        .from('projects')
        .select('id, org_id')
        .eq('id', projectId)
        .eq('org_id', agent.org_id)
        .maybeSingle()
      if (error || !project) throw new Error('프로젝트를 찾을 수 없습니다')
      return project
    }

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
          .eq('agent_key', agent_key)

        if (updateError) console.error('[heartbeat] update error:', updateError.message)

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
        const { task_id } = data
        if (!task_id) throw new Error('task_id가 필요합니다')
        await requireOwnedTask(task_id)

        const { error: updateError } = await adminClient
          .from('tasks')
          .update({
            status: 'running',
            agent_id: agent.id,
            started_at: new Date().toISOString(),
          })
          .eq('id', task_id)
          .eq('org_id', agent.org_id)
        if (updateError) throw updateError

        const { error: logError } = await adminClient.from('task_logs').insert({
          task_id,
          level: 'info',
          message: `에이전트 ${agent.id}가 작업을 시작했습니다`,
        })
        if (logError) throw logError
        break
      }

      case 'task_progress': {
        const { task_id, message, level = 'info', progress_pct } = data
        if (!task_id) throw new Error('task_id가 필요합니다')
        await requireOwnedTask(task_id)

        if (typeof progress_pct === 'number') {
          const boundedProgress = Math.max(0, Math.min(100, Math.round(progress_pct)))
          const { error: progressError } = await adminClient
            .from('tasks')
            .update({ progress_pct: boundedProgress })
            .eq('id', task_id)
            .eq('org_id', agent.org_id)
          if (progressError) throw progressError
        }

        const { error: logError } = await adminClient.from('task_logs').insert({
          task_id,
          level,
          message,
        })
        if (logError) throw logError
        break
      }

      case 'task_completed': {
        const { task_id, result } = data
        if (!task_id) throw new Error('task_id가 필요합니다')
        const task = await requireOwnedTask(task_id)

        const { error: updateError } = await adminClient
          .from('tasks')
          .update({
            status: 'success',
            result,
            progress_pct: 100,
            completed_at: new Date().toISOString(),
          })
          .eq('id', task_id)
          .eq('org_id', agent.org_id)
        if (updateError) throw updateError

        const { error: logError } = await adminClient.from('task_logs').insert({
          task_id,
          level: 'info',
          message: '작업이 성공적으로 완료되었습니다',
        })
        if (logError) throw logError

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
        const { task_id, error_code, error_message, retry } = data
        if (!task_id) throw new Error('task_id가 필요합니다')
        const task = await requireOwnedTask(task_id)

        const shouldRetry = retry && task.retry_count < task.max_retries

        const { error: updateError } = await adminClient
          .from('tasks')
          .update({
            status: shouldRetry ? 'retrying' : 'failed',
            error_code,
            error_message,
            retry_count: (task.retry_count ?? 0) + 1,
            completed_at: shouldRetry ? null : new Date().toISOString(),
            scheduled_at: shouldRetry
              ? new Date(Date.now() + 60000).toISOString()
              : undefined,
          })
          .eq('id', task_id)
          .eq('org_id', agent.org_id)
        if (updateError) throw updateError

        const { error: logError } = await adminClient.from('task_logs').insert({
          task_id,
          level: 'error',
          message: `[${error_code}] ${error_message}`,
        })
        if (logError) throw logError
        break
      }

      case 'document_uploaded': {
        const { project_id, document_type, file_url, file_name, raw_text } = data
        if (!project_id) throw new Error('project_id가 필요합니다')
        const project = await requireOwnedProject(project_id)

        const { error: insertError } = await adminClient.from('documents').insert({
          project_id,
          org_id: project.org_id,
          type: document_type,
          file_url,
          file_name,
          raw_text,
        })
        if (insertError) throw insertError
        break
      }

      case 'update_content': {
        const { content_id: ucId, updates } = data
        if (!ucId) throw new Error('content_id가 필요합니다')
        if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
          throw new Error('updates 객체가 필요합니다')
        }

        const allowedUpdates: Record<string, boolean | string> = {}
        if (typeof updates.is_published === 'boolean') {
          allowedUpdates.is_published = updates.is_published
        }
        if (typeof updates.published_url === 'string') {
          if (updates.published_url.length > 2048) throw new Error('published_url이 너무 깁니다')
          allowedUpdates.published_url = updates.published_url
        }
        if (Object.keys(allowedUpdates).length === 0) {
          throw new Error('수정 가능한 콘텐츠 필드가 없습니다')
        }

        const { data: updated, error } = await adminClient
          .from('generated_contents')
          .update(allowedUpdates)
          .eq('id', ucId)
          .eq('org_id', agent.org_id)
          .select('id')
        if (error || !updated?.length) throw new Error('콘텐츠를 찾을 수 없습니다')
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
        await requireOwnedProject(assetProjectId)
        const { data: assets, error } = await adminClient
          .from('assets')
          .select('file_url, type, is_cover, sort_order')
          .eq('project_id', assetProjectId)
          .eq('org_id', agent.org_id)
          .eq('type', 'image')
          .order('sort_order', { ascending: true })
          .limit(5)
        if (error) throw error
        return new Response(JSON.stringify({ success: true, assets: assets ?? [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'get_pending_tasks': {
        const { data: tasks, error } = await adminClient
          .from('tasks')
          .select('*')
          .in('status', ['queued', 'retrying'])
          .lte('scheduled_at', new Date().toISOString())
          .eq('org_id', agent.org_id)
          .order('scheduled_at', { ascending: true })
          .limit(10)
        if (error) throw error
        return new Response(JSON.stringify({ success: true, tasks: tasks ?? [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'get_recent_tasks': {
        const { data: recentTasks } = await adminClient
          .from('tasks')
          .select('id, type, status, error_code, error_message, created_at, started_at, completed_at')
          .eq('org_id', agent.org_id)
          .order('created_at', { ascending: false })
          .limit(10)
        return new Response(JSON.stringify({ success: true, tasks: recentTasks ?? [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'claim_task': {
        const { task_id } = data
        if (!task_id) throw new Error('task_id가 필요합니다')
        await requireOwnedTask(task_id)
        const { data: claimed, error } = await adminClient
          .from('tasks')
          .update({
            status: 'running',
            agent_id: agent.id,
            started_at: new Date().toISOString(),
          })
          .eq('id', task_id)
          .eq('org_id', agent.org_id)
          .in('status', ['queued', 'retrying'])
          .select()
        if (error) throw error
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
