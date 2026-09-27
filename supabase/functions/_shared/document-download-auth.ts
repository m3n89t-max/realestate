import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getAuthenticatedUser } from './auth.ts'

// Database types are not generated for Edge Functions in this repository.
// Keep the client unparameterized so Deno does not infer every table as `never`.
type SupabaseClient = any

type RequestBody = {
  project_id?: string
  task_id?: string
  record?: { id?: string }
}

type TaskRow = {
  id: string
  org_id: string
  project_id: string | null
  type: string
}

export type DocumentDownloadAuthorization = {
  adminClient: SupabaseClient
  orgId: string
  projectId: string
  taskId: string | null
}

export function assertNoSupabaseError(
  error: { message?: string } | null | undefined,
  operation: string,
): void {
  if (error) {
    throw new Error(`${operation}: ${error.message ?? '알 수 없는 오류'}`)
  }
}

export async function authorizeDocumentDownloadRequest(
  req: Request,
  body: RequestBody,
  allowedTaskTypes: string[],
): Promise<DocumentDownloadAuthorization> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase 서버 설정이 없습니다')
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  const authorization = req.headers.get('Authorization') ?? ''
  const isInternal = authorization === `Bearer ${serviceRoleKey}`

  if (isInternal) {
    const taskId = body.record?.id ?? body.task_id
    if (!taskId) throw new Error('내부 호출에는 task_id가 필요합니다')

    const { data, error } = await adminClient
      .from('tasks')
      .select('id, org_id, project_id, type')
      .eq('id', taskId)
      .in('type', allowedTaskTypes)
      .single()
    assertNoSupabaseError(error, '내부 작업 조회 실패')

    const task = data as TaskRow | null
    if (!task?.project_id || !task.org_id) {
      throw new Error('프로젝트에 연결된 유효한 내부 작업이 아닙니다')
    }

    const { data: project, error: projectError } = await adminClient
      .from('projects')
      .select('id')
      .eq('id', task.project_id)
      .eq('org_id', task.org_id)
      .single()
    assertNoSupabaseError(projectError, '내부 작업 프로젝트 조회 실패')
    if (!project) throw new Error('내부 작업의 프로젝트를 찾을 수 없습니다')

    return {
      adminClient,
      orgId: task.org_id,
      projectId: task.project_id,
      taskId: task.id,
    }
  }

  const projectId = body.project_id
  if (!projectId) throw new Error('project_id가 없습니다')

  const { user, supabaseClient } = await getAuthenticatedUser(req)
  const { data: project, error: projectError } = await supabaseClient
    .from('projects')
    .select('id, org_id')
    .eq('id', projectId)
    .single()
  assertNoSupabaseError(projectError, '프로젝트 조회 실패')
  if (!project) throw new Error('프로젝트를 찾을 수 없습니다')

  const { data: membership, error: membershipError } = await supabaseClient
    .from('memberships')
    .select('org_id')
    .eq('user_id', user.id)
    .eq('org_id', project.org_id)
    .not('joined_at', 'is', null)
    .single()
  assertNoSupabaseError(membershipError, '프로젝트 조직 멤버십 조회 실패')
  if (!membership) throw new Error('프로젝트에 접근할 권한이 없습니다')

  return {
    adminClient,
    orgId: project.org_id,
    projectId,
    taskId: null,
  }
}

export async function markOwnedTaskFailed(
  adminClient: SupabaseClient,
  taskId: string | null,
  orgId: string,
  projectId: string,
  message: string,
): Promise<void> {
  if (!taskId) return

  const { data, error } = await adminClient
    .from('tasks')
    .update({
      status: 'failed',
      error_message: message,
      completed_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .eq('org_id', orgId)
    .eq('project_id', projectId)
    .select('id')
    .single()
  assertNoSupabaseError(error, '실패 작업 상태 저장 실패')
  if (!data) throw new Error('실패 처리할 소유 작업을 찾을 수 없습니다')
}
