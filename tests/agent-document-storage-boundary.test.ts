import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

test('documents 버킷은 private이고 과도한 기존 정책을 제거한다', () => {
  const migration = read('supabase/migrations/20261014090000_harden_documents_storage.sql')

  assert.match(migration, /UPDATE\s+storage\.buckets[\s\S]*public\s*=\s*false[\s\S]*id\s*=\s*'documents'/i)
  for (const policy of ['documents_public_read', 'documents_auth_insert', 'documents_auth_update', 'documents_auth_delete']) {
    assert.match(migration, new RegExp(`DROP POLICY IF EXISTS ["']${policy}["'] ON storage\\.objects`, 'i'))
  }
  assert.match(migration, /TO\s+authenticated/i)
  assert.match(migration, /storage\.foldername\(name\)/i)
  assert.match(migration, /projects/i)
  assert.match(migration, /source_task_id/)
  assert.match(migration, /idx_documents_project_type_unique/)
  assert.match(migration, /ADD COLUMN IF NOT EXISTS raw_data jsonb/)
  assert.doesNotMatch(migration, /FOR\s+UPDATE/i)
})

test('문서 화면은 공개 URL 대신 서명 URL로 파일을 노출한다', () => {
  const docsPage = read('src/app/(dashboard)/docs/page.tsx')
  const projectPage = read('src/app/(dashboard)/projects/[id]/page.tsx')
  const cadastralFn = read('supabase/functions/download-cadastral-map/index.ts')

  for (const source of [docsPage, projectPage]) {
    assert.match(source, /resolveDocumentFileUrls/)
  }
  assert.doesNotMatch(cadastralFn, /getPublicUrl/)
  assert.doesNotMatch(cadastralFn, /upsert:\s*true/)
})

test('Electron 문서 수집기는 anon Supabase로 documents나 Storage에 직접 쓰지 않는다', () => {
  const building = read('src/agent/playwright/building_register.ts')
  const cadastral = read('src/agent/playwright/cadastral_map.ts')

  for (const source of [building, cadastral]) {
    assert.doesNotMatch(source, /createClient\s*\(/)
    assert.doesNotMatch(source, /\.from\(['"]documents['"]\)/)
    assert.doesNotMatch(source, /\.storage\s*\n?\s*\.from\(['"]documents['"]\)/)
  }
  assert.match(building, /saveDocument/)
  assert.match(cadastral, /saveDocument/)
})

test('서류 작업은 서버가 확인한 document_id 없이는 완료 보고할 수 없다', () => {
  const worker = read('src/agent/worker.ts')
  const guard = read('src/agent/document-result-guard.ts')
  const webhook = read('supabase/functions/webhook-agent/index.ts')

  assert.match(worker, /requireSavedDocumentResult\(task\.type, result\)/)
  assert.match(guard, /DOCUMENT_TASK_TYPES/)
  assert.match(webhook, /requireOwnedDocument/)
  assert.match(webhook, /document_id/)
  assert.match(webhook, /task\.project_id/)
})

test('file_url을 그대로 믿는 document_uploaded 이벤트는 더 이상 없다', () => {
  const webhook = read('supabase/functions/webhook-agent/index.ts')
  const client = read('src/agent/webhook-client.ts')

  assert.doesNotMatch(webhook, /case 'document_uploaded'/)
  assert.doesNotMatch(client, /document_uploaded/)
  assert.match(webhook, /case 'save_document'/)
  // 서버가 경로를 만들고 덮어쓰기를 막는다
  assert.match(webhook, /\$\{agent\.org_id\}\/\$\{project_id\}\//)
  assert.match(webhook, /upsert:\s*false/)
})

test('webhook-agent는 내부 DB 오류 문자열을 응답에 싣지 않는다', () => {
  const webhook = read('supabase/functions/webhook-agent/index.ts')
  const tail = webhook.slice(webhook.lastIndexOf('} catch'))

  assert.match(tail, /error: '요청을 처리하지 못했습니다'/)
  assert.doesNotMatch(tail, /err\s*instanceof\s*Error\s*\?\s*err\.message/)
})

test('지적도 함수는 API 키가 들어간 URL을 로그로 흘리지 않는다', () => {
  const cadastral = read('supabase/functions/download-cadastral-map/index.ts')

  assert.doesNotMatch(cadastral, /console\.(log|warn|error)\([^)]*wmsUrl/)
  assert.doesNotMatch(cadastral, /console\.(log|warn|error)\([^)]*staticUrl/)
  assert.doesNotMatch(cadastral, /console\.(log|warn|error)\([^)]*vworldKey/)
})
