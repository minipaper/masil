import type { VisitorComment } from './visitors'

/** 네이버 웹뷰 preload(PostView 프레임) ↔ main 사이 메시지 */
export const NAVER_FRAME = {
  /** frame → main: 글 내용 추출 완료 (PostContent) */
  post: 'naverframe:post',
  /** main → frame: 입력칸 채우기 (FillRequest) */
  fill: 'naverframe:fill',
  /** frame → main: 채우기 결과 (FillResult) */
  fillResult: 'naverframe:fill-result',
  /** frame → main: 사용자가 등록 버튼을 눌렀다 (SubmitClick) */
  submit: 'naverframe:submit',
  /** frame → main: 등록 후 댓글 목록에 나타났는지 (SubmitResult) */
  submitResult: 'naverframe:submit-result',
  /** frame → main: 사용자가 공감 버튼을 눌렀다 ({blogId, logNo, liked}) */
  like: 'naverframe:like',
  /** main → 모바일 댓글 화면: 댓글을 읽어 달라 (ScanCommentsRequest). "답방 갈 곳 찾아보기"를 눌렀을 때만. 아무것도 누르지 않는다 */
  scanComments: 'naverframe:scan-comments',
  /** frame → main: 읽은 댓글 (CommentsReport). 요청 응답이거나, 내 글을 지켜보다 댓글 목록이 바뀌었을 때 */
  comments: 'naverframe:comments',
  /** main → frame: 내 글이니 댓글 목록이 열리면 알려 달라 ({logNo}) */
  watchComments: 'naverframe:watch-comments',
  /** main → frame: 답글 입력칸 채우기 (ReplyFillRequest). 결과는 fillResult로 */
  fillReply: 'naverframe:fill-reply',
  /** main → 모든 프레임: 이웃 목록 화면의 블로그 링크를 읽어 달라 ({requestId}). 사용자가 "읽기"를 눌렀을 때만 */
  scanBuddies: 'naverframe:scan-buddies',
  /** frame → main: 읽은 링크 (BuddyScanResult) */
  buddies: 'naverframe:buddies'
} as const

export interface ScanCommentsRequest {
  requestId: string
  logNo: string
}

export interface CommentsReport {
  /** 요청에 대한 응답이면 그 id, 지켜보다 보낸 것이면 null */
  requestId: string | null
  logNo: string
  title: string
  /** comments: 읽음, closed: 댓글 영역이 접혀 있음, none: 댓글 목록을 찾지 못함 (막아 둔 글 등) */
  state: 'comments' | 'closed' | 'none'
  comments: VisitorComment[]
  /** 토글에 적힌 댓글 수 (답글 포함). 모르면 null */
  total?: number | null
  /** "답방 갈 곳 찾아보기"가 어디서 막혔는지 (이름, ID, 글 내용은 넣지 않는다) */
  diag?: ScanDiag
}

/** 댓글 읽기 진단. 사용자가 "진단 정보 복사"로 보내 줄 수 있게 개수와 모양만 담는다 */
export interface ScanDiag {
  /** 마지막으로 지난 단계 */
  stage: 'start' | 'no-list' | 'list' | 'read'
  ready: string
  loggedIn: boolean
  list: boolean
  items: number
  read: number
  /** 읽지 않고 뺀 댓글의 이유별 수 */
  skipped: Record<string, number>
  /** 프로필 링크 모양 (ID는 {id}로 가림) */
  profileShapes: string[]
  ms: number
}

export interface ReplyFillRequest {
  requestId: string
  logNo: string
  commentNo: string
  text: string
}

export interface BuddyScanResult {
  requestId: string
  url: string
  /** 이웃 목록 영역을 찾았는지 (못 찾으면 문서 전체에서 읽은 것) */
  inList: boolean
  links: { href: string; text: string }[]
}

export interface FillRequest {
  requestId: string
  logNo: string
  text: string
}

export type FillOutcome = 'filled' | 'login' | 'no-input' | 'no-toggle' | 'no-reply'

export interface FillResult {
  requestId: string
  outcome: FillOutcome
}

export interface SubmitClick {
  blogId: string
  logNo: string
  text: string
  secret: boolean
}

export interface SubmitResult {
  blogId: string
  logNo: string
  text: string
  confirmed: boolean
}

export const FILL_MESSAGE: Record<FillOutcome | 'no-post' | 'timeout', string> = {
  filled: '댓글창에 채웠어요. 다듬은 뒤 등록은 직접 눌러 주세요.',
  login: '댓글을 쓰려면 네이버 로그인이 필요해요.',
  'no-input': '댓글 입력칸을 찾지 못했어요. 댓글을 막아 둔 글일 수 있어요.',
  'no-toggle': '댓글 영역을 찾지 못했어요. 댓글을 막아 둔 글일 수 있어요.',
  'no-reply': '답글 입력칸을 찾지 못했어요. 댓글 영역이 펼쳐져 있는지 확인해 주세요.',
  'no-post': '열린 글이 없어요. 먼저 글을 열어 주세요.',
  timeout: '댓글창이 응답하지 않아요. 글을 새로고침한 뒤 다시 시도해 주세요.'
}
