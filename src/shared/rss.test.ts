import { describe, expect, it } from 'vitest'
import { parseNaverRss } from './rss'

// 실제 네이버 RSS와 같은 구조로 만든 가짜 피드
const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:activity="http://activitystrea.ms/spec/1.0/" version="2.0">
  <channel>
    <title><![CDATA[봄비의 제주 일기]]></title>
    <link><![CDATA[https://blog.naver.com/springrain?fromRss=true&trackingCode=rss]]></link>
    <description><![CDATA[제주 사는 이야기]]></description>
    <language>ko</language>
    <generator>Naver Blog</generator>
    <pubDate>Tue, 17 Nov 2026 09:20:00 +0900</pubDate>
    <item>
      <author>springrain</author>
      <category><![CDATA[제주 오름]]></category>
      <title><![CDATA[제주 동쪽 오름 세 군데, 하루에 다 돌기]]></title>
      <link><![CDATA[https://blog.naver.com/springrain/223614208871?fromRss=true&trackingCode=rss]]></link>
      <guid>https://blog.naver.com/springrain/223614208871</guid>
      <description><![CDATA[아침 7시에 숙소를 나와서 &amp; 다랑쉬오름부터   올랐어요.]]></description>
      <pubDate>Tue, 17 Nov 2026 09:12:00 +0900</pubDate>
      <tag><![CDATA[제주오름,다랑쉬오름, 용눈이오름]]></tag>
    </item>
    <item>
      <author>springrain</author>
      <category><![CDATA[일상]]></category>
      <title><![CDATA[귤 따기 체험 후기]]></title>
      <link><![CDATA[https://blog.naver.com/springrain/223500000001?fromRss=true&trackingCode=rss]]></link>
      <guid>https://blog.naver.com/springrain/223500000001</guid>
      <description><![CDATA[]]></description>
      <pubDate>Wed, 28 Oct 2026 18:00:00 +0900</pubDate>
      <tag><![CDATA[]]></tag>
    </item>
  </channel>
</rss>`

describe('parseNaverRss', () => {
  const feed = parseNaverRss(SAMPLE)

  it('블로그 제목을 읽는다', () => {
    expect(feed.blogTitle).toBe('봄비의 제주 일기')
  })

  it('글 번호, 제목, 추적 파라미터 없는 주소를 뽑는다', () => {
    expect(feed.items).toHaveLength(2)
    expect(feed.items[0]).toMatchObject({
      logNo: '223614208871',
      title: '제주 동쪽 오름 세 군데, 하루에 다 돌기',
      url: 'https://blog.naver.com/springrain/223614208871',
      category: '제주 오름'
    })
  })

  it('태그를 쉼표로 나누고 빈 태그는 버린다', () => {
    expect(feed.items[0]?.tags).toEqual(['제주오름', '다랑쉬오름', '용눈이오름'])
    expect(feed.items[1]?.tags).toEqual([])
  })

  it('발행 시각을 ISO로, 요약은 공백 정리', () => {
    expect(feed.items[0]?.publishedAt).toBe('2026-11-17T00:12:00.000Z')
    expect(feed.items[0]?.excerpt).toBe('아침 7시에 숙소를 나와서 & 다랑쉬오름부터 올랐어요.')
  })

  it('글이 하나뿐이어도 배열로 처리한다', () => {
    const one = SAMPLE.replace(/<item>[\s\S]*?<\/item>\s*(?=<item>)/, '')
    expect(parseNaverRss(one).items).toHaveLength(1)
  })

  it('RSS가 아니면 에러', () => {
    expect(() => parseNaverRss('<html><body>점검 중</body></html>')).toThrow()
  })
})
