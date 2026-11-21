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
  /** 네이버 닉네임. 그 이웃의 글을 웹뷰로 열 때 읽는다 */
  naverNick: string | null
  /** nickname을 사용자가 직접 고쳤는지 */
  nicknameCustom: boolean
  /** 보여 줄 이름 (호칭 제외): 고친 이름 → 네이버 닉네임 → 블로그 제목 */
  name: string
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
  /** "답방 갈 곳 찾아보기"에서 여는 내 최신 글 수 */
  replyCheckPosts: number
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
  /** 쓰는 중일 때의 실제 단계 (status가 loading일 때만) */
  progress?: DraftProgress | null
  /** 방금 쓴 초안에 걸린 시간. 저장해 둔 초안을 다시 열면 없음 */
  elapsedMs?: number | null
}

/**
 * 초안을 쓰는 단계 (응답을 스트리밍으로 받아 실제 진행을 안다)
 * - reading: 요청을 보내고 첫 글자를 기다리는 중 (모델이 본문을 읽는 시간, 처음엔 모델 불러오기 포함)
 * - writing: 글자가 오는 중. current는 지금 쓰는 초안 번호(1부터)
 * - retrying: 상투적 표현이 걸려 다시 쓰는 중
 */
export interface DraftProgress {
  phase: 'reading' | 'writing' | 'retrying'
  /** 생성을 시작한 시각 (epoch ms) */
  startedAt: number
  current: number
  total: number
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

export type UpdateStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'none' }
  | { kind: 'downloading'; version: string }
  | { kind: 'ready'; version: string }
  | { kind: 'error'; message: string }
  /** 개발 실행: 업데이트를 확인하지 않는다 */
  | { kind: 'dev' }

/** 설정 화면 "보내 보기" 결과 */
export interface AiTestResult {
  ok: boolean
  message: string
  /** 모델의 답 */
  reply: string
  ms: number
  /** 실패했을 때 서버가 보낸 오류 내용 */
  detail: string | null
}

/** 설정 화면 모델 목록 (서버의 GET /models) */
export interface AiModelsResult {
  ok: boolean
  /** 모델 이름 (이름순) */
  models: string[]
  /** 실패했을 때 알릴 문장 */
  message: string | null
}

// ───────── 답방 (docs/DECISIONS.md "답방") ─────────

export interface VisitScanStatus {
  running: boolean
  /** 연 글 수 / 열 글 수 */
  done: number
  total: number
  /** 이번에 새로 찾은 댓글 수 */
  found: number
  lastAt: string | null
  /** 안내나 오류 (예: 내 블로그에 글이 없어요) */
  message: string | null
  /** 글을 읽지 못했거나 댓글을 하나도 못 알아봤을 때의 진단 (JSON). "진단 정보 복사"로 보낸다 */
  diag?: string | null
}

export interface ReturnVisitItem {
  blogId: string
  nick: string
  lastAt: string
  logNo: string
  postTitle: string
  count: number
  /** 이웃 명단에 있으면 그 이웃 */
  neighborId: number | null
  name: string
}

/** 내 글에 달린 댓글과 그 답글 초안 */
export interface ReplyItem {
  commentNo: string
  blogId: string
  nick: string
  text: string
  at: string
  status: 'idle' | 'loading' | 'ready' | 'error'
  drafts: { tone: string; text: string }[]
  error: string | null
}

export interface RepliesState {
  logNo: string
  title: string
  items: ReplyItem[]
  /** 댓글 영역이 아직 펼쳐지지 않아 읽지 못했다 */
  needsOpen: boolean
}
