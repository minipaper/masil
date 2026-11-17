import { XMLParser } from 'fast-xml-parser'

export interface RssItem {
  logNo: string
  title: string
  url: string
  category: string | null
  tags: string[]
  excerpt: string
  publishedAt: string
}

export interface RssFeed {
  blogTitle: string
  items: RssItem[]
}

const parser = new XMLParser({
  ignoreAttributes: true,
  processEntities: true,
  trimValues: true,
  parseTagValue: false,
  isArray: (name) => name === 'item'
})

const EXCERPT_MAX = 300

/** 네이버 블로그 RSS(rss.blog.naver.com/{id}.xml)를 파싱한다. 형식이 아니면 throw. */
export function parseNaverRss(xml: string): RssFeed {
  const doc = parser.parse(xml) as { rss?: { channel?: Record<string, unknown> } }
  const channel = doc.rss?.channel
  if (!channel) throw new Error('RSS 형식이 아닙니다')

  const rawItems = (channel['item'] as Record<string, unknown>[] | undefined) ?? []
  const items: RssItem[] = []
  for (const it of rawItems) {
    const guid = text(it['guid']) || text(it['link'])
    const logNo = extractLogNo(guid)
    if (!logNo) continue
    const published = new Date(text(it['pubDate']))
    items.push({
      logNo,
      title: decodeEntities(text(it['title'])) || '(제목 없음)',
      url: stripTracking(text(it['link']) || guid),
      category: text(it['category']) || null,
      tags: splitTags(text(it['tag'])),
      excerpt: clip(collapse(text(it['description'])), EXCERPT_MAX),
      publishedAt: Number.isNaN(published.getTime()) ? new Date(0).toISOString() : published.toISOString()
    })
  }
  return { blogTitle: text(channel['title']), items }
}

function text(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number') return String(v)
  return ''
}

function extractLogNo(url: string): string | null {
  const m = url.match(/\/(\d{6,})(?:[/?#]|$)/) ?? url.match(/[?&]logNo=(\d+)/)
  return m?.[1] ?? null
}

function stripTracking(url: string): string {
  try {
    const u = new URL(url)
    u.searchParams.delete('fromRss')
    u.searchParams.delete('trackingCode')
    return u.toString()
  } catch {
    return url
  }
}

function splitTags(s: string): string[] {
  return s
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

function collapse(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/** CDATA 안에 그대로 남은 HTML 엔티티를 푼다. (XML 파서는 CDATA를 건드리지 않는다) */
function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole
    }
    return NAMED[body.toLowerCase()] ?? whole
  })
}

function clip(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`
}
