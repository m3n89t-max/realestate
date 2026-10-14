import assert from 'node:assert/strict'
import test from 'node:test'
import {
  validateDocumentSaveContext,
  type DocumentSaveContext,
} from '../supabase/functions/_shared/agent-document'

const valid: DocumentSaveContext = {
  agentId: 'agent-1',
  agentOrgId: 'org-1',
  task: {
    id: 'task-1',
    org_id: 'org-1',
    project_id: 'project-1',
    type: 'download_cadastral_map',
    status: 'running',
    agent_id: 'agent-1',
  },
  project: { id: 'project-1', org_id: 'org-1' },
  request: {
    task_id: 'task-1',
    project_id: 'project-1',
    document_type: 'cadastral_map',
  },
}

test('agent/task/project 조직과 소유권이 모두 맞는 저장 요청만 허용한다', () => {
  assert.doesNotThrow(() => validateDocumentSaveContext(valid))
})

test('다른 조직 프로젝트 저장을 거부한다', () => {
  assert.throws(
    () => validateDocumentSaveContext({ ...valid, project: { id: 'project-1', org_id: 'org-2' } }),
    /저장할 수 없는 문서 요청/,
  )
})

test('task의 project와 요청 project가 다르면 거부한다', () => {
  assert.throws(
    () => validateDocumentSaveContext({ ...valid, request: { ...valid.request, project_id: 'project-2' } }),
    /저장할 수 없는 문서 요청/,
  )
})

test('다른 에이전트가 claim한 task는 저장하지 못한다', () => {
  assert.throws(
    () => validateDocumentSaveContext({ ...valid, task: { ...valid.task, agent_id: 'agent-2' } }),
    /저장할 수 없는 문서 요청/,
  )
})

test('task 유형과 document 유형 조합이 다르면 거부한다', () => {
  assert.throws(
    () => validateDocumentSaveContext({ ...valid, request: { ...valid.request, document_type: 'building_register' } }),
    /저장할 수 없는 문서 요청/,
  )
})
