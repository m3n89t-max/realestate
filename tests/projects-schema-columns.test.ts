import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * 스키마에 없는 컬럼을 select하면 Supabase가 요청 전체를 42703으로 거절한다.
 * 한 컬럼 이름을 잘못 쓰면 그 화면이 통째로 죽는다 — 타입체크도 빌드도 잡지 못한다.
 * (`road_address`를 select에 넣어 입지분석 페이지가 로드되지 않은 사고가 있었다.)
 */

/** 마이그레이션 전체에서 projects 테이블에 존재하는 컬럼 이름을 모은다. */
function collectProjectColumns(): Set<string> {
  const dir = path.join(ROOT, 'supabase', 'migrations')
  const columns = new Set<string>()

  for (const file of readdirSync(dir).filter(f => f.endsWith('.sql'))) {
    const sql = readFileSync(path.join(dir, file), 'utf8')

    // CREATE TABLE ... projects ( ... )
    const created = sql.match(/CREATE TABLE[^;]*?\bprojects\s*\(([\s\S]*?)\n\)/i)
    if (created) {
      for (const line of created[1].split('\n')) {
        const m = line.match(/^\s*([a-z_][a-z0-9_]*)\s+[a-z]/i)
        if (m && !/^(CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK)$/i.test(m[1])) {
          columns.add(m[1])
        }
      }
    }

    // ALTER TABLE projects ADD COLUMN ... 문 안의 모든 컬럼을 수집한다.
    // 한 ALTER TABLE 문에 ADD COLUMN 절이 쉼표로 여러 개 올 수 있다.
    const alterRe = /ALTER TABLE\s+(?:public\.)?projects\s+([\s\S]*?);/gi
    let alter: RegExpExecArray | null
    while ((alter = alterRe.exec(sql)) !== null) {
      const addRe = /ADD COLUMN\s+(?:IF NOT EXISTS\s+)?([a-z_][a-z0-9_]*)/gi
      let added: RegExpExecArray | null
      while ((added = addRe.exec(alter[1])) !== null) columns.add(added[1])
    }
  }

  return columns
}

test('projects 스키마를 파싱할 수 있다', () => {
  const columns = collectProjectColumns()
  assert.ok(columns.has('id'), 'id 컬럼을 찾지 못했다 — 파서가 깨졌다')
  assert.ok(columns.has('address'))
  assert.ok(columns.has('public_data_layers'), '033 마이그레이션의 컬럼을 찾지 못했다')
})

test("projects select에 스키마에 없는 컬럼을 쓰지 않는다", () => {
  const columns = collectProjectColumns()
  const violations: string[] = []

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.next') continue
        walk(full)
        continue
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue

      const source = readFileSync(full, 'utf8')
      // .from('projects') 뒤에 이어지는 .select('a, b, c')
      const re = /\.from\(\s*['"]projects['"]\s*\)[\s\S]{0,200}?\.select\(\s*['"]([^'"]+)['"]/g
      let m: RegExpExecArray | null
      while ((m = re.exec(source)) !== null) {
        const selected = m[1]
        if (selected.trim() === '*') continue
        for (const raw of selected.split(',')) {
          // 조인 표기(other_table(...))와 별칭은 건너뛴다
          const name = raw.trim().split(/[\s:(]/)[0]
          if (!name || name.includes('*') || raw.includes('(')) continue
          if (!columns.has(name)) {
            violations.push(`${path.relative(ROOT, full)}: '${name}'`)
          }
        }
      }
    }
  }

  walk(path.join(ROOT, 'src'))

  assert.deepEqual(
    violations,
    [],
    `projects 테이블에 없는 컬럼을 select했다. Supabase가 요청 전체를 거절해 화면이 죽는다:\n${violations.join('\n')}`,
  )
})
