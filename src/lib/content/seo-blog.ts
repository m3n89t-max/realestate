import { Project, GenerateBlogRequest, GenerateBlogResponse, LocationAnalysis, Document } from '../types';
import { calculateSeoScore } from './seo-scorer';

export async function generateSeoBlog(
    project: Project,
    analysis: LocationAnalysis,
    docs: Document[],
    request: GenerateBlogRequest
): Promise<GenerateBlogResponse> {

    // In a real application, we would call an LLM (e.g. OpenAI/Claude API) here.
    // We construct the prompt based on the 7-H2 fixed template:
    const keywords = ['부동산', project.property_type || '', '투자', '실거주', project.address];

    const title = `[추천 매물] ${project.address} ${project.property_type} - 완벽한 입지와 미래가치`;

    const content = `
# ${title}

## 1. 매물 개요
${project.address}에 위치한 훌륭한 ${project.property_type}입니다. 
가격: ${project.price || '상담 환영'} 
면적: ${project.area || '미정'}

## 2. 입지 장점 7가지
${analysis.advantages?.map((adv, i) => `${i + 1}. ${adv}`).join('\n') || '초역세권, 우수한 학군 등 다양한 장점을 자랑합니다.'}

## 3. 주변 인프라 분석
${analysis.nearby_facilities?.transport.map(f => `${f.name}까지 ${f.distance_m}m`).join(', ') || '교통이 매우 편리합니다.'}

## 4. 시장 전망
주변 지역 개발 호재로 인해 향후 가치 상승이 강력하게 기대되는 물건입니다. 

## 5. 실거주/투자 포인트
실거주로서의 편안함과 투자로서의 수익성을 모두 잡을 수 있는 베스트 매물!

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
        titles: [title, `급매! ${project.address}의 빛나는 가치`],
        content,
        meta_description: `${project.address}에 위치한 ${project.property_type}의 핵심 투자 포인트를 확인하세요.`,
        tags: keywords,
        seo_score,
        faq: [{ q: '대출 가능한가요?', a: '네, 개인 신용도에 따라 다릅니다.' }],
        alt_tags: { 'mock-image.jpg': '매물 전경 사진' }
    };
}
