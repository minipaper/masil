import { ipcMain, session, type IpcMainEvent, type WebContents, type WebFrameMain } from 'electron'
import { NAVER_FRAME, FILL_MESSAGE, type FillResult, type SubmitClick, type SubmitResult } from '@shared/naver-frame'
import { NAVER_PARTITION } from '@shared/policy'
import type { DraftContext, PostContent } from '@shared/prompt'
import type { CurrentPost, DraftsState } from '@shared/types'
import { AiSetupError, describeAiError, generateDrafts } from './ai'
import type { DB } from './db'
import * as repo from './repo'
import { getApiKey, getSettings } from './settings'

interface Events {
  currentPost: (p: CurrentPost | null) => void
  drafts: (s: DraftsState) => void
  /** 댓글 기록이나 글 상태가 바뀜 */
  commentsChanged: (blogId: string) => void
  /** 등록이 댓글 목록에서 확인됨 */
  commentConfirmed: (blogId: string, logNo: string) => void
  dataChanged: () => void
}

const keyOf = (blogId: string, logNo: string): string => `${blogId}/${logNo}`

/**
 * 웹뷰에 열린 글 하나를 중심으로 본문 → 초안 → 채우기 → 등록 감지 흐름을 묶는다.
 * 등록 버튼은 사용자가 누르고, 여기서는 그 사실을 전달받아 기록만 한다.
 */
export class PostSession {
  private content: PostContent | null = null
  private frame: WebFrameMain | null = null
  private drafts: DraftsState | null = null
  /** 글마다 마지막으로 "채우기"한 초안 (최종본과 짝지어 학습에 쓴다) */
  private lastFilled = new Map<string, { text: string; tone: string }>()
  private generating = new Set<string>()
  private pendingFills = new Map<string, (r: FillResult) => void>()

  constructor(
    private readonly db: DB,
    private readonly naver: () => WebContents | null,
    private readonly events: Events
  ) {
    const fromNaver = (e: IpcMainEvent): boolean => e.sender === this.naver()
    // 웹뷰에서 오는 메시지 처리 중 오류가 나도 앱 전체가 멈추지 않게 한다 (로그에는 내용 없이 오류만)
    const listen = <T>(channel: string, fn: (e: IpcMainEvent, payload: T) => void): void => {
      ipcMain.on(channel, (e, payload: T) => {
        try {
          fn(e, payload)
        } catch (err) {
          console.error(`[post-session] ${channel} 처리 실패:`, err instanceof Error ? err.message : err)
        }
      })
    }

    listen<PostContent>(NAVER_FRAME.post, (e, post) => {
      if (!fromNaver(e) || !post?.blogId || !post.logNo) return
      this.frame = e.senderFrame
      this.content = post
      const likedChanged = post.liked && repo.setPostLiked(db, post.blogId, post.logNo, true)
      const nickChanged = !!post.authorNick && repo.setNaverNick(db, post.blogId, post.authorNick)
      if (likedChanged || nickChanged) this.events.dataChanged()
      this.events.currentPost(this.currentPost())
      this.loadDrafts(post)
    })

    listen<FillResult>(NAVER_FRAME.fillResult, (e, r) => {
      if (!fromNaver(e)) return
      this.pendingFills.get(r.requestId)?.(r)
    })

    listen<SubmitClick>(NAVER_FRAME.submit, (e, s) => {
      if (!fromNaver(e) || !s?.text) return
      const title = this.content && keyOf(this.content.blogId, this.content.logNo) === keyOf(s.blogId, s.logNo) ? this.content.title : ''
      const filled = this.lastFilled.get(keyOf(s.blogId, s.logNo)) ?? null
      repo.insertPendingComment(db, {
        blogId: s.blogId,
        logNo: s.logNo,
        postTitle: title,
        text: s.text,
        secret: s.secret,
        draft: filled
      })
      this.events.commentsChanged(s.blogId)
    })

    listen<SubmitResult>(NAVER_FRAME.submitResult, (e, r) => {
      if (!fromNaver(e)) return
      const rec = repo.resolvePendingComment(db, r.blogId, r.logNo, r.text, r.confirmed)
      if (rec && r.confirmed) {
        const post = repo.findPostByLogNo(db, r.blogId, r.logNo)
        if (post) repo.applyPostEvent(db, post.id, 'comment')
        this.lastFilled.delete(keyOf(r.blogId, r.logNo))
        this.events.dataChanged()
        this.events.commentConfirmed(r.blogId, r.logNo)
      }
      this.events.commentsChanged(r.blogId)
    })

    listen<{ blogId: string; logNo: string; liked: boolean }>(NAVER_FRAME.like, (e, l) => {
      if (!fromNaver(e)) return
      if (this.content && keyOf(this.content.blogId, this.content.logNo) === keyOf(l.blogId, l.logNo)) {
        this.content = { ...this.content, liked: l.liked }
        this.events.currentPost(this.currentPost())
      }
      if (repo.setPostLiked(db, l.blogId, l.logNo, l.liked)) this.events.dataChanged()
    })
  }

  /** 웹뷰가 글이 아닌 곳으로 이동하면 현재 글을 비운다 */
  onNavigate(ref: { blogId: string; logNo: string } | null): void {
    if (ref && this.content && keyOf(ref.blogId, ref.logNo) === keyOf(this.content.blogId, this.content.logNo)) return
    this.content = null
    this.frame = null
    this.drafts = null
    this.events.currentPost(null)
  }

  /** 지금 열린 글에서 읽은 글쓴이 닉네임 (그 블로그 글이 열려 있을 때만) */
  authorNickOf(blogId: string): string | null {
    return this.content?.blogId === blogId ? this.content.authorNick?.trim() || null : null
  }

  currentPost(): CurrentPost | null {
    const c = this.content
    if (!c) return null
    const post = repo.findPostByLogNo(this.db, c.blogId, c.logNo)
    const neighbor = repo.findNeighborByBlogId(this.db, c.blogId)
    return {
      blogId: c.blogId,
      logNo: c.logNo,
      title: c.title,
      url: c.url,
      postId: post?.id ?? null,
      neighborId: neighbor?.id ?? null,
      liked: c.liked
    }
  }

  /** 설정이 바뀌면, 설정이 없어 멈춰 있던 초안을 다시 판단한다 (글을 다시 열지 않아도 되게) */
  onSettingsChanged(): void {
    const post = this.content
    const d = this.drafts
    if (!post || !d || d.status === 'loading' || d.status === 'ready') return
    if (d.needsSetup || d.status === 'idle') this.loadDrafts(post)
  }

  draftsState(): DraftsState | null {
    return this.drafts
  }

  private setDrafts(s: DraftsState): void {
    this.drafts = s
    this.events.drafts(s)
  }

  private loadDrafts(post: PostContent): void {
    const saved = repo.latestDrafts(this.db, post.blogId, post.logNo)
    if (saved.length > 0) {
      this.setDrafts({ blogId: post.blogId, logNo: post.logNo, status: 'ready', drafts: saved, error: null, needsSetup: false })
      return
    }
    const settings = getSettings(this.db)
    const missing = !settings.ai.baseUrl ? 'Base URL이 비어 있어요.' : !settings.ai.model ? '모델 이름이 비어 있어요.' : null
    if (settings.ai.autoGenerate && !missing) {
      void this.generate()
    } else {
      this.setDrafts({ blogId: post.blogId, logNo: post.logNo, status: 'idle', drafts: [], error: missing, needsSetup: missing !== null })
    }
  }

  /** 지금 열린 글의 초안을 만든다 (자동 생성 또는 "다시 쓰기") */
  async generate(): Promise<void> {
    const post = this.content
    if (!post) return
    const key = keyOf(post.blogId, post.logNo)
    if (this.generating.has(key)) return
    this.generating.add(key)
    const base = { blogId: post.blogId, logNo: post.logNo }
    this.setDrafts({ ...base, status: 'loading', drafts: this.drafts?.drafts ?? [], error: null, needsSetup: false })
    try {
      const settings = getSettings(this.db)
      const ctx = this.buildContext(post, settings.ai.tones, settings.ai.examples)
      const images = settings.ai.sendImages ? await loadImages(post.images) : []
      const drafts = await generateDrafts(settings.ai, getApiKey(this.db), ctx, images)
      const items = repo.saveDraftBatch(this.db, post.blogId, post.logNo, settings.ai.model, drafts)
      if (this.isCurrent(key)) this.setDrafts({ ...base, status: 'ready', drafts: items, error: null, needsSetup: false })
    } catch (e) {
      if (this.isCurrent(key)) {
        this.setDrafts({
          ...base,
          status: 'error',
          drafts: this.drafts?.drafts ?? [],
          error: describeAiError(e),
          needsSetup: e instanceof AiSetupError
        })
      }
    } finally {
      this.generating.delete(key)
    }
  }

  private isCurrent(key: string): boolean {
    return this.content !== null && keyOf(this.content.blogId, this.content.logNo) === key
  }

  private buildContext(
    post: PostContent,
    tones: DraftContext['tones'],
    examples: { recent: number; neighbor: number; pairs: number }
  ): DraftContext {
    const n = repo.findNeighborByBlogId(this.db, post.blogId)
    return {
      post,
      neighbor: n ? { honorific: n.honorific, nickname: n.name, speech: n.speech, closeness: n.closeness, memo: n.memo } : null,
      styleGuide: repo.activeStyleGuide(this.db),
      recentFinals: repo.recentFinals(this.db, examples.recent, post.blogId),
      neighborFinals: repo.neighborFinals(this.db, post.blogId, examples.neighbor),
      pairs: repo.draftFinalPairs(this.db, examples.pairs),
      tones
    }
  }

  /** 초안을 댓글 입력칸에 채운다. 등록은 사용자가 직접 누른다. */
  async fill(text: string, tone: string): Promise<{ ok: boolean; message: string }> {
    const post = this.content
    const frame = this.frame
    if (!post || !frame || frame.isDestroyed()) return { ok: false, message: FILL_MESSAGE['no-post'] }
    const clean = text.trim()
    if (!clean) return { ok: false, message: '채울 내용이 비어 있어요.' }

    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const result = await new Promise<FillResult | null>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingFills.delete(requestId)
        resolve(null)
      }, 12_000)
      this.pendingFills.set(requestId, (r) => {
        clearTimeout(timer)
        this.pendingFills.delete(requestId)
        resolve(r)
      })
      frame.send(NAVER_FRAME.fill, { requestId, logNo: post.logNo, text: clean })
    })

    if (!result) return { ok: false, message: FILL_MESSAGE.timeout }
    if (result.outcome === 'filled') {
      this.lastFilled.set(keyOf(post.blogId, post.logNo), { text: clean, tone })
      this.naver()?.focus()
    }
    return { ok: result.outcome === 'filled', message: FILL_MESSAGE[result.outcome] }
  }
}

/**
 * 이미지 보내기 옵션용. 웹뷰가 이미 불러온 이미지를 같은 세션(캐시)으로 다시 읽어 data URL로 만든다.
 * 최대 4장, 한 장 1.5MB 이하만. 순차로 읽는다.
 */
async function loadImages(urls: string[]): Promise<string[]> {
  const ses = session.fromPartition(NAVER_PARTITION)
  const out: string[] = []
  for (const raw of urls.slice(0, 4)) {
    try {
      const u = new URL(raw)
      if (u.searchParams.has('type')) u.searchParams.set('type', 'w580')
      const res = await ses.fetch(u.toString(), { headers: { Referer: 'https://blog.naver.com/' } })
      if (!res.ok) continue
      const type = res.headers.get('content-type') ?? 'image/jpeg'
      if (!type.startsWith('image/')) continue
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.byteLength > 1_500_000) continue
      out.push(`data:${type};base64,${buf.toString('base64')}`)
    } catch {
      // 한 장 실패는 건너뛴다
    }
  }
  return out
}
