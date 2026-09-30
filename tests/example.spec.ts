import { test, expect } from '@playwright/test'

const relativeLuminance = (channels: number[]) => {
  const [r, g, b] = channels.map(value => {
    const channel = value / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const contrastRatio = (foreground: number[], background: number[]) => {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background))
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background))
  return (lighter + 0.05) / (darker + 0.05)
}

const hexToRgb = (hex: string) => [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16))

test('공개 첫 화면은 집포터의 결과와 이용 방법을 설명한다', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })

  expect(new URL(page.url()).pathname).toBe('/')
  await expect(page).toHaveTitle(/집포터/)
  await expect(page.getByRole('heading', { level: 1, name: /매물 정보는 한 번만 입력하세요/ })).toBeVisible()
  await expect(page.getByRole('navigation', { name: '랜딩페이지 주요 메뉴' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '매물 하나로, 필요한 홍보 자료를 한곳에서' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '주소부터 넣고, 순서대로 따라가세요' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '자주 묻는 질문' })).toBeVisible()
  await expect(page.getByRole('banner')).toBeVisible()
  await expect(page.getByRole('contentinfo')).toBeVisible()
  await expect(page.locator('main header')).toHaveCount(0)
  await expect(page.locator('main footer')).toHaveCount(0)
  await expect(page.getByText('예시 결과', { exact: true })).toHaveCount(4)

  const primaryCta = page.getByRole('link', { name: '내 매물로 결과 받아보기' }).first()
  await expect(primaryCta).toHaveAttribute('href', '/login?mode=signup')
  await expect(page.getByRole('link', { name: '로그인', exact: true }).first()).toHaveAttribute('href', '/login')

  const structuredData = await page.locator('script[type="application/ld+json"]').allTextContents()
  const parsedStructuredData = structuredData.map(raw => JSON.parse(raw) as {
    '@type'?: string
    '@graph'?: Array<{ '@type'?: string; name?: string; mainEntity?: unknown[] }>
  })
  const structuredTypes = parsedStructuredData.flatMap(parsed => {
    return parsed['@graph']?.map(item => item['@type']) ?? [parsed['@type']]
  })
  expect(structuredTypes).toContain('SoftwareApplication')
  expect(structuredTypes).toContain('FAQPage')
  const graph = parsedStructuredData.flatMap(parsed => parsed['@graph'] ?? [])
  expect(graph.find(item => item['@type'] === 'SoftwareApplication')?.name).toBe('집포터')
  expect(graph.find(item => item['@type'] === 'FAQPage')?.mainEntity).toHaveLength(5)

  for (const label of ['01', '02', '03', '04', '집포터 업무 공간 · 예시 화면']) {
    const foreground = await page.getByText(label, { exact: true }).evaluate(element => (
      getComputedStyle(element).color.match(/\d+/g)?.slice(0, 3).map(Number) ?? [0, 0, 0]
    ))
    expect(contrastRatio(foreground, [255, 255, 255])).toBeGreaterThanOrEqual(4.5)
  }

  for (const { label, backgrounds } of [
    { label: '사진 8장 · 매매 · 예시', backgrounds: ['#d9ebe6', '#86bfb1'] },
    { label: '주소와 가격', backgrounds: ['#f8f7f3'] },
    { label: '사진과 특징', backgrounds: ['#f8f7f3'] },
    { label: '거래 정보', backgrounds: ['#f8f7f3'] },
  ]) {
    const foreground = await page.getByText(label, { exact: true }).evaluate(element => (
      getComputedStyle(element).color.match(/\d+/g)?.slice(0, 3).map(Number) ?? [0, 0, 0]
    ))
    for (const background of backgrounds) {
      expect(contrastRatio(foreground, hexToRgb(background))).toBeGreaterThanOrEqual(4.5)
    }
  }
})

test('랜딩페이지 CTA는 회원가입 화면으로 바로 연결한다', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.getByRole('link', { name: '내 매물로 결과 받아보기' }).first().click()

  await expect(page).toHaveURL(/\/login\?mode=signup$/)
  await expect(page.getByRole('heading', { name: '계정 만들기' })).toBeVisible()
  await expect(page.getByLabel('이름')).toBeVisible()
})

test('모바일 랜딩페이지는 가로 넘침 없이 고정 CTA와 콘텐츠를 함께 보여준다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })

  await expect(page.getByRole('navigation', { name: '랜딩페이지 주요 메뉴' })).toBeHidden()
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth)

  await page.getByRole('contentinfo').scrollIntoViewIfNeeded()
  const stickyCta = page.locator('div.fixed').getByRole('link', { name: '내 매물로 결과 받아보기' })
  const disclaimer = page.getByText(/생성된 분석과 콘텐츠는 참고용 초안/)
  await expect(stickyCta).toBeVisible()
  await expect(disclaimer).toBeVisible()
  const stickyBox = await stickyCta.boundingBox()
  const disclaimerBox = await disclaimer.boundingBox()
  expect(disclaimerBox && stickyBox && disclaimerBox.y + disclaimerBox.height <= stickyBox.y).toBe(true)
})

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
