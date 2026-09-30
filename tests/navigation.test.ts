import test from 'node:test'
import assert from 'node:assert/strict'
import { getNavigationSections, getPageMeta, isNavigationItemActive } from '../src/lib/navigation'

test('일반 사용자는 네 가지 쉬운 기본 메뉴만 본다', () => {
  const sections = getNavigationSections('viewer')
  const items = sections.flatMap(section => section.items)

  assert.deepEqual(sections.map(section => section.label), ['기본 메뉴'])
  assert.deepEqual(items.map(item => item.href), ['/dashboard', '/projects', '/tasks', '/help'])
  assert.deepEqual(items.map(item => item.label), ['홈', '내 매물', '처리 알림', '도움말'])
})

test('새 매물 입력에서는 모바일 새 매물만 활성화한다', () => {
  assert.equal(isNavigationItemActive('/projects/new', '/projects/new'), true)
  assert.equal(isNavigationItemActive('/projects/new', '/projects'), false)
  assert.equal(isNavigationItemActive('/projects/abc', '/projects'), true)
})

test('관리 메뉴는 관리자에게만 보인다', () => {
  const viewerItems = getNavigationSections('viewer').flatMap(section => section.items)
  const adminSections = getNavigationSections('admin')
  const adminItems = adminSections.flatMap(section => section.items)

  assert.equal(viewerItems.some(item => item.href === '/usage'), false)
  assert.equal(viewerItems.some(item => item.href === '/admin/members'), false)
  assert.equal(adminSections.some(section => section.label === '관리자 메뉴'), true)
  assert.equal(adminItems.some(item => item.href === '/usage'), true)
  assert.equal(adminItems.some(item => item.href === '/admin/members'), true)
})

test('상세 경로에서도 초보자가 이해할 수 있는 상단 문맥을 유지한다', () => {
  assert.deepEqual(getPageMeta('/dashboard'), { eyebrow: '홈', title: '오늘 할 일' })
  assert.deepEqual(getPageMeta('/projects/abc'), { eyebrow: '내 매물', title: '매물 상세' })
  assert.deepEqual(getPageMeta('/tasks'), { eyebrow: '처리 알림', title: '처리 상태와 문제 해결' })
  assert.deepEqual(getPageMeta('/help'), { eyebrow: '도움말', title: '처음 사용하는 분을 위한 안내' })
})

test('알 수 없는 경로에서도 집포터 브랜드 문맥을 유지한다', () => {
  assert.deepEqual(getPageMeta('/unknown'), { eyebrow: '집포터', title: '업무 공간' })
})
