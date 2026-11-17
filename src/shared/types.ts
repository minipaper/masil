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

export interface Settings {
  checkIntervalMinutes: number
  quietHours: QuietHours
  launchAtLogin: boolean
  myBlogId: string | null
  paneWidths: { left: number; right: number }
  rightCollapsed: boolean
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
  | { ok: false; reason: 'invalid' | 'duplicate' | 'not-found' | 'network'; message: string }
