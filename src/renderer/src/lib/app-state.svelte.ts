import type { CheckStatus, CommentRecord, CurrentPost, DraftsState, NaverViewState, Neighbor, Post, Settings } from '@shared/types'

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
  currentPost = $state<CurrentPost | null>(null)
  drafts = $state<DraftsState | null>(null)
  history = $state<CommentRecord[]>([])
  settingsOpen = $state(false)

  selectedPost = $derived(this.posts.find((p) => p.id === this.selectedPostId) ?? null)
  /** 오른쪽 패널의 이웃: 웹뷰에 열린 글의 이웃 → 출석부에서 고른 글의 이웃 순 */
  selectedNeighbor = $derived.by(() => {
    const id = this.currentPost?.neighborId ?? this.selectedPost?.neighborId ?? null
    return id == null ? null : (this.neighbors.find((n) => n.id === id) ?? null)
  })
  /** 지난 댓글을 보여줄 블로그 */
  historyBlogId = $derived(this.currentPost?.blogId ?? this.selectedNeighbor?.blogId ?? null)
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
    api.drafts.onCurrent((p) => {
      this.currentPost = p
      if (p?.postId != null) this.selectedPostId = p.postId
      void this.loadHistory()
    })
    api.drafts.onState((s) => (this.drafts = s))
    api.comments.onChanged((blogId) => {
      if (blogId === this.historyBlogId) void this.loadHistory()
    })

    const [settings, check, naver, current, drafts] = await Promise.all([
      api.settings.get(),
      api.check.status(),
      api.naver.state(),
      api.drafts.current(),
      api.drafts.state()
    ])
    this.settings = settings
    this.check = check
    this.naver = naver
    this.currentPost = current
    this.drafts = drafts
    await this.refresh()
  }

  async loadHistory(): Promise<void> {
    const blogId = this.historyBlogId
    this.history = blogId ? await api.comments.forBlog(blogId) : []
  }

  openSettings(open: boolean): void {
    this.settingsOpen = open
    // WebContentsView는 항상 화면 맨 위에 그려지므로 설정 화면이 열려 있는 동안 숨긴다
    api.naver.setHidden(open)
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
    void this.loadHistory()
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
