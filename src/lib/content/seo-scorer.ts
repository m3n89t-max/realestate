import { Project } from '../types';

export function calculateSeoScore(content: string, title: string, keywords: string[]): {
    keyword_in_title: boolean;
    min_length: boolean;
    has_h2: boolean;
    has_faq: boolean;
    has_alt: boolean;
    longtail_keywords: boolean;
    total_score: number;
} {
    const keyword_in_title = keywords.some(k => title.includes(k));
    const min_length = content.length >= 1500;
    const has_h2 = /##\s.*$/m.test(content);
    const has_faq = content.includes('FAQ') || content.includes('자주 묻는 질문');
    const has_alt = /!\[.*?\]\(.*?\)/g.test(content); // simplistic alt check for markdown images

    // check if at least 3 keywords appear in content
    const keywordMatches = keywords.filter(k => content.includes(k));
    const longtail_keywords = keywordMatches.length >= 3;

    let score = 0;
    if (keyword_in_title) score += 20;
    if (min_length) score += 20;
    if (has_h2) score += 15;
    if (has_faq) score += 10;
    if (has_alt) score += 15;
    if (longtail_keywords) score += 20;

    return {
        keyword_in_title,
        min_length,
        has_h2,
        has_faq,
        has_alt,
        longtail_keywords,
        total_score: score
    };
}
