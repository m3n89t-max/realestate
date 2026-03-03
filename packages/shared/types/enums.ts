// ============================================================
// packages/shared/types/enums.ts
// 모든 DB enum 상수 — SQL 제약조건과 1:1 매핑
// ============================================================

/** Task type enum (005_task_extensions + 개발정의서 v3.0) */
export const TaskType = {
    // V3 core tasks
    NORMALIZE_PARCEL: 'normalize_parcel',
    LOCATION_ANALYZE: 'location_analyze',
    DOWNLOAD_BUILDING_REGISTER: 'download_building_register',
    DOWNLOAD_CADASTRAL_MAP: 'download_cadastral_map',
    SUMMARIZE_DOCUMENTS: 'summarize_documents',
    GENERATE_BLOG: 'generate_blog',
    GENERATE_CARDS_INSTAGRAM: 'generate_cards_instagram',
    GENERATE_CARDS_KAKAO: 'generate_cards_kakao',
    GENERATE_SHORTS_SCRIPT: 'generate_shorts_script',
    RENDER_SHORTS_VIDEO: 'render_shorts_video',
    UPLOAD_NAVER_BLOG: 'upload_naver_blog',
    UPLOAD_YOUTUBE: 'upload_youtube',
    // Legacy agent tasks
    NAVER_UPLOAD: 'naver_upload',
    YOUTUBE_UPLOAD: 'youtube_upload',
    BUILDING_REGISTER: 'building_register',
    SEUMTEO_API: 'seumteo_api',
    VIDEO_RENDER: 'video_render',
    PDF_MERGE: 'pdf_merge',
} as const;

export type TaskTypeValue = (typeof TaskType)[keyof typeof TaskType];

/** Task status enum (007_schema_fixes: pending → queued) */
export const TaskStatus = {
    QUEUED: 'queued',
    RUNNING: 'running',
    SUCCESS: 'success',
    FAILED: 'failed',
    RETRYING: 'retrying',
    CANCELLED: 'cancelled',
} as const;

export type TaskStatusValue = (typeof TaskStatus)[keyof typeof TaskStatus];

/** Project status */
export const ProjectStatus = {
    DRAFT: 'draft',
    ACTIVE: 'active',
    COMPLETED: 'completed',
    ARCHIVED: 'archived',
} as const;

export type ProjectStatusValue = (typeof ProjectStatus)[keyof typeof ProjectStatus];

/** Property type */
export const PropertyType = {
    APARTMENT: 'apartment',
    OFFICETEL: 'officetel',
    VILLA: 'villa',
    COMMERCIAL: 'commercial',
    LAND: 'land',
    HOUSE: 'house',
} as const;

export type PropertyTypeValue = (typeof PropertyType)[keyof typeof PropertyType];

/** Membership role */
export const MembershipRole = {
    OWNER: 'owner',
    ADMIN: 'admin',
    EDITOR: 'editor',
    VIEWER: 'viewer',
} as const;

export type MembershipRoleValue = (typeof MembershipRole)[keyof typeof MembershipRole];

/** Document type (007_schema_fixes: cadastral_map 추가) */
export const DocumentType = {
    BUILDING_REGISTER: 'building_register',
    FLOOR_PLAN: 'floor_plan',
    PERMIT_HISTORY: 'permit_history',
    RISK_REPORT: 'risk_report',
    PACKAGE_PDF: 'package_pdf',
    CADASTRAL_MAP: 'cadastral_map',
} as const;

export type DocumentTypeValue = (typeof DocumentType)[keyof typeof DocumentType];

/** Generated content type (007_schema_fixes: shorts_script 추가) */
export const ContentType = {
    BLOG: 'blog',
    CARD_NEWS: 'card_news',
    VIDEO_SCRIPT: 'video_script',
    LOCATION_ANALYSIS: 'location_analysis',
    DOC_SUMMARY: 'doc_summary',
    SHORTS_SCRIPT: 'shorts_script',
} as const;

export type ContentTypeValue = (typeof ContentType)[keyof typeof ContentType];

/** Asset type */
export const AssetType = {
    IMAGE: 'image',
    VIDEO: 'video',
    DOCUMENT: 'document',
    CARD_NEWS: 'card_news',
} as const;

export type AssetTypeValue = (typeof AssetType)[keyof typeof AssetType];

/** Plan type */
export const PlanType = {
    FREE: 'free',
    PRO: 'pro',
    PREMIUM: 'premium',
} as const;

export type PlanTypeValue = (typeof PlanType)[keyof typeof PlanType];

/** Agent status */
export const AgentStatus = {
    ONLINE: 'online',
    OFFLINE: 'offline',
    BUSY: 'busy',
} as const;

export type AgentStatusValue = (typeof AgentStatus)[keyof typeof AgentStatus];

/** Task log level */
export const LogLevel = {
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error',
} as const;

export type LogLevelValue = (typeof LogLevel)[keyof typeof LogLevel];

/** Template type */
export const TemplateType = {
    BLOG: 'blog',
    CARD_NEWS: 'card_news',
    VIDEO: 'video',
} as const;

export type TemplateTypeValue = (typeof TemplateType)[keyof typeof TemplateType];
