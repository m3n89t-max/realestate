import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildWebhookUrl,
  validateSupabaseProjectUrl,
  validateWebhookUrl,
} from '../src/agent/endpoint-policy'

const validProjectUrl = 'https://abcdefghijklmnopqrst.supabase.co'

test('공식 HTTPS Supabase 프로젝트 origin만 허용한다', () => {
  assert.equal(validateSupabaseProjectUrl(validProjectUrl), validProjectUrl)
  for (const candidate of [
    'http://abcdefghijklmnopqrst.supabase.co',
    'https://supabase.co',
    'https://abcdefghijklmnopqrst.supabase.co.evil.example',
    'https://abcdefghijklmnopqrst.supabase.com',
    'https://abcdefghijklmnopqrst.supabase.co/rest/v1',
    'https://abcdefghijklmnopqrst.supabase.co?next=https://evil.example',
    'https://user@abcdefghijklmnopqrst.supabase.co',
  ]) {
    assert.throws(() => validateSupabaseProjectUrl(candidate), /공식 Supabase 프로젝트 HTTPS 주소/)
  }
})

test('webhook은 bootstrap origin의 정확한 함수 경로만 허용한다', () => {
  const expected = `${validProjectUrl}/functions/v1/webhook-agent`
  assert.equal(buildWebhookUrl(validProjectUrl), expected)
  assert.equal(validateWebhookUrl(expected, validProjectUrl), expected)
  for (const candidate of [
    `${validProjectUrl}/functions/v1/webhook-agent/`,
    `${validProjectUrl}/functions/v1/webhook-agent?agent_key=secret`,
    'https://abcdefghijklmnopqrst.supabase.co.evil.example/functions/v1/webhook-agent',
    'https://otherprojectrefxxxx.supabase.co/functions/v1/webhook-agent',
  ]) {
    assert.throws(() => validateWebhookUrl(candidate, validProjectUrl), /webhook 주소/)
  }
})
