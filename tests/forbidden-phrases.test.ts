import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { FORBIDDEN_LAYER_PHRASES } from '../src/lib/public-data-layers'

// tsx는 이 파일을 CJS로 변환할 수 있어 import.meta.dirname 이 undefined가 된다.
// 두 실행 방식 모두에서 동작하도록 __dirname 을 우선 사용한다.
const HERE =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const SCAN_DIRS = ['src', 'supabase/functions']
const SCAN_EXT = new Set(['.ts', '.tsx'])

/** 금지 문구 fixture 자체를 담은 파일은 제외한다. */
const EXEMPT = new Set([path.join('src', 'lib', 'public-data-layers.ts')])

function walk(dir: string, acc: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return acc
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, acc)
    else if (SCAN_EXT.has(path.extname(full))) acc.push(full)
  }
  return acc
}

test('소스 전체에 금지 문구가 남아 있지 않다', () => {
  const files = SCAN_DIRS.flatMap(dir => walk(path.join(ROOT, dir)))
  assert.ok(files.length > 50, `스캔 대상 파일이 너무 적다 (${files.length}개) — 경로 설정을 확인하라`)

  const violations: string[] = []
  for (const file of files) {
    const relative = path.relative(ROOT, file)
    if (EXEMPT.has(relative)) continue
    const content = readFileSync(file, 'utf8')
    for (const phrase of FORBIDDEN_LAYER_PHRASES) {
      if (content.includes(phrase)) violations.push(`${relative}: "${phrase}"`)
    }
  }

  assert.deepEqual(violations, [], `금지 문구가 발견됐다:\n${violations.join('\n')}`)
})

test('상권등급 배수 상수가 코드에 남아 있지 않다', () => {
  const files = SCAN_DIRS.flatMap(dir => walk(path.join(ROOT, dir)))
  const violations: string[] = []
  for (const file of files) {
    const content = readFileSync(file, 'utf8')
    // 등급을 사람 수 배수로 쓰던 패턴: { S: 3, A: 2, B: 1, ... }
    if (/\bS:\s*3\b[\s\S]{0,60}\bA:\s*2\b/.test(content)) {
      violations.push(path.relative(ROOT, file))
    }
  }
  assert.deepEqual(violations, [], `상권등급 배수 테이블이 남아 있다: ${violations.join(', ')}`)
})
