import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { getAuthenticatedUser, getOrgId } from '../_shared/auth.ts'
import { callOpenAI } from '../_shared/openai.ts'
import { maskPersonalInfo } from '../_shared/masking.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const { user, supabaseClient } = await getAuthenticatedUser(req)
    const orgId = await getOrgId(supabaseClient, user.id)

    const { document_id, raw_text } = await req.json()
    if (!document_id) throw new Error('document_id가 필요합니다')

    // 문서 조회
    const { data: doc } = await supabaseClient
      .from('documents')
      .select('*')
      .eq('id', document_id)
      .single()
    if (!doc) throw new Error('문서를 찾을 수 없습니다')

    // 분석할 텍스트 (파라미터 우선, 없으면 DB의 raw_text)
    const textToAnalyze = maskPersonalInfo(raw_text ?? doc.raw_text ?? '')
    if (!textToAnalyze) throw new Error('분석할 텍스트가 없습니다')

    const isBuilding = doc.type === 'building_register'

    const systemPrompt = isBuilding
      ? `당신은 건축물대장 분석 전문가입니다. 건축물대장 원문을 분석하여 핵심 정보를 추출하고 리스크를 체크하세요.

[출력 형식: JSON]
{
  "summary": {
    "usage": "건축물 용도",
    "floors": "층수 정보",
    "approved_date": "사용승인일 (YYYY-MM-DD)",
    "structure": "구조 (철근콘크리트 등)",
    "total_area": 연면적숫자,
    "violation": true/false,
    "summary_text": "AI 요약 문장 (100자 이내)"
  },
  "risk_items": [
    {"item": "위반건축물 여부", "status": "safe/caution/danger", "detail": "상세 설명"},
    {"item": "사용승인 경과 연수", "status": "safe/caution/danger", "detail": ""},
    {"item": "불법 용도변경", "status": "safe/caution/danger", "detail": ""},
    {"item": "구조 안전성", "status": "safe/caution/danger", "detail": ""},
    {"item": "증개축 이력", "status": "safe/caution/danger", "detail": ""}
  ],
  "customer_report": "고객에게 전달할 간략한 설명 (200자 이내)",
  "agent_memo": "중개사가 주의해야 할 내부 메모 (100자 이내)"
}`
      : `당신은 설계도면 분석 전문가입니다.

[출력 형식: JSON]
{
  "summary": {
    "usage": "건물 용도",
    "floors": "층수 정보",
    "total_area": 연면적숫자,
    "violation": false,
    "summary_text": "도면 구조 설명 문장"
  },
  "risk_items": [],
  "customer_report": "고객용 평면 구조 설명",
  "agent_memo": "중개사 메모"
}`

    const userPrompt = `다음 문서 내용을 분석하세요:\n\n${textToAnalyze.slice(0, 4000)}`

    const responseText = await callOpenAI(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { responseFormat: 'json', maxTokens: 2000, temperature: 0.3 }
    )

    const result = JSON.parse(responseText)

    // 문서 업데이트
    const { error: updateError } = await supabaseClient
      .from('documents')
      .update({
        summary: result.summary,
        risk_items: result.risk_items,
      })
      .eq('id', document_id)

    if (updateError) throw updateError

    return new Response(JSON.stringify({
      success: true,
      summary: result.summary,
      risk_items: result.risk_items,
      customer_report: result.customer_report,
      agent_memo: result.agent_memo,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[analyze-document]', err)
    const message = err instanceof Error ? err.message : '문서 분석에 실패했습니다'
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
