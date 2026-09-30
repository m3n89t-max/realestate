import { Project, GenerateCardNewsRequest, CardNewsSlide } from '../types';
import { assertRenderablePriceSource, formatKeyMoney, formatPriceOrUnknown, formatPriceSourceLabel } from '../price-source';

export async function generateCardNews(
    project: Project,
    request: GenerateCardNewsRequest
): Promise<CardNewsSlide[]> {

    // 값유형이 '실거래'/'호가'인데 출처명·기준일이 비어 있으면 여기서 한국어 오류로 중단한다.
    // 빈 값으로 렌더하거나 조용히 넘기지 않는다.
    assertRenderablePriceSource(project, 'card_news');

    const priceSource = formatPriceSourceLabel(project);

    // In a real application, we would use an LLM to craft snappy copy for the slides.
    const slides: CardNewsSlide[] = [
        {
            order: 1,
            title: '이런 매물이 나왔습니다',
            body: `${project.address}\n아늑한 ${project.property_type} 매장을 소개합니다.`,
            emoji: '',
        },
        {
            order: 2,
            title: '핵심 스펙 파헤치기',
            // 가격 옆에 값유형·출처명·기준일을 함께 노출한다.
            // 미입력은 PRICE_UNKNOWN_TEXT 로. 원 단위 숫자를 그대로 노출하거나
            // 상담 유도형 추측 문구로 바꾸지 않는다.
            body: `가격: ${formatPriceOrUnknown(project.price)}\n권리금: ${formatKeyMoney(project.key_money)}\n(${priceSource})\n면적: ${project.area ? `${project.area}㎡` : '미입력'}`,
            highlight: '이 매물 가격입니다',
            emoji: '',
        },
        {
            order: 3,
            title: '이곳이 특별한 이유',
            body: '초역세권 + 편의시설 밀집 구역\n모든 것을 걸어서 누리세요.',
            emoji: '',
        },
        {
            order: 4,
            title: '실내 공간 포인트',
            body: '채광이 가득한 거실, 넉넉한 수납공간.\n생활의 질이 달라집니다.',
            emoji: '',
        },
        {
            order: 5,
            title: '투자 검토 시 확인할 점',
            // 보장·단정형 표현(가치 상승을 약속하는 문구)은 근거 없는 과장 광고다.
            body: '개발 계획·인구 추이는 공개 자료로 직접 확인해 주세요.\n가치 상승 여부는 단정할 수 없습니다.',
            emoji: '',
        },
        {
            order: 6,
            title: '지금 바로 문의하세요!',
            body: '자세한 조건은 상담으로 안내드립니다.\n투명하게 설명해 드리겠습니다.',
            highlight: 'DM 환영!',
            emoji: '',
        }
    ];

    return slides;
}
