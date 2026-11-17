/** main, preload, renderer가 함께 쓰는 데이터 타입 */

/**
 * 글 상태. (docs/DECISIONS.md "글 상태")
 * - old: 이웃을 처음 등록할 때 RSS에 이미 있던 글. 목록에 보이지 않는다.
 */
export type PostStatus = 'new' | 'read' | 'commented' | 'skipped' | 'old'

export type Speech = 'polite' | 'casual'
export type Closeness = 1 | 2 | 3

export interface Neighbor {
  id: number
  blogId: string
  /** 표시 이름. 기본값은 블로그 제목 */
  nickname: string
  blogTitle: string | null
  /** 초안에서 부를 호칭 (예: "봄비님") */
  honorific: string
  speech: Speech
  closeness: Closeness
  memo: string
  createdAt: string
  lastCheckedAt: string | null
  failCount: number
  /** 이 이웃에게 마지막으로 댓글을 등록한 시각 */
  lastCommentAt: string | null
  /** 아직 처리하지 않은 새 글 수 */
  pendingCount: number
}

export type NeighborPatch = Partial<Pick<Neighbor, 'nickname' | 'honorific' | 'speech' | 'closeness' | 'memo'>>

export interface Post {
  id: number
  neighborId: number
  blogId: string
  neighborName: string
  logNo: string
  title: string
  url: string
  category: string | null
  tags: string[]
  excerpt: string
  publishedAt: string
  discoveredAt: string
  status: PostStatus
  liked: boolean
  openedAt: string | null
  actedAt: string | null
}

export interface QuietHours {
  enabled: boolean
  /** "HH:MM" */
  start: string
  end: string
}

export interface ToneSpec {
  name: string
  description: string
}

export interface AiSettings {
  /** OpenAI 호환 API 주소 (예: https://api.openai.com/v1) */
  baseUrl: string
  model: string
  /** 글이 열리면 초안 자동 생성 */
  autoGenerate: boolean
  /** 본문 이미지도 AI에 보내기 (비전 모델 전용, 최대 4장) */
  sendImages: boolean
  tones: ToneSpec[]
  /** 프롬프트에 넣는 예시 개수 */
  examples: { recent: number; neighbor: number; pairs: number }
}

export interface Settings {
  checkIntervalMinutes: number
  quietHours: QuietHours
  launchAtLogin: boolean
  myBlogId: string | null
  paneWidths: { left: number; right: number }
  rightCollapsed: boolean
  ai: AiSettings
  /** API 키 저장 여부 (키 자체는 renderer로 보내지 않는다) */
  hasApiKey: boolean
}

/** 지금 웹뷰에 열린 글 */
export interface CurrentPost {
  blogId: string
  logNo: string
  title: string
  url: string
  /** 출석부에 있는 글이면 그 id */
  postId: number | null
  neighborId: number | null
  liked: boolean
}

export interface DraftItem {
  id: number
  tone: string
  text: string
}

export interface DraftsState {
  blogId: string
  logNo: string
  status: 'idle' | 'loading' | 'ready' | 'error'
  drafts: DraftItem[]
  error: string | null
  /** 설정이 덜 되어 생성하지 못함 */
  needsSetup: boolean
}

export interface CommentRecord {
  id: number
  blogId: string
  logNo: string
  postTitle: string
  text: string
  draftText: string | null
  draftTone: string | null
  isSecret: boolean
  status: 'pending' | 'confirmed' | 'failed'
  clickedAt: string
  confirmedAt: string | null
}

export interface CheckStatus {
  running: boolean
  lastCheckedAt: string | null
  nextCheckAt: string | null
  /** 진행 중일 때 "3/12" 같은 진행도 */
  progress: { done: number; total: number } | null
  lastError: string | null
}

export interface NaverViewState {
  visible: boolean
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  loggedIn: boolean
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export type AddNeighborResult =
  | { ok: true; neighbor: Neighbor }
  | { ok: false; reason: 'invalid' | 'duplicate' | 'not-found' | 'network' | 'self'; message: string }

/** 이웃 가져오기: 웹뷰 화면에서 읽은 이웃 후보 */
export interface BuddyScan {
  candidates: { blogId: string; name: string; registered: boolean }[]
  /** 이웃 목록 영역을 찾았는지 (못 찾으면 화면 전체의 블로그 링크) */
  inList: boolean
  url: string
}

export interface ImportProgress {
  running: boolean
  done: number
  total: number
  added: number
  /** 이미 등록된 이웃 */
  skipped: number
  /** 블로그를 찾지 못했거나 연결에 실패한 ID */
  failed: string[]
}
