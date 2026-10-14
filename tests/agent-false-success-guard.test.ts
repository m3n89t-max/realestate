import assert from 'node:assert/strict'
import test from 'node:test'
import { requireSavedDocumentResult } from '../src/agent/document-result-guard'

const documentTaskTypes = [
  'building_register',
  'download_building_register',
  'download_cadastral_map',
]

test('서류 작업은 document_id 없이 완료 보고하면 예외가 난다', () => {
  for (const type of documentTaskTypes) {
    assert.throws(() => requireSavedDocumentResult(type, {}), /저장/)
    assert.throws(() => requireSavedDocumentResult(type, { document_id: '' }), /저장/)
    assert.throws(() => requireSavedDocumentResult(type, { document_id: null as never }), /저장/)
    assert.throws(() => requireSavedDocumentResult(type, { file_url: 'https://x/y.png' }), /저장/)
  }
})

test('서버가 돌려준 document_id가 있으면 통과한다', () => {
  for (const type of documentTaskTypes) {
    assert.doesNotThrow(() =>
      requireSavedDocumentResult(type, { document_id: '11111111-1111-1111-1111-111111111111' }),
    )
  }
})

test('문서 작업이 아닌 유형은 영향받지 않는다', () => {
  for (const type of ['blog_generation', 'naver_upload', 'shorts_generation']) {
    assert.doesNotThrow(() => requireSavedDocumentResult(type, { message: 'ok' }))
  }
})
