import { Project, GenerateBlogRequest, GenerateBlogResponse, LocationAnalysis, Document } from '../types';
import { calculateSeoScore } from './seo-scorer';
import { assertRenderablePriceSource, formatKeyMoney, formatPriceOrUnknown, formatPriceSourceLabel } from '../price-source';

export async function generateSeoBlog(
    project: Project,
    analysis: LocationAnalysis,
    docs: Document[],
    request: GenerateBlogRequest
): Promise<GenerateBlogResponse> {

    // 값유형이 '실거래'/'호가'인데 출처명·기준일이 비어 있으면 여기서 한국어 오류로 중단한다.
    // 빈 값으로 렌더하거나 조용히 넘기지 않는다.
    assertRenderablePriceSource(project, 'blog');

    const priceSource = formatPriceSourceLabel(project);

    // In a real application, we would call an LLM (e.g. OpenAI/Claude API) here.
    // We construct the prompt based on the 7-H2 fixed template:
    const keywords = ['부동산', project.property_type || '', '투자', '실거주', project.address];

    const title = `[추천 매물] ${project.address} ${project.property_type} - 입지와 매물 정보 정리`;

    const content = `
# ${title}

## 1. 매물 개요
${project.address}에 위치한 ${project.property_type}입니다. 
가격: ${formatPriceOrUnknown(project.price)}
권리금: ${formatKeyMoney(project.key_money)}
가격 출처: ${priceSource}
면적: ${project.area ? `${project.area}㎡` : '미입력'}

※ 위 금액은 이 매물 1건의 가격입니다. 지역 전체 시세가 아닙니다.

## 2. 입지 장점 7가지
${analysis.advantages?.map((adv, i) => `${i + 1}. ${adv}`).join('\n') || '초역세권, 우수한 학군 등 다양한 장점을 자랑합니다.'}

## 3. 주변 인프라 분석
${analysis.nearby_facilities?.transport.map(f => `${f.name}까지 ${f.distance_m}m`).join(', ') || '교통이 매우 편리합니다.'}

## 4. 시장 전망
주변 지역 개발 계획은 공개된 자료를 기준으로 확인해 주세요. 지역 시세는 이 매물 1건의 가격으로 판단할 수 없으므로 중개사에게 문의 바랍니다.

## 5. 실거주/투자 포인트
실거주 편의와 투자 관점을 함께 검토할 수 있는 매물입니다.

## 6. FAQ
Q. 대출 가능한가요?
A. 네, 개인 신용도에 따라 다릅니다.

## 7. 문의 안내
자세한 내용은 전화나 방문 상담을 통해 확인해주세요. 
친절하게 모시겠습니다!

![매물 사진](https://example.com/mock-image.jpg)
`;

    // Calculate SEO Score
    const seo_score = calculateSeoScore(content, title, keywords);

    return {
        titles: [title, `${project.address} 매물 정보 안내`],
        content,
        meta_description: `${project.address}에 위치한 ${project.property_type}의 매물 정보와 입지를 확인하세요. (가격 출처: ${priceSource})`,
        tags: keywords,
        seo_score,
        faq: [{ q: '대출 가능한가요?', a: '네, 개인 신용도에 따라 다릅니다.' }],
        alt_tags: { 'mock-image.jpg': '매물 전경 사진' }
    };
}
