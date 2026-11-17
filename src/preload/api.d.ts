import type { NaverNav } from '../shared/ipc'
import type {
  AddNeighborResult,
  CheckStatus,
  CommentRecord,
  CurrentPost,
  DraftsState,
  NaverViewState,
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
    test(): Promise<{ ok: boolean; message: string }>
  }
  onDataChanged(cb: () => void): Unsubscribe
  onSelectPost(cb: (postId: number) => void): Unsubscribe
}

declare global {
  interface Window {
    masil: MasilApi
  }
}
