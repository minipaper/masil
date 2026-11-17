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
  like: 'naverframe:like'
} as const

export interface FillRequest {
  requestId: string
  logNo: string
  text: string
}

export type FillOutcome = 'filled' | 'login' | 'no-input' | 'no-toggle'

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
  'no-post': '열린 글이 없어요. 먼저 글을 열어 주세요.',
  timeout: '댓글창이 응답하지 않아요. 글을 새로고침한 뒤 다시 시도해 주세요.'
}
