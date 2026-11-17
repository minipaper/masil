/**
 * AI 요청 옵션 조합 (docs/DECISIONS.md "AI 초안").
 * 서버·모델마다 받는 옵션이 달라서, 거절되면 덜 중요한 옵션부터 빼며 다시 보낸다.
 * - reasoning_effort "none": 추론형 모델의 생각 단계를 꺼서 초안을 빨리 받는다 (로컬 모델에서 10배 가까이 차이)
 * - JSON 모드: 응답 형식을 지키게 한다 (없어도 parseDrafts가 본문에서 JSON을 찾는다)
 * - temperature: 초안 말투를 고르게 한다
 */
export interface RequestOptions {
  temperature?: number
  response_format?: { type: 'json_object' }
  reasoning_effort?: 'none'
}

export function requestVariants(json: boolean, temperature: number): RequestOptions[] {
  // 중요도: 생각 끄기(속도) > JSON 모드 > temperature. 가중치 합이 큰 조합부터 시도한다.
  const parts = [
    { weight: 4, opt: { reasoning_effort: 'none' as const } },
    ...(json ? [{ weight: 2, opt: { response_format: { type: 'json_object' as const } } }] : []),
    { weight: 1, opt: { temperature } }
  ]
  const combos: { weight: number; opt: RequestOptions }[] = []
  for (let mask = 0; mask < 1 << parts.length; mask++) {
    const picked = parts.filter((_, i) => mask & (1 << i))
    combos.push({ weight: picked.reduce((s, p) => s + p.weight, 0), opt: Object.assign({}, ...picked.map((p) => p.opt)) })
  }
  return combos.sort((a, b) => b.weight - a.weight).map((c) => c.opt)
}

/** 옵션을 모른다는 뜻의 응답이면 옵션을 줄여 다시 보낸다: 400 잘못된 요청, 422 검증 실패, 501 지원 안 함 */
export const isOptionRejected = (status: number | undefined): boolean => status === 400 || status === 422 || status === 501
