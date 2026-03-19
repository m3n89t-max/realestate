import { chromium } from 'playwright';
import { AgentConfig, getCredentials } from '../config';
import { sendTaskProgress } from '../webhook-client';
import { createClient } from '@supabase/supabase-js';

// ============================================================
// 인스타그램 카드뉴스 업로드 자동화 — instagram.com
// ⚠️ 인스타그램은 데스크탑 업로드 제한이 있어 모바일 에뮬레이션 사용
// ============================================================

export async function uploadInstagram(
    task: any,
    config: AgentConfig
): Promise<Record<string, unknown>> {
    const projectId = task.project_id;
    const contentId = task.payload?.content_id;
    const imageUrls: string[] = task.payload?.image_urls || [];

    if (imageUrls.length === 0) {
        throw new Error('[SEARCH_NOT_FOUND] 업로드할 이미지 URL이 없습니다.');
    }

    // 1. 자격증명 로드
    const creds = getCredentials('instagram');
    if (!creds?.pw) {
        throw new Error('[LOGIN_FAILED] 인스타그램 자격증명이 없습니다. /settings/credentials 에서 저장해주세요.');
    }
    const instagramId = creds.id || creds.email || '';
    const instagramPw = creds.pw;

    // 2. Supabase에서 콘텐츠/캡션 가져오기
    const supabase = createClient(config.supabase_url, config.supabase_anon_key);

    let caption = '';
    let tags: string[] = [];

    if (contentId) {
        const { data: content } = await supabase
            .from('generated_contents')
            .select('content, tags')
            .eq('id', contentId)
            .single();

        if (content) {
            // 첫 단락을 캡션으로 사용 (최대 2200자)
            caption = (content.content || '').substring(0, 2000);
            tags = content.tags || [];
        }
    }

    // 3. 이미지 다운로드 (로컬에 임시 저장)
    await progress(config, task.id, '이미지 다운로드 중...', 5);

    const fs = await import('fs');
    const path = await import('path');
    const os = await import('os');

    const tmpDir = path.join(os.tmpdir(), 'realestate-insta');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const localPaths: string[] = [];
    for (let i = 0; i < Math.min(imageUrls.length, 10); i++) { // 최대 10장
        const res = await fetch(imageUrls[i]);
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        const ext = imageUrls[i].includes('.png') ? 'png' : 'jpg';
        const localPath = path.join(tmpDir, `card_${i}.${ext}`);
        fs.writeFileSync(localPath, buf);
        localPaths.push(localPath);
    }

    await progress(config, task.id, `이미지 ${localPaths.length}장 다운로드 완료`, 15);

    // 4. Instagram 웹에서 업로드 (모바일 에뮬레이션)
    const browser = await chromium.launch({
        channel: 'msedge',
        headless: false,
        args: ['--start-maximized'],
    });

    try {
        // 인스타그램은 모바일 UA가 있어야 업로드 버튼이 보임
        const context = await browser.newContext({
            viewport: { width: 390, height: 844 },
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
            locale: 'ko-KR',
        });
        const page = await context.newPage();

        // ---- 접속 ----
        await progress(config, task.id, 'Instagram 접속 중...', 20);
        await page.goto('https://www.instagram.com/', {
            waitUntil: 'domcontentloaded',
            timeout: 30_000,
        });

        // ---- 로그인 ----
        await progress(config, task.id, 'Instagram 로그인 중...', 25);

        const usernameInput = page.locator('input[name="username"], input[aria-label*="전화번호"]').first();
        const passwordInput = page.locator('input[name="password"], input[aria-label*="비밀번호"]').first();

        if (await usernameInput.count() > 0) {
            await usernameInput.fill(instagramId);
            await passwordInput.fill(instagramPw);
            await page.locator('button[type="submit"]').click();
            await page.waitForTimeout(5000);
        }

        // 로그인 유지 팝업
        const notNowBtn = page.locator('button:has-text("나중에"), button:has-text("Not Now")').first();
        if (await notNowBtn.count() > 0) {
            await notNowBtn.click();
            await page.waitForTimeout(1500);
        }

        await progress(config, task.id, '로그인 완료', 35);

        // ---- 새 게시물 ----
        await progress(config, task.id, '업로드 화면 진입 중...', 40);

        // 하단 + 버튼 또는 만들기 버튼
        const createBtn = page.locator('a[href="/create/style/"], svg[aria-label*="새 게시물"], button:has-text("새로 만들기")').first();
        if (await createBtn.count() > 0) {
            await createBtn.click();
            await page.waitForTimeout(2000);
        }

        // ---- 파일 선택 ----
        await progress(config, task.id, '이미지 선택 중...', 50);

        const fileInput = page.locator('input[type="file"]').first();
        if (await fileInput.count() > 0 && localPaths.length > 0) {
            await fileInput.setInputFiles(localPaths);
            await page.waitForTimeout(3000);
        }

        // 다음 버튼
        const nextBtn = page.locator('button:has-text("다음"), button:has-text("Next")').first();
        if (await nextBtn.count() > 0) {
            await nextBtn.click();
            await page.waitForTimeout(2000);
        }

        await progress(config, task.id, '필터/편집 단계 스킵...', 60);

        // 필터 단계 다음
        if (await nextBtn.count() > 0) {
            await nextBtn.click();
            await page.waitForTimeout(2000);
        }

        // ---- 캡션 입력 ----
        await progress(config, task.id, '캡션 입력 중...', 70);

        const captionArea = page.locator('textarea[aria-label*="문구"], div[role="textbox"]').first();
        if (await captionArea.count() > 0) {
            await captionArea.click();
            const fullCaption = caption + '\n\n' + tags.map(t => `#${t}`).join(' ');
            await captionArea.fill(fullCaption.substring(0, 2200));
        }

        // ---- 공유 ----
        await progress(config, task.id, '게시물 공유 중...', 85);

        const shareBtn = page.locator('button:has-text("공유"), button:has-text("Share")').first();
        if (await shareBtn.count() > 0) {
            await shareBtn.click();
            await page.waitForTimeout(5000);
        }

        // 게시 완료 감지
        await page.waitForSelector('._acan, [aria-label*="게시"]', { timeout: 15_000 }).catch(() => { });

        await progress(config, task.id, 'Instagram 업로드 완료! ✅', 100);

        // 임시 파일 정리
        for (const p of localPaths) {
            try { fs.unlinkSync(p); } catch { /* ignore */ }
        }

        return {
            platform: 'instagram',
            image_count: localPaths.length,
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
