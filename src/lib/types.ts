// ============================================================
// RealEstate AI OS - TypeScript 타입 정의
// ============================================================

export type PlanType = 'free' | 'pro' | 'premium'
export type UserRole = 'owner' | 'admin' | 'editor' | 'viewer'
export type PropertyType = 'apartment' | 'officetel' | 'villa' | 'commercial' | 'land' | 'house'
export type ProjectStatus = 'draft' | 'active' | 'completed' | 'archived'
export type ContentType = 'blog' | 'card_news' | 'video_script' | 'location_analysis' | 'doc_summary'
export type TaskType = 'naver_upload' | 'youtube_upload' | 'building_register' | 'seumteo_api' | 'video_render' | 'pdf_merge'
export type TaskStatus = 'pending' | 'running' | 'success' | 'failed' | 'retrying' | 'cancelled'
export type AssetType = 'image' | 'video' | 'document' | 'card_news'
export type DocumentType = 'building_register' | 'floor_plan' | 'permit_history' | 'risk_report' | 'package_pdf'

// ============================================================
// DB 엔티티 타입
// ============================================================

export interface Organization {
  id: string
  name: string
  logo_url?: string
  phone?: string
  address?: string
  business_number?: string
  plan_type: PlanType
  plan_expires_at?: string
  monthly_project_limit: number
  created_at: string
  updated_at: string
}

export interface User {
  id: string
  email: string
  full_name?: string
  avatar_url?: string
  created_at: string
}

export interface Membership {
  id: string
  org_id: string
  user_id: string
  role: UserRole
  invited_at: string
  joined_at?: string
  user?: User
  organization?: Organization
}

export interface Project {
  id: string
  org_id: string
  created_by?: string
  address: string
  jibun_address?: string
  lat?: number
  lng?: number
  property_type?: PropertyType
  price?: number
  monthly_rent?: number
  area?: number
  floor?: number
  total_floors?: number
  direction?: string
  features?: string[]
  status: ProjectStatus
  cover_image_url?: string
  note?: string
  created_at: string
  updated_at: string
}

export interface Asset {
  id: string
  project_id: string
  org_id: string
  type: AssetType
  category?: string
  file_name?: string
  file_url: string
  file_size?: number
  mime_type?: string
  width?: number
  height?: number
  alt_text?: string
  is_cover: boolean
  sort_order: number
  created_at: string
}

export interface SeoScore {
  keyword_in_title: boolean
  min_length: boolean
  has_h2: boolean
  has_faq: boolean
  has_alt: boolean
  longtail_keywords: boolean
  total_score: number
}

export interface FaqItem {
  q: string
  a: string
}

export interface GeneratedContent {
  id: string
  project_id: string
  org_id: string
  type: ContentType
  title?: string
  content: string
  meta_description?: string
  tags?: string[]
  seo_score?: SeoScore
  faq?: FaqItem[]
  version: number
  is_published: boolean
  published_url?: string
  template_id?: string
  created_at: string
  updated_at: string
}

export interface LocationAnalysis {
  id: string
  project_id: string
  advantages?: string[]
  recommended_targets?: RecommendedTarget[]
  nearby_facilities?: NearbyFacilities
  analysis_text?: string
  created_at: string
}

export interface RecommendedTarget {
  type: string
  reason: string
  priority: number
}

export interface NearbyFacilities {
  transport: FacilityItem[]
  school: FacilityItem[]
  shopping: FacilityItem[]
  hospital: FacilityItem[]
  park: FacilityItem[]
}

export interface FacilityItem {
  name: string
  distance_m: number
  walk_min?: number
  drive_min?: number
}

export interface Document {
  id: string
  project_id: string
  org_id: string
  type: DocumentType
  file_url?: string
  file_name?: string
  raw_text?: string
  summary?: DocumentSummary
  risk_items?: RiskItem[]
  created_at: string
}

export interface DocumentSummary {
  usage?: string
  floors?: string
  approved_date?: string
  structure?: string
  total_area?: number
  violation?: boolean
  summary_text?: string
}

export interface RiskItem {
  item: string
  status: 'safe' | 'caution' | 'danger'
  detail?: string
}

export interface Task {
  id: string
  org_id: string
  project_id?: string
  type: TaskType
  status: TaskStatus
  payload?: Record<string, unknown>
  result?: Record<string, unknown>
  error_code?: string
  error_message?: string
  retry_count: number
  max_retries: number
  agent_id?: string
  scheduled_at: string
  started_at?: string
  completed_at?: string
  created_at: string
  project?: Project
}

export interface TaskLog {
  id: string
  task_id: string
  level: 'info' | 'warn' | 'error'
  message: string
  created_at: string
}

export interface UsageLog {
  id: string
  org_id: string
  year: number
  month: number
  project_count: number
  generation_count: number
  token_usage: number
  video_render_count: number
  doc_download_count: number
}

export interface Template {
  id: string
  org_id?: string
  type: 'blog' | 'card_news' | 'video'
  name: string
  description?: string
  structure?: Record<string, unknown>
  variables?: string[]
  is_default: boolean
  is_public: boolean
  created_at: string
}

export interface AgentConnection {
  id: string
  org_id: string
  agent_key: string
  name?: string
  platform: string
  version?: string
  status: 'online' | 'offline' | 'busy'
  last_seen_at?: string
  created_at: string
}

// ============================================================
// API Request/Response 타입
// ============================================================

export interface GenerateBlogRequest {
  project_id: string
  style?: 'informative' | 'investment' | 'lifestyle'
}

export interface GenerateBlogResponse {
  titles: string[]
  content: string
  meta_description: string
  tags: string[]
  seo_score: SeoScore
  faq: FaqItem[]
  alt_tags: Record<string, string>
}

export interface GenerateCardNewsRequest {
  project_id: string
  card_count?: 6 | 8
  color_theme?: string
}

export interface CardNewsSlide {
  order: number
  title: string
  body: string
  highlight?: string
  emoji?: string
  background?: string
}

export interface GenerateVideoScriptRequest {
  project_id: string
  duration: 15 | 30 | 60
}

export interface VideoScript {
  duration: number
  scenes: VideoScene[]
  full_script: string
}

export interface VideoScene {
  order: number
  duration: number
  script: string
  caption: string
  visual_note: string
}

// ============================================================
// UI 상태 타입
// ============================================================

export interface QuotaInfo {
  org_id: string
  plan_type: PlanType
  type: string
  current: number
  limit: number
  exceeded: boolean
  remaining: number
}

export interface DashboardStats {
  total_projects: number
  active_projects: number
  monthly_generation_count: number
  monthly_token_usage: number
  pending_tasks: number
  agent_status: 'online' | 'offline' | 'busy'
}

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  apartment: '아파트',
  officetel: '오피스텔',
  villa: '빌라/다세대',
  commercial: '상가/사무실',
  land: '토지',
  house: '단독주택',
}

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: '작성중',
  active: '진행중',
  completed: '완료',
  archived: '보관',
}

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  naver_upload: '네이버 업로드',
  youtube_upload: '유튜브 업로드',
  building_register: '건축물대장 수집',
  seumteo_api: '세움터 조회',
  video_render: '영상 렌더링',
  pdf_merge: 'PDF 패키지 생성',
}

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: '대기중',
  running: '진행중',
  success: '완료',
  failed: '실패',
  retrying: '재시도중',
  cancelled: '취소됨',
}

export const ROLE_LABELS: Record<UserRole, string> = {
  owner: '소유자',
  admin: '관리자',
  editor: '편집자',
  viewer: '뷰어',
}
