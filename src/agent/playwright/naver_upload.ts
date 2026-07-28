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
        // viewport: null → 페이지가 기본 1280px에 고정되지 않고 --start-maximized된 창 전체 크기를 사용
        // (에디터가 넓게 렌더되어 라이브러리 패널이 열려도 본문이 좁게 잘려 보이지 않음)
        viewport: null,
        permissions: ['clipboard-read', 'clipboard-write'],
        args: [
            '--start-maximized',
            '--disable-blink-features=AutomationControlled',
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
        await page.waitForTimeout(2500);

        // 로그인 상태 판정 (견고): 로그아웃 링크가 있거나, "로그인" 링크(nidlogin.login)가 없으면 로그인된 상태
        const isLoggedIn = (await page.locator('a[href*="logout"]').count() > 0)
            || (await page.locator('a[href*="nidlogin.login"]').count() === 0);

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

            // 사람처럼 한 글자씩 랜덤 간격으로 타이핑 (봇 탐지 우회).
            // 필드 클릭 → 기존 값 전체선택 후 덮어쓰기(중복 입력 방지) → 랜덤 딜레이 타이핑.
            const typeInto = async (selector: string, text: string) => {
                const field = page.locator(selector);
                await field.click();
                await page.waitForTimeout(300 + Math.random() * 200);
                await page.keyboard.press('Control+A');
                await page.waitForTimeout(100);
                for (const ch of text) {
                    await page.keyboard.type(ch, { delay: 80 + Math.random() * 120 });
                }
            };

            await typeInto('#id', creds.id);
            await page.waitForTimeout(500 + Math.random() * 500);
            await typeInto('#pw', creds.pw);
            await page.waitForTimeout(800 + Math.random() * 500);

            // 로그인 제출 — 비밀번호 입력 직후 Enter로 폼 제출.
            // (버튼 셀렉터는 네이버가 자주 바꾸고, '패스키 로그인' 등 다른 버튼을 잘못 누를 위험이 있어
            //  포커스가 비밀번호 필드에 있는 상태에서 Enter를 치는 것이 가장 안정적임)
            await page.locator('#pw').press('Enter').catch(async () => {
                await page.keyboard.press('Enter').catch(() => {});
            });
            await page.waitForTimeout(5000);

            // 로그인 제출 후: 성공(리다이렉트) 또는 추가 인증(2단계/캡챠/기기등록) 완료를 기다린다.
            // ⚠️ 제출 직후 페이지를 다른 곳으로 이동시키면 2단계 인증 흐름이 끊기므로(이전 버그),
            //    "그 자리에서" nid 인증 도메인을 벗어날 때(=로그인 성공)까지 최대 5분 폴링한다.
            //    2단계 인증/캡챠는 nid 도메인 안에서 진행되므로, 이 동안 사용자가 휴대폰 승인 등을 직접 처리할 수 있다.
            await progress(config, task.id, '로그인 확인 중... 2단계 인증이 뜨면 휴대폰(네이버 앱)으로 승인해 주세요.', 15);

            // 로그인 성공 판정 (가장 견고): 블로그 글쓰기 페이지를 열어본다.
            //  - 로그인 상태면 에디터(mainFrame)가 로드됨
            //  - 로그아웃 상태면 nid 로그인 페이지로 리다이렉트됨
            // (네이버가 자주 바꾸는 GNB 해시 클래스에 의존하지 않아 안정적. 실제 필요한 동작이기도 함)
            const confirmLoggedIn = async (): Promise<boolean> => {
                try {
                    await page.goto('https://blog.naver.com/GoBlogWrite.naver', { waitUntil: 'domcontentloaded', timeout: 20_000 });
                    await page.waitForTimeout(3000);
                    if (/nid\.naver\.com/.test(page.url())) return false; // 로그인 페이지로 튕김 = 미로그인
                    return page.frames().some(f => f.name() === 'mainFrame'); // 에디터 프레임 존재 = 로그인됨
                } catch { return false; }
            };

            let loggedIn = await confirmLoggedIn();
            if (!loggedIn) {
                // 자동 로그인 미완료 (2단계 인증/캡챠/자격증명 등) → 열린 창에서 사용자가 직접 처리하도록 최대 5분 대기.
                // 이 동안 페이지를 함부로 이동시키지 않아 2단계 인증 흐름을 끊지 않는다.
                await progress(config, task.id, '⚠️ 자동 로그인이 완료되지 않았습니다. 열린 브라우저에서 직접 로그인/2단계 인증을 완료해 주세요 (최대 5분 대기). 최초 1회만 하면 이후 자동 유지됩니다.', 12);
                const deadline = Date.now() + 300_000; // 5분
                while (Date.now() < deadline) {
                    await page.waitForTimeout(5000);
                    const url = page.url();
                    // "새로운 기기 등록" 페이지 자동 통과
                    if (url.includes('deviceConfirm') || await page.locator('#new\\.save, #new\\.dontsave').count() > 0) {
                        for (const sel of ['#new\\.dontsave', '#new\\.save', 'a:has-text("등록안함")', 'button:has-text("등록")']) {
                            if (await page.locator(sel).count() > 0) { await page.locator(sel).first().click().catch(() => {}); break; }
                        }
                        continue;
                    }
                    // 인증 도메인을 벗어났으면(로그인/2단계 완료 가능성) 확정 확인
                    if (!/nid\.naver\.com/.test(url)) {
                        if (await confirmLoggedIn()) { loggedIn = true; break; }
                    }
                }
            }

            if (!loggedIn) {
                throw new Error('[LOGIN_FAILED] 로그인이 완료되지 않았습니다. 2단계 인증/캡챠를 완료했는지, 자격증명이 정확한지 확인 후 다시 시도하세요.');
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

        // 현재 "선택된" 텍스트에 굵게 적용.
        // ⚠️ 툴바 버튼 클릭은 에디터 포커스를 빼앗아 선택이 풀리고, 이후 타이핑이 선택 영역을
        //    덮어써 글자가 유실된다. Ctrl+B는 포커스를 유지한 채 선택 영역에만 굵게를 적용하므로
        //    Ctrl+B만 사용한다. (SE3가 Ctrl+B를 지원 안 하면 굵게가 안 될 뿐, 글자 유실은 없음)
        const boldSelection = async () => {
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
        // ⚠️ bold=true는 "한 줄 전체"에만 사용할 것(헤딩/FAQ 질문). 타이핑 후 Shift+Home으로
        //    줄 시작~현재 커서까지 선택 → Ctrl+B로 굵게 → End로 선택 해제. 문자 단위 선택(Shift+ArrowLeft)은
        //    커서가 앞줄로 넘어가 굵기 번짐/글자 붙음을 유발해 사용하지 않는다.
        const typeText = async (text: string, bold = false) => {
            if (!text) return;
            await page.keyboard.type(text, { delay: 20 });
            if (bold) {
                await page.keyboard.press('Shift+Home');
                await page.waitForTimeout(60);
                await boldSelection();
                await page.waitForTimeout(60);
                await page.keyboard.press('End'); // 선택 해제 + 커서를 줄 끝으로
            }
        };

        // 인라인 볼드(**...**) 처리 — 단락 내 부분 굵게는 자동화로 안정적 처리가 불가(글자 유실/붙음)하여
        // ** 마커만 제거하고 "평문"으로 입력한다. (굵기 구분은 헤딩/FAQ 질문에서만 적용)
        const typeInlineBold = async (text: string) => {
            const cleaned = text
                .replace(/<[^>]+>/g, '')
                .replace(/^#{1,6}\s+/, '')
                .replace(/^[-*]\s/, '• ')
                .replace(/\*\*([^*]+)\*\*/g, '$1')
                .replace(/\*([^*]+)\*/g, '$1');
            if (cleaned.trim()) await typeText(cleaned);
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

        // Naver SE3 동영상 버튼 셀렉터
        const VIDEO_BTN_SELECTORS = [
            'button[data-name="video"]',
            'button.se-video-toolbar-button',
            'button[class*="se-video-toolbar-button"]',
            '.se-toolbar-item-video > button',
            '.se-toolbar-item-video button',
            'button[aria-label*="동영상"]',
            'button[title*="동영상"]',
        ];
        const findVideoButton = async () => {
            for (const sel of VIDEO_BTN_SELECTORS) {
                const c = mainFrame.locator(sel).first();
                if (await c.count() > 0) { console.log(`[NaverUpload] 동영상 버튼 발견(mainFrame): ${sel}`); return c; }
                const cp = page.locator(sel).first();
                if (await cp.count() > 0) { console.log(`[NaverUpload] 동영상 버튼 발견(page): ${sel}`); return cp; }
            }
            console.warn('[NaverUpload] ⚠️ 동영상 버튼을 찾지 못했습니다.');
            return null;
        };

        // 동영상 1개를 현재 커서 위치에 삽입 (업로드 + 인코딩 대기 최대 5분)
        const insertVideoAtCursor = async (videoPath: string) => {
            const vBtn = await findVideoButton();
            if (!vBtn) return;

            const [fileChooser] = await Promise.all([
                page.waitForEvent('filechooser', { timeout: 15_000 }).catch(() => null),
                vBtn.click(),
            ]);
            let chooser = fileChooser;
            if (!chooser) {
                // 동영상 업로드 팝업 안에 별도 '동영상 추가/파일 추가' 버튼이 있는 경우
                for (const sel of ['button:has-text("동영상 추가")', 'button:has-text("파일 추가")', 'button:has-text("불러오기")', '.se-popup-video button']) {
                    for (const ctx of [page, mainFrame]) {
                        if (await ctx.locator(sel).count() > 0) {
                            const [fc] = await Promise.all([
                                page.waitForEvent('filechooser', { timeout: 10_000 }).catch(() => null),
                                ctx.locator(sel).first().click().catch(() => {}),
                            ]);
                            if (fc) { chooser = fc; break; }
                        }
                    }
                    if (chooser) break;
                }
            }
            if (!chooser) { console.warn('[NaverUpload] ⚠️ 동영상 파일 선택창이 열리지 않았습니다.'); return; }

            await chooser.setFiles([videoPath]);
            await progress(config, task.id, '동영상 업로드/인코딩 대기 중... (최대 5분)', 62);

            // 업로드/인코딩 완료 후 '완료/등록/게시' 버튼이 활성화되면 클릭
            const encDeadline = Date.now() + 300_000;
            let done = false;
            while (Date.now() < encDeadline) {
                await page.waitForTimeout(5000);
                for (const sel of [
                    '.se-popup-button-confirm:not([disabled])',
                    '.se-popup-button-primary:not([disabled])',
                    'button:has-text("완료"):not([disabled])',
                    'button:has-text("등록"):not([disabled])',
                    'button:has-text("게시"):not([disabled])',
                    'button:has-text("삽입"):not([disabled])',
                ]) {
                    for (const ctx of [page, mainFrame]) {
                        const btn = ctx.locator(sel).first();
                        if (await btn.count() > 0 && await btn.isEnabled().catch(() => false)) {
                            await btn.click().catch(() => {});
                            done = true;
                            break;
                        }
                    }
                    if (done) break;
                }
                if (done) break;
            }
            if (!done) console.warn('[NaverUpload] ⚠️ 동영상 인코딩 완료/등록 버튼을 찾지 못해 시간 초과.');
            await page.waitForTimeout(3000);
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

        // 이미지/동영상 URL 다운로드 공통 헬퍼
        const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']);
        const VIDEO_EXTS = new Set(['mp4', 'mov', 'avi', 'webm', 'm4v', 'mkv']);
        const isVideoUrl = (url: string) => {
            const m = url.match(/\.([a-zA-Z0-9]+)(?:[\?#]|$)/);
            return !!m && VIDEO_EXTS.has(m[1].toLowerCase());
        };
        const downloadVideo = async (url: string, idx: number): Promise<string | null> => {
            try {
                const matchExt = url.match(/\.([a-zA-Z0-9]+)(?:[\?#]|$)/);
                const ext = (matchExt ? matchExt[1] : 'mp4').toLowerCase();
                const res = await fetch(url);
                if (!res.ok) return null;
                const buf = await res.arrayBuffer();
                const tmpPath = join(tmpdir(), `naver_video_${Date.now()}_${idx}.${ext}`);
                writeFileSync(tmpPath, Buffer.from(buf));
                return tmpPath;
            } catch (e) {
                console.warn(`[NaverUpload] 동영상 다운로드 실패: ${url}`, e);
                return null;
            }
        };
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
                const mediaUrl = imgMatch[2];
                if (isVideoUrl(mediaUrl)) {
                    // 동영상 → 네이버 동영상 업로드로 삽입
                    const vPath = await downloadVideo(mediaUrl, imgIdxRef.v++);
                    if (vPath) {
                        await focusEditor();
                        await insertVideoAtCursor(vPath);
                        await page.keyboard.press('Enter');
                    }
                    return;
                }
                const tmpPath = await downloadImage(mediaUrl, imgIdxRef.v++);
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
            // FAQ Q/A — 소스는 보통 **Q. ...** (굵게) + A. ... 형태. 굵기 마커를 먼저 제거해 인식한다.
            // ⚠️ Q를 굵게 토글하면 focusEditor(Ctrl+End)가 커서를 이전 줄 끝으로 되돌려
            //    A 답변에 Q가 달라붙거나 문장이 중간에 잘리는 문제가 있음 → FAQ는 '평문'으로 입력해 커서 튐 제거.
            const faqBare = line.replace(/^\s*\*\*/, '').replace(/\*\*\s*$/, '').trim();
            const qMatch = faqBare.match(/^(?:\d+\.\s*)?Q\s*[：:.．]\s*(.+)$/);
            if (qMatch) {
                await typeText('Q. ' + qMatch[1].replace(/\*\*/g, '').trim(), true);
                await page.keyboard.press('Enter');
                return;
            }
            const aMatch = faqBare.match(/^(?:\d+\.\s*)?A\s*[：:.．]\s*(.+)$/);
            if (aMatch) {
                await typeText('A. ' + aMatch[1].replace(/\*\*/g, '').trim());
                await page.keyboard.press('Enter');
                await page.keyboard.press('Enter'); // Q&A 쌍 사이 간격
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
                    // 이미지 마크다운은 일괄 업로드로 처리(스킵)하되, 동영상은 인라인으로 삽입
                    const mm = line.match(/!\[.*?\]\((.*?)\)/);
                    if (mm && !isVideoUrl(mm[1])) continue;
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
