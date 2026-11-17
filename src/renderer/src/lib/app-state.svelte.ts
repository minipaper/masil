import type { CheckStatus, NaverViewState, Neighbor, Post, Settings } from '@shared/types'

export type LeftTab = 'today' | 'neighbors' | 'quiet'

const api = window.masil

/** 앱 화면 전체가 공유하는 상태. main에서 오는 이벤트로 갱신된다. */
class AppState {
  posts = $state<Post[]>([])
  neighbors = $state<Neighbor[]>([])
  check = $state<CheckStatus>({ running: false, lastCheckedAt: null, nextCheckAt: null, progress: null, lastError: null })
  settings = $state<Settings | null>(null)
  naver = $state<NaverViewState | null>(null)
  selectedPostId = $state<number | null>(null)
  leftTab = $state<LeftTab>('today')

  selectedPost = $derived(this.posts.find((p) => p.id === this.selectedPostId) ?? null)
  selectedNeighbor = $derived(
    this.selectedPost ? (this.neighbors.find((n) => n.id === this.selectedPost?.neighborId) ?? null) : null
  )
  pendingCount = $derived(this.posts.filter((p) => p.status === 'new' || p.status === 'read').length)
  /** 지금 연 글을 뺀 나머지 들를 글 수 ("다음 글" 버튼용) */
  pendingOthers = $derived(
    this.posts.filter((p) => (p.status === 'new' || p.status === 'read') && p.id !== this.selectedPostId).length
  )

  async init(): Promise<void> {
    api.onDataChanged(() => void this.refresh())
    api.onSelectPost((id) => {
      this.selectedPostId = id
      this.leftTab = 'today'
    })
    api.check.onStatus((s) => (this.check = s))
    api.naver.onState((s) => (this.naver = s))

    const [settings, check, naver] = await Promise.all([api.settings.get(), api.check.status(), api.naver.state()])
    this.settings = settings
    this.check = check
    this.naver = naver
    await this.refresh()
  }

  async refresh(): Promise<void> {
    const [posts, neighbors] = await Promise.all([api.posts.list(), api.neighbors.list()])
    this.posts = posts
    this.neighbors = neighbors
  }

  async saveSettings(patch: Partial<Settings>): Promise<void> {
    this.settings = await api.settings.set(patch)
  }

  async openPost(id: number): Promise<void> {
    this.selectedPostId = id
    await api.posts.open(id)
  }

  async skipSelected(): Promise<void> {
    if (this.selectedPostId == null) return
    await api.posts.skip(this.selectedPostId)
    await this.openNextPending()
  }

  /** 들러야 하는 글 중 가장 오래된 것을 연다 (마실 모드의 기본 동작) */
  async openNextPending(): Promise<boolean> {
    const next = await api.posts.nextPending(this.selectedPostId ?? undefined)
    if (!next) return false
    await this.openPost(next.id)
    return true
  }
}

export const appState = new AppState()
