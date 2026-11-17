import type { Speech, ToneSpec } from './types'

export type { ToneSpec }

/** 네이버 글 화면에서 뽑은 내용 */
export interface PostContent {
  blogId: string
  logNo: string
  url: string
  title: string
  body: string
  captions: string[]
  places: string[]
  tags: string[]
  /** 이미지 주소 (AI에 이미지 보내기 옵션용) */
  images: string[]
  liked: boolean
  /** 글쓴이 네이버 닉네임 (글 화면의 meta에서 읽음) */
  authorNick?: string
}

export const DEFAULT_TONES: ToneSpec[] = [
  { name: '다정한 공감', description: '따뜻하게 맞장구치며 글쓴이의 마음에 공감한다. 2~3문장.' },
  { name: '짧고 가볍게', description: '한두 문장으로 가볍고 산뜻하게.' },
  { name: '질문으로 잇기', description: '본문 내용에 대해 궁금한 점을 하나 물어 대화를 이어 간다.' }
]

export interface DraftContext {
  post: PostContent
  neighbor: { honorific: string; nickname: string; speech: Speech; closeness: number; memo: string } | null
  styleGuide: string | null
  /** 최근 내가 등록한 댓글 (다른 이웃 포함) */
  recentFinals: string[]
  /** 이 이웃에게 쓴 과거 댓글 */
  neighborFinals: { postTitle: string; text: string }[]
  /** AI 초안 → 내가 고친 최종본 */
  pairs: { draft: string; final: string }[]
  tones: ToneSpec[]
}

export interface Draft {
  tone: string
  text: string
}

export const BODY_LIMIT = 3000

/** 상투적 표현. 시스템 프롬프트에서 금지하고, 응답에서도 걸러낸다. */
export const CLICHES = [
  '좋은 글 잘 보고 가요',
  '좋은 글 잘 보고 갑니다',
  '잘 보고 갑니다',
  '잘 보고 가요',
  '좋은 정보 감사합니다',
  '좋은 정보 잘 보고',
  '포스팅 잘 봤',
  '좋은 하루 되세요',
  '행복한 하루 되세요',
  '소통해요',
  '서이추',
  '맞팔'
]

export function findCliche(text: string): string | null {
  const t = text.replace(/\s+/g, ' ')
  return CLICHES.find((c) => t.includes(c)) ?? null
}

export function systemPrompt(toneCount: number): string {
  return [
    '너는 네이버 블로그 이웃의 글에 남길 댓글 초안을 쓰는 도우미다. 초안은 사용자 본인이 직접 쓴 것처럼, 사용자의 말투로 쓴다.',
    '',
    '규칙:',
    '1. 초안마다 본문에 나온 구체적인 내용(장소, 음식, 물건, 사건, 인상적인 문장 등)을 최소 1개 언급한다.',
    `2. 다음 같은 상투적 표현은 쓰지 않는다: ${CLICHES.slice(0, 8)
      .map((c) => `"${c}"`)
      .join(', ')}.`,
    '3. 본문에 없는 사실을 지어내지 않는다. 사용자가 겪은 일을 꾸며내지 않는다.',
    '4. 이웃 정보에 호칭과 말투(존댓말/반말)가 있으면 반드시 따른다.',
    '5. 스타일 가이드와 예시 댓글의 길이, 어미, 웃음 표현(ㅎㅎ 등), 이모티콘 습관을 따른다. 예시 문장을 그대로 베끼지는 않는다.',
    '6. "AI 초안 → 사용자가 고친 최종본" 예시가 있으면, 사용자가 어떤 방향으로 고치는지 배워서 처음부터 그렇게 쓴다.',
    '7. 링크, 해시태그, 광고, 이웃 추가 요청을 넣지 않는다.',
    '',
    `출력은 JSON 객체 하나만: {"drafts":[{"tone":"<톤 이름>","text":"<댓글>"}]}. drafts는 주어진 톤 순서대로 정확히 ${toneCount}개.`
  ].join('\n')
}

function clip(s: string, max: number): string {
  const t = s.trim()
  return t.length <= max ? t : `${t.slice(0, max)}…(이하 생략)`
}

function section(title: string, body: string): string {
  return `## ${title}\n${body.trim()}`
}

const SPEECH_TEXT: Record<Speech, string> = { polite: '존댓말', casual: '반말' }

export function buildUserPrompt(ctx: DraftContext): string {
  const { post, neighbor } = ctx
  const parts: string[] = []

  parts.push(
    section(
      '써야 할 톤 (이 순서대로)',
      ctx.tones.map((t, i) => `${i + 1}. ${t.name}: ${t.description}`).join('\n')
    )
  )

  if (neighbor) {
    const lines = [
      `- 부를 호칭: ${neighbor.honorific || `${neighbor.nickname}님`}`,
      `- 말투: ${SPEECH_TEXT[neighbor.speech]}`,
      `- 친밀도: ${['조금 아는 사이', '보통', '아주 가까운 사이'][Math.min(3, Math.max(1, neighbor.closeness)) - 1]}`
    ]
    if (neighbor.memo.trim()) lines.push(`- 메모: ${neighbor.memo.trim()}`)
    parts.push(section('이웃 정보', lines.join('\n')))
  } else if (post.authorNick?.trim()) {
    // 명단에 없는 블로그: 처음 찾아온 사이로 쓴다
    const lines = [`- 부를 호칭: ${post.authorNick.trim()}님`, `- 말투: ${SPEECH_TEXT.polite}`, '- 친밀도: 아직 이웃이 아니고 처음 찾아온 사이']
    parts.push(section('글쓴이 정보', lines.join('\n')))
  }

  if (ctx.styleGuide?.trim()) parts.push(section('내 댓글 스타일 가이드', ctx.styleGuide))

  if (ctx.recentFinals.length > 0) {
    parts.push(section('최근 내가 실제로 남긴 댓글', ctx.recentFinals.map((t) => `- ${t}`).join('\n')))
  }
  if (ctx.neighborFinals.length > 0) {
    parts.push(
      section(
        '이 이웃에게 예전에 남긴 댓글',
        ctx.neighborFinals.map((c) => `- 「${c.postTitle}」에: ${c.text}`).join('\n')
      )
    )
  }
  if (ctx.pairs.length > 0) {
    parts.push(
      section(
        'AI 초안을 내가 이렇게 고쳤다',
        ctx.pairs.map((p) => `- 초안: ${p.draft}\n  최종: ${p.final}`).join('\n')
      )
    )
  }

  const postLines = [`제목: ${post.title}`]
  if (post.tags.length) postLines.push(`태그: ${post.tags.join(', ')}`)
  if (post.places.length) postLines.push(`장소: ${post.places.join(', ')}`)
  if (post.captions.length) postLines.push(`사진 설명: ${post.captions.join(' / ')}`)
  postLines.push('', '본문:', clip(post.body, BODY_LIMIT) || '(본문 글이 거의 없는 사진 위주 글)')
  parts.push(section('댓글을 달 글', postLines.join('\n')))

  return parts.join('\n\n')
}

/**
 * 모델 응답에서 초안을 꺼낸다. 앞뒤 잡담이나 ```json 펜스가 있어도 첫 JSON 객체를 찾는다.
 * 톤 이름이 어긋나면 순서대로 맞춘다. 쓸 만한 초안이 하나도 없으면 throw.
 */
export function parseDrafts(raw: string, tones: ToneSpec[]): Draft[] {
  const json = extractJsonObject(raw)
  if (!json) throw new Error('AI 응답에서 JSON을 찾지 못했어요')
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    throw new Error('AI 응답 JSON을 읽지 못했어요')
  }
  const list = Array.isArray((data as { drafts?: unknown }).drafts) ? (data as { drafts: unknown[] }).drafts : []
  const drafts: Draft[] = []
  list.forEach((d, i) => {
    if (!d || typeof d !== 'object') return
    const text = typeof (d as { text?: unknown }).text === 'string' ? (d as { text: string }).text.trim() : ''
    if (!text) return
    const rawTone = (d as { tone?: unknown }).tone
    const tone = tones.find((t) => t.name === rawTone)?.name ?? tones[i]?.name ?? (typeof rawTone === 'string' ? rawTone : `초안 ${i + 1}`)
    drafts.push({ tone, text })
  })
  if (drafts.length === 0) throw new Error('AI가 초안을 돌려주지 않았어요')
  return drafts.slice(0, tones.length)
}

function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return raw.slice(start, i + 1)
    }
  }
  return null
}

/** 댓글 비교용 정규화 (공백 차이 무시) */
export function normalizeComment(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}
