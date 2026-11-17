import { app } from 'electron'
import { pickRequestDelay } from '@shared/policy'
import { parseNaverRss, type RssFeed } from '@shared/rss'
import { rssUrl } from '@shared/blog-id'

/**
 * 앱이 네이버로 보내는 모든 자동 요청은 이 큐를 거친다. (CLAUDE.md 원칙 2)
 * - 한 번에 하나씩 순차 실행
 * - 앞 요청이 끝난 뒤 3~6초 랜덤 지연 후 다음 요청
 */
let chain: Promise<unknown> = Promise.resolve()
let lastFinishedAt = 0

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export function enqueueNaverRequest<T>(task: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    if (lastFinishedAt > 0) {
      const wait = lastFinishedAt + pickRequestDelay() - Date.now()
      if (wait > 0) await sleep(wait)
    }
    try {
      return await task()
    } finally {
      lastFinishedAt = Date.now()
    }
  }
  const p = chain.then(run, run)
  chain = p.catch(() => undefined)
  return p
}

export type RssFetchResult =
  | { kind: 'ok'; feed: RssFeed; etag: string | null; lastModified: string | null }
  | { kind: 'not-modified' }
  | { kind: 'not-found' }

const TIMEOUT_MS = 15_000

/** RSS 한 개를 큐를 거쳐 가져온다. 네트워크 오류나 5xx는 throw. */
export function fetchRss(blogId: string, cache: { etag: string | null; lastModified: string | null }): Promise<RssFetchResult> {
  return enqueueNaverRequest(async () => {
    const headers: Record<string, string> = {
      'User-Agent': `Masil/${app.getVersion()} (RSS reader; +https://github.com/minipaper/masil)`,
      Accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.1'
    }
    if (cache.etag) headers['If-None-Match'] = cache.etag
    if (cache.lastModified) headers['If-Modified-Since'] = cache.lastModified

    const res = await fetch(rssUrl(blogId), { headers, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'follow' })
    if (res.status === 304) return { kind: 'not-modified' }
    if (res.status === 404) return { kind: 'not-found' }
    if (!res.ok) throw new Error(`RSS 응답 ${res.status}`)

    const feed = parseNaverRss(await res.text())
    // 없는 블로그도 200으로 빈 채널을 준다
    if (!feed.blogTitle && feed.items.length === 0) return { kind: 'not-found' }
    return { kind: 'ok', feed, etag: res.headers.get('etag'), lastModified: res.headers.get('last-modified') }
  })
}
