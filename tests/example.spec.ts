import { test, expect } from '@playwright/test'

test('비로그인 사용자는 대시보드에서 로그인 화면으로 이동한다', async ({ page }) => {
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

  await expect(page).toHaveURL(/\/login(?:\?|$)/)
  await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeVisible()
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
  await page.getByRole('button', { name: '무료 계정 만들기' }).click()

  await expect(page.getByLabel('이름')).toHaveAttribute('required', '')
  await expect(page.getByLabel('이메일')).toHaveAttribute('required', '')
  await expect(page.getByRole('textbox', { name: '비밀번호', exact: true })).toHaveAttribute('minlength', '6')
})

test('가입 요청 후 이메일 확인 안내를 화면에 계속 보여준다', async ({ page }) => {
  await page.route('**/auth/v1/signup**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '00000000-0000-0000-0000-000000000001',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'broker@example.com',
        confirmation_sent_at: new Date().toISOString(),
        identities: [{ id: 'identity-1', provider: 'email' }],
      }),
    })
  })

  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '무료 계정 만들기' }).click()
  await page.getByLabel('이름').fill('홍길동')
  await page.getByLabel('이메일').fill('broker@example.com')
  await page.getByRole('textbox', { name: '비밀번호', exact: true }).fill('safe-password')
  await page.getByRole('button', { name: '계정 만들기' }).click()

  await expect(page.getByRole('heading', { name: '이메일을 확인해 주세요' })).toBeVisible()
  await expect(page.getByText('broker@example.com')).toBeVisible()
  await expect(page.getByRole('button', { name: '인증 메일 다시 보내기' })).toBeVisible()
})

test('비밀번호 재설정은 안전한 콜백 경로를 요청하고 안내를 유지한다', async ({ page }) => {
  let requestBody = ''
  await page.route('**/auth/recovery/request', async route => {
    requestBody = route.request().postData() ?? ''
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '비밀번호를 잊으셨나요?' }).click()
  await page.getByLabel('이메일').fill('broker@example.com')
  await page.getByRole('button', { name: '재설정 안내 보내기' }).click()

  await expect(page.getByRole('heading', { name: '이메일을 확인해 주세요' })).toBeVisible()
  await expect(page.getByRole('button', { name: '로그인' })).toBeVisible()
  await expect(page.getByRole('button', { name: '비밀번호 재설정' })).toBeVisible()
  expect(JSON.parse(requestBody)).toEqual({ email: 'broker@example.com' })
})
