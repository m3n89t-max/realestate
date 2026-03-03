import { Project, GenerateCardNewsRequest, CardNewsSlide } from '../types';

export async function generateCardNews(
    project: Project,
    request: GenerateCardNewsRequest
): Promise<CardNewsSlide[]> {

    // In a real application, we would use an LLM to craft snappy copy for the slides.
    const slides: CardNewsSlide[] = [
        {
            order: 1,
            title: '오늘의 강력 추천 매물! 🏠',
            body: `${project.address}\n아늑한 ${project.property_type} 매장을 소개합니다.`,
            emoji: '🌟',
        },
        {
            order: 2,
            title: '핵심 스펙 파헤치기 🔍',
            body: `가격: ${project.price || '상담가능'}\n면적: ${project.area || '?'}㎡`,
            highlight: '놓치면 후회할 가격!',
            emoji: '💰',
        },
        {
            order: 3,
            title: '이곳이 특별한 이유 ✨',
            body: '초역세권 + 편의시설 밀집 구역\n모든 것을 걸어서 누리세요.',
            emoji: '🚶‍♂️',
        },
        {
            order: 4,
            title: '실내 공간 포인트 🛋️',
            body: '채광이 가득한 거실, 넉넉한 수납공간.\n생활의 질이 달라집니다.',
            emoji: '☀️',
        },
        {
            order: 5,
            title: '투자가치는 어떨까요? 📈',
            body: '인근 재개발 호재와 지속적인 인구 유입!\n미래 가치 상승 보장!',
            emoji: '🚀',
        },
        {
            order: 6,
            title: '지금 바로 문의하세요! 📞',
            body: '더 늦기 전에 선점하세요.\n친절하고 투명한 상담 진행 중입니다.',
            highlight: 'DM 환영!',
            emoji: '💬',
        }
    ];

    return slides;
}
