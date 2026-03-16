import { createClient, RealtimeChannel } from '@supabase/supabase-js';
import { getConfig, AgentConfig } from './config';
import {
    sendHeartbeat,
    sendTaskStarted,
    sendTaskProgress,
    sendTaskCompleted,
    sendTaskFailed,
    getPendingTasks,
    claimTaskViaWebhook,
} from './webhook-client';
import { downloadBuildingRegister } from './playwright/building_register';
import { downloadCadastralMap } from './playwright/cadastral_map';
import { uploadNaverBlog } from './playwright/naver_upload';
import { uploadYoutube } from './playwright/youtube_upload';
import { uploadInstagram } from './playwright/instagram_upload';
import { startUIServer } from './ui/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

const LOG_DIR = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'RealEstateAIOS');
const LOG_FILE = path.join(LOG_DIR, 'agent.log');

function log(msg: string) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${msg}\n`;
    console.log(msg);
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, line);
}

// ============================================================
// 에이전트가 처리하는 작업 유형 (agent-protocol.md)
// ============================================================
const AGENT_TASK_TYPES = [
    'building_register',
    'download_building_register',
    'download_cadastral_map',
    'naver_upload',
    'upload_naver_blog',
    'youtube_upload',
    'upload_youtube',
    'instagram_upload',
    'upload_instagram',
    'poi_analysis',
    'location_analysis',
    'commercial_analysis',
    'blog_generation',
    'cardnews_generation',
    'shorts_generation'
];

const HEARTBEAT_INTERVAL = 30_000; // 30초
const POLL_INTERVAL = 30_000;      // Realtime 실패 시 폴백 폴링 30초

// ============================================================
// Main Agent Class
// ============================================================
class LocalAgent {
    private config!: AgentConfig;
    private supabase: any;
    private orgId: string = '';
    private agentConnectionId: string = '';
    private channel: RealtimeChannel | null = null;
    private heartbeatTimer: NodeJS.Timeout | null = null;
    private pollTimer: NodeJS.Timeout | null = null;
    private isProcessing = false;
    private isShuttingDown = false;

    constructor() {
        // config는 start() 호출 시점에 로드 (설정 완료 후 실행 보장)
    }

    // ============================================================
    // 시작
    // ============================================================
    async start() {
        this.config = getConfig();
        log(`[Config] Supabase URL: ${this.config.supabase_url}`);
        log(`[Config] Agent Name: ${this.config.agent_name}`);
        log(`[Config] Agent Key: ${this.config.agent_key ? '설정됨' : '미설정'}`);

        this.supabase = createClient(
            this.config.supabase_url,
            this.config.supabase_anon_key,
            {
                global: {
                    headers: {
                        'x-agent-key': this.config.agent_key || '',
                        'X-Agent-Key': this.config.agent_key || '', // 대소문자 문제 방지
                    },
                },
            }
        );

        log('===========================================');
        log('  RealEstate AI OS — Local Agent v' + this.config.version);
        log('  Agent: ' + this.config.agent_name);
        log('===========================================');

        // 1. Heartbeat으로 agent_key 검증 & org_id 확보
        await this.validateAndRegister();

        // 2. Graceful shutdown 핸들러
        this.setupShutdownHandlers();

        // 3. Heartbeat 타이머 시작
        this.startHeartbeat();

        // 4. Realtime 구독 시도
        await this.subscribeRealtime();

        // 5. 정기 폴링 시작 (Realtime과 병행하여 안전성 확보)
        this.startFallbackPolling();

        // 6. 로컬 UI 설정 서버 시작
        startUIServer();

        console.log('[Agent] 에이전트가 정상 가동되었습니다. 작업 대기 중...');
    }

    // ============================================================
    // 1. 검증 & 등록
    // ============================================================
    private async validateAndRegister() {
        console.log('[Agent] agent_key 검증 중...');

        if (!this.config.agent_key) {
            console.warn('[Agent] agent_key 미설정. DB 직접 폴링 모드로 동작합니다.');
            // agent_key 없는 경우 service role key로 직접 DB 접근 (개발 모드)
            this.startFallbackPolling();
            return;
        }

        try {
            const res = await sendHeartbeat(this.config, 'online');
            if (res?.error) {
                throw new Error(res.error);
            }
            log('[Agent] ✅ agent_key 검증 완료');

            // org_id & agent_id는 heartbeat 응답에서 직접 추출 (RLS 우회)
            if (res?.org_id) {
                this.orgId = res.org_id;
                this.agentConnectionId = res.agent_id ?? '';
                log(`[Agent] org_id: ${this.orgId}`);
            } else {
                log('[Agent] heartbeat 응답에 org_id 없음. 폴백 폴링 모드.');
                this.startFallbackPolling();
            }
        } catch (err: any) {
            log(`[Agent] 검증 실패: ${err.message}`);
            log('[Agent] 폴백 폴링 모드로 전환합니다.');
            this.startFallbackPolling();
        }
    }

    // ============================================================
    // 2. Graceful Shutdown
    // ============================================================
    private setupShutdownHandlers() {
        const shutdown = async () => {
            if (this.isShuttingDown) return;
            this.isShuttingDown = true;
            console.log('\n[Agent] 종료 시작...');

            if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
            if (this.pollTimer) clearTimeout(this.pollTimer);

            // offline 상태 전송
            if (this.config.agent_key) {
                try {
                    await sendHeartbeat(this.config, 'offline');
                } catch { /* ignore */ }
            }

            // Realtime 구독 해제
            if (this.channel) {
                await this.supabase.removeChannel(this.channel);
            }

            console.log('[Agent] 👋 에이전트가 종료되었습니다.');
            process.exit(0);
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
        process.on('SIGHUP', shutdown);
    }

    // ============================================================
    // 3. Heartbeat
    // ============================================================
    private startHeartbeat() {
        if (!this.config.agent_key) return;

        this.heartbeatTimer = setInterval(async () => {
            try {
                const status = this.isProcessing ? 'busy' : 'online';
                log(`[Heartbeat] 전송 중 (${status})...`);
                const res = await sendHeartbeat(this.config, status);
                if (res?.error) log(`[Heartbeat] 서버 응답 에러: ${res.error}`);
            } catch (err: any) {
                log(`[Heartbeat] 전송 실패: ${err.message}`);
            }
        }, HEARTBEAT_INTERVAL);
    }

    // ============================================================
    // 4. Realtime 구독
    // ============================================================
    private async subscribeRealtime() {
        if (!this.orgId) {
            log('[Agent] org_id 미확인, Realtime 구독을 건너뛰고 폴링만 수행합니다.');
            return;
        }

        console.log('[Agent] Supabase Realtime 구독 시작...');

        this.channel = this.supabase
            .channel('agent-tasks')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'tasks',
                    filter: `org_id=eq.${this.orgId}`,
                },
                (payload: any) => this.handleNewTask(payload.new)
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'tasks',
                    filter: `org_id=eq.${this.orgId}`,
                },
                (payload: any) => {
                    if (payload.new.status === 'retrying') {
                        this.scheduleRetry(payload.new);
                    }
                }
            )
            .subscribe((status: string) => {
                if (status === 'SUBSCRIBED') {
                    log('[Agent] ✅ Realtime 구독 성공');
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    log(`[Agent] ⚠️ Realtime 연결 실패 (상태: ${status}), 폴백 폴링에 의존합니다.`);
                } else {
                    log(`[Agent] Realtime 상태 변경: ${status}`);
                }
            });
    }

    // ============================================================
    // 5. 폴백 폴링
    // ============================================================
    private startFallbackPolling() {
        if (this.pollTimer) return;
        console.log('[Agent] 폴링 모드 활성화');

        const poll = async () => {
            if (this.isShuttingDown) return;
            await this.catchUpPendingTasks();
            this.pollTimer = setTimeout(poll, POLL_INTERVAL);
        };

        poll();
    }

    // ============================================================
    // 6. 밀린 작업 처리
    // ============================================================
    async catchUpPendingTasks() {
        try {
            if (!this.orgId || !this.config.agent_key) {
                return;
            }

            log(`[Poll] 작업 확인 중... (webhook 경유)`);

            const tasks = await getPendingTasks(this.config);

            if (tasks.length > 0) {
                log(`[Poll] 대기 작업 ${tasks.length}건 발견`);
                for (const task of tasks) {
                    if (AGENT_TASK_TYPES.includes(task.type)) {
                        await this.handleNewTask(task);
                    }
                }
            }
        } catch (err: any) {
            console.error('[Poll] 에러:', err.message);
        }
    }

    // ============================================================
    // 7. 새 작업 수신 핸들러
    // ============================================================
    private async handleNewTask(task: any) {
        // 에이전트 담당 타입인지 확인
        if (!AGENT_TASK_TYPES.includes(task.type)) return;
        if (task.status !== 'pending' && task.status !== 'retrying') return;
        if (this.isProcessing) return; // 현재 작업 중이면 스킵

        // Optimistic Lock — 다른 에이전트가 먼저 claim 하면 실패
        const claimed = await this.claimTask(task.id);
        if (!claimed) {
            console.log(`[Agent] 작업 ${task.id} claim 실패 (이미 다른 에이전트가 처리 중)`);
            return;
        }

        this.isProcessing = true;
        console.log(`[Agent] 📋 작업 시작: ${task.type} (${task.id})`);

        try {
            // webhook: task_started 전송
            if (this.config.agent_key) {
                await sendTaskStarted(this.config, task.id);
            }

            // 작업 타입별 실행
            let result: Record<string, unknown> = {};

            switch (task.type) {
                case 'building_register':
                case 'download_building_register':
                    result = await downloadBuildingRegister(task, this.config);
                    break;

                case 'download_cadastral_map':
                    result = await downloadCadastralMap(task, this.config);
                    break;

                case 'naver_upload':
                case 'upload_naver_blog':
                    result = await uploadNaverBlog(task, this.config);
                    break;

                case 'youtube_upload':
                case 'upload_youtube':
                    result = await uploadYoutube(task, this.config);
                    break;

                case 'instagram_upload':
                case 'upload_instagram':
                    result = await uploadInstagram(task, this.config);
                    break;

                // TEAM 4: Content Engine & Automation Skeleton
                case 'poi_analysis':
                    console.log(`[Agent] POI 분석 실행 (ID: ${task.id})`);
                    result = { message: 'POI analysis completed (stub)' };
                    break;
                case 'location_analysis':
                    console.log(`[Agent] 입지 분석 실행 (ID: ${task.id})`);
                    result = { message: 'Location analysis completed (stub)' };
                    break;
                case 'commercial_analysis':
                    console.log(`[Agent] 상권 분석 실행 (ID: ${task.id})`);
                    result = { message: 'Commercial analysis completed (stub)' };
                    break;
                case 'blog_generation':
                    console.log(`[Agent] 블로그 생성 실행 (ID: ${task.id})`);
                    result = { message: 'Blog generation completed (stub)' };
                    break;
                case 'cardnews_generation':
                    console.log(`[Agent] 카드뉴스 생성 실행 (ID: ${task.id})`);
                    result = { message: 'Cardnews generation completed (stub)' };
                    break;
                case 'shorts_generation':
                    console.log(`[Agent] 쇼츠 스크립트 생성 실행 (ID: ${task.id})`);
                    result = { message: 'Shorts generation completed (stub)' };
                    break;

                default:
                    throw new Error(`지원하지 않는 작업 유형: ${task.type}`);
            }

            // webhook: task_completed 전송
            if (this.config.agent_key) {
                await sendTaskCompleted(this.config, task.id, result);
            } else {
                // agent_key 없는 개발 모드: 직접 DB 업데이트
                await this.supabase
                    .from('tasks')
                    .update({
                        status: 'success',
                        result,
                        completed_at: new Date().toISOString(),
                    })
                    .eq('id', task.id);
            }

            console.log(`[Agent] ✅ 작업 완료: ${task.type}`);

        } catch (err: any) {
            console.error(`[Agent] ❌ 작업 실패: ${err.message}`);

            const errorCode = this.classifyError(err);

            if (this.config.agent_key) {
                await sendTaskFailed(this.config, task.id, errorCode, err.message, true);
            } else {
                await this.supabase
                    .from('tasks')
                    .update({
                        status: 'failed',
                        error_code: errorCode,
                        error_message: err.message,
                        completed_at: new Date().toISOString(),
                    })
                    .eq('id', task.id);
            }
        } finally {
            this.isProcessing = false;
        }
    }

    // ============================================================
    // 8. Optimistic Lock
    // ============================================================
    private async claimTask(taskId: string): Promise<boolean> {
        if (this.config.agent_key) {
            return claimTaskViaWebhook(this.config, taskId);
        }
        // agent_key 없는 개발 모드: 직접 DB 업데이트
        const { data, error } = await this.supabase
            .from('tasks')
            .update({
                status: 'running',
                agent_id: this.agentConnectionId || undefined,
                started_at: new Date().toISOString(),
            })
            .eq('id', taskId)
            .in('status', ['pending', 'retrying'])
            .select();
        if (error || !data || data.length === 0) return false;
        return true;
    }

    // ============================================================
    // 9. Retry 스케줄링
    // ============================================================
    private scheduleRetry(task: any) {
        const scheduledAt = new Date(task.scheduled_at).getTime();
        const delayMs = Math.max(scheduledAt - Date.now(), 0);
        console.log(`[Agent] ⏳ 재시도 예약: ${task.type} (${Math.round(delayMs / 1000)}초 후)`);
        setTimeout(() => this.handleNewTask({ ...task, status: 'retrying' }), delayMs);
    }

    // ============================================================
    // 10. 에러 분류
    // ============================================================
    private classifyError(err: any): string {
        const msg = (err.message || '').toLowerCase();
        if (msg.includes('login') || msg.includes('로그인')) return 'LOGIN_FAILED';
        if (msg.includes('captcha')) return 'CAPTCHA_TIMEOUT';
        if (msg.includes('not found') || msg.includes('검색 결과 없음')) return 'SEARCH_NOT_FOUND';
        if (msg.includes('download') || msg.includes('다운로드')) return 'DOWNLOAD_FAILED';
        if (msg.includes('upload') || msg.includes('업로드')) return 'UPLOAD_FAILED';
        if (msg.includes('network') || msg.includes('fetch')) return 'NETWORK_ERROR';
        if (msg.includes('browser') || msg.includes('playwright')) return 'BROWSER_CRASH';
        if (msg.includes('점검') || msg.includes('maintenance')) return 'SITE_MAINTENANCE';
        return 'UNKNOWN_ERROR';
    }
}

// ============================================================
// 에이전트 인터페이스 (main.ts에서 제어)
// ============================================================
export const agent = new LocalAgent();

// CLI 실행 지원: node worker.ts 로 직접 실행 시 에이전트 시작
if (require.main === module) {
    agent.start().catch((err: any) => {
        console.error('[Agent] 시작 중 치명적 오류:', err);
    });
}

