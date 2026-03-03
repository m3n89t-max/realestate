// ============================================================
// packages/shared/types/api.ts
// API 표준 응답 봉투 + 엔드포인트별 Request/Response 타입
// ============================================================

// ============================================================
// Standard Response Envelope
// ============================================================
export interface ApiMeta {
    timestamp: string;
    task_id?: string | null;
    org_id?: string | null;
    version?: string;
}

export interface ApiResponse<T = unknown> {
    data: T | null;
    error: string | null;
    meta: ApiMeta;
}

// ============================================================
// POST /projects — Request
// ============================================================
export interface CreateProjectRequest {
    address: string;
    property_type?: string;
    transaction_type?: string;
    price?: number;
    area?: number;
    summary?: string;
    features?: string;
    images?: string[];
}

// ============================================================
// POST /projects/{id}/generate — Request
// ============================================================
export interface GenerateContentRequest {
    content_types: ('blog' | 'instagram' | 'kakao' | 'shorts')[];
}

// ============================================================
// POST /projects/{id}/documents/summarize — Response
// ============================================================
export interface SummarizeResponse {
    message: string;
}

// ============================================================
// POST /functions/v1/generate-blog — Request / Response
// ============================================================
export interface GenerateBlogRequest {
    project_id: string;
    style?: 'informative' | 'investment' | 'lifestyle';
}

export interface GenerateBlogResponse {
    content_id: string;
    version: number;
    titles: string[];
    content: string;
    meta_description: string;
    tags: string[];
    faq: { q: string; a: string }[];
    alt_tags: Record<string, string>;
    seo_score: {
        keyword_in_title: boolean;
        min_length: boolean;
        has_h2: boolean;
        has_faq: boolean;
        has_alt: boolean;
        longtail_keywords: boolean;
        total_score: number;
    };
}

// ============================================================
// POST /functions/v1/generate-card-news — Request / Response
// ============================================================
export interface GenerateCardNewsRequest {
    project_id: string;
    platform?: 'instagram' | 'kakao';
    card_count?: 6 | 8;
    color_theme?: string;
}

export interface CardSlide {
    order: number;
    title: string;
    body: string;
    highlight: string;
    emoji: string;
    background: string;
}

export interface GenerateCardNewsResponse {
    content_id: string;
    version: number;
    platform: 'instagram' | 'kakao';
    cards: CardSlide[];
}

// ============================================================
// POST /functions/v1/analyze-location — Request / Response
// ============================================================
export interface AnalyzeLocationRequest {
    project_id: string;
}

export interface AnalyzeLocationResponse {
    advantages: string[];
    recommended_targets: {
        type: string;
        reason: string;
        priority: number;
    }[];
    nearby_facilities: {
        transport?: { name: string; distance_m: number; walk_min: number }[];
        school?: { name: string; distance_m: number; walk_min: number }[];
        shopping?: { name: string; distance_m: number; drive_min: number }[];
        hospital?: { name: string; distance_m: number; drive_min: number }[];
        park?: { name: string; distance_m: number; walk_min: number }[];
    };
    analysis_text: string;
}

// ============================================================
// POST /functions/v1/analyze-document — Request / Response
// ============================================================
export interface AnalyzeDocumentRequest {
    document_id: string;
    raw_text?: string;
}

export interface AnalyzeDocumentResponse {
    document_id: string;
    document_type: string;
    summary: {
        usage: string;
        floors: string;
        approved_date: string;
        structure: string;
        total_area: number;
        violation: boolean;
        summary_text: string;
    };
    risk_items: {
        item: string;
        status: 'safe' | 'caution' | 'danger';
        detail: string;
    }[];
    customer_report: string;
    agent_memo: string;
}

// ============================================================
// POST /functions/v1/normalize-parcel — Request / Response
// ============================================================
export interface NormalizeParcelRequest {
    address: string;
    project_id?: string;
}

export interface NormalizeParcelResponse {
    input_address: string;
    road_address: string;
    jibun_address: string;
    lat: number;
    lng: number;
    seumteo_codes: {
        sigunguCd: string;
        bjdongCd: string;
        bun: string;
        ji: string;
    };
    project_updated: boolean;
}

// ============================================================
// POST /functions/v1/generate-shorts-script — Request / Response
// ============================================================
export interface GenerateShortsScriptRequest {
    project_id: string;
    duration: 15 | 30 | 60;
    style?: 'energetic' | 'calm' | 'luxury';
}

export interface ShortsScene {
    order: number;
    duration: number;
    script: string;
    caption: string;
    visual_note: string;
}

export interface GenerateShortsScriptResponse {
    content_id: string;
    version: number;
    duration: number;
    scenes: ShortsScene[];
    full_script: string;
    hashtags: string[];
    thumbnail_text: string;
}

// ============================================================
// POST /functions/v1/seumteo-api — Request / Response
// ============================================================
export interface SeumteoApiRequest {
    project_id: string;
    action?: 'permit_history' | 'floor_plan_list';
}

export interface SeumteoApiResponse {
    action: string;
    project_id: string;
    document_id: string;
    items: Record<string, unknown>[];
    count: number;
}

// ============================================================
// POST /functions/v1/validate-license — Response
// ============================================================
export interface ValidateLicenseResponse {
    org_id: string;
    plan_type: string;
    plan_expires_at: string | null;
    is_expired: boolean;
    features_enabled: string[];
    usage: {
        project_count: number;
        generation_count: number;
        token_usage: number;
        video_render_count: number;
        doc_download_count: number;
    };
    quota: {
        type: string;
        current: number;
        limit: number;
        exceeded: boolean;
        remaining: number;
    };
}

// ============================================================
// POST /functions/v1/webhook-agent — Request / Response
// ============================================================
export interface WebhookAgentBaseRequest {
    event: string;
    agent_key: string;
}

export interface WebhookHeartbeatRequest extends WebhookAgentBaseRequest {
    event: 'heartbeat';
    status: 'online' | 'busy';
    version: string;
}

export interface WebhookTaskStartedRequest extends WebhookAgentBaseRequest {
    event: 'task_started';
    task_id: string;
}

export interface WebhookTaskProgressRequest extends WebhookAgentBaseRequest {
    event: 'task_progress';
    task_id: string;
    message: string;
    level: 'info' | 'warn' | 'error';
    progress_pct: number;
}

export interface WebhookTaskCompletedRequest extends WebhookAgentBaseRequest {
    event: 'task_completed';
    task_id: string;
    result: Record<string, unknown>;
}

export interface WebhookTaskFailedRequest extends WebhookAgentBaseRequest {
    event: 'task_failed';
    task_id: string;
    error_code: string;
    error_message: string;
    retry: boolean;
}

export interface WebhookDocumentUploadedRequest extends WebhookAgentBaseRequest {
    event: 'document_uploaded';
    project_id: string;
    document_type: 'building_register' | 'floor_plan' | 'permit_history';
    file_url: string;
    file_name: string;
    raw_text?: string;
}

export type WebhookAgentRequest =
    | WebhookHeartbeatRequest
    | WebhookTaskStartedRequest
    | WebhookTaskProgressRequest
    | WebhookTaskCompletedRequest
    | WebhookTaskFailedRequest
    | WebhookDocumentUploadedRequest;

export interface WebhookAgentResponse {
    event: string;
    acknowledged: boolean;
}
