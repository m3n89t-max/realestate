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
    const photoPosition: 'inline' | 'bulk' = task.payload?.photo_position ?? 'bulk';

    // 사진 첨부 방식 → 다이얼로그 텍스트 매핑
    const layoutLabelMap = { individual: '개별사진', collage: '콜라주', slideshow: '슬라이드' };
    const layoutLabel = layoutLabelMap[photoLayout];

    if (!contentId) throw new Error('[SEARCH_NOT_FOUND] content_id가 필요합니다.');

    // 1. 콘텐츠 조회 (webhook 경유 — service role로 RLS 우회)
    const content = await getContent(config, contentId);

    // 2. 이미지 조회 (webhook 경유)
    const assets = await getAssets(config, projectId);

    // 3. 브라우저 실행 — 에이전트 전용 Edge 프로필 (캡챠 우회)
    // 전용 프로필 디렉토리: 사용자 Edge와 충돌 없이 로그인 세션 영속 보존
    const agentProfileDir = path.join(SESSION_DIR, 'EdgeProfile');

    const context = await chromium.launchPersistentContext(agentProfileDir, {
        channel: 'msedge',
        headless: false,
        permissions: ['clipboard-read', 'clipboard-write'],
        args: [
            '--start-maximized',
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-infobars',
        ],
        locale: 'ko-KR',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
        ignoreDefaultArgs: ['--enable-automation'],
    });

    // 자동화 시그니처 마스킹 (캡챠 우회)
    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Array;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Promise;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
    });

    const browser = { close: async () => { try { await context.close(); } catch { } } };

    try {
        const page = context.pages()[0] || await context.newPage();

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
            await page.waitForTimeout(1500 + Math.random() * 1000);

            // 사람처럼 클릭 후 한 글자씩 타이핑 (봇 탐지 우회)
            // 기존 입력값 선택 후 덮어쓰기 (중복 입력 방지)
            const idField = page.locator('#id');
            await idField.click();
            await page.waitForTimeout(300 + Math.random() * 200);
            await page.keyboard.press('Control+A');
            await page.waitForTimeout(100);
            for (const ch of creds.id) {
                await page.keyboard.type(ch, { delay: 80 + Math.random() * 120 });
            }
            await page.waitForTimeout(500 + Math.random() * 500);

            const pwField = page.locator('#pw');
            await pwField.click();
            await page.waitForTimeout(300 + Math.random() * 200);
            await page.keyboard.press('Control+A');
            await page.waitForTimeout(100);
            for (const ch of creds.pw) {
                await page.keyboard.type(ch, { delay: 80 + Math.random() * 120 });
            }
            await page.waitForTimeout(800 + Math.random() * 500);

            await page.locator('#log\\.login').click();
            await page.waitForTimeout(5000);

            // CAPTCHA 감지 — 사용자가 직접 풀 때까지 대기 (최대 3분)
            const hasCaptcha = await page.locator('#captcha, .captcha_wrap, [class*="captcha"]').count() > 0;
            if (hasCaptcha) {
                await progress(config, task.id, '⚠️ 캡챠 발생 — 브라우저에서 직접 캡챠를 풀어주세요 (최대 3분 대기)...', 15);
                await page.waitForFunction(
                    () => !document.querySelector('#captcha, .captcha_wrap, [class*="captcha"]'),
                    { timeout: 180_000 }
                ).catch(() => { });
                await page.waitForTimeout(2000);
            }

            await progress(config, task.id, '로그인 완료.', 25);
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
            task.payload?.content_title || content.title || '매물 소개', { delay: 30 }
        );
        await page.waitForTimeout(800);

        // 마크다운 줄 → 네이버용 텍스트로 변환 (이미지 제외)
        const stripLine = (line: string) => line
            .replace(/<[^>]+>/g, '')
            .replace(/^#{1,6}\s+/, '')
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/\*([^*]+)\*/g, '$1')
            .replace(/^[-*]\s/, '• ');

        // 이미지 1장을 현재 커서 위치에 삽입하는 헬퍼
        const insertImageAtCursor = async (tmpPath: string) => {
            const imgBtn = mainFrame.locator('button[data-name="image"], button[aria-label*="이미지 첨부"]').first();
            if (await imgBtn.count() === 0) return;
            const [fileChooser] = await Promise.all([
                page.waitForEvent('filechooser', { timeout: 10_000 }).catch(() => null),
                imgBtn.click(),
            ]);
            if (!fileChooser) return;
            await fileChooser.setFiles([tmpPath]);
            await page.waitForTimeout(2000);

            // 사진 첨부 방식 다이얼로그 처리
            const dialogVisible = await page.locator('text=사진 첨부 방식').count() > 0
                || await mainFrame.locator('text=사진 첨부 방식').count() > 0;
            if (dialogVisible) {
                for (const sel of [`text=${layoutLabel}`, `[data-type="${photoLayout}"]`, '.se-popup-photo-layout-item:first-child']) {
                    for (const ctx of [page, mainFrame]) {
                        if (await ctx.locator(sel).count() > 0) {
                            await ctx.locator(sel).first().click();
                            break;
                        }
                    }
                }
                await page.waitForTimeout(400);
                for (const sel of ['button:has-text("확인")', 'button:has-text("적용")', '.se-popup-button-primary']) {
                    for (const ctx of [page, mainFrame]) {
                        if (await ctx.locator(sel).count() > 0) {
                            await ctx.locator(sel).first().click();
                            break;
                        }
                    }
                }
            }
            await page.waitForTimeout(2000);
        };

        // HTML 표 등 구조화된 콘텐츠를 복사-붙여넣기 형태로 삽입하는 헬퍼
        const insertHtmlAtCursor = async (htmlStr: string) => {
            await page.bringToFront();
            
            // 1. 실제 OS 클립보드에 HTML 데이터 쓰기
            const useClipboard = await page.evaluate(async (html) => {
                try {
                    const blobHtml = new Blob([html], { type: 'text/html' });
                    const blobText = new Blob(['[매물개요 표]'], { type: 'text/plain' });
                    const ClipboardItemConstructor = (window as any).ClipboardItem;
                    const item = new ClipboardItemConstructor({
                        'text/html': blobHtml,
                        'text/plain': blobText
                    });
                    await navigator.clipboard.write([item]);
                    return true;
                } catch (err) {
                    console.warn('Clipboard write failed, attempting fallback...', err);
                    // Fallback to execCommand if clipboard API fails due to focus
                    const activeEl = document.activeElement as HTMLElement;
                    if (activeEl && activeEl.isContentEditable) {
                        document.execCommand('insertHTML', false, html);
                    }
                    return false;
                }
            }, htmlStr);
            
            await page.waitForTimeout(300);
            
            if (useClipboard) {
                // 2. Ctrl+V (붙여넣기) 단축키 전송 (실제 유저 액션 시뮬레이션)
                await page.keyboard.press('Control+V');
                await page.waitForTimeout(1500); // 에디터 렌더링 대기
            } else {
                await page.waitForTimeout(500);
            }
        };

        // 7. 본문 입력
        await progress(config, task.id, `본문 입력 중... (사진 ${photoPosition === 'inline' ? '인라인' : '일괄'} 모드)`, 55);
        await mainFrame.waitForSelector('.se-section-text', { timeout: 10_000 });
        await mainFrame.locator('.se-section-text').first().click();
        await page.waitForTimeout(500);

        if (photoPosition === 'inline') {
            // ── 인라인 모드: 텍스트 중간에 이미지 삽입 ─────────────────────────────
            // 마크다운 이미지 URL에서 직접 다운로드 (URL 매칭 불필요)
            const downloadImage = async (imgUrl: string, idx: number): Promise<string | null> => {
                try {
                    const res = await fetch(imgUrl);
                    if (!res.ok) return null;
                    const buf = await res.arrayBuffer();
                    const matchExt = imgUrl.match(/\.([a-zA-Z0-9]+)(?:[\?#]|$)/);
                    const ext = matchExt ? matchExt[1] : 'jpg';
                    const tmpPath = join(tmpdir(), `naver_inline_${Date.now()}_${idx}.${ext}`);
                    writeFileSync(tmpPath, Buffer.from(buf));
                    return tmpPath;
                } catch (e) {
                    console.warn(`[NaverUpload] 이미지 다운로드 실패: ${imgUrl}`, e);
                    return null;
                }
            };

            const parts = (content.content || '').split(/(<table[\s\S]*?<\/table>)/i);
            let imgIdx = 0;

            for (let pIdx = 0; pIdx < parts.length; pIdx++) {
                if (pIdx % 2 === 1) {
                    await insertHtmlAtCursor(parts[pIdx]);
                    await page.keyboard.press('Enter');
                    continue;
                }

                const rawLines = parts[pIdx].split('\n');
                for (const line of rawLines) {
                    const imgMatch = line.match(/!\[([^\]]*)\]\(([^)]+)\)/);
                    if (imgMatch) {
                        // 이미지 라인 → URL에서 직접 다운로드 후 삽입
                        const tmpPath = await downloadImage(imgMatch[2], imgIdx++);
                        if (tmpPath) {
                            await insertImageAtCursor(tmpPath);
                            await page.keyboard.press('Enter');
                        }
                    } else if (line.match(/^\*▲/)) {
                        // 캡션 라인 — 건너뜀
                    } else {
                        const stripped = stripLine(line);
                        if (stripped.trim()) {
                            await mainFrame.locator('.se-section-text').first().pressSequentially(stripped, { delay: 20 });
                        }
                        await page.keyboard.press('Enter');
                    }
                    await page.waitForTimeout(80);
                }
            }
        } else {
            // ── 일괄 모드: 텍스트 전체 입력 후 이미지 마지막에 삽입 ─────────────────
            const parts = (content.content || '').split(/(<table[\s\S]*?<\/table>)/i);

            for (let pIdx = 0; pIdx < parts.length; pIdx++) {
                if (pIdx % 2 === 1) {
                    await insertHtmlAtCursor(parts[pIdx]);
                    await page.keyboard.press('Enter');
                    continue;
                }

                const plainBody = parts[pIdx]
                    .replace(/!\[.*?\]\(.*?\)/g, '')
                    .replace(/\*▲.*?\*/g, '')
                    .replace(/<[^>]+>/g, '')  // table은 이미 parts 홀수 인덱스로 빠졌으므로 안전함
                    .replace(/^#{1,6}\s+/gm, '')
                    .replace(/\*\*([^*]+)\*\*/g, '$1')
                    .replace(/\*([^*]+)\*/g, '$1')
                    .replace(/^[-*]\s/gm, '• ')
                    .replace(/\n{3,}/g, '\n\n')
                    .trim();

                if (!plainBody) continue;

                const lines = plainBody.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].trim()) {
                        await mainFrame.locator('.se-section-text').first().pressSequentially(lines[i], { delay: 20 });
                    }
                    if (i < lines.length - 1) await page.keyboard.press('Enter');
                    await page.waitForTimeout(80);
                }
                
                // 마지막 파트가 아니면 들여쓰기/여백 추가
                if (pIdx < parts.length - 1) {
                    await page.keyboard.press('Enter');
                }
            }

            // 이미지 일괄 업로드 (본문 마지막)
            if (assets && assets.length > 0) {
                await progress(config, task.id, `이미지 ${assets.length}장 일괄 업로드 중...`, 68);
                await page.keyboard.press('Control+End');
                await page.keyboard.press('Enter');

                const tempPaths: string[] = [];
                for (let i = 0; i < assets.length; i++) {
                    try {
                        const res = await fetch(assets[i].file_url);
                        const buf = await res.arrayBuffer();
                        const matchExt = assets[i].file_url.match(/\.([a-zA-Z0-9]+)(?:[\?#]|$)/);
                        const ext = matchExt ? matchExt[1] : 'jpg';
                        const tmpPath = join(tmpdir(), `naver_bulk_${Date.now()}_${i}.${ext}`);
                        writeFileSync(tmpPath, Buffer.from(buf));
                        tempPaths.push(tmpPath);
                    } catch (e) {
                        console.warn(`[NaverUpload] 이미지 다운로드 실패: ${assets[i].file_url}`, e);
                    }
                }

                if (tempPaths.length > 0) {
                    const imgBtn = mainFrame.locator('button[data-name="image"], button[aria-label*="이미지 첨부"]').first();
                    if (await imgBtn.count() > 0) {
                        const [fileChooser] = await Promise.all([
                            page.waitForEvent('filechooser', { timeout: 10_000 }).catch(() => null),
                            imgBtn.click(),
                        ]);
                        if (fileChooser) {
                            await fileChooser.setFiles(tempPaths);
                            await page.waitForTimeout(2000);

                            // 사진 첨부 방식 다이얼로그 처리
                            const dialogVisible = await page.locator('text=사진 첨부 방식').count() > 0
                                || await mainFrame.locator('text=사진 첨부 방식').count() > 0;
                            if (dialogVisible) {
                                for (const sel of [`text=${layoutLabel}`, `[data-type="${photoLayout}"]`, '.se-popup-photo-layout-item:first-child']) {
                                    for (const ctx of [page, mainFrame]) {
                                        if (await ctx.locator(sel).count() > 0) { await ctx.locator(sel).first().click(); break; }
                                    }
                                }
                                await page.waitForTimeout(400);
                                for (const sel of ['button:has-text("확인")', '.se-popup-button-primary']) {
                                    for (const ctx of [page, mainFrame]) {
                                        if (await ctx.locator(sel).count() > 0) { await ctx.locator(sel).first().click(); break; }
                                    }
                                }
                            }
                            await page.waitForTimeout(3000);
                        }
                    }
                }
            }
        }
        await page.waitForTimeout(1000);

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
