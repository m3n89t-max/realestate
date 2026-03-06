import { chromium } from 'playwright';
import { AgentConfig, getCredentials } from '../config';
import { sendTaskProgress } from '../webhook-client';
import { createClient } from '@supabase/supabase-js';

// ============================================================
// 유튜브 업로드 자동화 — studio.youtube.com
// agent-protocol.md 섹션 3 (youtube_upload) 참조
// ============================================================

export async function uploadYoutube(
    task: any,
    config: AgentConfig
): Promise<Record<string, unknown>> {
    const projectId = task.project_id;
    const videoUrl = task.payload?.video_url;
    const contentId = task.payload?.content_id;

    if (!videoUrl) {
        throw new Error('[SEARCH_NOT_FOUND] video_url이 필요합니다.');
    }

    // 1. 콘텐츠 메타데이터 가져오기
    const supabase = createClient(config.supabase_url, config.supabase_anon_key);

    let title = task.payload?.title || '부동산 쇼츠';
    let description = task.payload?.description || '';
    let tags: string[] = task.payload?.tags || [];

    if (contentId) {
        const { data: content } = await supabase
            .from('generated_contents')
            .select('title, content, tags')
            .eq('id', contentId)
            .single();

        if (content) {
            title = content.title || title;
            description = content.content || description;
            tags = content.tags || tags;
        }
    }

    // 2. 비디오 파일 로컬 다운로드
    await progress(config, task.id, '비디오 파일 다운로드 중...', 5);

    const fs = await import('fs');
    const path = await import('path');
    const os = await import('os');

    const tmpDir = path.join(os.tmpdir(), 'realestate-agent');
    if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
    }

    const videoFileName = `video_${Date.now()}.mp4`;
    const localVideoPath = path.join(tmpDir, videoFileName);

    // Supabase Storage URL에서 다운로드
    const response = await fetch(videoUrl);
    if (!response.ok) {
        throw new Error(`[DOWNLOAD_FAILED] 비디오 다운로드 실패: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    fs.writeFileSync(localVideoPath, Buffer.from(arrayBuffer));

    await progress(config, task.id, '비디오 다운로드 완료', 15);

    // 3. 유튜브 스튜디오에서 업로드
    const browser = await chromium.launch({
        headless: false,
        args: ['--start-maximized'],
    });

    try {
        const context = await browser.newContext({
            viewport: { width: 1280, height: 900 },
            locale: 'ko-KR',
        });
        const page = await context.newPage();

        // ---- 유튜브 스튜디오 접속 ----
        await progress(config, task.id, 'YouTube Studio 접속 중...', 20);
        await page.goto('https://studio.youtube.com/', {
            waitUntil: 'domcontentloaded',
            timeout: 30_000,
        });

        // ---- 구글 로그인 ----
        await progress(config, task.id, 'Google 로그인 중...', 25);

        // 로그인 페이지 감지
        if (page.url().includes('accounts.google.com')) {
            // Google 자격증명 — credentials.json 우선, .env 폴백
            const creds = getCredentials('google');
            if (!creds?.email || !creds?.pw) {
                throw new Error('[LOGIN_FAILED] 구글 자격증명이 없습니다. /settings/credentials 에서 저장해주세요.');
            }
            const googleEmail = creds.email;
            const googlePw = creds.pw;

            // 이메일 입력
            await page.locator('input[type="email"]').fill(googleEmail);
            await page.locator('#identifierNext, button:has-text("Next"), button:has-text("다음")').first().click();
            await page.waitForTimeout(3000);

            // 비밀번호 입력
            await page.locator('input[type="password"]').fill(googlePw);
            await page.locator('#passwordNext, button:has-text("Next"), button:has-text("다음")').first().click();
            await page.waitForTimeout(5000);
        }

        await progress(config, task.id, 'YouTube Studio 로그인 완료', 35);

        // ---- 업로드 버튼 클릭 ----
        await progress(config, task.id, '업로드 페이지 이동...', 40);

        // 만들기 버튼 → 동영상 업로드
        const createBtn = page.locator('#create-icon, button[aria-label*="만들기"], ytcp-button:has-text("만들기")').first();
        if (await createBtn.count() > 0) {
            await createBtn.click();
            await page.waitForTimeout(1000);
        }

        const uploadOption = page.locator('tp-yt-paper-item:has-text("동영상 업로드"), a:has-text("동영상 업로드")').first();
        if (await uploadOption.count() > 0) {
            await uploadOption.click();
            await page.waitForTimeout(2000);
        }

        // ---- 파일 선택 ----
        await progress(config, task.id, '비디오 파일 업로드 중...', 50);

        const fileInput = page.locator('input[type="file"]').first();
        if (await fileInput.count() > 0) {
            await fileInput.setInputFiles(localVideoPath);
        }

        // 업로드 진행 대기 (최대 5분)
        await page.waitForTimeout(5000);
        await progress(config, task.id, '비디오 업로드 진행 중...', 60);

        // ---- 제목 입력 ----
        await progress(config, task.id, '제목/설명 입력 중...', 65);

        const titleInput = page.locator('#textbox[aria-label*="제목"], div[id="title-textarea"] > div.notranslate').first();
        if (await titleInput.count() > 0) {
            await titleInput.click();
            await titleInput.fill('');
            // 셀렉션 후 입력
            await page.keyboard.press('Control+A');
            await page.keyboard.type(title.substring(0, 100)); // 유튜브 제목 100자 제한
        }

        // ---- 설명 입력 ----
        const descInput = page.locator('#textbox[aria-label*="설명"], div[id="description-textarea"] > div.notranslate').first();
        if (await descInput.count() > 0) {
            await descInput.click();
            await page.keyboard.type(description.substring(0, 5000)); // 5000자 제한
        }

        // ---- Shorts 설정 (15초/30초/60초 영상은 자동 Shorts 감지) ----
        await progress(config, task.id, '공개 설정 중...', 75);

        // "다음" 버튼을 3번 클릭하여 공개 설정 페이지로 이동
        for (let i = 0; i < 3; i++) {
            const nextBtn = page.locator('#next-button, button:has-text("다음")').first();
            if (await nextBtn.count() > 0) {
                await nextBtn.click();
                await page.waitForTimeout(2000);
            }
        }

        // ---- 공개 설정 → 공개 선택 ----
        const publicRadio = page.locator('tp-yt-paper-radio-button[name="PUBLIC"], #public-button').first();
        if (await publicRadio.count() > 0) {
            await publicRadio.click();
        }

        await progress(config, task.id, '업로드 처리 완료 대기...', 85);

        // 업로드 처리 완료 대기 (최대 5분)
        await page.waitForTimeout(10_000);

        // ---- 게시 버튼 ----
        await progress(config, task.id, '동영상 게시 중...', 90);

        const publishBtn = page.locator('#done-button, button:has-text("게시"), ytcp-button:has-text("게시")').first();
        if (await publishBtn.count() > 0) {
            await publishBtn.click();
            await page.waitForTimeout(5000);
        }

        // ---- 게시 URL 확보 ----
        await progress(config, task.id, '게시 URL 확인 중...', 95);

        // 게시 완료 다이얼로그에서 URL 추출
        const videoLink = page.locator('a[href*="youtu.be"], a[href*="youtube.com/video"], .video-url-text').first();
        let publishedUrl = '';
        if (await videoLink.count() > 0) {
            publishedUrl = await videoLink.getAttribute('href') || '';
        }

        // generated_contents 업데이트
        if (contentId) {
            await supabase
                .from('generated_contents')
                .update({
                    is_published: true,
                    published_url: publishedUrl,
                })
                .eq('id', contentId);
        }

        await progress(config, task.id, '유튜브 업로드 완료! ✅', 100);

        // 임시 파일 정리
        try { fs.unlinkSync(localVideoPath); } catch { /* ignore */ }

        return {
            published_url: publishedUrl,
            video_url: videoUrl,
        };

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
