import test from 'node:test'
import assert from 'node:assert/strict'
import { getNavigationSections, getPageMeta } from '../src/lib/navigation'

test('핵심 업무와 AI 제작 도구를 서로 다른 메뉴 그룹으로 구성한다', () => {
  const sections = getNavigationSections('viewer')

  assert.deepEqual(sections.map(section => section.label), ['업무', 'AI 콘텐츠', '관리'])
  assert.deepEqual(
    sections[0].items.map(item => item.href),
    ['/dashboard', '/projects', '/tasks'],
  )
  assert.deepEqual(
    sections[1].items.map(item => item.href),
    ['/analysis', '/blog', '/cardnews', '/shorts', '/docs'],
  )
})

test('회원 관리는 관리자에게만 노출한다', () => {
  const viewerItems = getNavigationSections('viewer').flatMap(section => section.items)
  const adminItems = getNavigationSections('admin').flatMap(section => section.items)

  assert.equal(viewerItems.some(item => item.href === '/admin/members'), false)
  assert.equal(adminItems.some(item => item.href === '/admin/members'), true)
})

test('상세 경로에서도 상단 헤더 문맥을 유지한다', () => {
  assert.deepEqual(getPageMeta('/projects/abc'), {
    eyebrow: '매물 관리',
    title: '매물 상세',
  })
  assert.deepEqual(getPageMeta('/cardnews'), {
    eyebrow: 'AI 콘텐츠',
    title: '카드뉴스',
  })
})
