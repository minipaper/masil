/**
 * 네이버 블로그 WebContentsView에 주입하는 preload.
 * nodeIntegrationInSubFrames로 모든 프레임에서 실행되고, PostView(mainFrame) 문서에서만 동작한다.
 *
 * 절대 원칙 (CLAUDE.md 원칙 1):
 *  - 공감/댓글 "등록" 버튼을 프로그램이 누르지 않는다. click(), submit(), 키 입력 흉내 금지.
 *  - 입력칸 채우기까지만 한다.
 *  - 등록·공감 클릭은 capture 리스너로 감지만 하고 기본 동작을 막지 않는다.
 *  - 예외로 누를 수 있는 버튼은 둘뿐이고, 사용자가 앱의 버튼을 눌렀을 때만 누른다.
 *    · 접힌 댓글 영역을 펼치는 토글(#Comi{logNo}): "채우기"를 눌렀을 때 ("답방 갈 곳 찾아보기"는 모바일 댓글 화면을 읽어 아무것도 누르지 않는다)
 *    · 댓글의 "답글" 버튼(답글 입력칸 열기): 그 댓글의 답글 초안에서 "채우기"를 눌렀을 때
 */
import { ipcRenderer } from 'electron'
import {
  NAVER_FRAME,
  type BuddyScanResult,
  type CommentsReport,
  type FillRequest,
  type FillResult,
  type ReplyFillRequest,
  type ScanCommentsRequest,
  type ScanDiag
} from '@shared/naver-frame'
import { blogHomeId } from '@shared/buddy'
import { parseCommentInfo, toIso, type VisitorComment } from '@shared/visitors'
import type { PostContent } from '@shared/prompt'
import { putText } from './fill-text'
import { SEL, first } from './naver-selectors'

const isPostView = /\/PostView\.naver$/i.test(location.pathname) && location.hostname === 'blog.naver.com'
/** "답방 갈 곳 찾아보기"가 여는 모바일 댓글 화면. 읽기만 한다 */
const isMobileComments =
  /\/PostView\.naver$/i.test(location.pathname) && location.hostname === 'm.blog.naver.com' && new URLSearchParams(location.search).get('modal') === 'comment'

const params = new URLSearchParams(location.search)
const blogId = (params.get('blogId') ?? '').toLowerCase()
const logNo = params.get('logNo') ?? ''

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const norm = (s: string): string => s.replace(/\s+/g, ' ').trim()

async function waitFor<T>(fn: () => T | null, timeoutMs: number, stepMs = 250): Promise<T | null> {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    const v = fn()
    if (v) return v
    await sleep(stepMs)
  }
  return fn()
}

function texts(selector: string, max: number): string[] {
  const out: string[] = []
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    const t = norm(el.innerText || el.textContent || '')
    if (t && !out.includes(t)) out.push(t)
    if (out.length >= max) break
  }
  return out
}

function isLiked(): boolean {
  return document.querySelector(SEL.likeOn) !== null
}

function extractPost(): PostContent | null {
  const body = first(SEL.postBody)
  if (!body) return null
  const title = norm(first(SEL.postTitle)?.innerText ?? document.title.replace(/: 네이버 블로그$/, ''))
  const images: string[] = []
  for (const img of document.querySelectorAll<HTMLImageElement>(SEL.images)) {
    const src = img.getAttribute('data-lazy-src') || img.currentSrc || img.src
    if (src && /^https:\/\//.test(src) && !images.includes(src)) images.push(src)
    if (images.length >= 4) break
  }
  return {
    blogId,
    logNo,
    url: `https://blog.naver.com/${blogId}/${logNo}`,
    title,
    body: (body.innerText || '').replace(/​/g, '').replace(/\n{3,}/g, '\n\n').trim(),
    captions: texts(SEL.captions, 10),
    places: texts(SEL.places, 5),
    tags: texts(SEL.tags, 15)
      .map((t) => t.replace(/^#/, ''))
      .filter((t) => t && t !== '취소'),
    images,
    liked: isLiked(),
    authorNick: readAuthorNick()
  }
}

function readAuthorNick(): string {
  const meta = document.querySelector<HTMLMetaElement>(SEL.authorNickMeta)?.content ?? ''
  const fromPage = first(SEL.authorNick)?.innerText ?? ''
  const nick = norm(meta || fromPage)
  // 템플릿 자리표시({=nickname}) 같은 값은 버린다
  return /[{}]/.test(nick) ? '' : nick.slice(0, 40)
}

/** 지금 화면의 댓글 쓰기 입력칸: 답글 칸이 아니고, 쓰기 상자 안에 있는 것을 먼저 */
function findInput(): HTMLElement | null {
  const all = [...document.querySelectorAll<HTMLElement>(`${SEL.commentMainInput}, ${SEL.commentWrite} ${SEL.commentInput}`)].filter(
    (el) => !el.closest(SEL.replyArea)
  )
  return all.find((el) => el.closest(SEL.commentInbox)) ?? all[0] ?? null
}

const loggedOut = (el: HTMLElement): boolean => el.closest(SEL.commentLoggedOut) !== null

/** 댓글 입력칸에 글을 넣는다. 등록 버튼은 건드리지 않는다. */
async function fill(text: string): Promise<FillResult['outcome']> {
  let input = findInput()
  if (!input) {
    if (document.querySelector(SEL.cbox)) {
      // 댓글 영역은 열려 있는데 입력칸이 없다 → 로그인 필요 등
      return document.querySelector(SEL.commentLoginGuide) ? 'login' : 'no-input'
    }
    // 허용된 유일한 클릭: 접힌 댓글 영역 펼치기 토글
    const toggle = document.querySelector<HTMLElement>(SEL.commentToggle(logNo))
    if (!toggle) return 'no-toggle'
    toggle.click()
    input = await waitFor(findInput, 8000)
    if (!input) return document.querySelector(SEL.commentLoginGuide) ? 'login' : 'no-input'
  }
  if (loggedOut(input)) return 'login'
  return putText(findInput, text, { blocked: loggedOut })
}

/** 내 글의 댓글에 답글 초안을 넣는다. 답글 입력칸이 닫혀 있으면 그 댓글의 "답글" 버튼만 누른다 (허용 버튼). */
async function fillReply(commentNo: string, text: string): Promise<FillResult['outcome']> {
  const find = (): HTMLElement | null => document.querySelector<HTMLElement>(SEL.replyInput(commentNo))
  let input = find()
  if (!input) {
    const btn = document.querySelector<HTMLElement>(SEL.replyButton(commentNo))
    if (!btn) return 'no-reply'
    btn.click()
    input = await waitFor(find, 6000)
    if (!input) return 'no-reply'
  }
  if (loggedOut(input)) return 'login'
  return putText(find, text, { blocked: loggedOut })
}

/** 프로필 링크의 모양만 남긴다 (진단용, ID는 가린다) */
function hrefShape(href: string): string {
  try {
    const u = new URL(href, location.href)
    const path = u.pathname
      .split('/')
      .map((seg, i) => (i === 0 || /\.naver$|\.nhn$/i.test(seg) ? seg : '{id}'))
      .join('/')
    const keys = [...u.searchParams.keys()].join('&')
    return `${u.hostname}${path}${keys ? `?${keys}` : ''}`.slice(0, 80)
  } catch {
    return href ? 'bad-url' : 'none'
  }
}

/** 지금 화면에 보이는 원댓글을 읽는다 (내 댓글, 지운 댓글, 답글은 뺀다). diag가 있으면 뺀 이유를 센다 */
function readComments(diag?: ScanDiag): VisitorComment[] {
  const out: VisitorComment[] = []
  const skip = (why: string): void => {
    if (diag) diag.skipped[why] = (diag.skipped[why] ?? 0) + 1
  }
  for (const li of document.querySelectorAll<HTMLElement>(SEL.commentItem)) {
    const info = parseCommentInfo(li.getAttribute('data-info'))
    if (!info) {
      skip(li.hasAttribute('data-info') ? 'info-unreadable' : 'no-info')
      continue
    }
    if (info.mine) skip('mine')
    else if (info.deleted) skip('deleted')
    else if (info.replyLevel > 1) skip('reply')
    if (info.mine || info.deleted || info.replyLevel > 1) continue
    const href = li.querySelector<HTMLAnchorElement>(SEL.commentProfile)?.getAttribute('href') ?? ''
    const visitor = blogHomeId(href)
    const at = toIso(info.regTime)
    if (!visitor || !at) {
      skip(!visitor ? 'no-blog-link' : 'bad-time')
      if (diag && !visitor && diag.profileShapes.length < 3) diag.profileShapes.push(hrefShape(href))
      continue
    }
    out.push({
      commentNo: info.commentNo,
      logNo,
      blogId: visitor,
      nick: norm(li.querySelector<HTMLElement>(SEL.commentNick)?.innerText ?? '').slice(0, 40),
      at,
      text: norm(li.querySelector<HTMLElement>(SEL.commentText)?.innerText ?? '').slice(0, 500)
    })
  }
  return out
}

function postTitle(): string {
  return norm(first(SEL.postTitle)?.innerText ?? '').slice(0, 200)
}

function report(requestId: string | null, state: CommentsReport['state'], diag?: ScanDiag): void {
  const comments = state === 'comments' ? readComments(diag) : []
  if (diag) {
    diag.ready = document.readyState
    diag.list = document.querySelector(SEL.commentList) !== null
    diag.items = document.querySelectorAll(SEL.commentItem).length
    diag.read = comments.length
  }
  const msg: CommentsReport = { requestId, logNo, title: postTitle(), state, comments, total: commentCount(), diag }
  ipcRenderer.send(NAVER_FRAME.comments, msg)
}

/** 댓글 토글("댓글 14")에 적힌 댓글 수. 모르면 null */
function commentCount(): number | null {
  const m = (document.querySelector<HTMLElement>(SEL.commentToggle(logNo))?.innerText ?? '').match(/댓글\s*([\d,]+)/)
  return m ? Number(m[1].replace(/,/g, '')) : null
}

/**
 * "답방 갈 곳 찾아보기": 모바일 댓글 화면(m.blog.naver.com/PostView.naver?…&modal=comment)에서 댓글을 읽어 보낸다.
 * 이 화면은 댓글 목록이 처음부터 펼쳐져 있어서 아무것도 누르지 않는다.
 * PC 글 화면의 "댓글 N" 토글은 펼치는 데 몇 초씩 걸리고, 다시 누르면 닫혀 버려 믿을 수 없었다 (2026-11-21).
 */
async function scanComments(req: ScanCommentsRequest): Promise<void> {
  const started = Date.now()
  const diag: ScanDiag = {
    stage: 'start',
    ready: document.readyState,
    loggedIn: false,
    list: false,
    items: 0,
    read: 0,
    skipped: {},
    profileShapes: [],
    ms: 0
  }
  const send = (state: CommentsReport['state'], stage: ScanDiag['stage']): void => {
    diag.stage = stage
    diag.ms = Date.now() - started
    diag.loggedIn = !document.querySelector(SEL.commentLoggedOut)
    report(req.requestId, state, diag)
  }
  // 목록 틀이 생기고, 댓글이 있으면 댓글이 채워질 때까지
  const list = await waitFor(() => document.querySelector(SEL.commentList), 20_000, 100)
  if (!list) return send(document.querySelector(SEL.cbox) ? 'comments' : 'none', 'no-list')
  diag.stage = 'list'
  await waitFor(() => document.querySelector(SEL.commentItem), 3000, 100)
  // 댓글이 한꺼번에 채워지지 않을 때를 대비해 개수가 잠깐 그대로인지 본다
  let last = -1
  await waitFor(() => {
    const n = document.querySelectorAll(SEL.commentItem).length
    if (n === last) return true
    last = n
    return null
  }, 3000, 300)
  send('comments', 'read')
}

/** 내 글: 사용자가 댓글 영역을 펼치거나 목록이 바뀌면 다시 읽어 보낸다 (누르는 것 없음) */
let watching = false
function watchComments(): void {
  if (watching) return
  watching = true
  let timer: ReturnType<typeof setTimeout> | null = null
  let last = ''
  const check = (): void => {
    if (!document.querySelector(SEL.commentList)) return
    const sig = [...document.querySelectorAll(SEL.commentItem)].map((li) => li.getAttribute('data-info') ?? '').join('|')
    if (sig === last) return
    last = sig
    report(null, 'comments')
  }
  new MutationObserver(() => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(check, 700)
  }).observe(document.body, { childList: true, subtree: true })
  check()
  if (!document.querySelector(SEL.commentList)) report(null, document.querySelector(SEL.commentToggle(logNo)) ? 'closed' : 'none')
}

function countMatches(text: string): number {
  const target = norm(text)
  let n = 0
  for (const el of document.querySelectorAll<HTMLElement>(SEL.commentContents)) {
    if (norm(el.innerText) === target) n++
  }
  return n
}

/** 사용자가 누른 등록을 감지만 한다. 기본 동작은 막지 않는다. */
function onSubmitClick(button: Element): void {
  const wrap = button.closest(SEL.commentWrite) ?? document
  const input = wrap.querySelector<HTMLElement>(SEL.commentInput) ?? findInput()
  const text = (input?.innerText ?? '').replace(/​/g, '').trim()
  if (!text) return
  const secretEl = wrap.querySelector<HTMLInputElement>(SEL.commentSecret)
  const secret = Boolean(secretEl?.checked)
  const before = countMatches(text)
  ipcRenderer.send(NAVER_FRAME.submit, { blogId, logNo, text, secret })

  // 댓글 목록에 같은 내용이 새로 나타나면 등록 확인
  void (async () => {
    const appeared = await waitFor(() => (countMatches(text) > before ? true : null), 15_000, 500)
    ipcRenderer.send(NAVER_FRAME.submitResult, { blogId, logNo, text, confirmed: Boolean(appeared) })
  })()
}

function onLikeClick(): void {
  // 공감 상태는 네이버가 바꾼 뒤에 읽는다
  setTimeout(() => ipcRenderer.send(NAVER_FRAME.like, { blogId, logNo, liked: isLiked() }), 1500)
}

if (isPostView && blogId && logNo) {
  document.addEventListener(
    'click',
    (e) => {
      const target = e.target instanceof Element ? e.target : null
      if (!target) return
      const submit = target.closest(SEL.commentSubmit)
      if (submit) onSubmitClick(submit)
      else if (target.closest(SEL.likeButton)) onLikeClick()
    },
    true
  )

  ipcRenderer.on(NAVER_FRAME.fill, (_e, req: FillRequest) => {
    if (req.logNo !== logNo) return
    void fill(req.text)
      .catch(() => 'no-input' as const)
      .then((outcome) => ipcRenderer.send(NAVER_FRAME.fillResult, { requestId: req.requestId, outcome } satisfies FillResult))
  })

  ipcRenderer.on(NAVER_FRAME.fillReply, (_e, req: ReplyFillRequest) => {
    if (req.logNo !== logNo) return
    void fillReply(req.commentNo, req.text)
      .catch(() => 'no-reply' as const)
      .then((outcome) => ipcRenderer.send(NAVER_FRAME.fillResult, { requestId: req.requestId, outcome } satisfies FillResult))
  })

  ipcRenderer.on(NAVER_FRAME.watchComments, (_e, req: { logNo: string }) => {
    if (req.logNo === logNo) watchComments()
  })

  window.addEventListener('DOMContentLoaded', () => {
    void waitFor(extractPost, 15_000, 300).then((post) => {
      if (post) ipcRenderer.send(NAVER_FRAME.post, post)
    })
  })
}

// 이웃 가져오기: 사용자가 "이 화면에서 읽기"를 눌렀을 때만 링크를 읽는다 (클릭이나 이동은 하지 않는다)
if (/(^|\.)blog\.naver\.com$/i.test(location.hostname)) {
  ipcRenderer.on(NAVER_FRAME.scanBuddies, (_e, req: { requestId: string }) => {
    const area = first(SEL.buddyList)
    const root: ParentNode = area ?? document
    const links: BuddyScanResult['links'] = []
    for (const a of root.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      if (!/blog\.naver\.com/i.test(a.href)) continue
      links.push({ href: a.href, text: (a.innerText || a.title || '').slice(0, 60) })
      if (links.length >= 2000) break
    }
    ipcRenderer.send(NAVER_FRAME.buddies, { requestId: req.requestId, url: location.href, inList: area !== null, links } satisfies BuddyScanResult)
  })
}

if (isMobileComments && blogId && logNo) {
  // main은 화면이 뜰 때까지 같은 요청을 몇 번 보낸다. 한 번만 답한다.
  const answered = new Set<string>()
  ipcRenderer.on(NAVER_FRAME.scanComments, (_e, req: ScanCommentsRequest) => {
    if (req.logNo !== logNo || answered.has(req.requestId)) return
    answered.add(req.requestId)
    void scanComments(req).catch(() => report(req.requestId, 'none'))
  })
}
