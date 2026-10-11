import { expect, test } from '@playwright/test'

const landingUrl = process.env.LANDING_VIDEO_BASE_URL ?? '/'

test('무음 데모는 설명문과 연결되고 실제 재생 상태를 버튼에 반영한다', async ({ page }) => {
  await page.goto(landingUrl)

  const video = page.locator('video[aria-labelledby="demo-video-title"]')
  const transcript = page.locator('#demo-video-description')
  const pauseButton = page.getByRole('button', { name: '영상 일시정지' })

  await expect(video).toHaveAttribute('aria-describedby', 'demo-video-description')
  await expect(transcript).toContainText('가상 매물의 주소를 입력하고 사진을 추가한 뒤 역세권·남향·주차가능 특징을 선택합니다')
  await expect(transcript).toContainText('입지분석, 블로그 글, 카드뉴스')
  await expect(video).toHaveJSProperty('paused', false)

  await pauseButton.click()
  await expect(video).toHaveJSProperty('paused', true)
  await expect(page.getByRole('button', { name: '영상 재생' })).toBeVisible()

  await page.getByRole('button', { name: '영상 재생' }).click()
  await expect(video).toHaveJSProperty('paused', false)
  await expect(page.getByRole('button', { name: '영상 일시정지' })).toBeVisible()
})

test('재생 요청이 거부되면 재생 버튼 상태를 유지한다', async ({ page }) => {
  const pageErrors: Error[] = []
  page.on('pageerror', error => pageErrors.push(error))

  await page.goto(landingUrl)
  await page.getByRole('button', { name: '영상 일시정지' }).click()

  await page.locator('video').evaluate(element => {
    const video = element as HTMLVideoElement
    video.play = () => Promise.reject(new DOMException('Playback denied', 'NotAllowedError'))
  })

  await page.getByRole('button', { name: '영상 재생' }).click()
  await expect(page.getByRole('button', { name: '영상 재생' })).toBeVisible()
  await expect(page.locator('video')).toHaveJSProperty('paused', true)
  expect(pageErrors).toHaveLength(0)
})
