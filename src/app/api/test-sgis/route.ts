import { NextResponse } from 'next/server'

export async function GET() {
  const serviceId = process.env.SGIS_SERVICE_ID
  const securityKey = process.env.SGIS_SECURITY_KEY

  const result: Record<string, any> = {
    env: {
      SGIS_SERVICE_ID: serviceId ? `${serviceId.substring(0, 6)}... (${serviceId.length}자)` : '❌ 없음',
      SGIS_SECURITY_KEY: securityKey ? `${securityKey.substring(0, 6)}... (${securityKey.length}자)` : '❌ 없음',
    },
  }

  if (!serviceId || !securityKey) {
    return NextResponse.json({ ...result, status: '❌ 환경변수 없음' })
  }

  // 1. 인증 테스트
  try {
    const authUrl = `https://sgisapi.kostat.go.kr/OpenAPI3/auth/authentication.json?consumer_key=${serviceId}&consumer_secret=${securityKey}`
    const authRes = await fetch(authUrl)
    const authData = await authRes.json()

    result.auth = {
      errCd: authData.errCd,
      errMsg: authData.errMsg,
      hasToken: !!authData.result?.accessToken,
    }

    if (authData.errCd !== 0) {
      return NextResponse.json({ ...result, status: '❌ 인증 실패' })
    }

    const token = authData.result.accessToken

    // 2. 좌표변환 테스트 (병점역 37.2055, 127.0547)
    const transUrl = `https://sgisapi.kostat.go.kr/OpenAPI3/transformation/transcoord.json?src=4326&dst=5179&posX=127.0547&posY=37.2055&accessToken=${token}`
    const transRes = await fetch(transUrl)
    const transData = await transRes.json()
    result.transcoord = { errCd: transData.errCd, errMsg: transData.errMsg, result: transData.result }

    if (transData.errCd !== 0) {
      return NextResponse.json({ ...result, status: '❌ 좌표변환 실패' })
    }

    // 3. 역지오코딩 테스트
    const { posX, posY } = transData.result
    const rgeoUrl = `https://sgisapi.kostat.go.kr/OpenAPI3/addr/rgeocode.json?x_coor=${posX}&y_coor=${posY}&addr_type=20&accessToken=${token}`
    const rgeoRes = await fetch(rgeoUrl)
    const rgeoData = await rgeoRes.json()
    result.rgeocode = { errCd: rgeoData.errCd, errMsg: rgeoData.errMsg, first: rgeoData.result?.[0] }

    return NextResponse.json({ ...result, status: rgeoData.errCd === 0 ? '✅ 정상' : '❌ 역지오코딩 실패' })
  } catch (e: any) {
    return NextResponse.json({ ...result, status: '❌ 네트워크 오류', error: e.message })
  }
}
