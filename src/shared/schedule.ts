import type { QuietHours } from './types'

function toMinutes(hhmm: string): number | null {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/** 방해 금지 시간대인가. 자정을 넘는 구간(23:00~08:00)도 처리한다. */
export function isQuietTime(now: Date, quiet: QuietHours): boolean {
  if (!quiet.enabled) return false
  const start = toMinutes(quiet.start)
  const end = toMinutes(quiet.end)
  if (start == null || end == null || start === end) return false
  const cur = now.getHours() * 60 + now.getMinutes()
  return start < end ? cur >= start && cur < end : cur >= start || cur < end
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 연속 실패한 이웃은 확인 간격을 2배씩 늘린다(최대 하루).
 * 마지막 시도 후 그 간격이 지나지 않았으면 이번 확인에서 건너뛴다.
 */
export function shouldBackOff(failCount: number, lastAttemptAt: string | null, now: Date, intervalMinutes: number): boolean {
  if (failCount <= 0 || !lastAttemptAt) return false
  const last = new Date(lastAttemptAt).getTime()
  if (Number.isNaN(last)) return false
  const wait = Math.min(intervalMinutes * 60 * 1000 * 2 ** Math.min(failCount, 10), DAY_MS)
  return now.getTime() - last < wait
}

/** 새 글 알림 문구. 확인 한 번에 알림 하나로 묶는다. */
export function summarizeNewPosts(names: string[]): { title: string; body: string } | null {
  if (names.length === 0) return null
  const unique = [...new Set(names)]
  const shown = unique.slice(0, 2).join(', ')
  const rest = unique.length - 2
  return {
    title: `새 글 ${names.length}개`,
    body: rest > 0 ? `${shown} 외 ${rest}명` : shown
  }
}
