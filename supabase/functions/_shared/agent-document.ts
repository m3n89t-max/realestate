export type AgentDocumentType = 'building_register' | 'cadastral_map'

export interface AgentDocumentSaveRequest {
  task_id: string
  project_id: string
  document_type: AgentDocumentType
}

export interface AgentDocumentTask {
  id: string
  org_id: string
  project_id: string | null
  type: string
  status: string
  agent_id: string | null
}

export interface AgentDocumentProject {
  id: string
  org_id: string
}

export interface DocumentSaveContext {
  agentId: string
  agentOrgId: string
  task: AgentDocumentTask
  project: AgentDocumentProject
  request: AgentDocumentSaveRequest
}

const taskDocumentTypes: Record<string, AgentDocumentType> = {
  building_register: 'building_register',
  download_building_register: 'building_register',
  download_cadastral_map: 'cadastral_map',
}

export function validateDocumentSaveContext(context: DocumentSaveContext): void {
  const { agentId, agentOrgId, task, project, request } = context
  const valid =
    task.id === request.task_id &&
    task.org_id === agentOrgId &&
    task.project_id === request.project_id &&
    task.status === 'running' &&
    task.agent_id === agentId &&
    project.id === request.project_id &&
    project.org_id === agentOrgId &&
    taskDocumentTypes[task.type] === request.document_type

  if (!valid) throw new Error('저장할 수 없는 문서 요청입니다')
}

export function isAgentDocumentTask(taskType: string): boolean {
  return taskDocumentTypes[taskType] !== undefined
}

export function expectedDocumentType(taskType: string): AgentDocumentType | undefined {
  return taskDocumentTypes[taskType]
}
