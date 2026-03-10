import { chromium } from 'playwright';
import { AgentConfig, getCredentials } from '../config';
import { sendTaskProgress } from '../webhook-client';
import { createClient } from '@supabase/supabase-js';
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

    if (!contentId) throw new Error('[SEARCH_NOT_FOUND] content_id가 필요합니다.');

    const supabase = createClient(config.supabase_url, config.supabase_anon_key);

    // 1. 콘텐츠 조회
    const { data: content, error: contentError } = await supabase
        .from('generated_contents')
        .select('*')
        .eq('id', contentId)
        .single();
    if (contentError || !content) throw new Error(`[SEARCH_NOT_FOUND] 콘텐츠 없음: ${contentId}`);

    // 2. 이미지 조회 (최대 5장)
    const { data: assets } = await supabase
        .from('assets')
        .select('file_url')
        .eq('project_id', projectId)
        .eq('type', 'image')
        .order('sort_order', { ascending: true })
        .limit(5);

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
                await page.waitForURL('**/naver.com/**', { timeout: 120_000 }).catch(() => {});
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

        // 6. 제목 입력
        await progress(config, task.id, '제목 입력 중...', 40);
        await mainFrame.waitForSelector('.se-title-text, [placeholder*="제목"]', { timeout: 15_000 });
        const titleEl = mainFrame.locator('.se-title-text, [placeholder*="제목"]').first();
        await titleEl.click();
        await page.keyboard.press('Control+a');
        await page.keyboard.type(content.title || '매물 소개', { delay: 20 });
        await page.waitForTimeout(1000);

        // 7. 본문 클립보드 붙여넣기
        await progress(config, task.id, '본문 입력 중...', 55);
        const plainBody = content.content || '';

        // 클립보드에 텍스트 복사
        await page.evaluate((text) => {
            return navigator.clipboard.writeText(text).catch(() => {
                // fallback: execCommand
                const ta = document.createElement('textarea');
                ta.value = text;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            });
        }, plainBody);

        // 본문 영역 클릭 후 붙여넣기
        const bodyEl = mainFrame.locator('.se-section .se-component-content, .se-main-section .ProseMirror').first();
        if (await bodyEl.count() > 0) {
            await bodyEl.click();
            await page.waitForTimeout(500);
            await page.keyboard.press('Control+a');
            await page.keyboard.press('Delete');
            await page.keyboard.press('Control+v');
            await page.waitForTimeout(2000);
        }

        // 8. 이미지 업로드
        if (assets && assets.length > 0) {
            await progress(config, task.id, `이미지 ${assets.length}장 다운로드 중...`, 65);

            // 이미지를 임시 파일로 다운로드
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

                // 이미지 삽입 버튼 클릭
                const imgBtn = mainFrame.locator('button[data-name="image"], button[aria-label*="이미지 첨부"]').first();
                if (await imgBtn.count() > 0) {
                    const [fileChooser] = await Promise.all([
                        page.waitForEvent('filechooser', { timeout: 10_000 }).catch(() => null),
                        imgBtn.click(),
                    ]);
                    if (fileChooser) {
                        await fileChooser.setFiles(tempPaths);
                        await page.waitForTimeout(3000);
                    }
                }
            }
        }

        // 9. 태그 입력
        if (content.tags && content.tags.length > 0) {
            await progress(config, task.id, '태그 입력 중...', 80);
            const tagInput = mainFrame.locator('.se-hashtag-input input, input[placeholder*="태그"]').first();
            if (await tagInput.count() > 0) {
                for (const tag of (content.tags as string[]).slice(0, 10)) {
                    await tagInput.fill(tag);
                    await tagInput.press('Enter');
                    await page.waitForTimeout(300);
                }
            }
        }

        // 10. 발행
        await progress(config, task.id, '발행 중...', 88);
        const publishBtn = mainFrame.locator('button:has-text("발행"), .publish_btn button').first();
        if (await publishBtn.count() > 0) {
            await publishBtn.click();
            await page.waitForTimeout(2000);
            // 발행 확인 모달
            const confirmBtn = page.locator('button:has-text("발행"), .se-popup button:has-text("발행")').last();
            if (await confirmBtn.count() > 0) {
                await confirmBtn.click();
                await page.waitForTimeout(5000);
            }
        }

        // 11. 발행 URL 확인 & DB 업데이트
        await progress(config, task.id, '발행 URL 확인 중...', 95);
        const publishedUrl = page.url();

        await supabase
            .from('generated_contents')
            .update({ is_published: true, published_url: publishedUrl })
            .eq('id', contentId);

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
