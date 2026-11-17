import OpenAI from 'openai'
import type { ChatCompletionContentPart, ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import {
  buildReplyPrompt,
  buildUserPrompt,
  findCliche,
  parseDrafts,
  replySystemPrompt,
  systemPrompt,
  type Draft,
  type DraftContext,
  type ReplyContext
} from '@shared/prompt'
import { buildStylePrompt, parseStyleGuide, styleSystemPrompt } from '@shared/style'
import type { AiSettings, AiTestResult } from '@shared/types'
import { isOptionRejected, requestVariants } from '@shared/ai-options'

/** 초안 품질 일관성을 위해 고정 (docs/DECISIONS.md "AI 초안") */
export const TEMPERATURE = 0.4
/** 로컬 모델은 처음 요청에서 모델을 메모리에 올리느라 오래 걸릴 수 있다 */
const TIMEOUT_MS = 120_000

export class AiSetupError extends Error {}

function client(ai: AiSettings, apiKey: string | null): OpenAI {
  if (!ai.baseUrl) throw new AiSetupError('AI 주소(Base URL)를 설정해 주세요.')
  if (!ai.model) throw new AiSetupError('사용할 모델 이름을 설정해 주세요.')
  // Ollama 같은 로컬 서버는 키가 없어도 된다. SDK가 빈 키를 거부해서 자리표시 값을 쓴다.
  return new OpenAI({ baseURL: ai.baseUrl, apiKey: apiKey || 'no-key', timeout: TIMEOUT_MS, maxRetries: 1 })
}

/**
 * 서버나 모델마다 받는 옵션이 달라서, 옵션을 거절하면(400, 422, 501) 덜 중요한 옵션부터 빼며 다시 보낸다.
 * 조합 순서는 @shared/ai-options. 서버·모델별로 통했던 옵션 단계를 기억해 매번 실패하는 요청을 다시 보내지 않는다 (앱 실행 중에만) */
const workingStep = new Map<string, number>()

async function complete(
  api: OpenAI,
  ai: AiSettings,
  messages: ChatCompletionMessageParam[],
  opts: { json?: boolean; temperature?: number } = {}
): Promise<string> {
  const json = opts.json ?? true
  const temperature = opts.temperature ?? TEMPERATURE
  const attempts = requestVariants(json, temperature)
  const key = `${ai.baseUrl}|${ai.model}|${json}`
  let lastError: unknown
  for (let i = workingStep.get(key) ?? 0; i < attempts.length; i++) {
    try {
      const res = await api.chat.completions.create({ model: ai.model, messages, ...attempts[i] })
      workingStep.set(key, i)
      return res.choices[0]?.message?.content ?? ''
    } catch (e) {
      lastError = e
      if (!(e instanceof OpenAI.APIError && isOptionRejected(e.status))) throw e
    }
  }
  throw lastError
}

/**
 * 초안을 만든다. 상투적 표현이 섞여 나오면 한 번만 다시 요청한다.
 * imageDataUrls는 sendImages 옵션이 켜져 있을 때만 넘어온다.
 */
export async function generateDrafts(
  ai: AiSettings,
  apiKey: string | null,
  ctx: DraftContext,
  imageDataUrls: string[] = []
): Promise<Draft[]> {
  const api = client(ai, apiKey)
  const userText = buildUserPrompt(ctx)
  const userContent: string | ChatCompletionContentPart[] =
    imageDataUrls.length > 0
      ? [{ type: 'text', text: userText }, ...imageDataUrls.map((url) => ({ type: 'image_url' as const, image_url: { url } }))]
      : userText
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt(ctx.tones.length) },
    { role: 'user', content: userContent }
  ]

  let drafts = parseDrafts(await complete(api, ai, messages), ctx.tones)
  const cliche = drafts.map((d) => findCliche(d.text)).find(Boolean)
  if (cliche) {
    messages.push(
      { role: 'assistant', content: JSON.stringify({ drafts }) },
      { role: 'user', content: `"${cliche}" 같은 상투적 표현이 들어갔어요. 본문의 구체적인 내용을 넣어 같은 형식으로 다시 써 주세요.` }
    )
    try {
      drafts = parseDrafts(await complete(api, ai, messages), ctx.tones)
    } catch {
      // 다시 쓰기에 실패하면 첫 결과를 그대로 쓴다
    }
  }
  return drafts
}

/** 최종본으로 문체 가이드 개정안을 만든다 */
export async function generateStyleGuide(
  ai: AiSettings,
  apiKey: string | null,
  input: Parameters<typeof buildStylePrompt>[0]
): Promise<string> {
  const api = client(ai, apiKey)
  const raw = await complete(api, ai, [
    { role: 'system', content: styleSystemPrompt() },
    { role: 'user', content: buildStylePrompt(input) }
  ])
  return parseStyleGuide(raw)
}

/** 설정 화면의 "연결 확인" */
export const DEFAULT_TEST_PROMPT = '연결 확인이에요. 한 문장으로 짧게 인사해 주세요.'

/** 설정 화면의 "보내 보기": 테스트 문장을 보내고 모델의 답을 그대로 돌려준다 */
/** 내 글에 달린 댓글 하나에 답글 초안을 만든다 */
export async function generateReplies(ai: AiSettings, apiKey: string | null, ctx: ReplyContext): Promise<Draft[]> {
  const api = client(ai, apiKey)
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: replySystemPrompt(ctx.tones.length) },
    { role: 'user', content: buildReplyPrompt(ctx) }
  ]
  return parseDrafts(await complete(api, ai, messages), ctx.tones)
}

export async function testConnection(ai: AiSettings, apiKey: string | null, prompt?: string): Promise<AiTestResult> {
  const started = Date.now()
  try {
    const api = client(ai, apiKey)
    const text = (prompt ?? '').trim() || DEFAULT_TEST_PROMPT
    const reply = (await complete(api, ai, [{ role: 'user', content: text.slice(0, 500) }], { json: false })).trim()
    const ms = Date.now() - started
    if (!reply) return { ok: false, message: '연결은 됐지만 모델이 빈 답을 보냈어요. 모델 이름을 확인해 주세요.', reply: '', ms, detail: null }
    return { ok: true, message: `연결됐어요. ${ai.model} 모델이 ${(ms / 1000).toFixed(1)}초 만에 답했어요.`, reply: reply.slice(0, 400), ms, detail: null }
  } catch (e) {
    const sent = ai.baseUrl ? `보낸 주소: ${ai.baseUrl} (모델 ${ai.model || '없음'})` : null
    const detail = [sent, serverDetail(e)].filter(Boolean).join('\n') || null
    return { ok: false, message: describeAiError(e), reply: '', ms: Date.now() - started, detail }
  }
}

/** 서버가 보낸 오류 문장 (키나 본문은 들어 있지 않다). 무엇이 틀렸는지 알 수 있게 그대로 보여 준다. */
function serverDetail(e: unknown): string | null {
  if (e instanceof OpenAI.APIError) {
    const status = e.status ? `HTTP ${e.status}` : '연결 오류'
    const msg = (e.message || '').replace(/sk-[A-Za-z0-9_-]{6,}/g, 'sk-…').slice(0, 300)
    return `${status}: ${msg}`
  }
  if (e instanceof Error && !(e instanceof AiSetupError)) return e.message.slice(0, 300)
  return null
}

export function describeAiError(e: unknown): string {
  if (e instanceof AiSetupError) return e.message
  if (e instanceof OpenAI.APIError) {
    if (e.status === 401 || e.status === 403) return 'API 키가 맞지 않아요. 설정에서 키를 확인해 주세요.'
    if (e.status === 404) return '모델이나 주소를 찾지 못했어요. 모델 이름과 Base URL을 확인해 주세요.'
    if (e.status === 429) return 'AI 사용량 한도에 걸렸어요. 잠시 뒤 다시 시도해 주세요.'
    if (e.status) return `AI 서버가 오류를 돌려줬어요 (${e.status}).`
    return 'AI 서버에 연결하지 못했어요. 주소와 인터넷 연결을 확인해 주세요.'
  }
  if (e instanceof Error) return e.message
  return '초안을 만들지 못했어요.'
}
