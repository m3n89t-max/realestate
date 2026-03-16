import { chromium } from 'playwright';
import { AgentConfig, getCredentials } from '../config';
import { sendTaskProgress, getContent, getAssets, updateContent } from '../webhook-client';
import { tmpdir } from 'os';
import { writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import path from 'path';
import os from 'os';

// ============================================================
// 세션 저장 경로 (재로그인 방지)
// ============================================================
const SESSION_DIR = path.join(
    process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
    'RealEstateAIOS'
);
const NAVER_SESSION_PATH = path.join(SESSION_DIR, 'naver-session.json');

// ============================================================
// 네이버 블로그 자동 업로드
// ============================================================
export async function uploadNaverBlog(
    task: any,
    config: AgentConfig
): Promise<Record<string, unknown>> {
    const projectId = task.payload?.project_id || task.project_id;
    const contentId = task.payload?.content_id;
    const photoLayout: 'individual' | 'collage' | 'slideshow' = task.payload?.photo_layout ?? 'individual';

    // 사진 첨부 방식 → 다이얼로그 텍스트 매핑
    const layoutLabelMap = { individual: '개별사진', collage: '콜라주', slideshow: '슬라이드' };
    const layoutLabel = layoutLabelMap[photoLayout];

    if (!contentId) throw new Error('[SEARCH_NOT_FOUND] content_id가 필요합니다.');

    // 1. 콘텐츠 조회 (webhook 경유 — service role로 RLS 우회)
    const content = await getContent(config, contentId);

    // 2. 이미지 조회 (webhook 경유)
    const assets = await getAssets(config, projectId);

    // 3. 브라우저 실행 (저장된 세션 복원)
    const storageState = existsSync(NAVER_SESSION_PATH) ? NAVER_SESSION_PATH : undefined;
    const browser = await chromium.launch({
        headless: false,
        args: ['--start-maximized'],
    });

    try {
        const context = await browser.newContext({
            viewport: { width: 1280, height: 900 },
            locale: 'ko-KR',
            storageState,
        });
        const page = await context.newPage();

        // 4. 로그인 확인
        await progress(config, task.id, '네이버 로그인 확인 중...', 5);
        await page.goto('https://www.naver.com/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await page.waitForTimeout(2000);

        const isLoggedIn = await page.locator('.MyView-module__my_logo___HdBbr, .gnb_my_image, a[href*="logout"]').count() > 0;

        if (!isLoggedIn) {
            await progress(config, task.id, '네이버 로그인 중...', 10);
            const creds = getCredentials('naver');
            if (!creds?.id || !creds?.pw) {
                throw new Error('[LOGIN_FAILED] 네이버 자격증명이 없습니다. 에이전트 설정에서 저장해주세요.');
            }

            await page.goto('https://nid.naver.com/nidlogin.login', {
                waitUntil: 'domcontentloaded',
                timeout: 30_000,
            });
            await page.waitForTimeout(2000);

            // JS로 직접 값 주입 (봇 탐지 우회)
            await page.evaluate((id) => {
                const el = document.querySelector('#id') as HTMLInputElement;
                if (el) { el.focus(); el.value = id; el.dispatchEvent(new Event('input', { bubbles: true })); }
            }, creds.id);
            await page.waitForTimeout(800);

            await page.evaluate((pw) => {
                const el = document.querySelector('#pw') as HTMLInputElement;
                if (el) { el.focus(); el.value = pw; el.dispatchEvent(new Event('input', { bubbles: true })); }
            }, creds.pw);
            await page.waitForTimeout(800);

            await page.locator('#log\\.login').click();
            await page.waitForTimeout(5000);

            // CAPTCHA 대기
            const hasCaptcha = await page.locator('#captcha, .captcha_wrap').count() > 0;
            if (hasCaptcha) {
                await progress(config, task.id, '⚠️ CAPTCHA 감지 — 수동 입력 대기 (120초)...', 15);
                await page.waitForURL('**/naver.com/**', { timeout: 120_000 }).catch(() => { });
            }

            // 세션 저장
            await context.storageState({ path: NAVER_SESSION_PATH });
            await progress(config, task.id, '로그인 완료. 세션 저장됨.', 25);
        } else {
            await progress(config, task.id, '기존 세션으로 로그인 유지.', 25);
        }

        // 5. 블로그 글쓰기 페이지
        await progress(config, task.id, '블로그 에디터 열기...', 30);
        await page.goto('https://blog.naver.com/GoBlogWrite.naver', {
            waitUntil: 'domcontentloaded',
            timeout: 30_000,
        });
        await page.waitForTimeout(4000);

        // mainFrame 진입
        const mainFrame = page.frames().find(f => f.name() === 'mainFrame');
        if (!mainFrame) throw new Error('[BROWSER_CRASH] mainFrame iframe을 찾을 수 없습니다.');

        // 팝업 닫기 (존재하면 클릭, 없으면 무시)
        const cancelPopup = mainFrame.locator('.se-popup-button-cancel').first();
        if (await cancelPopup.count() > 0) {
            await cancelPopup.click().catch(() => {});
            await page.waitForTimeout(500);
        }
        const helpClose = mainFrame.locator('.se-help-panel-close-button').first();
        if (await helpClose.count() > 0) {
            await helpClose.click().catch(() => {});
            await page.waitForTimeout(500);
        }

        // 6. 제목 입력 — .se-section-documentTitle 클릭 후 한 글자씩 타이핑
        await progress(config, task.id, '제목 입력 중...', 40);
        await mainFrame.waitForSelector('.se-section-documentTitle', { timeout: 15_000 });
        await mainFrame.locator('.se-section-documentTitle').first().click();
        await page.waitForTimeout(500);
        await mainFrame.locator('.se-section-documentTitle').first().pressSequentially(
            content.title || '매물 소개', { delay: 30 }
        );
        await page.waitForTimeout(800);

        // 7. 본문 입력 — .se-section-text 클릭 후 한 글자씩 타이핑
        await progress(config, task.id, '본문 입력 중...', 55);

        // 마크다운 → 네이버 업로드용 텍스트 변환
        const plainBody = (content.content || '')
            .replace(/!\[.*?\]\(.*?\)/g, '')   // 이미지 제거 (별도 업로드)
            .replace(/\*▲.*?\*/g, '')           // 이미지 캡션 제거
            .replace(/^#{1,6}\s+/gm, '')        // 헤딩 기호 제거
            .replace(/\*\*([^*]+)\*\*/g, '$1')  // **bold** → bold (마크다운 기호 제거)
            .replace(/\*([^*]+)\*/g, '$1')       // *italic* → italic
            .replace(/^[-*]\s/gm, '• ')          // 리스트 항목 → 불릿 기호
            .replace(/\n{3,}/g, '\n\n')          // 3줄 이상 빈줄 → 2줄로
            .trim();

        await mainFrame.waitForSelector('.se-section-text', { timeout: 10_000 });
        await mainFrame.locator('.se-section-text').first().click();
        await page.waitForTimeout(500);

        // 긴 본문은 줄 단위로 입력 (속도 최적화)
        const lines = plainBody.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim()) {
                await mainFrame.locator('.se-section-text').first().pressSequentially(lines[i], { delay: 30 });
            }
            if (i < lines.length - 1) {
                await page.keyboard.press('Enter');
            }
            await page.waitForTimeout(100);
        }
        await page.waitForTimeout(1000);

        // 8. 이미지 업로드 처리 (본문 하단에 일괄 삽입)
        if (assets && assets.length > 0) {
            await progress(config, task.id, `이미지 ${assets.length}장 처리 중...`, 65);
            await page.keyboard.press('Control+End');
            await page.keyboard.press('Enter');

            const tempPaths: string[] = [];
            for (let i = 0; i < assets.length; i++) {
                try {
                    const res = await fetch(assets[i].file_url);
                    const buf = await res.arrayBuffer();
                    const ext = (assets[i].file_url.split('.').pop() ?? 'jpg').split('?')[0];
                    const tmpPath = join(tmpdir(), `naver_img_${Date.now()}_${i}.${ext}`);
                    writeFileSync(tmpPath, Buffer.from(buf));
                    tempPaths.push(tmpPath);
                } catch (e) {
                    console.warn(`[NaverUpload] 이미지 다운로드 실패: ${assets[i].file_url}`, e);
                }
            }

            if (tempPaths.length > 0) {
                await progress(config, task.id, `이미지 ${tempPaths.length}장 업로드 중...`, 70);
                const imgBtn = mainFrame.locator('button[data-name="image"], button[aria-label*="이미지 첨부"]').first();
                if (await imgBtn.count() > 0) {
                    const [fileChooser] = await Promise.all([
                        page.waitForEvent('filechooser', { timeout: 10_000 }).catch(() => null),
                        imgBtn.click(),
                    ]);
                    if (fileChooser) {
                        await fileChooser.setFiles(tempPaths);
                        await page.waitForTimeout(2000);

                        // "사진 첨부 방식" 다이얼로그 자동 처리
                        // 다이얼로그는 page 또는 mainFrame 레이어에서 뜸
                        const dialogVisible = await page.locator('text=사진 첨부 방식').count() > 0
                            || await mainFrame.locator('text=사진 첨부 방식').count() > 0;

                        if (dialogVisible) {
                            // 선택된 레이아웃 옵션 클릭 (텍스트 기반)
                            const individualSelectors = [
                                `text=${layoutLabel}`,
                                `[data-type="${photoLayout}"]`,
                                `.se-popup-photo-layout-item:first-child`,
                                `li:has-text("${layoutLabel}")`,
                            ];
                            let clicked = false;
                            for (const sel of individualSelectors) {
                                for (const ctx of [page, mainFrame]) {
                                    const el = ctx.locator(sel).first();
                                    if (await el.count() > 0) {
                                        await el.click();
                                        clicked = true;
                                        break;
                                    }
                                }
                                if (clicked) break;
                            }
                            // 첫 번째 옵션(개별사진)이 기본 선택인 경우 바로 확인 버튼 클릭
                            await page.waitForTimeout(500);
                            const confirmSelectors = [
                                'button:has-text("확인")',
                                'button:has-text("적용")',
                                '.se-popup-button-primary',
                                '.btn_confirm',
                                '.confirm_btn',
                            ];
                            for (const sel of confirmSelectors) {
                                for (const ctx of [page, mainFrame]) {
                                    const el = ctx.locator(sel).first();
                                    if (await el.count() > 0) {
                                        await el.click();
                                        break;
                                    }
                                }
                            }
                        }

                        await page.waitForTimeout(3000);
                    }
                }
            }
        }

        // 9. 태그 입력 (mainFrame 안 또는 페이지 레벨에서 시도)
        if (content.tags && content.tags.length > 0) {
            await progress(config, task.id, '태그 입력 중...', 80);
            // Naver SE3: 태그 입력란은 에디터 하단 mainFrame 내부
            const tagSelectors = [
                '.se-hashtag-input input',
                'input[placeholder*="태그"]',
                'input[placeholder*="tag"]',
                '.tag_input input',
            ];
            let tagInput = null;
            for (const sel of tagSelectors) {
                const candidate = mainFrame.locator(sel).first();
                if (await candidate.count() > 0) { tagInput = candidate; break; }
                const pageCandidate = page.locator(sel).first();
                if (await pageCandidate.count() > 0) { tagInput = pageCandidate; break; }
            }
            if (tagInput) {
                for (const tag of (content.tags as string[]).slice(0, 10)) {
                    await tagInput.pressSequentially(tag.replace(/^#/, ''), { delay: 30 });
                    await tagInput.press('Enter');
                    await page.waitForTimeout(300);
                }
            }
        }

        // 10. 발행 버튼 클릭 + 발행 설정 다이얼로그 처리
        await progress(config, task.id, '발행 중...', 88);

        // 발행 버튼 우선순위: .save_btn__bzc5B → button:has-text("발행") → .publish_btn
        const publishSelectors = [
            '.save_btn__bzc5B',
            'button[class*="publish"]',
            '.publish_btn button',
        ];
        let publishClicked = false;
        for (const sel of publishSelectors) {
            const btn = mainFrame.locator(sel).first();
            if (await btn.count() > 0) {
                await btn.click();
                publishClicked = true;
                break;
            }
        }
        if (!publishClicked) {
            // 텍스트 기반 fallback
            const textBtn = mainFrame.locator('button').filter({ hasText: /^발행$/ }).first();
            if (await textBtn.count() > 0) {
                await textBtn.click();
                publishClicked = true;
            }
        }

        if (publishClicked) {
            // 발행 설정 다이얼로그가 뜰 수 있음 — 최대 5초 대기 후 확인 버튼 클릭
            await page.waitForTimeout(2000);

            // 다이얼로그 내 "발행" 확인 버튼 (page 레벨에서 탐색)
            const dialogConfirmSelectors = [
                '.se-popup-button-primary',
                '.se-confirm-button',
                'button.confirm',
                '.btn_publish',
            ];
            for (const sel of dialogConfirmSelectors) {
                const confirmBtn = page.locator(sel).first();
                if (await confirmBtn.count() > 0) {
                    await confirmBtn.click();
                    break;
                }
            }
            // 텍스트 기반 confirm fallback
            const confirmText = page.locator('button').filter({ hasText: /^발행$/ }).last();
            if (await confirmText.count() > 0) {
                await confirmText.click();
            }

            // 페이지 전환 대기 (에디터 → 발행된 포스트)
            await page.waitForTimeout(3000);
        }

        // 11. 발행 URL 확인 & DB 업데이트
        await progress(config, task.id, '발행 URL 확인 중...', 95);

        // editor URL이 아닌 실제 블로그 포스트 URL 대기 (최대 10초)
        let publishedUrl = page.url();
        try {
            await page.waitForURL(
                url => !url.toString().includes('GoBlogWrite') && url.toString().includes('blog.naver.com'),
                { timeout: 10_000 }
            );
            publishedUrl = page.url();
        } catch {
            // URL 전환 실패 시 현재 URL 그대로 사용
            console.warn('[NaverUpload] 발행 후 URL 전환 미감지, 현재 URL 사용:', page.url());
        }

        await updateContent(config, contentId, { is_published: true, published_url: publishedUrl });

        // 세션 갱신 저장
        await context.storageState({ path: NAVER_SESSION_PATH });

        await progress(config, task.id, '✅ 네이버 블로그 발행 완료!', 100);
        return { published_url: publishedUrl, content_id: contentId };

    } finally {
        await browser.close();
    }
}

async function progress(config: AgentConfig, taskId: string, message: string, pct: number) {
    console.log(`  [${pct}%] ${message}`);
    if (config.agent_key) {
        await sendTaskProgress(config, taskId, message, 'info', pct);
    }
}
