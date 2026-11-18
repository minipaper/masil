import { describe, expect, it } from 'vitest'
import {
  BODY_LIMIT,
  DEFAULT_TONES,
  MAX_TONES,
  TONE_PRESETS,
  nextTone,
  buildReplyPrompt,
  buildUserPrompt,
  REPLY_TONES,
  replySystemPrompt,
  findCliche,
  normalizeComment,
  parseDrafts,
  systemPrompt,
  type DraftContext
} from './prompt'

const ctx: DraftContext = {
  post: {
    blogId: 'springrain',
    logNo: '223614208871',
    url: 'https://blog.naver.com/springrain/223614208871',
    title: '제주 동쪽 오름 세 군데, 하루에 다 돌기',
    body: '아침 7시에 숙소를 나와서 다랑쉬오름부터 올랐어요.',
    captions: ['아끈다랑쉬, 밥그릇 엎어놓은 모양'],
    places: ['다랑쉬오름'],
    tags: ['제주오름'],
    images: [],
    liked: false
  },
  neighbor: { honorific: '봄비님', nickname: '봄비의 제주 일기', speech: 'polite', closeness: 3, memo: '귤밭 얘기 나눔' },
  styleGuide: '문장 끝에 ㅎㅎ를 자주 붙인다.',
  recentFinals: ['바질 페스토 색이 진짜 진하네요 ㅎㅎ'],
  neighborFinals: [{ postTitle: '귤 따기 체험 후기', text: '노지 귤이 이렇게 새콤한 줄 몰랐네요.' }],
  pairs: [{ draft: '정말 멋진 풍경이네요!', final: '억새가 저렇게 키가 큰 줄 몰랐어요 ㅎㅎ' }],
  tones: TONE_PRESETS
}

describe('프롬프트 조립', () => {
  const user = buildUserPrompt(ctx)

  it('톤, 이웃 정보, 예시, 본문이 모두 들어간다', () => {
    expect(user).toContain('1. 다정한 공감')
    expect(user).toContain('부를 호칭: 봄비님')
    expect(user).toContain('말투: 존댓말')
    expect(user).toContain('아주 가까운 사이')
    expect(user).toContain('문장 끝에 ㅎㅎ를')
    expect(user).toContain('바질 페스토')
    expect(user).toContain('「귤 따기 체험 후기」에')
    expect(user).toContain('초안: 정말 멋진 풍경이네요!')
    expect(user).toContain('사진 설명: 아끈다랑쉬')
    expect(user).toContain('다랑쉬오름부터 올랐어요')
  })

  it('이웃 정보와 예시가 없으면 해당 구역을 뺀다', () => {
    const bare = buildUserPrompt({ ...ctx, neighbor: null, styleGuide: null, recentFinals: [], neighborFinals: [], pairs: [] })
    expect(bare).not.toContain('이웃 정보')
    expect(bare).not.toContain('스타일 가이드')
    expect(bare).toContain('댓글을 달 글')
  })

  it('명단에 없는 블로그는 글쓴이 닉네임으로 처음 인사한다', () => {
    const stranger = buildUserPrompt({ ...ctx, neighbor: null, post: { ...ctx.post, authorNick: '햇살' } })
    expect(stranger).toContain('글쓴이 정보')
    expect(stranger).toContain('부를 호칭: 햇살님')
    expect(stranger).toContain('처음 찾아온 사이')
    expect(stranger).not.toContain('이웃 정보')
  })

  it('본문은 3000자에서 자른다', () => {
    const long = buildUserPrompt({ ...ctx, post: { ...ctx.post, body: '가'.repeat(BODY_LIMIT + 500) } })
    expect(long).toContain('…(이하 생략)')
    expect(long).not.toContain('가'.repeat(BODY_LIMIT + 1))
  })

  it('본문이 비면 사진 위주 글이라고 알린다', () => {
    expect(buildUserPrompt({ ...ctx, post: { ...ctx.post, body: '  ' } })).toContain('사진 위주 글')
  })

  it('시스템 프롬프트에 개수와 금지 규칙이 있다', () => {
    const sys = systemPrompt(3)
    expect(sys).toContain('정확히 3개')
    expect(sys).toContain('좋은 글 잘 보고 가요')
    expect(sys).toContain('구체적인 내용')
  })
})

describe('응답 해석', () => {
  it('깔끔한 JSON', () => {
    const raw = JSON.stringify({
      drafts: [
        { tone: '다정한 공감', text: '아끈다랑쉬가 정말 밥그릇 같네요' },
        { tone: '짧고 가볍게', text: '모자 날릴 뻔한 용눈이오름!' },
        { tone: '질문으로 잇기', text: '손지오름은 해 질 녘이 제일 예쁜가요?' }
      ]
    })
    expect(parseDrafts(raw, TONE_PRESETS)).toHaveLength(3)
  })

  it('코드 펜스와 잡담 사이의 JSON, 문자열 속 중괄호도 처리', () => {
    const raw = '물론이죠!\n```json\n{"drafts":[{"tone":"다정한 공감","text":"괄호 {이런} 것도 괜찮아요"}]}\n```\n끝'
    expect(parseDrafts(raw, TONE_PRESETS)).toEqual([{ tone: '다정한 공감', text: '괄호 {이런} 것도 괜찮아요' }])
  })

  it('톤 이름이 다르면 순서대로 맞춘다', () => {
    const raw = '{"drafts":[{"tone":"warm","text":"a"},{"tone":"short","text":"b"}]}'
    expect(parseDrafts(raw, TONE_PRESETS).map((d) => d.tone)).toEqual(['다정한 공감', '짧고 가볍게'])
  })

  it('빈 초안은 버리고, 남는 게 없으면 에러', () => {
    expect(() => parseDrafts('{"drafts":[{"tone":"x","text":"  "}]}', TONE_PRESETS)).toThrow()
    expect(() => parseDrafts('JSON 없음', TONE_PRESETS)).toThrow()
  })

  it('톤 수보다 많으면 자른다', () => {
    const raw = JSON.stringify({ drafts: Array.from({ length: 5 }, (_, i) => ({ tone: '', text: `t${i}` })) })
    expect(parseDrafts(raw, TONE_PRESETS)).toHaveLength(3)
  })
})

describe('상투적 표현과 비교', () => {
  it('상투적 표현을 찾는다', () => {
    expect(findCliche('사진 예뻐요. 좋은 글 잘 보고 가요~')).toBe('좋은 글 잘 보고 가요')
    expect(findCliche('아끈다랑쉬가 밥그릇 같네요')).toBeNull()
  })
  it('공백 차이를 무시하고 비교한다', () => {
    expect(normalizeComment('  안녕하세요\n\n봄비님  ')).toBe('안녕하세요 봄비님')
  })
})

describe('답글 프롬프트', () => {
  it('내 글, 댓글, 쓴 사람, 스타일을 넣고 톤 수를 맞춘다', () => {
    const p = buildReplyPrompt({
      postTitle: '제주 오름 세 군데',
      postBody: '다랑쉬오름부터 올랐어요.',
      visitorNick: '햇살',
      comment: '다랑쉬오름 몇 시간 걸려요?',
      styleGuide: '문장 끝에 ㅎㅎ',
      recentFinals: ['억새가 멋져요 ㅎㅎ'],
      tones: REPLY_TONES
    })
    expect(p).toContain('1. 고마움 담아')
    expect(p).toContain('쓴 사람: 햇살')
    expect(p).toContain('다랑쉬오름 몇 시간')
    expect(p).toContain('문장 끝에 ㅎㅎ')
    expect(replySystemPrompt(2)).toContain('정확히 2개')
  })
})

describe('톤 개수 (설정의 빼기/톤 추가)', () => {
  it('기본은 "질문으로 잇기"를 뺀 두 톤', () => {
    expect(DEFAULT_TONES.map((t) => t.name)).toEqual(['다정한 공감', '짧고 가볍게'])
    expect(TONE_PRESETS).toHaveLength(MAX_TONES)
  })
  it('톤 추가는 아직 안 쓰는 프리셋부터 넣는다', () => {
    expect(nextTone(DEFAULT_TONES).name).toBe('질문으로 잇기')
    expect(nextTone([TONE_PRESETS[2]]).name).toBe('다정한 공감')
  })
  it('프리셋을 다 쓰고 있으면 빈 톤을 넣는다', () => {
    expect(nextTone([{ name: '다정한 공감', description: '' }, { name: '짧고 가볍게', description: '' }, { name: '질문으로 잇기', description: '' }])).toEqual({ name: '', description: '' })
  })
  it('넣은 톤은 프리셋과 따로 고칠 수 있다 (복사본)', () => {
    const t = nextTone([])
    t.name = '바꿈'
    expect(TONE_PRESETS[0].name).toBe('다정한 공감')
  })
})
