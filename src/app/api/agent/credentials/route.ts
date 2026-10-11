import { NextResponse } from 'next/server'

const retiredResponse = () => NextResponse.json(
  {
    error: '외부 플랫폼 로그인정보는 웹에서 처리하지 않습니다. 집포터 로컬 에이전트의 설정 화면을 사용해 주세요.',
  },
  { status: 410 },
)

export const GET = retiredResponse
export const POST = retiredResponse
export const DELETE = retiredResponse
