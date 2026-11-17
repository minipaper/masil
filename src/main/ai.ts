import OpenAI from 'openai'
import type { ChatCompletionContentPart, ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { buildUserPrompt, findCliche, parseDrafts, systemPrompt, type Draft, type DraftContext } from '@shared/prompt'
import type { AiSettings } from '@shared/types'

/** 초안 품질 일관성을 위해 고정 (docs/DECISIONS.md "AI 초안") */
export const TEMPERATURE = 0.4
const TIMEOUT_MS = 60_000

export class AiSetupError extends Error {}

function client(ai: AiSettings, apiKey: string | null): OpenAI {
  if (!ai.baseUrl) throw new AiSetupError('AI 주소(Base URL)를 설정해 주세요.')
  if (!ai.model) throw new AiSetupError('사용할 모델 이름을 설정해 주세요.')
  // Ollama 같은 로컬 서버는 키가 없어도 된다. SDK가 빈 키를 거부해서 자리표시 값을 쓴다.
  return new OpenAI({ baseURL: ai.baseUrl, apiKey: apiKey || 'no-key', timeout: TIMEOUT_MS, maxRetries: 1 })
}

async function complete(api: OpenAI, ai: AiSettings, messages: ChatCompletionMessageParam[]): Promise<string> {
  const base = { model: ai.model, temperature: TEMPERATURE, messages }
  try {
    const res = await api.chat.completions.create({ ...base, response_format: { type: 'json_object' } })
    return res.choices[0]?.message?.content ?? ''
  } catch (e) {
    // JSON 모드를 지원하지 않는 서버면 형식 지정 없이 한 번 더
    if (e instanceof OpenAI.APIError && e.status === 400) {
      const res = await api.chat.completions.create(base)
      return res.choices[0]?.message?.content ?? ''
    }
    throw e
  }
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

/** 설정 화면의 "연결 확인" */
export async function testConnection(ai: AiSettings, apiKey: string | null): Promise<{ ok: boolean; message: string }> {
  try {
    const api = client(ai, apiKey)
    const res = await api.chat.completions.create({
      model: ai.model,
      temperature: 0,
      max_tokens: 5,
      messages: [{ role: 'user', content: '확인용 메시지입니다. "네"라고만 답하세요.' }]
    })
    const text = res.choices[0]?.message?.content?.trim()
    return { ok: true, message: `연결됐어요. 모델이 "${text?.slice(0, 20) || '(빈 응답)'}"라고 답했어요.` }
  } catch (e) {
    return { ok: false, message: describeAiError(e) }
  }
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
