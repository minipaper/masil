import { pickNextInRound, summarizeRound } from '@shared/round'
import type {
  CheckStatus,
  CommentRecord,
  CurrentPost,
  DraftsState,
  NaverViewState,
  Neighbor,
  Post,
  RepliesState,
  ReturnVisitItem,
  Settings,
  VisitScanStatus
} from '@shared/types'

export type LeftTab = 'today' | 'visits' | 'neighbors' | 'quiet'

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
  /** 이웃 명단 검색어 (명단, 오래 못 간 집 탭이 함께 쓴다) */
  neighborQuery = $state('')
  currentPost = $state<CurrentPost | null>(null)
  drafts = $state<DraftsState | null>(null)
  /** 답방: 찾아보기 진행 상태, 답방할 집, 내 글의 답글 초안 */
  visitStatus = $state<VisitScanStatus | null>(null)
  returnVisits = $state<ReturnVisitItem[]>([])
  replies = $state<RepliesState | null>(null)
  history = $state<CommentRecord[]>([])
  settingsOpen = $state(false)
  /** 이웃 가져오기 패널 (왼쪽) */
  importOpen = $state(false)
  /** 마실 모드: 시작 시각과 시작할 때 남은 글 수 */
  round = $state<{ startedAt: string; total: number; visited: number[] } | null>(null)
  roundFinished = $state(false)
  /** 웹뷰를 가리는 이유들 (설정 창, 마실 끝 화면, 경계선 끌기) */
  private hideReasons = new Set<string>()

  selectedPost = $derived(this.posts.find((p) => p.id === this.selectedPostId) ?? null)
  /** 오른쪽 패널의 이웃: 웹뷰에 열린 글의 이웃 → 출석부에서 고른 글의 이웃 순 */
  selectedNeighbor = $derived.by(() => {
    const id = this.currentPost?.neighborId ?? this.selectedPost?.neighborId ?? null
    return id == null ? null : (this.neighbors.find((n) => n.id === id) ?? null)
  })
  /** 지난 댓글을 보여줄 블로그 */
  /**
   * 웹뷰에 지금 열린 글의 이웃 (명단에 있을 때만). "이웃 명단에서 제외"는 이것만 쓴다.
   * selectedNeighbor처럼 출석부 선택으로 돌아가지 않아, 다른 블로그를 보다가 엉뚱한 이웃을 지우지 않는다.
   */
  viewingNeighbor = $derived.by(() => {
    const id = this.currentPost?.neighborId ?? null
    return id == null ? null : (this.neighbors.find((n) => n.id === id) ?? null)
  })
  /** 답방할 집의 블로그 ID */
  returnVisitIds = $derived(new Set(this.returnVisits.map((r) => r.blogId)))
  /** 웹뷰에 열린 글이 내 글인지 (오른쪽에 답글 초안을 보여 준다) */
  isMyPost = $derived(!!this.currentPost && !!this.settings?.myBlogId && this.currentPost.blogId === this.settings.myBlogId)
  historyBlogId = $derived(this.currentPost?.blogId ?? this.selectedNeighbor?.blogId ?? null)
  pendingCount = $derived(this.posts.filter((p) => p.status === 'new' || p.status === 'read').length)
  /** 지금 연 글을 뺀 나머지 들를 글 수 ("다음 글" 버튼용) */
  roundStats = $derived(this.round ? summarizeRound(this.posts, this.round.startedAt) : null)
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
    api.replies.onState((s) => (this.replies = s))
    api.visits.onStatus((s) => {
      this.visitStatus = s
      if (!s.running) void this.refresh()
    })
    api.onSettings((s) => (this.settings = s))
    api.onCommentConfirmed((c) => {
      // 마실 중이면 등록이 확인된 뒤 잠깐 보여 주고 다음 글로
      if (this.round && this.currentPost?.blogId === c.blogId && this.currentPost.logNo === c.logNo) {
        setTimeout(() => void this.advance(), 1500)
      }
    })
    api.comments.onChanged((blogId) => {
      if (blogId === this.historyBlogId) void this.loadHistory()
    })

    const [settings, check, naver, current, drafts, replies, visitStatus] = await Promise.all([
      api.settings.get(),
      api.check.status(),
      api.naver.state(),
      api.drafts.current(),
      api.drafts.state(),
      api.replies.state(),
      api.visits.status()
    ])
    this.replies = replies
    this.visitStatus = visitStatus
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

  /** WebContentsView는 항상 화면 맨 위에 그려지므로, 앱 화면이 그 자리를 써야 할 때 숨긴다 */
  hideNaver(reason: string, hidden: boolean): void {
    if (hidden) this.hideReasons.add(reason)
    else this.hideReasons.delete(reason)
    api.naver.setHidden(this.hideReasons.size > 0)
  }

  openSettings(open: boolean): void {
    this.settingsOpen = open
    this.hideNaver('settings', open)
  }

  // ── 마실 모드 ──

  async startRound(): Promise<void> {
    await this.refresh()
    this.round = { startedAt: new Date().toISOString(), total: this.pendingCount, visited: [] }
    this.setFinished(false)
    await this.openRoundNext()
  }

  /** 다음 글로. 마실 중이면 이번 바퀴에 들른 글은 다시 열지 않고, 더 없으면 "오늘 마실 끝" */
  async advance(): Promise<void> {
    const round = this.round
    if (!round) {
      await this.openNextPending()
      return
    }
    if (this.selectedPostId != null && !round.visited.includes(this.selectedPostId)) round.visited.push(this.selectedPostId)
    await this.refresh()
    await this.openRoundNext()
  }

  private async openRoundNext(): Promise<void> {
    const round = this.round
    if (!round) return
    const next = pickNextInRound(this.posts, round.visited, this.returnVisitIds)
    if (!next) {
      this.setFinished(true)
      return
    }
    round.visited.push(next.id)
    await this.openPost(next.id)
  }

  endRound(): void {
    this.round = null
    this.setFinished(false)
  }

  private setFinished(done: boolean): void {
    this.roundFinished = done
    this.hideNaver('round-finished', done)
  }

  async refresh(): Promise<void> {
    const [posts, neighbors, returnVisits] = await Promise.all([api.posts.list(), api.neighbors.list(), api.visits.list()])
    this.posts = posts
    this.neighbors = neighbors
    this.returnVisits = returnVisits
  }

  async saveSettings(patch: Partial<Settings>): Promise<void> {
    // 반응형 Proxy(예: 설정 창의 톤 목록)는 IPC로 복제할 수 없어서 일반 객체로 바꿔 보낸다
    this.settings = await api.settings.set($state.snapshot(patch) as Partial<Settings>)
  }

  async openPost(id: number): Promise<void> {
    this.selectedPostId = id
    await api.posts.open(id)
    void this.loadHistory()
  }

  /**
   * 지금 보고 있는 글의 이웃을 명단에서 뺀다. 확인 창을 먼저 띄운다.
   * 출석부의 그 이웃 글은 함께 지워지고, 내가 남긴 댓글 기록은 남는다.
   */
  /** 웹뷰에 열린 글이 명단에 없는 블로그면 그 블로그 (내 블로그 제외) */
  get strangerBlogId(): string | null {
    const p = this.currentPost
    if (!this.naver?.visible || !p || p.neighborId) return null
    if (p.blogId === this.settings?.myBlogId) return null
    return this.neighbors.some((n) => n.blogId === p.blogId) ? null : p.blogId
  }

  /** 지금 보는 블로그를 이웃 명단에 적는다. 결과 문장을 돌려준다 */
  async addCurrentBlog(): Promise<string> {
    const id = this.strangerBlogId
    if (!id) return ''
    const res = await api.neighbors.add(id)
    await this.refresh()
    this.currentPost = await api.drafts.current()
    return res.ok ? `${res.neighbor.name} 님을 명단에 적었어요.` : res.message
  }

  async removeCurrentNeighbor(): Promise<boolean> {
    const n = this.viewingNeighbor
    if (!n) return false
    const name = n.honorific || n.name || n.blogId
    const ok = window.confirm(
      `${name}(${n.blogId}) 님을 이웃 명단에서 뺄까요?\n\n출석부에 있던 이 이웃의 글도 함께 사라지고, 앞으로 새 글을 확인하지 않아요. 내가 남긴 댓글 기록은 남아요.`
    )
    if (!ok) return false
    await api.neighbors.remove(n.id)
    // 지운 이웃의 글은 출석부에서 사라지므로 선택과 현재 글의 연결을 끊는다
    if (this.currentPost?.neighborId === n.id) this.currentPost = { ...this.currentPost, neighborId: null, postId: null }
    if (this.selectedPost?.neighborId === n.id) this.selectedPostId = null
    await this.refresh()
    if (this.round) await this.advance()
    return true
  }

  async skipSelected(): Promise<void> {
    if (this.selectedPostId == null) return
    await api.posts.skip(this.selectedPostId)
    await this.advance()
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
