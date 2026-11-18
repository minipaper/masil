import type { DraftProgress } from './types'

/** 스트리밍으로 받은 응답 앞부분에서 몇 번째 초안을 쓰고 있는지 센다 ("text" 키가 나온 수, 1~total) */
export function currentDraft(partial: string, total: number): number {
  const started = partial.match(/"text"\s*:/g)?.length ?? 0
  return Math.min(Math.max(started, 1), Math.max(total, 1))
}

/** "12초", "1분 5초" */
export function formatElapsed(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000))
  return sec < 60 ? `${sec}초` : `${Math.floor(sec / 60)}분 ${sec % 60}초`
}

/** 이 시간이 지나도 첫 글자가 없으면 모델을 불러오는 중일 수 있다고 덧붙인다 */
export const SLOW_READING_MS = 15_000

/** 초안 패널의 진행 문구 */
export function progressText(p: DraftProgress, now: number): string {
  const t = formatElapsed(now - p.startedAt)
  if (p.phase === 'reading') return `본문을 읽는 중 · ${t}`
  if (p.phase === 'retrying') return `상투적 표현이 있어 다시 쓰는 중 · ${t}`
  return p.total > 1 ? `초안 ${p.current}/${p.total} 쓰는 중 · ${t}` : `초안 쓰는 중 · ${t}`
}
