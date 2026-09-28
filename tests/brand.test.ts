import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { BRAND } from '../src/lib/brand'
import { AGENT_BRAND } from '../src/agent/brand'

const readProjectFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test('집포터 브랜드의 공식 이름과 핵심 약속을 한 곳에서 제공한다', () => {
  assert.equal(BRAND.name, '집포터')
  assert.equal(BRAND.englishName, 'JIPPORTER')
  assert.equal(BRAND.tagline, '주소와 사진만 넣으면, 집포터가 홍보 초안을 완성합니다.')
  assert.match(BRAND.description, /공인중개사/)
})

test('로컬 에이전트도 집포터 이름을 사용한다', () => {
  assert.equal(AGENT_BRAND.productName, '집포터')
  assert.equal(AGENT_BRAND.localAgentName, '집포터 로컬 에이전트')
})

test('하위 페이지 제목은 루트 템플릿과 브랜드명을 중복하지 않는다', () => {
  const credentialsPage = readProjectFile('src/app/(dashboard)/settings/credentials/page.tsx')

  assert.match(credentialsPage, /title: '자동화 계정 관리'/)
  assert.doesNotMatch(credentialsPage, /자동화 계정 관리 \|/)
})

test('로컬 에이전트 배포 화면과 스크립트에 이전 제품명이 남지 않는다', () => {
  const surfaces = [
    'public/agent-setup.bat',
    'scripts/setup-local-agent.bat',
    'scripts/build-agent-zip.js',
    'src/agent/setup.html',
  ].map(readProjectFile)

  for (const surface of surfaces) {
    assert.match(surface, /집포터/)
    assert.doesNotMatch(surface, /RealEstate AI OS|부동산 AI OS|부동산 AI 에이전트/)
  }

  for (const batchFile of surfaces.slice(0, 2)) {
    assert.match(batchFile, /chcp 65001/i)
  }
})
