// 유효 배후인구(거주 + 유동) 산정 헬퍼
//
// 거주 배후인구(통계청 집계구 밀도 기반 실측 추정) 에
// 상권등급 기반 유동인구 기여분을 더해 "유효 배후인구"를 산정한다.
// 실측 유동인구 headcount 소스(제주데이터허브 카드)가 위치 단위로 제공되지 않아
// 상권등급을 유동 강도의 프록시로 사용한다. (표준 가중)

// 상권등급별 유동 배수 (거주 대비) — 표준 가중
//  S=최우수 상권(관광·번화가) … D=주거 외곽
const FLOATING_MULTIPLIER: Record<string, number> = {
  S: 3.0,
  A: 2.0,
  B: 1.0,
  C: 0.5,
  D: 0.2,
}

export interface Catchment {
  resident: number   // 거주 배후인구 (실측 밀도 기반)
  floating: number   // 유동 기여분 (상권등급 기반 추정)
  effective: number  // 유효 배후인구 = 거주 + 유동
  multiplier: number // 적용된 유동 배수
  grade: string | null
}

/**
 * 거주 배후인구 + 상권등급 기반 유동 기여를 합쳐 유효 배후인구를 산정한다.
 * 상권등급이 없으면 유동 배수 0 → 유효 = 거주(기존과 동일).
 */
export function effectiveCatchment(
  resident: number | null | undefined,
  grade: string | null | undefined,
): Catchment | null {
  if (resident == null || !Number.isFinite(resident)) return null
  const g = (grade ?? '').toUpperCase()
  const multiplier = FLOATING_MULTIPLIER[g] ?? 0
  const r = Math.round(resident)
  const floating = Math.round(r * multiplier)
  return {
    resident: r,
    floating,
    effective: r + floating,
    multiplier,
    grade: g || null,
  }
}
