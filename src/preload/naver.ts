/**
 * 네이버 블로그 WebContentsView에 주입하는 preload.
 * nodeIntegrationInSubFrames로 모든 프레임에서 실행되고, PostView(mainFrame) 문서에서만 동작한다.
 *
 * 절대 원칙 (CLAUDE.md 원칙 1):
 *  - 공감/댓글 "등록" 버튼을 프로그램이 누르지 않는다. click(), submit(), 키 입력 흉내 금지.
 *  - 입력칸 채우기까지만 한다.
 *  - 등록·공감 클릭은 capture 리스너로 감지만 하고 기본 동작을 막지 않는다.
 *  - 예외: 사용자가 "채우기"를 눌렀을 때, 접힌 댓글 영역을 펼치는 토글(#Comi{logNo})만 누를 수 있다.
 */
import { ipcRenderer } from 'electron'
import { NAVER_FRAME, type BuddyScanResult, type FillRequest, type FillResult } from '@shared/naver-frame'
import type { PostContent } from '@shared/prompt'
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

function findInput(): HTMLElement | null {
  return document.querySelector<HTMLElement>(`${SEL.commentWrite} ${SEL.commentInput}`) ?? document.querySelector<HTMLElement>(SEL.commentInput)
}

/** 입력칸에 글을 넣는다. 등록 버튼은 건드리지 않는다. */
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
  if (document.querySelector(SEL.commentLoggedOut)) return 'login'

  input.scrollIntoView({ block: 'center', behavior: 'smooth' })
  input.focus()
  const selection = window.getSelection()
  const range = document.createRange()
  range.selectNodeContents(input)
  selection?.removeAllRanges()
  selection?.addRange(range)
  // insertText는 입력칸 안에서만 일어나는 편집이다 (등록과 무관)
  const ok = document.execCommand('insertText', false, text)
  if (!ok || norm(input.innerText) !== norm(text)) {
    input.textContent = text
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }))
  }
  // 네이버가 입력칸을 바꿔 끼웠으면 채운 것으로 치지 않는다
  return input.isConnected && norm(input.innerText) === norm(text) ? 'filled' : 'no-input'
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
