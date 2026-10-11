import test from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import LandingPage from '../src/app/page'

test('랜딩페이지 제품 미리보기 영상은 클릭 없이 무음 반복 재생된다', () => {
  const html = renderToStaticMarkup(<LandingPage />)

  assert.match(html, /<video[^>]*autoplay=""/)
  assert.match(html, /<video[^>]*loop=""/)
  assert.match(html, /<video[^>]*muted=""/)
  assert.match(html, /<video[^>]*playsinline=""/)
  assert.match(html, /poster="\/demo\/jipporter-demo-poster\.webp"/)
  assert.match(html, /<source src="\/demo\/jipporter-demo\.mp4" type="video\/mp4"/)
  assert.match(html, /15초로 보는 집포터 사용 흐름/)
  assert.match(html, /aria-describedby="demo-video-description"/)
  assert.match(html, /가상 매물의 주소를 입력하고 사진을 추가한 뒤 역세권·남향·주차가능 특징을 선택합니다/)
  assert.match(html, /영상 재생/)
})
