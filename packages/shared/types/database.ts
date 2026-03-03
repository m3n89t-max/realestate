// ============================================================
// packages/shared/types/database.ts
// Supabase 테이블에 대응하는 TypeScript 인터페이스
// ============================================================

import type {
    TaskTypeValue,
    TaskStatusValue,
    ProjectStatusValue,
    PropertyTypeValue,
    MembershipRoleValue,
    DocumentTypeValue,
    ContentTypeValue,
    AssetTypeValue,
    PlanTypeValue,
    AgentStatusValue,
    LogLevelValue,
    TemplateTypeValue,
} from './enums';

// ============================================================
// 1. organizations
// ============================================================
export interface Organization {
    id: string;
    name: string;
    logo_url: string | null;
    phone: string | null;
    address: string | null;
    business_number: string | null;
    plan_type: PlanTypeValue;
    plan_expires_at: string | null;
    monthly_project_limit: number;
    created_at: string;
    updated_at: string;
}

// ============================================================
// 2. users
// ============================================================
export interface User {
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
    created_at: string;
}

// ============================================================
// 3. memberships
// ============================================================
export interface Membership {
    id: string;
    org_id: string;
    user_id: string;
    role: MembershipRoleValue;
    invited_at: string;
    joined_at: string | null;
}

// ============================================================
// 4. projects
// ============================================================
export interface Project {
    id: string;
    org_id: string;
    created_by: string | null;
    address: string;
    jibun_address: string | null;
    lat: number | null;
    lng: number | null;
    property_type: PropertyTypeValue | null;
    price: number | null;
    monthly_rent: number | null;
    area: number | null;
    floor: number | null;
    total_floors: number | null;
    direction: string | null;
    features: string[] | null;
    status: ProjectStatusValue;
    cover_image_url: string | null;
    note: string | null;
    created_at: string;
    updated_at: string;
}

// ============================================================
// 5. assets
// ============================================================
export interface Asset {
    id: string;
    project_id: string;
    org_id: string;
    type: AssetTypeValue;
    category: string | null;
    file_name: string | null;
    file_url: string;
    file_size: number | null;
    mime_type: string | null;
    width: number | null;
    height: number | null;
    alt_text: string | null;
    is_cover: boolean;
    sort_order: number;
    created_at: string;
}

// ============================================================
// 6. generated_contents
// ============================================================
export interface GeneratedContent {
    id: string;
    project_id: string;
    org_id: string;
    type: ContentTypeValue;
    title: string | null;
    content: string;
    meta_description: string | null;
    tags: string[] | null;
    seo_score: SeoScore | null;
    faq: FaqItem[] | null;
    version: number;
    is_published: boolean;
    published_url: string | null;
    template_id: string | null;
    created_at: string;
    updated_at: string;
}

export interface SeoScore {
    keyword_in_title: boolean;
    min_length: boolean;
    has_h2: boolean;
    has_faq: boolean;
    has_alt: boolean;
    longtail_keywords: boolean;
    total_score: number;
}

export interface FaqItem {
    q: string;
    a: string;
}

// ============================================================
// 7. location_analyses
// ============================================================
export interface LocationAnalysis {
    id: string;
    project_id: string;
    advantages: string[] | null;
    recommended_targets: RecommendedTarget[] | null;
    nearby_facilities: NearbyFacilities | null;
    analysis_text: string | null;
    created_at: string;
}

export interface RecommendedTarget {
    type: string;
    reason: string;
    priority: number;
}

export interface NearbyFacilities {
    transport?: FacilityItem[];
    school?: FacilityItem[];
    shopping?: FacilityItem[];
    hospital?: FacilityItem[];
    park?: FacilityItem[];
}

export interface FacilityItem {
    name: string;
    distance_m: number;
    walk_min?: number;
    drive_min?: number;
}

// ============================================================
// 8. documents
// ============================================================
export interface Document {
    id: string;
    project_id: string;
    org_id: string;
    type: DocumentTypeValue;
    file_url: string | null;
    file_name: string | null;
    raw_text: string | null;
    summary: DocumentSummary | null;
    risk_items: RiskItem[] | null;
    created_at: string;
}

export interface DocumentSummary {
    usage: string;
    floors: string;
    approved_date: string;
    structure: string;
    total_area: number;
    violation: boolean;
    summary_text: string;
}

export interface RiskItem {
    item: string;
    status: 'safe' | 'caution' | 'danger';
    detail: string;
}

// ============================================================
// 9. tasks
// ============================================================
export interface Task {
    id: string;
    org_id: string;
    project_id: string | null;
    type: TaskTypeValue;
    status: TaskStatusValue;
    payload: Record<string, unknown> | null;
    result: Record<string, unknown> | null;
    error_code: string | null;
    error_message: string | null;
    retry_count: number;
    max_retries: number;
    progress_pct: number;
    agent_id: string | null;
    scheduled_at: string;
    started_at: string | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
}

// ============================================================
// 10. task_logs
// ============================================================
export interface TaskLog {
    id: string;
    task_id: string;
    level: LogLevelValue;
    message: string;
    created_at: string;
}

// ============================================================
// 11. usage_logs
// ============================================================
export interface UsageLog {
    id: string;
    org_id: string;
    year: number;
    month: number;
    project_count: number;
    generation_count: number;
    token_usage: number;
    video_render_count: number;
    doc_download_count: number;
}

// ============================================================
// 12. templates
// ============================================================
export interface Template {
    id: string;
    org_id: string | null;
    type: TemplateTypeValue;
    name: string;
    description: string | null;
    structure: Record<string, unknown> | null;
    variables: string[] | null;
    is_default: boolean;
    is_public: boolean;
    created_at: string;
}

// ============================================================
// 13. agent_connections
// ============================================================
export interface AgentConnection {
    id: string;
    org_id: string;
    agent_key: string;
    name: string | null;
    platform: string;
    version: string | null;
    status: AgentStatusValue;
    last_seen_at: string | null;
    created_at: string;
    updated_at: string;
}
