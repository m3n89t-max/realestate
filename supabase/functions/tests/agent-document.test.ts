import { assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  validateDocumentSaveContext,
  type DocumentSaveContext,
} from '../_shared/agent-document.ts'

const valid: DocumentSaveContext = {
  agentId: 'agent-1',
  agentOrgId: 'org-1',
  task: {
    id: 'task-1',
    org_id: 'org-1',
    project_id: 'project-1',
    type: 'download_building_register',
    status: 'running',
    agent_id: 'agent-1',
  },
  project: { id: 'project-1', org_id: 'org-1' },
  request: {
    task_id: 'task-1',
    project_id: 'project-1',
    document_type: 'building_register',
  },
}

Deno.test('claimed task의 agent/org/project/document type이 모두 맞아야 저장한다', () => {
  validateDocumentSaveContext(valid)
})

Deno.test('다른 조직, project 또는 agent의 문서 저장을 거부한다', async () => {
  const invalidContexts: DocumentSaveContext[] = [
    { ...valid, agentOrgId: 'org-2' },
    { ...valid, project: { ...valid.project, org_id: 'org-2' } },
    { ...valid, task: { ...valid.task, project_id: 'project-2' } },
    { ...valid, task: { ...valid.task, agent_id: 'agent-2' } },
  ]

  for (const context of invalidContexts) {
    await assertRejects(() => Promise.resolve().then(() => validateDocumentSaveContext(context)))
  }
})
