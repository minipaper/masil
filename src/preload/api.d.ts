import type { NaverNav } from '../shared/ipc'
import type { StyleState } from '@shared/style'
import type {
  AddNeighborResult,
  BuddyScan,
  ImportProgress,
  CheckStatus,
  CommentRecord,
  AiModelsResult,
  AiTestResult,
  CurrentPost,
  UpdateStatus,
  DraftsState,
  NaverViewState,
  RepliesState,
  ReturnVisitItem,
  VisitScanStatus,
  Neighbor,
  NeighborPatch,
  Post,
  Rect,
  Settings
} from '../shared/types'

type Unsubscribe = () => void

/** preload가 window.masil 로 노출하는 API (renderer와 공유) */
export interface MasilApi {
  platform: string
  neighbors: {
    list(): Promise<Neighbor[]>
    add(input: string): Promise<AddNeighborResult>
    update(id: number, patch: NeighborPatch): Promise<Neighbor | null>
    remove(id: number): Promise<void>
  }
  posts: {
    list(): Promise<Post[]>
    open(id: number): Promise<void>
    skip(id: number): Promise<Post | null>
    /** 들러야 하는 글 중 가장 오래된 것 (excludeId 제외) */
    nextPending(excludeId?: number): Promise<Post | null>
  }
  check: {
    now(): Promise<void>
    status(): Promise<CheckStatus>
    onStatus(cb: (s: CheckStatus) => void): Unsubscribe
  }
  settings: {
    get(): Promise<Settings>
    set(patch: Partial<Settings>): Promise<Settings>
  }
  naver: {
    setBounds(rect: Rect): void
    setHidden(hidden: boolean): void
    nav(action: NaverNav): void
    /** 블로그 ID나 네이버 주소를 웹뷰에 연다 (네이버 주소만) */
    open(input: string): Promise<{ ok: boolean; message: string }>
    state(): Promise<NaverViewState | null>
    onState(cb: (s: NaverViewState) => void): Unsubscribe
  }
  drafts: {
    current(): Promise<CurrentPost | null>
    state(): Promise<DraftsState | null>
    generate(): Promise<void>
    /** 입력칸에 채우기만 한다. 등록은 사용자가 직접 누른다. */
    fill(text: string, tone: string): Promise<{ ok: boolean; message: string }>
    onCurrent(cb: (p: CurrentPost | null) => void): Unsubscribe
    onState(cb: (s: DraftsState) => void): Unsubscribe
  }
  comments: {
    forBlog(blogId: string): Promise<CommentRecord[]>
    onChanged(cb: (blogId: string) => void): Unsubscribe
  }
  ai: {
    /** null이면 키 삭제 */
    setKey(key: string | null): Promise<{ ok: boolean; message?: string; settings: Settings }>
    /** 테스트 문장을 보내고 모델의 답을 받는다 */
    test(prompt?: string): Promise<AiTestResult>
    /** Base URL 서버가 가진 모델 이름. typedKey는 아직 저장하지 않은 새 키 */
    models(baseUrl: string, typedKey?: string): Promise<AiModelsResult>
  }
  style: {
    state(): Promise<StyleState>
    /** 지금 개정안 만들기 */
    refresh(): Promise<void>
    approve(id: number): Promise<void>
    reject(id: number): Promise<void>
    /** 직접 고친 가이드를 바로 적용 (빈 글이면 가이드 끄기) */
    save(content: string): Promise<void>
    onState(cb: (s: StyleState) => void): Unsubscribe
  }
  importer: {
    /** 웹뷰에 이웃 관리 화면을 연다 */
    openPage(): Promise<{ ok: boolean; message: string }>
    /** 웹뷰에 보이는 화면에서 이웃을 읽는다 */
    scan(): Promise<BuddyScan>
    run(blogIds: string[]): Promise<void>
    cancel(): Promise<void>
    status(): Promise<ImportProgress>
    onProgress(cb: (p: ImportProgress) => void): Unsubscribe
  }
  /** 답방: 내 최신 글에 댓글 단 사람 찾기 (사용자가 눌렀을 때만 웹뷰로 내 글을 연다) */
  visits: {
    scan(): Promise<void>
    cancel(): Promise<void>
    status(): Promise<VisitScanStatus>
    /** 답방할 집 */
    list(): Promise<ReturnVisitItem[]>
    onStatus(cb: (s: VisitScanStatus) => void): Unsubscribe
  }
  /** 내 글에 달린 댓글의 답글 초안 */
  replies: {
    state(): Promise<RepliesState | null>
    generate(commentNo: string): Promise<void>
    /** 답글 입력칸에 채우기만 한다. 등록은 사용자가 직접 누른다. */
    fill(commentNo: string, text: string): Promise<{ ok: boolean; message: string }>
    onState(cb: (s: RepliesState | null) => void): Unsubscribe
  }
  /** 웹뷰에서 내 블로그를 열어 ID를 알아낸다 (찾으면 onSettings로 알려 준다) */
  findMyBlog(): Promise<void>
  onSettings(cb: (s: Settings) => void): Unsubscribe
  onCommentConfirmed(cb: (c: { blogId: string; logNo: string }) => void): Unsubscribe
  data: {
    export(): Promise<{ ok: boolean; message: string }>
    /** 성공하면 앱이 다시 시작된다 */
    import(): Promise<{ ok: boolean; message: string }>
  }
  app: {
    info(): Promise<{ version: string; update: UpdateStatus }>
    checkUpdate(): Promise<UpdateStatus>
    /** 받아 둔 새 버전으로 다시 시작 */
    restartToUpdate(): Promise<void>
    onUpdate(cb: (s: UpdateStatus) => void): Unsubscribe
  }
  onDataChanged(cb: () => void): Unsubscribe
  onSelectPost(cb: (postId: number) => void): Unsubscribe
}

declare global {
  interface Window {
    masil: MasilApi
  }
}
