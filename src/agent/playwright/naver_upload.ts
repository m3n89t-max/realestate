import { chromium } from 'playwright';
import { AgentConfig, getCredentials } from '../config';
import { sendTaskProgress, getContent, getAssets, updateContent } from '../webhook-client';
import { tmpdir } from 'os';
import { writeFileSync } from 'fs';
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
    config: AgentConfig,
    checkCancelled?: () => Promise<boolean>
): Promise<Record<string, unknown>> {
    const projectId = task.payload?.project_id || task.project_id;
    const contentId = task.payload?.content_id;
    const photoLayout: 'individual' | 'collage' | 'slideshow' = task.payload?.photo_layout ?? 'individual';
    const photoPosition: 'inline' | 'bulk' = task.payload?.photo_position ?? 'bulk';

    const assertNotCancelled = async () => {
        if (checkCancelled && await checkCancelled()) {
            throw new Error('[TASK_CANCELLED] 사용자가 업로드를 취소했습니다.');
        }
    };

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

        await assertNotCancelled(); // 로그인 후 취소 확인

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

        // 마크다운 텍스트 정규화 (헤딩 제거, ** 제거, HTML 제거)
        const stripLine = (line: string) => line
            .replace(/<[^>]+>/g, '')
            .replace(/^#{1,6}\s+/, '')
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/\*([^*]+)\*/g, '$1')
            .replace(/^[-*]\s/, '• ');

        // 에디터 포커스 확보 헬퍼 (마지막 섹션 끝으로 이동)
        const focusEditor = async () => {
            // 마지막 텍스트 섹션 클릭 → Ctrl+End 로 커서를 맨 끝으로
            const sections = mainFrame.locator('.se-section-text');
            const count = await sections.count();
            await (count > 0 ? sections.nth(count - 1) : sections.first()).click();
            await page.waitForTimeout(100);
            await page.keyboard.press('Control+End'); // 문서 끝으로 커서 이동
            await page.waitForTimeout(50);
        };

        // SE3 볼드 툴바 버튼 셀렉터 (data-name="bold", class="se-bold-toolbar-button" 확인됨)
        const BOLD_BTN_SELECTORS = [
            'button[data-name="bold"]',                 // ✓ 실제 data-name 확인됨
            'button.se-bold-toolbar-button',            // ✓ 실제 class 확인됨
            'button[class*="se-bold-toolbar"]',
            '.se-toolbar-item-bold > button',
            'button[aria-label="굵게"]',
            'button[title="굵게"]',
        ];

        // SE3 볼드 버튼 클릭 토글 (Ctrl+B 대신 툴바 버튼 직접 클릭)
        const toggleBold = async () => {
            for (const sel of BOLD_BTN_SELECTORS) {
                for (const ctx of [mainFrame, page]) {
                    if (await ctx.locator(sel).count() > 0) {
                        await ctx.locator(sel).first().click({ force: true });
                        await page.waitForTimeout(80);
                        return;
                    }
                }
            }
            // 버튼 못 찾으면 Ctrl+B fallback
            await page.keyboard.press('Control+B');
            await page.waitForTimeout(80);
        };

        // SE3 글자 크기 변경 (data-name="font-size" 확인됨)
        const FONTSIZE_BTN_SELECTORS = [
            'button[data-name="font-size"]',
            'button[data-log="prt.size"]',
            'button.se-font-size-code-toolbar-button',
        ];
        const setFontSize = async (size: number) => {
            let btn = null;
            for (const sel of FONTSIZE_BTN_SELECTORS) {
                for (const ctx of [mainFrame, page]) {
                    if (await ctx.locator(sel).count() > 0) { btn = ctx.locator(sel).first(); break; }
                }
                if (btn) break;
            }
            if (!btn) return;
            await btn.click({ force: true });
            await page.waitForTimeout(400);
            const sizeStr = String(size);
            // 드롭다운에서 해당 크기 클릭 (다양한 셀렉터 시도)
            for (const ctx of [mainFrame, page]) {
                for (const sel of [
                    `li[data-value="${sizeStr}"]`,
                    `button[data-value="${sizeStr}"]`,
                    `.se-list-item[data-value="${sizeStr}"]`,
                    `.se-dropdown-item[data-value="${sizeStr}"]`,
                    `[data-value="${sizeStr}"]`,
                ]) {
                    if (await ctx.locator(sel).count() > 0) {
                        await ctx.locator(sel).first().click();
                        await page.waitForTimeout(150);
                        return;
                    }
                }
                // 텍스트 매칭 (다양한 리스트 아이템 형태)
                for (const listSel of ['li.se-list-item', '.se-listitem', 'li', '.se-dropdown-item']) {
                    const opt = ctx.locator(listSel).filter({ hasText: new RegExp(`^${sizeStr}$`) }).first();
                    if (await opt.count() > 0) { await opt.click(); await page.waitForTimeout(150); return; }
                }
            }
            await page.keyboard.press('Escape'); // 못 찾으면 닫기
            await page.waitForTimeout(100);
        };

        // 텍스트 입력 (bold 여부 지정 가능)
        // page.keyboard.type 사용: 툴바 버튼 클릭 후 포커스가 유지된 상태에서 타이핑
        const typeText = async (text: string, bold = false) => {
            if (bold) {
                await toggleBold();
                // 볼드 버튼 클릭 후 에디터 포커스 복원 (툴바 클릭이 포커스를 가져갈 수 있음)
                await focusEditor();
            }
            await page.keyboard.type(text, { delay: 20 });
            if (bold) {
                await toggleBold();
                await page.waitForTimeout(50);
            }
        };

        // 인라인 볼드(**...**) 처리 — 단락 내 굵은 글씨 지원
        const typeInlineBold = async (text: string) => {
            // 헤딩/HTML 태그 제거 후 인라인 볼드 분리
            const cleaned = text
                .replace(/<[^>]+>/g, '')
                .replace(/^#{1,6}\s+/, '')
                .replace(/^[-*]\s/, '• ');
            const parts = cleaned.split(/(\*\*[^*]+\*\*)/);
            for (const part of parts) {
                if (!part) continue;
                const boldMatch = part.match(/^\*\*([^*]+)\*\*$/);
                if (boldMatch) {
                    await typeText(boldMatch[1], true);
                } else {
                    const noItalic = part.replace(/\*([^*]+)\*/g, '$1');
                    if (noItalic) await typeText(noItalic);
                }
            }
        };

        // 구분선 삽입
        const insertHR = async () => {
            const hrSelectors = [
                'button[data-name="horizontal-line"]',          // SE3 실제 data-name
                'button[data-log*="horizt"]',                   // data-log="dot.horizontal-line"
                'button[data-name="horizontalRule"]',
                '.se-toolbar-item-horizontalrule > button',
                'button[aria-label="구분선"]',
                'button[aria-label*="구분선"]',
                'button[title*="구분선"]',
                'button[data-se-item-name="horizontalRule"]',
                '.se-toolbar__item--horizontalrule button',
            ];
            for (const sel of hrSelectors) {
                for (const ctx of [mainFrame, page]) {
                    if (await ctx.locator(sel).count() > 0) {
                        await ctx.locator(sel).first().click();
                        await page.waitForTimeout(400);
                        return;
                    }
                }
            }
            // fallback: 긴 대시 줄
            await typeText('──────────────────────────────');
        };

        // Naver SE3 이미지 버튼 셀렉터 (data-name="image", class="se-image-toolbar-button" 확인됨)
        const IMAGE_BTN_SELECTORS = [
            'button[data-name="image"]',                    // ✓ 실제 data-name 확인됨
            'button.se-image-toolbar-button',               // ✓ 실제 class 확인됨
            'button[class*="se-image-toolbar-button"]',
            '.se-toolbar-item-image > button',
            '.se-toolbar-item-image button',
            'button[aria-label*="사진"]',
            'button[title*="사진"]',
        ];

        // 이미지 버튼 탐색 헬퍼 (mainFrame 우선, page fallback)
        const findImageButton = async () => {
            for (const sel of IMAGE_BTN_SELECTORS) {
                const c = mainFrame.locator(sel).first();
                if (await c.count() > 0) {
                    console.log(`[NaverUpload] 이미지 버튼 발견(mainFrame): ${sel}`);
                    return c;
                }
                const cp = page.locator(sel).first();
                if (await cp.count() > 0) {
                    console.log(`[NaverUpload] 이미지 버튼 발견(page): ${sel}`);
                    return cp;
                }
            }
            console.warn('[NaverUpload] ⚠️ 이미지 버튼을 찾지 못했습니다. 모든 셀렉터 실패.');
            return null;
        };

        // 사진 첨부 방식 다이얼로그 공통 처리
        const handlePhotoDialog = async () => {
            await page.waitForTimeout(1500);
            const dialogVisible = await page.locator('text=사진 첨부 방식').count() > 0
                || await mainFrame.locator('text=사진 첨부 방식').count() > 0;
            if (!dialogVisible) return;
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
        };

        // 이미지 1장을 현재 커서 위치에 삽입하는 헬퍼
        const insertImageAtCursor = async (tmpPath: string) => {
            const imgBtn = await findImageButton();
            if (!imgBtn) return;

            const [fileChooser] = await Promise.all([
                page.waitForEvent('filechooser', { timeout: 12_000 }).catch(() => null),
                imgBtn.click(),
            ]);
            if (!fileChooser) {
                console.warn('[NaverUpload] ⚠️ 파일 선택 다이얼로그가 열리지 않았습니다.');
                return;
            }
            await fileChooser.setFiles([tmpPath]);
            await handlePhotoDialog();
            await page.waitForTimeout(2000);
        };

        // HTML 표를 이미지로 렌더링 후 삽입
        // context.newPage() 대신 현재 페이지에 숨김 div 주입 → 탭 전환/포커스 문제 없음
        const insertHtmlAsImage = async (htmlStr: string, idx: number) => {
            const imgPath = join(tmpdir(), `naver_table_${Date.now()}_${idx}.png`);
            const divId = `__table_render_${Date.now()}_${idx}__`;

            // 현재 page(메인 프레임 외부)에 스타일 적용 숨김 div 주입
            await page.evaluate(({ id, html }) => {
                const div = document.createElement('div');
                div.id = id;
                // position:fixed + left:0 + top:0 → Playwright screenshot 가능 (off-screen은 빈 이미지 반환)
                div.style.cssText = [
                    'position:fixed',
                    'left:0',
                    'top:0',
                    'z-index:99999',
                    'background:white',
                    'padding:20px',
                    'font-size:13px',
                    'color:#222',
                    'font-family:-apple-system,BlinkMacSystemFont,"Malgun Gothic","Segoe UI",sans-serif',
                    'width:700px',
                    'box-sizing:border-box',
                ].join(';');
                div.innerHTML = `<style>
                    *{box-sizing:border-box;margin:0;padding:0;}
                    table{width:100%;border-collapse:collapse;font-size:13px;}
                    td,th{border:1px solid #ccc;padding:7px 10px;vertical-align:middle;line-height:1.4;}
                </style>${html}`;
                document.body.appendChild(div);
            }, { id: divId, html: htmlStr });

            try {
                await page.locator(`#${divId}`).screenshot({ path: imgPath, type: 'png' });
            } finally {
                await page.evaluate((id) => document.getElementById(id)?.remove(), divId);
            }

            // 탭 전환 없으므로 포커스 유지 — 바로 이미지 삽입
            await focusEditor();
            await insertImageAtCursor(imgPath);
        };

        // 7. 본문 입력
        await progress(config, task.id, `본문 입력 중... (사진 ${photoPosition === 'inline' ? '인라인' : '일괄'} 모드)`, 55);
        await mainFrame.waitForSelector('.se-section-text', { timeout: 10_000 });
        await focusEditor();
        await page.waitForTimeout(500);

        await assertNotCancelled(); // 본문 입력 전 취소 확인

        // task.payload.content_body 우선 사용 (buildFullContent 포함: 인사말+본문+공인중개사 정보)
        const bodyText: string = task.payload?.content_body || content.content || '';

        // 인사말(첫 번째 # 헤딩 이전 텍스트)과 본문을 분리
        const allBodyLines = bodyText.split('\n');
        const firstHeadIdx = allBodyLines.findIndex(l => /^#{1,6}\s/.test(l.trim()));
        const greetingLines = firstHeadIdx > 0 ? allBodyLines.slice(0, firstHeadIdx) : [];
        const mainBodyText = firstHeadIdx >= 0 ? allBodyLines.slice(firstHeadIdx).join('\n') : bodyText;

        // 이미지 URL 다운로드 공통 헬퍼
        const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']);
        const downloadImage = async (imgUrl: string, idx: number): Promise<string | null> => {
            try {
                const matchExt = imgUrl.match(/\.([a-zA-Z0-9]+)(?:[\?#]|$)/);
                const ext = (matchExt ? matchExt[1] : 'jpg').toLowerCase();
                if (!IMAGE_EXTS.has(ext)) {
                    console.warn(`[NaverUpload] 이미지 아닌 파일 건너뜀: ${imgUrl}`);
                    return null;
                }
                const res = await fetch(imgUrl);
                if (!res.ok) return null;
                const buf = await res.arrayBuffer();
                const tmpPath = join(tmpdir(), `naver_inline_${Date.now()}_${idx}.${ext}`);
                writeFileSync(tmpPath, Buffer.from(buf));
                return tmpPath;
            } catch (e) {
                console.warn(`[NaverUpload] 이미지 다운로드 실패: ${imgUrl}`, e);
                return null;
            }
        };

        // 한 줄 처리 (헤딩→크기+굵게+구분선, ---→구분선, 이미지→삽입, 일반→타이핑)
        let h2Count = 0; // H2 앞 구분선 제어용
        const processLine = async (line: string, imgIdxRef: { v: number }) => {
            const imgMatch = line.match(/!\[([^\]]*)\]\(([^)]+)\)/);
            if (imgMatch) {
                const tmpPath = await downloadImage(imgMatch[2], imgIdxRef.v++);
                if (tmpPath) {
                    await focusEditor();
                    await insertImageAtCursor(tmpPath);
                    await page.keyboard.press('Enter');
                }
                return;
            }
            if (line.match(/^\*▲/)) return; // 캡션 건너뜀
            if (line.match(/^---+\s*$/)) {
                await insertHR();
                await page.keyboard.press('Enter');
                return;
            }
            if (line.match(/^#{1,6}\s+/)) {
                // 헤딩 → 크기+굵게 (H1: 24, H2: 24+구분선, H3+: 18)
                const level = (line.match(/^(#{1,6})\s+/)?.[1] ?? '##').length;
                const fontSize = level === 1 ? 24 : level === 2 ? 24 : 18;
                const headText = line
                    .replace(/^#{1,6}\s+/, '')
                    .replace(/\*\*([^*]+)\*\*/g, '$1')
                    .replace(/\*([^*]+)\*/g, '$1')
                    .replace(/<[^>]+>/g, '');
                if (headText.trim()) {
                    // H2 앞에 구분선 자동 삽입 (콘텐츠 사이 구분)
                    if (level === 2) {
                        h2Count++;
                        if (h2Count > 1) await insertHR(); // 첫 H2 제외
                    }
                    await setFontSize(fontSize);
                    await typeText(headText, true);
                    await setFontSize(15); // 본문 크기로 복원
                }
                await page.keyboard.press('Enter');
                return;
            }
            // FAQ Q:/A: 라인 — Q는 볼드, A는 일반
            const qMatch = line.match(/^(?:\d+\.\s*)?Q[：:．.]\s*(.+)/);
            if (qMatch) {
                await typeText('Q. ' + qMatch[1].replace(/\*\*([^*]+)\*\*/g, '$1'), true);
                await page.keyboard.press('Enter');
                return;
            }
            const aMatch = line.match(/^(?:\s*\d+\.\s*)?A[：:．.]\s*(.+)/);
            if (aMatch) {
                await typeText('A. ' + aMatch[1].replace(/\*\*([^*]+)\*\*/g, '$1'));
                await page.keyboard.press('Enter');
                return;
            }
            // 인라인 볼드(**...**) 포함 여부에 따라 분기
            if (line.includes('**')) {
                await typeInlineBold(line);
            } else {
                const plain = stripLine(line);
                if (plain.trim()) await typeText(plain);
            }
            await page.keyboard.press('Enter');
        };

        // 5줄마다 취소 확인
        let lineCount = 0;
        const checkCancelEvery5 = async () => {
            if (++lineCount % 5 === 0) await assertNotCancelled();
        };

        // 인사말 먼저 타이핑 (첫 번째 # 헤딩 이전)
        const imgIdxGreeting = { v: 0 };
        for (const line of greetingLines) {
            await processLine(line, imgIdxGreeting);
            await page.waitForTimeout(60);
        }

        // 대표이미지 — 인사말 다음, 본문 이전에 삽입 (네이버 썸네일 자동 설정)
        const coverImageUrl: string | undefined = task.payload?.cover_image_url;
        if (coverImageUrl) {
            await progress(config, task.id, '대표이미지 삽입 중...', 57);
            try {
                const matchExt = coverImageUrl.match(/\.([a-zA-Z0-9]+)(?:[\?#]|$)/);
                const ext = (matchExt ? matchExt[1] : 'jpg').toLowerCase();
                const res = await fetch(coverImageUrl);
                if (res.ok) {
                    const buf = await res.arrayBuffer();
                    const coverPath = join(tmpdir(), `naver_cover_${Date.now()}.${ext}`);
                    writeFileSync(coverPath, Buffer.from(buf));
                    await insertImageAtCursor(coverPath);
                    await page.keyboard.press('Enter');
                }
            } catch (e) {
                console.warn('[NaverUpload] 대표이미지 삽입 실패:', e);
            }
        }

        if (photoPosition === 'inline') {
            // ── 인라인 모드 ─────────────────────────────────────────────────────────
            const normalizedBody = mainBodyText.replace(/```(?:html)?\s*(<table[\s\S]*?<\/table>)\s*```/gi, '$1');
            const parts = normalizedBody.split(/(<table[\s\S]*?<\/table>)/i);
            const imgIdxRef = { v: 0 };

            for (let pIdx = 0; pIdx < parts.length; pIdx++) {
                await assertNotCancelled();
                if (pIdx % 2 === 1) {
                    await insertHtmlAsImage(parts[pIdx], pIdx);
                    await page.keyboard.press('Enter');
                    continue;
                }
                for (const line of parts[pIdx].split('\n')) {
                    await checkCancelEvery5();
                    await processLine(line, imgIdxRef);
                    await page.waitForTimeout(60);
                }
            }
        } else {
            // ── 일괄 모드 ───────────────────────────────────────────────────────────
            const normalizedBody2 = mainBodyText.replace(/```(?:html)?\s*(<table[\s\S]*?<\/table>)\s*```/gi, '$1');
            const parts = normalizedBody2.split(/(<table[\s\S]*?<\/table>)/i);
            const imgIdxRef2 = { v: 0 };

            for (let pIdx = 0; pIdx < parts.length; pIdx++) {
                await assertNotCancelled(); // 파트 단위 체크
                if (pIdx % 2 === 1) {
                    await insertHtmlAsImage(parts[pIdx], pIdx);
                    await page.keyboard.press('Enter');
                    continue;
                }
                for (const line of parts[pIdx].replace(/\n{3,}/g, '\n\n').split('\n')) {
                    if (line.match(/!\[.*?\]\(.*?\)/)) continue;
                    await checkCancelEvery5();
                    await processLine(line, imgIdxRef2);
                    await page.waitForTimeout(60);
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
                        const matchExt = assets[i].file_url.match(/\.([a-zA-Z0-9]+)(?:[\?#]|$)/);
                        const ext = (matchExt ? matchExt[1] : 'jpg').toLowerCase();
                        if (!IMAGE_EXTS.has(ext)) {
                            console.warn(`[NaverUpload] 이미지 아닌 파일 건너뜀: ${assets[i].file_url}`);
                            continue;
                        }
                        const res = await fetch(assets[i].file_url);
                        const buf = await res.arrayBuffer();
                        const tmpPath = join(tmpdir(), `naver_bulk_${Date.now()}_${i}.${ext}`);
                        writeFileSync(tmpPath, Buffer.from(buf));
                        tempPaths.push(tmpPath);
                    } catch (e) {
                        console.warn(`[NaverUpload] 이미지 다운로드 실패: ${assets[i].file_url}`, e);
                    }
                }

                if (tempPaths.length > 0) {
                    const imgBtn = await findImageButton();
                    if (imgBtn) {
                        const [fileChooser] = await Promise.all([
                            page.waitForEvent('filechooser', { timeout: 12_000 }).catch(() => null),
                            imgBtn.click(),
                        ]);
                        if (fileChooser) {
                            await fileChooser.setFiles(tempPaths);
                            await handlePhotoDialog();
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

        await assertNotCancelled(); // 발행 전 최종 취소 확인

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
