/**
 * 문체 가이드 (docs/DECISIONS.md "최종본과 스타일 학습")
 * 등록이 확인된 최종본이 새로 STYLE_GUIDE_EVERY개 쌓이면 AI가 개정안을 만들고, 사용자가 승인해야 반영된다.
 */

export const STYLE_GUIDE_EVERY = 10
/** 가이드 길이 상한 (프롬프트에 매번 들어가므로 짧게) */
export const STYLE_GUIDE_MAX = 1200
/** 개정안을 만들 때 보여 줄 최종본 수 */
export const STYLE_SAMPLE_FINALS = 30

export interface StyleGuide {
  id: number
  content: string
  source: 'manual' | 'ai'
  status: 'active' | 'proposed' | 'rejected' | 'archived'
  basedOnCount: number
  createdAt: string
}

export interface StyleState {
  active: StyleGuide | null
  proposal: StyleGuide | null
  /** 등록이 확인된 최종본 수 */
  confirmedCount: number
  /** 다음 개정안을 만들 최종본 수 */
  nextAt: number
  /** 개정안 생성 중 */
  busy: boolean
  error: string | null
}

/**
 * 마지막으로 개정안을 만든 시점(승인·거절 무관) 이후 최종본이 충분히 쌓였는지.
 * 거절한 개정안도 기준점이 되어, 거절 직후 같은 개정안이 다시 오지 않는다.
 */
export function styleGuideDue(confirmedCount: number, lastBasedOn: number): boolean {
  return confirmedCount >= STYLE_GUIDE_EVERY && confirmedCount - lastBasedOn >= STYLE_GUIDE_EVERY
}

export function nextStyleAt(lastBasedOn: number): number {
  return Math.max(STYLE_GUIDE_EVERY, lastBasedOn + STYLE_GUIDE_EVERY)
}

export function styleSystemPrompt(): string {
  return [
    '너는 한 사람이 네이버 블로그 이웃에게 남긴 댓글을 읽고, 그 사람의 댓글 문체를 정리하는 편집자다.',
    '규칙:',
    '1. 실제 댓글에서 반복해서 보이는 특징만 적는다. 짐작이나 일반론은 적지 않는다.',
    '2. 말투(존댓말/반말 비율, 어미), 길이, 이모티콘·문장부호 습관, 자주 쓰는 표현, 피하는 표현, 글 내용을 언급하는 방식을 다룬다.',
    '3. 수정 전후 쌍이 있으면, 초안에서 무엇을 고치는지(줄이는지, 바꾸는 표현 등)를 적는다.',
    '4. 한 줄에 하나씩 "- "로 시작하는 짧은 항목 6~12개로 쓴다. 전체 1000자 이내.',
    '5. 기존 가이드가 있으면 여전히 맞는 항목은 유지하고, 달라진 점만 고친다.',
    '6. 댓글 원문을 그대로 옮기지 않는다.',
    '출력은 JSON 하나만: {"guide": "- 항목\\n- 항목"}'
  ].join('\n')
}

export function buildStylePrompt(input: {
  current: string | null
  finals: string[]
  pairs: { draft: string; final: string }[]
}): string {
  const parts: string[] = []
  parts.push('## 기존 가이드', input.current?.trim() || '(없음)', '')
  parts.push(`## 최근 등록한 댓글 ${input.finals.length}개`)
  input.finals.forEach((f, i) => parts.push(`${i + 1}. ${f}`))
  parts.push('')
  if (input.pairs.length > 0) {
    parts.push('## 초안 → 최종본')
    input.pairs.forEach((p, i) => parts.push(`${i + 1}. 초안: ${p.draft}`, `   최종: ${p.final}`))
    parts.push('')
  }
  parts.push('위 댓글로 문체 가이드를 써 줘.')
  return parts.join('\n')
}

/** AI 응답에서 가이드 본문을 꺼낸다. JSON이 아니면 본문 전체를 가이드로 본다. */
export function parseStyleGuide(raw: string): string {
  let text = raw.trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(text.slice(start, end + 1)) as { guide?: unknown }
      if (typeof obj.guide === 'string') text = obj.guide
      else if (Array.isArray(obj.guide)) text = obj.guide.map((g) => `- ${String(g).replace(/^-\s*/, '')}`).join('\n')
    } catch {
      // JSON이 아니면 그대로 쓴다
    }
  }
  text = text
    .replace(/^```\w*\n?|```$/g, '')
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l, i, arr) => l !== '' || (i > 0 && arr[i - 1] !== ''))
    .join('\n')
    .trim()
  if (!text) throw new Error('가이드가 비어 있어요.')
  return text.length > STYLE_GUIDE_MAX ? text.slice(0, STYLE_GUIDE_MAX).replace(/\n[^\n]*$/, '') : text
}

export type DiffLine = { kind: 'same' | 'add' | 'del'; text: string }

/** 줄 단위 차이 (LCS). 가이드 개정안을 보여 줄 때 쓴다. */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before ? before.split('\n') : []
  const b = after ? after.split('\n') : []
  const n = a.length
  const m = b.length
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: 'same', text: a[i] })
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ kind: 'del', text: a[i++] })
    } else {
      out.push({ kind: 'add', text: b[j++] })
    }
  }
  while (i < n) out.push({ kind: 'del', text: a[i++] })
  while (j < m) out.push({ kind: 'add', text: b[j++] })
  return out
}
