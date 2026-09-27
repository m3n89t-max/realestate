import { test, expect } from '@playwright/test'

test('비로그인 사용자는 대시보드에서 로그인 화면으로 이동한다', async ({ page }) => {
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

  await expect(page).toHaveURL(/\/login(?:\?|$)/)
  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible()
  await expect(page.locator('input[type="email"]')).toBeVisible()
  await expect(page.locator('input[type="password"]')).toBeVisible()
})

test('비로그인 사용자의 인구 분석 API 요청을 거부한다', async ({ request }) => {
  const response = await request.post('/api/population', {
    data: { project_id: '00000000-0000-0000-0000-000000000000' },
  })

  expect(response.status()).toBe(401)
})

test('가입 화면은 이름, 이메일, 비밀번호를 요구한다', async ({ page }) => {
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Create a free account' }).click()

  await expect(page.locator('input[placeholder*="Hong"]')).toHaveAttribute('required', '')
  await expect(page.locator('input[type="email"]')).toHaveAttribute('required', '')
  await expect(page.locator('input[type="password"]')).toHaveAttribute('minlength', '6')
})
