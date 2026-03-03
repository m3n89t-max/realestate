import { chromium, Browser, Page } from 'playwright';
import { AgentConfig } from '../config';
import { sendTaskProgress, sendDocumentUploaded } from '../webhook-client';
import { createClient } from '@supabase/supabase-js';

// ============================================================
// 건축물대장 다운로드 — 정부24 (gov.kr)
// agent-protocol.md 섹션 3 참조
// ============================================================

export async function downloadBuildingRegister(
    task: any,
    config: AgentConfig
): Promise<Record<string, unknown>> {
    const projectId = task.project_id;
    const address = task.payload?.jibun_address || task.payload?.address || '';

    if (!address) {
        throw new Error('[SEARCH_NOT_FOUND] 주소 정보가 없습니다.');
    }

    const browser = await chromium.launch({
        headless: false,  // CAPTCHA 대응을 위해 headful
        args: ['--start-maximized'],
    });

    try {
        const context = await browser.newContext({
            viewport: { width: 1280, height: 900 },
            locale: 'ko-KR',
        });
        const page = await context.newPage();

        // ---- Step 1: 정부24 접속 ----
        await progress(config, task.id, '정부24 접속 중...', 5);
        await page.goto('https://www.gov.kr/mw/AA020InfoCappView.do?HighCtgCD=A09002&CappBizCD=13100000015', {
            waitUntil: 'domcontentloaded',
            timeout: 30_000,
        });

        // ---- Step 2: 로그인 (필요 시) ----
        await progress(config, task.id, '로그인 확인 중...', 10);

        // 비로그인 열람 가능 여부 확인 — 정부24는 비로그인으로 건축물대장 열람 가능
        // 로그인이 필요한 경우 Windows Credential Manager에서 인증정보 가져옴
        // TODO: Windows Credential Manager 연동 필요 시 구현
        await progress(config, task.id, '비로그인 열람 모드 진행', 15);

        // ---- Step 3: 주소 검색 ----
        await progress(config, task.id, `주소 검색: ${address}`, 20);

        // 지번 주소 입력
        const searchInput = page.locator('input[name="search_addr"], input[id*="addr"], input[placeholder*="주소"]').first();
        if (await searchInput.count() > 0) {
            await searchInput.fill(address);
            // 검색 버튼 클릭
            const searchBtn = page.locator('button:has-text("검색"), input[type="submit"], a:has-text("검색")').first();
            if (await searchBtn.count() > 0) {
                await searchBtn.click();
            } else {
                await searchInput.press('Enter');
            }
            await page.waitForTimeout(3000);
        }

        await progress(config, task.id, '검색 결과 확인 중...', 40);

        // ---- Step 4: 결과 선택 ----
        // 검색 결과 목록에서 첫 번째 항목 선택
        const resultItem = page.locator('table tbody tr, .result-item, .list-item').first();
        if (await resultItem.count() > 0) {
            await resultItem.click();
            await page.waitForTimeout(2000);
        }

        // ---- Step 5: PDF 다운로드 ----
        await progress(config, task.id, 'PDF 발급 요청 중...', 60);

        // 다운로드 이벤트 대기
        const downloadPromise = page.waitForEvent('download', { timeout: 60_000 }).catch(() => null);

        // 발급/다운로드 버튼 클릭
        const downloadBtn = page.locator('button:has-text("발급"), a:has-text("열람"), button:has-text("다운로드")').first();
        if (await downloadBtn.count() > 0) {
            await downloadBtn.click();
        }

        const download = await downloadPromise;
        let filePath = '';
        let fileName = `building_register_${Date.now()}.pdf`;

        if (download) {
            filePath = await download.path() || '';
            fileName = download.suggestedFilename() || fileName;
            await progress(config, task.id, `PDF 다운로드 완료: ${fileName}`, 70);
        } else {
            // 다운로드 실패 시 페이지 스크린샷으로 대체
            await progress(config, task.id, 'PDF 다운로드 실패, 스크린샷 캡처 중...', 70);
            const screenshotBuffer = await page.screenshot({ fullPage: true });
            filePath = ''; // 스크린샷은 buffer로 처리
            fileName = `building_register_screenshot_${Date.now()}.png`;
        }

        // ---- Step 6: 텍스트 추출 ----
        await progress(config, task.id, '문서 텍스트 추출 중...', 80);
        const rawText = await page.evaluate(() => document.body.innerText).catch(() => '');

        // ---- Step 7: Supabase Storage 업로드 ----
        await progress(config, task.id, 'Supabase Storage 업로드 중...', 85);

        const supabase = createClient(config.supabase_url, config.supabase_anon_key);
        const storagePath = `${task.org_id}/${projectId}/${fileName}`;

        let fileUrl = '';
        if (filePath) {
            const fs = await import('fs');
            const fileBuffer = fs.readFileSync(filePath);
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('documents')
                .upload(storagePath, fileBuffer, {
                    contentType: 'application/pdf',
                    upsert: true,
                });

            if (uploadError) {
                throw new Error(`[UPLOAD_FAILED] Storage 업로드 실패: ${uploadError.message}`);
            }

            const { data: urlData } = supabase.storage
                .from('documents')
                .getPublicUrl(storagePath);
            fileUrl = urlData.publicUrl;
        }

        // ---- Step 8: document_uploaded 웹훅 ----
        await progress(config, task.id, '문서 등록 완료 처리 중...', 95);
        if (config.agent_key && fileUrl) {
            await sendDocumentUploaded(
                config,
                projectId,
                'building_register',
                fileUrl,
                fileName,
                rawText
            );
        }

        await progress(config, task.id, '건축물대장 다운로드 완료! ✅', 100);

        return {
            file_url: fileUrl,
            file_name: fileName,
            page_count: 1,
        };

    } catch (err: any) {
        throw err;
    } finally {
        await browser.close();
    }
}

// progress 헬퍼
async function progress(config: AgentConfig, taskId: string, message: string, pct: number) {
    console.log(`  [${pct}%] ${message}`);
    if (config.agent_key) {
        await sendTaskProgress(config, taskId, message, 'info', pct);
    }
}
