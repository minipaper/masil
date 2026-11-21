/**
 * 네이버 블로그 WebContentsView에 주입하는 preload.
 * nodeIntegrationInSubFrames로 모든 프레임에서 실행되고, PostView(mainFrame) 문서에서만 동작한다.
 *
 * 절대 원칙 (CLAUDE.md 원칙 1):
 *  - 공감/댓글 "등록" 버튼을 프로그램이 누르지 않는다. click(), submit(), 키 입력 흉내 금지.
 *  - 입력칸 채우기까지만 한다.
 *  - 등록·공감 클릭은 capture 리스너로 감지만 하고 기본 동작을 막지 않는다.
 *  - 예외로 누를 수 있는 버튼은 둘뿐이고, 사용자가 앱의 버튼을 눌렀을 때만 누른다.
 *    · 접힌 댓글 영역을 펼치는 토글(#Comi{logNo}): "채우기" 또는 "답방 갈 곳 찾아보기"를 눌렀을 때
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
  type ScanCommentsRequest
} from '@shared/naver-frame'
import { blogHomeId } from '@shared/buddy'
import { parseCommentInfo, toIso, type VisitorComment } from '@shared/visitors'
import type { PostContent } from '@shared/prompt'
import { putText } from './fill-text'
import { SEL, first } from './naver-selectors'

const isPostView = /\/PostView\.naver$/i.test(location.pathname) && location.hostname === 'blog.naver.com'

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

/** 지금 화면에 보이는 원댓글을 읽는다 (내 댓글, 지운 댓글, 답글은 뺀다) */
function readComments(): VisitorComment[] {
  const out: VisitorComment[] = []
  for (const li of document.querySelectorAll<HTMLElement>(SEL.commentItem)) {
    const info = parseCommentInfo(li.getAttribute('data-info'))
    if (!info || info.mine || info.deleted || info.replyLevel > 1) continue
    const href = li.querySelector<HTMLAnchorElement>(SEL.commentProfile)?.getAttribute('href') ?? ''
    const visitor = blogHomeId(href)
    const at = toIso(info.regTime)
    if (!visitor || !at) continue
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

function report(requestId: string | null, state: CommentsReport['state']): void {
  const msg: CommentsReport = {
    requestId,
    logNo,
    title: postTitle(),
    state,
    comments: state === 'comments' ? readComments() : [],
    total: commentCount()
  }
  ipcRenderer.send(NAVER_FRAME.comments, msg)
}

/** 댓글 토글("댓글 14")에 적힌 댓글 수. 모르면 null */
function commentCount(): number | null {
  const m = (document.querySelector<HTMLElement>(SEL.commentToggle(logNo))?.innerText ?? '').match(/댓글\s*([\d,]+)/)
  return m ? Number(m[1].replace(/,/g, '')) : null
}

/**
 * "답방 갈 곳 찾아보기": 댓글을 읽어 보낸다. open이면 접힌 댓글 영역의 토글만 누른다 (허용 버튼).
 * 글 본문이 먼저 뜨고 댓글 영역은 나중에 그려지므로, 토글이나 목록이 보이고 댓글이 채워질 때까지 기다린 뒤에 답한다.
 * 너무 일찍 답하면 댓글이 있는 글도 "없음"으로 끝난다 (2026-11-21 버그).
 */
async function scanComments(req: ScanCommentsRequest): Promise<void> {
  await waitFor(() => document.querySelector(SEL.commentList) ?? document.querySelector(SEL.commentToggle(logNo)), 10_000, 100)
  if (!document.querySelector(SEL.commentList)) {
    const toggle = document.querySelector<HTMLElement>(SEL.commentToggle(logNo))
    if (!toggle) return report(req.requestId, document.querySelector(SEL.cbox) ? 'comments' : 'none')
    const count = commentCount()
    if (count === 0) return report(req.requestId, 'comments')
    // 지난번과 댓글 수가 같으면 펼치지 않는다 (네이버에 댓글을 다시 불러오지 않아 빠르다)
    if (count !== null && count === req.known) return report(req.requestId, 'unchanged')
    if (!req.open) return report(req.requestId, 'closed')
    // 네이버 댓글 스크립트가 준비되기 전에 누르면 아무 일도 없다. 문서가 다 뜬 뒤에 누르고,
    // 그래도 목록이 안 생기면 한 번만 더 누른다 (같은 허용 버튼)
    await waitFor(() => (document.readyState === 'complete' ? true : null), 8000, 100)
    const list = (): Element | null => document.querySelector(SEL.commentList)
    toggle.click()
    if (!(await waitFor(list, 4000, 100))) {
      document.querySelector<HTMLElement>(SEL.commentToggle(logNo))?.click()
      if (!(await waitFor(list, 6000, 100))) return report(req.requestId, 'none')
    }
  }
  // 목록 틀이 먼저 생기고 댓글은 나중에 한꺼번에 채워진다
  const expected = commentCount() ?? 0
  await waitFor(() => document.querySelector(SEL.commentItem), expected > 0 ? 8000 : 1500, 100)
  report(req.requestId, 'comments')
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

  // main은 글이 뜰 때까지 같은 요청을 몇 번 보낸다. 한 번만 답한다.
  const answered = new Set<string>()
  ipcRenderer.on(NAVER_FRAME.scanComments, (_e, req: ScanCommentsRequest) => {
    if (req.logNo !== logNo || answered.has(req.requestId)) return
    answered.add(req.requestId)
    void scanComments(req).catch(() => report(req.requestId, 'none'))
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
