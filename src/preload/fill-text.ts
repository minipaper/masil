/**
 * 네이버 댓글/답글 입력칸(contenteditable)에 글을 넣는다. DOM만 쓰고 등록 버튼은 건드리지 않는다 (CLAUDE.md 원칙 1).
 *
 * 네이버는 입력칸에 처음 포커스가 가면 쓰기 영역을 새로 그려 입력칸을 바꿔 끼운다 (로그인 상태에서도, 2026-11-17 이슈 #1).
 * 바뀌기 전 입력칸에 넣으면 글이 상자 밖에 남고 네이버는 내용을 모른다. 그래서
 *  1) 포커스한 뒤 입력칸이 한동안 그대로일 때까지 기다렸다가, 지금 화면의 입력칸에 넣고
 *  2) 넣은 뒤 다시 찾아서 그 입력칸에 글이 들어 있을 때만 'filled'로 본다. 그새 바뀌어 끼워졌으면 한 번 더 채운다.
 * main은 채우기 전에 웹뷰에 포커스를 준다. 그래야 focus 이벤트가 바로 일어나 다시 그리기가 채우기 전에 끝난다.
 */
export type PutOutcome = 'filled' | 'no-input' | 'login'

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim()
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export interface PutOptions {
  /** 로그인이 필요한 입력칸인지 */
  blocked?: (el: HTMLElement) => boolean
  /** 같은 입력칸이 이만큼 그대로면 다 그려진 것으로 본다 */
  stableMs?: number
  /** 이 시간 안에 자리 잡지 않으면 포기 */
  timeoutMs?: number
}

/** 포커스 뒤 입력칸이 바뀌어 끼워지는지 지켜보다가, stableMs 동안 같은 입력칸이면 그것을 돌려준다 */
async function settle(find: () => HTMLElement | null, start: HTMLElement, stableMs: number, timeoutMs: number): Promise<HTMLElement | null> {
  const step = 100
  const end = Date.now() + timeoutMs
  let cur: HTMLElement | null = start
  let since = Date.now()
  while (Date.now() < end) {
    await sleep(step)
    const next = find()
    if (next !== cur) {
      cur = next
      since = Date.now()
      cur?.focus()
      continue
    }
    if (cur && Date.now() - since >= stableMs) return cur
  }
  return cur?.isConnected ? cur : null
}

function insert(input: HTMLElement, text: string): void {
  input.focus()
  const selection = window.getSelection()
  const range = document.createRange()
  range.selectNodeContents(input)
  selection?.removeAllRanges()
  selection?.addRange(range)
  // insertText는 입력칸 안에서만 일어나는 편집이고, 네이버가 듣는 input 이벤트도 함께 생긴다
  const ok = document.execCommand('insertText', false, text)
  if (!ok || norm(input.innerText) !== norm(text)) {
    input.textContent = text
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }))
  }
}

export async function putText(find: () => HTMLElement | null, text: string, opts: PutOptions = {}): Promise<PutOutcome> {
  const stableMs = opts.stableMs ?? 700
  let el = find()
  if (!el) return 'no-input'
  el.scrollIntoView({ block: 'center' })
  el.focus()
  // 네이버가 채운 뒤에 상자를 다시 그리면 한 번 더 채운다
  for (let attempt = 0; attempt < 2; attempt++) {
    const input = await settle(find, el, stableMs, opts.timeoutMs ?? 5000)
    if (!input) return 'no-input'
    if (opts.blocked?.(input)) return 'login'
    insert(input, text)
    await sleep(stableMs)
    const now = find()
    if (now && now.isConnected && norm(now.innerText) === norm(text)) return 'filled'
    if (!now) return 'no-input'
    el = now
  }
  return 'no-input'
}
