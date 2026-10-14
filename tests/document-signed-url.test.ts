import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveDocumentFileUrls, type SignedUrlCreator } from '../src/lib/document-url'

const signer = (overrides: Partial<Record<string, string>> = {}, failures: string[] = []): SignedUrlCreator =>
  async (path) => {
    if (failures.includes(path)) return null
    return overrides[path] ?? `https://example.test/signed/${path}`
  }

test('비공개 저장소 경로는 서명 URL로 바꾼다', async () => {
  const [doc] = await resolveDocumentFileUrls(
    [{ id: 'doc-1', file_url: 'org-1/project-1/map.png' }],
    signer(),
  )
  assert.equal(doc.file_url, 'https://example.test/signed/org-1/project-1/map.png')
})

test('서명 발급 실패는 링크를 비워 깨진 공개 URL을 노출하지 않는다', async () => {
  const [doc] = await resolveDocumentFileUrls(
    [{ id: 'doc-1', file_url: 'org-1/project-1/map.png' }],
    signer({}, ['org-1/project-1/map.png']),
  )
  assert.equal(doc.file_url, null)
})

test('과거 절대 URL 문서는 그대로 둔다', async () => {
  const [doc] = await resolveDocumentFileUrls(
    [{ id: 'doc-1', file_url: 'https://cdn.example.test/public/old.png' }],
    signer(),
  )
  assert.equal(doc.file_url, 'https://cdn.example.test/public/old.png')
})

test('파일이 없는 문서는 서명을 요청하지 않는다', async () => {
  const requested: string[] = []
  const docs = await resolveDocumentFileUrls(
    [{ id: 'doc-1', file_url: null }, { id: 'doc-2' }],
    async (path) => { requested.push(path); return 'x' },
  )
  assert.deepEqual(requested, [])
  assert.deepEqual(docs.map((d) => d.file_url ?? null), [null, null])
})
