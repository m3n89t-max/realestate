import test from 'node:test'
import assert from 'node:assert/strict'
import { buildProjectDraftWrite } from '../src/lib/project-draft'

test('최초 저장은 조직과 작성자를 포함해 insert 한다', () => {
  assert.deepEqual(buildProjectDraftWrite(null, { address: '서울' }, { orgId: 'org-1', userId: 'user-1' }), {
    operation: 'insert',
    values: { address: '서울', org_id: 'org-1', created_by: 'user-1' },
  })
})

test('이전 단계에서 고친 내용은 기존 매물을 update 한다', () => {
  assert.deepEqual(buildProjectDraftWrite('project-1', { address: '수정한 주소' }, { orgId: 'org-1', userId: 'user-1' }), {
    operation: 'update',
    projectId: 'project-1',
    values: { address: '수정한 주소' },
  })
})