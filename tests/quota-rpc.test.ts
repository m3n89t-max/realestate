import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS = join(process.cwd(), 'supabase/migrations')
const FUNCTIONS = join(process.cwd(), 'supabase/functions')

function allMigrationSql(): string {
  return readdirSync(MIGRATIONS)
    .filter(f => f.endsWith('.sql'))
    .map(f => readFileSync(join(MIGRATIONS, f), 'utf8'))
    .join('\n')
}

function definedFunctions(sql: string): Set<string> {
  const names = new Set<string>()
  const re = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(\w+)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(sql))) names.add(m[1])
  return names
}

function calledRpcs(): Map<string, string[]> {
  const found = new Map<string, string[]>()
  for (const dir of readdirSync(FUNCTIONS, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue
    let source: string
    try {
      source = readFileSync(join(FUNCTIONS, dir.name, 'index.ts'), 'utf8')
    } catch {
      continue
    }
    const re = /\.rpc\(\s*['"](\w+)['"]/g
    let m: RegExpExecArray | null
    while ((m = re.exec(source))) {
      const list = found.get(m[1]) ?? []
      list.push(dir.name)
      found.set(m[1], list)
    }
  }
  return found
}

/**
 * 재현한 실제 장애:
 * 쇼츠 생성에서 '사용량 한도를 확인할 수 없습니다' 가 나왔다.
 * checkQuota 가 호출하는 check_quota RPC 가 운영 DB에 존재하지 않았고,
 * 쿼터는 fail-closed 로 설계돼 판정 불가 시 요청을 막는다. 그래서 전부 실패했다.
 *
 * 003_functions.sql 에는 정의가 있었지만 실제 적용본인 000_full_setup.sql 에는 없었다.
 * 그래서 '마이그레이션 파일에 있다'는 것만으로는 안전하지 않다.
 */

test('엣지 함수가 호출하는 모든 RPC 는 마이그레이션에 정의가 있다', () => {
  const defined = definedFunctions(allMigrationSql())
  const called = calledRpcs()

  const missing: string[] = []
  for (const [rpc, callers] of called) {
    if (!defined.has(rpc)) missing.push(`${rpc} (호출: ${callers.join(', ')})`)
  }

  assert.deepEqual(missing, [], `정의 없는 RPC 가 있으면 런타임에 실패합니다:\n${missing.join('\n')}`)
})

test('check_quota 는 한 번이라도 적용되는 마이그레이션에 정의돼 있다', () => {
  const defined = definedFunctions(allMigrationSql())
  assert.ok(defined.has('check_quota'), 'check_quota 정의가 어느 마이그레이션에도 없습니다.')
})

test('전체 설치 경로(000_full_setup)에도 쿼터 함수가 들어 있다', () => {
  // 신규 프로젝트는 000_full_setup 만으로 세워진다.
  // 여기에 빠진 함수는 그 환경에서 영구히 없는 상태가 된다.
  const fullSetup = readFileSync(join(MIGRATIONS, '000_full_setup.sql'), 'utf8')
  const defined = definedFunctions(fullSetup)

  const required = ['check_quota', 'increment_usage', 'get_org_usage']
  const missing = required.filter(fn => !defined.has(fn))

  assert.deepEqual(
    missing,
    [],
    `000_full_setup.sql 에 없는 함수: ${missing.join(', ')}. 이 경로로 세운 프로젝트는 해당 기능이 런타임 실패합니다.`,
  )
})

test('쿼터 확인은 판정 불가 시 통과시키지 않는다 (fail-closed 유지)', () => {
  const auth = readFileSync(join(FUNCTIONS, '_shared/auth.ts'), 'utf8')
  const checkQuota = auth.match(/export async function checkQuota\([\s\S]*?\n}/)
  assert.ok(checkQuota, 'checkQuota 정의를 찾지 못했습니다.')
  const body = checkQuota[0]

  // 판정 불가 경로가 두 가지다: RPC 오류, 예상 밖 응답 모양.
  // 두 경로 모두 반드시 throw 해야 한다(통과시키면 과금·남용 경계가 뚫린다).
  const errorBranch = body.match(/if \(error\) \{[\s\S]*?\n  \}/)
  assert.ok(errorBranch, 'RPC 오류 분기를 찾지 못했습니다.')
  assert.match(errorBranch[0], /throw new Error/, 'RPC 오류 시 막아야 합니다.')

  const shapeBranch = body.match(/if \(typeof data\?\.exceeded !== 'boolean'\) \{[\s\S]*?\n  \}/)
  assert.ok(shapeBranch, '응답 모양 검사 분기를 찾지 못했습니다.')
  assert.match(shapeBranch[0], /throw new Error/, '응답 모양이 다르면 막아야 합니다.')

  // 판정 불가 상황에서 조용히 return 하는 경로가 없어야 한다.
  assert.ok(
    !/if \(error\)[\s\S]{0,120}return\b/.test(body),
    'RPC 오류를 return 으로 넘기면 쿼터가 무력화됩니다.',
  )
})

test('함수 누락 오류는 재시도 안내와 구분해서 알린다', () => {
  const auth = readFileSync(join(FUNCTIONS, '_shared/auth.ts'), 'utf8')
  // PGRST202 는 PostgREST 가 함수를 못 찾을 때 쓰는 코드다.
  assert.match(
    auth,
    /PGRST202|does not exist|could not find the function/i,
    '함수 누락을 식별하지 못하면 영구 실패에도 "잠시 후 다시 시도"만 안내한다.',
  )
  assert.match(auth, /설정되어 있지 않습니다/, '설정 문제임을 알리는 안내가 필요합니다.')
})

test('쿼터 확인 실패 메시지는 사용자가 다음 행동을 알 수 있게 쓰여 있다', () => {
  const auth = readFileSync(join(FUNCTIONS, '_shared/auth.ts'), 'utf8')
  // '잠시 후 다시 시도' 만 안내하면, 설정 누락으로 영구 실패하는 상황에서 사용자가 계속 재시도만 한다.
  const vagueRetryOnly =
    /사용량 한도를 확인할 수 없습니다\. 잠시 후 다시 시도해주세요\./g
  const matches = auth.match(vagueRetryOnly) ?? []
  assert.equal(
    matches.length,
    0,
    '재시도로 해결되지 않는 원인(설정 누락)까지 "잠시 후 다시 시도"로 안내하면 안 됩니다.',
  )
})
