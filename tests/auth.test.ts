import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSignupName, sanitizeAuthNext, shouldIssueRecoveryMarker } from '../src/lib/auth'

test('인증 완료 후 이동 경로는 같은 사이트의 상대 경로만 허용한다', () => {
  assert.equal(sanitizeAuthNext('/dashboard'), '/dashboard')
  assert.equal(sanitizeAuthNext('/projects/abc?tab=blog'), '/projects/abc?tab=blog')

  for (const unsafe of [
    'https://evil.example/path',
    '//evil.example/path',
    '@evil.example/path',
    '/\\evil.example/path',
    '/%5cevil.example/path',
    'javascript:alert(1)',
    '',
  ]) {
    assert.equal(sanitizeAuthNext(unsafe), '/dashboard')
  }
})

test('복구 표식은 성공한 비밀번호 재설정 콜백에만 발급한다', () => {
  assert.equal(shouldIssueRecoveryMarker({ flow: 'pkce', successful: true, next: '/reset-password' }), false)
  assert.equal(shouldIssueRecoveryMarker({ flow: 'pkce', successful: true, next: '/reset-password', hasRecoveryPreflight: true }), true)
  assert.equal(shouldIssueRecoveryMarker({ flow: 'token_hash', type: 'recovery', successful: true, next: '/reset-password' }), true)
  assert.equal(shouldIssueRecoveryMarker({ flow: 'token_hash', type: 'signup', successful: true, next: '/reset-password' }), false)
  assert.equal(shouldIssueRecoveryMarker({ flow: 'pkce', successful: true, next: '/dashboard' }), false)
})

test('회원가입 이름은 공백을 제거하고 빈 이름을 거부한다', () => {
  assert.equal(normalizeSignupName('  홍 길동  '), '홍 길동')
  assert.equal(normalizeSignupName('   '), null)
})
