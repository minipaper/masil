import type { NaverNav } from '../shared/ipc'
import type {
  AddNeighborResult,
  CheckStatus,
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
  onDataChanged(cb: () => void): Unsubscribe
  onSelectPost(cb: (postId: number) => void): Unsubscribe
}

declare global {
  interface Window {
    masil: MasilApi
  }
}
