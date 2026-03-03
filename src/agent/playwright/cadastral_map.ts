import { chromium } from 'playwright';
import { AgentConfig } from '../config';
import { sendTaskProgress, sendDocumentUploaded } from '../webhook-client';
import { createClient } from '@supabase/supabase-js';

// ============================================================
// 지적도 다운로드 — 토지이음 (eum.go.kr)
// ============================================================

export async function downloadCadastralMap(
    task: any,
    config: AgentConfig
): Promise<Record<string, unknown>> {
    const projectId = task.project_id;
    const address = task.payload?.jibun_address || task.payload?.address || '';

    if (!address) {
        throw new Error('[SEARCH_NOT_FOUND] 주소 정보가 없습니다.');
    }

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

        // ---- Step 1: 토지이음 접속 ----
        await progress(config, task.id, '토지이음 접속 중...', 5);
        await page.goto('https://www.eum.go.kr/web/ar/lu/luLandinfoR.jsp', {
            waitUntil: 'domcontentloaded',
            timeout: 30_000,
        });

        // ---- Step 2: 주소 검색 ----
        await progress(config, task.id, `주소 검색: ${address}`, 15);

        const searchInput = page.locator('input[id*="search"], input[name*="addr"], input[placeholder*="주소"]').first();
        if (await searchInput.count() > 0) {
            await searchInput.fill(address);
            await searchInput.press('Enter');
            await page.waitForTimeout(3000);
        }

        await progress(config, task.id, '지도 로딩 대기 중...', 30);
        await page.waitForTimeout(5000); // 지도 렌더링 대기

        // ---- Step 3: 검색 결과 선택 ----
        const resultItem = page.locator('.search-result li, table tbody tr').first();
        if (await resultItem.count() > 0) {
            await resultItem.click();
            await page.waitForTimeout(3000);
        }

        await progress(config, task.id, '지적도 캡처 중...', 50);

        // ---- Step 4: 지적도 영역 스크린샷 ----
        // 지도 영역을 스크린샷으로 캡처
        const mapElement = page.locator('#map, .map-container, .ol-viewport, canvas').first();
        let screenshotBuffer: Buffer;

        if (await mapElement.count() > 0) {
            screenshotBuffer = await mapElement.screenshot();
        } else {
            // 지도 요소가 없으면 전체 페이지 캡처
            screenshotBuffer = await page.screenshot({ fullPage: false });
        }

        const fileName = `cadastral_map_${Date.now()}.png`;
        await progress(config, task.id, '스크린샷 캡처 완료', 70);

        // ---- Step 5: Supabase Storage 업로드 ----
        await progress(config, task.id, 'Supabase Storage 업로드 중...', 80);

        const supabase = createClient(config.supabase_url, config.supabase_anon_key);
        const storagePath = `${task.org_id}/${projectId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(storagePath, screenshotBuffer, {
                contentType: 'image/png',
                upsert: true,
            });

        if (uploadError) {
            throw new Error(`[UPLOAD_FAILED] Storage 업로드 실패: ${uploadError.message}`);
        }

        const { data: urlData } = supabase.storage
            .from('documents')
            .getPublicUrl(storagePath);
        const fileUrl = urlData.publicUrl;

        // ---- Step 6: document_uploaded 웹훅 ----
        await progress(config, task.id, '지적도 등록 완료 처리 중...', 90);
        if (config.agent_key && fileUrl) {
            await sendDocumentUploaded(
                config,
                projectId,
                'cadastral_map',
                fileUrl,
                fileName
            );
        }

        await progress(config, task.id, '지적도 다운로드 완료! ✅', 100);

        return {
            file_url: fileUrl,
            file_name: fileName,
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
