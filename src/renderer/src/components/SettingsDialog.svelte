<script lang="ts">
  import { MIN_CHECK_INTERVAL_MINUTES } from '@shared/policy'
  import { REPLY_CHECK_POSTS } from '@shared/visitors'
  import type { AiTestResult, Settings, UpdateStatus } from '@shared/types'
  import { appState } from '../lib/app-state.svelte'
  import StyleGuideSection from './StyleGuideSection.svelte'

  const api = window.masil

  const PRESETS = [
    { label: 'OpenAI', url: 'https://api.openai.com/v1' },
    { label: 'OpenRouter', url: 'https://openrouter.ai/api/v1' },
    { label: 'Ollama (내 PC)', url: 'http://localhost:11434/v1' }
  ]

  // 열 때의 설정을 복사해 고친 뒤 "저장"할 때 반영
  // svelte-ignore state_referenced_locally
  const initial = appState.settings as Settings
  let form = $state({
    baseUrl: initial.ai.baseUrl,
    model: initial.ai.model,
    autoGenerate: initial.ai.autoGenerate,
    sendImages: initial.ai.sendImages,
    checkIntervalMinutes: initial.checkIntervalMinutes,
    quietEnabled: initial.quietHours.enabled,
    quietStart: initial.quietHours.start,
    quietEnd: initial.quietHours.end,
    launchAtLogin: initial.launchAtLogin,
    tones: initial.ai.tones.map((t) => ({ ...t })),
    examples: { ...initial.ai.examples },
    myBlogId: initial.myBlogId ?? '',
    replyCheckPosts: initial.replyCheckPosts
  })
  // 내 블로그 찾기는 웹뷰에서 끝나므로, 그사이 main이 알려 준 값을 반영한다
  $effect(() => {
    const id = appState.settings?.myBlogId
    if (id && !form.myBlogId) form.myBlogId = id
  })
  let dataNote = $state<{ ok: boolean; text: string } | null>(null)
  let version = $state('')
  let update = $state<UpdateStatus>({ kind: 'idle' })
  $effect(() => {
    void api.app.info().then((i) => {
      version = i.version
      update = i.update
    })
    return api.app.onUpdate((s) => (update = s))
  })
  const UPDATE_TEXT: Record<UpdateStatus['kind'], string> = {
    idle: '',
    checking: '확인하는 중이에요.',
    none: '최신 버전이에요.',
    downloading: '새 버전을 받는 중이에요.',
    ready: '새 버전을 받아 두었어요. 마실을 종료하면 설치돼요.',
    error: '업데이트를 확인하지 못했어요.',
    dev: '개발 실행에서는 업데이트를 확인하지 않아요.'
  }
  const updateText = $derived(
    update.kind === 'downloading' || update.kind === 'ready' ? `${update.version}: ${UPDATE_TEXT[update.kind]}` : UPDATE_TEXT[update.kind]
  )
  let apiKey = $state('')
  let hasKey = $state(initial.hasApiKey)
  let saving = $state(false)
  let testing = $state(false)
  let notice = $state<{ ok: boolean; text: string } | null>(null)
  let testPrompt = $state('연결 확인이에요. 한 문장으로 짧게 인사해 주세요.')
  let testResult = $state<AiTestResult | null>(null)

  const intervalTooShort = $derived(form.checkIntervalMinutes < MIN_CHECK_INTERVAL_MINUTES)

  async function persist(): Promise<boolean> {
    if (apiKey.trim()) {
      const res = await api.ai.setKey(apiKey.trim())
      if (!res.ok) {
        notice = { ok: false, text: res.message ?? 'API 키를 저장하지 못했어요.' }
        return false
      }
      apiKey = ''
      hasKey = true
    }
    await appState.saveSettings({
      checkIntervalMinutes: Math.max(MIN_CHECK_INTERVAL_MINUTES, Math.round(form.checkIntervalMinutes || 0)),
      quietHours: { enabled: form.quietEnabled, start: form.quietStart, end: form.quietEnd },
      launchAtLogin: form.launchAtLogin,
      myBlogId: form.myBlogId.trim() || null,
      replyCheckPosts: Math.min(REPLY_CHECK_POSTS.max, Math.max(REPLY_CHECK_POSTS.min, Math.round(form.replyCheckPosts || REPLY_CHECK_POSTS.default))),
      ai: {
        ...initial.ai,
        baseUrl: form.baseUrl,
        model: form.model,
        autoGenerate: form.autoGenerate,
        sendImages: form.sendImages,
        tones: form.tones,
        examples: form.examples
      }
    })
    return true
  }

  async function save(e: SubmitEvent): Promise<void> {
    e.preventDefault()
    saving = true
    notice = null
    try {
      if (await persist()) appState.openSettings(false)
    } catch (err) {
      notice = { ok: false, text: `설정을 저장하지 못했어요. ${errorText(err)}` }
    } finally {
      saving = false
    }
  }

  const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err)).replace(/^Error invoking remote method '[^']+': /, '').slice(0, 200)

  /** 지금 입력한 설정을 저장한 뒤 테스트 문장을 보낸다 */
  async function test(): Promise<void> {
    testing = true
    notice = null
    testResult = null
    try {
      if (!(await persist())) return
      testResult = await api.ai.test(testPrompt)
    } catch (err) {
      testResult = { ok: false, message: '보내기 전에 문제가 생겼어요.', reply: '', ms: 0, detail: errorText(err) }
    } finally {
      testing = false
    }
  }

  async function removeKey(): Promise<void> {
    const res = await api.ai.setKey(null)
    hasKey = res.settings.hasApiKey
    notice = { ok: true, text: 'API 키를 지웠어요.' }
  }

  function findMyBlog(): void {
    appState.openSettings(false)
    void api.findMyBlog()
  }

  async function exportData(): Promise<void> {
    dataNote = null
    const res = await api.data.export()
    if (res.message) dataNote = { ok: res.ok, text: res.message }
  }

  async function importData(): Promise<void> {
    dataNote = null
    const res = await api.data.import()
    if (res.message) dataNote = { ok: res.ok, text: res.message }
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') appState.openSettings(false)
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="backdrop">
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
  <form class="inner" onsubmit={save}>
    <header>
      <h2 id="settings-title">설정</h2>
      <button type="button" class="ghost" onclick={() => appState.openSettings(false)}>닫기</button>
    </header>

    <div class="body">
      <section>
        <h3>AI 연결</h3>
        <p class="hint">OpenAI 호환 API라면 어디든 쓸 수 있어요. API 키는 이 PC에 암호화해서 저장해요.</p>
        <label class="field">
          <span>Base URL</span>
          <input bind:value={form.baseUrl} placeholder="https://api.openai.com/v1" spellcheck="false" />
        </label>
        <div class="presets">
          {#each PRESETS as p (p.url)}
            <button type="button" class="chip" class:on={form.baseUrl === p.url} onclick={() => (form.baseUrl = p.url)}>{p.label}</button>
          {/each}
        </div>
        <label class="field">
          <span>API 키</span>
          <input type="password" bind:value={apiKey} placeholder={hasKey ? '저장된 키가 있어요. 바꾸려면 새로 입력' : '로컬 서버(Ollama)는 비워 둬도 돼요'} autocomplete="off" />
        </label>
        {#if hasKey}
          <p class="hint">저장된 키가 있어요. <button type="button" class="link" onclick={removeKey}>키 지우기</button></p>
        {/if}
        <label class="field">
          <span>모델</span>
          <input bind:value={form.model} placeholder="서비스에서 쓰는 모델 이름 그대로" spellcheck="false" />
        </label>
        <div class="test">
          <p class="test-title">연결 확인</p>
          <p class="hint">위 설정을 저장하고 이 문장을 모델에게 보내요. 답이 오면 제대로 연결된 거예요.</p>
          <div class="test-row">
            <input bind:value={testPrompt} aria-label="테스트 문장" />
            <button type="button" class="primary" disabled={testing || saving} onclick={test}>{testing ? '기다리는 중' : '보내 보기'}</button>
          </div>
          {#if testResult}
            <div class="test-result" class:fail={!testResult.ok} role="status">
              <p class="tr-msg">{testResult.message}</p>
              {#if testResult.reply}<p class="tr-reply">{testResult.reply}</p>{/if}
              {#if testResult.detail}<p class="tr-detail">{testResult.detail}</p>{/if}
            </div>
          {/if}
        </div>
      </section>

      <section>
        <h3>댓글 초안</h3>
        <label class="check">
          <input type="checkbox" bind:checked={form.autoGenerate} />
          <span>글이 열리면 초안을 자동으로 쓰기</span>
        </label>
        <label class="check">
          <input type="checkbox" bind:checked={form.sendImages} />
          <span>본문 이미지도 AI에게 보내기</span>
        </label>
        <p class="hint warn">
          이미지는 글보다 토큰을 훨씬 많이 써서 비용이 크게 늘 수 있어요. 이미지를 읽을 수 있는(비전) 모델에서만 켜 주세요.
          켜 두면 글마다 이미지를 최대 4장까지 보내고, 꺼 두면 이미지는 보내지 않아요.
        </p>

        <h4>톤 세 가지</h4>
        <p class="hint">초안은 이 순서대로 1, 2, 3번이 돼요. 설명은 AI에게 그대로 전해져요.</p>
        {#each form.tones as tone, i (i)}
          <div class="tone">
            <span class="tn" aria-hidden="true">{i + 1}</span>
            <input bind:value={tone.name} aria-label="{i + 1}번 톤 이름" />
            <input bind:value={tone.description} aria-label="{i + 1}번 톤 설명" placeholder="이 톤으로 어떻게 쓸지" />
          </div>
        {/each}

        <h4>프롬프트에 넣을 예시</h4>
        <div class="nums">
          <label>최근 내 댓글 <input type="number" min="0" max="10" bind:value={form.examples.recent} />개</label>
          <label>이 이웃에게 쓴 댓글 <input type="number" min="0" max="10" bind:value={form.examples.neighbor} />개</label>
          <label>초안을 고친 예 <input type="number" min="0" max="10" bind:value={form.examples.pairs} />쌍</label>
        </div>
        <p class="hint">많이 넣을수록 내 말투에 가까워지지만 토큰도 늘어나요.</p>
      </section>

      <StyleGuideSection />

      <section>
        <h3>새 글 확인</h3>
        <label class="field narrow">
          <span>확인 주기</span>
          <span class="inline">
            <input type="number" min={MIN_CHECK_INTERVAL_MINUTES} step="5" bind:value={form.checkIntervalMinutes} />분마다
          </span>
        </label>
        <p class="hint" class:warn={intervalTooShort}>
          네이버 서버에 부담을 주지 않도록 {MIN_CHECK_INTERVAL_MINUTES}분보다 짧게는 정할 수 없어요.
        </p>
        <label class="check">
          <input type="checkbox" bind:checked={form.quietEnabled} />
          <span>방해 금지 시간에는 알림 끄기</span>
        </label>
        {#if form.quietEnabled}
          <div class="times">
            <input type="time" bind:value={form.quietStart} aria-label="방해 금지 시작" /> 부터
            <input type="time" bind:value={form.quietEnd} aria-label="방해 금지 끝" /> 까지
          </div>
        {/if}
      </section>

      <section>
        <h3>내 블로그</h3>
        <label class="field">
          <span>블로그 ID</span>
          <span class="inline grow">
            <input bind:value={form.myBlogId} placeholder="로그인한 뒤 찾기를 누르세요" spellcheck="false" />
            <button type="button" class="ghost" disabled={!appState.naver?.loggedIn} onclick={findMyBlog}>웹뷰에서 찾기</button>
          </span>
        </label>
        <p class="hint">이웃 가져오기에 쓰고, 내 블로그는 이웃 명단에 넣지 않아요. 찾기를 누르면 웹뷰에 내 블로그를 열어 주소에서 ID를 읽어요.</p>
        <label class="field">
          <span>답방 찾기</span>
          <span class="inline">
            내 최신 글 <input type="number" min={REPLY_CHECK_POSTS.min} max={REPLY_CHECK_POSTS.max} bind:value={form.replyCheckPosts} />편
          </span>
        </label>
        <p class="hint">"답방 갈 곳 찾아보기"를 누르면 이만큼의 최신 글을 차례로 열어 댓글 단 분을 찾아요. 글마다 몇 초씩 쉬어서, 많을수록 오래 걸려요.</p>
      </section>

      <section>
        <h3>데이터</h3>
        <p class="hint">이웃 명단, 출석부, 댓글 기록, 설정을 파일 하나로 내보내요. API 키와 네이버 로그인은 들어가지 않아요.</p>
        <div class="row-start">
          <button type="button" class="ghost" onclick={exportData}>내보내기</button>
          <button type="button" class="ghost" onclick={importData}>가져오기</button>
          {#if dataNote}<span class="data-note" class:error={!dataNote.ok}>{dataNote.text}</span>{/if}
        </div>
        <p class="hint">가져오면 지금 데이터를 먼저 자동으로 백업하고, 마실을 다시 시작해요.</p>
      </section>

      <section>
        <h3>시작</h3>
        <label class="check">
          <input type="checkbox" bind:checked={form.launchAtLogin} />
          <span>Windows를 켜면 마실을 트레이에 띄워 두기</span>
        </label>
      </section>

      <section>
        <h3>버전</h3>
        <div class="row-start">
          <span class="ver">마실 {version}</span>
          <button
            type="button"
            class="ghost"
            disabled={update.kind === 'checking' || update.kind === 'downloading' || update.kind === 'dev'}
            onclick={async () => (update = await api.app.checkUpdate())}>업데이트 확인</button
          >
          {#if updateText}<span class="data-note" class:error={update.kind === 'error'}>{updateText}</span>{/if}
        </div>
      </section>
    </div>

    <footer>
      {#if notice}<p class="notice" class:error={!notice.ok} role="status">{notice.text}</p>{/if}
      <button type="button" class="ghost" onclick={() => appState.openSettings(false)}>취소</button>
      <button type="submit" class="primary" disabled={saving}>저장</button>
    </footer>
  </form>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(36, 72, 54, 0.55);
    display: grid;
    place-items: center;
    z-index: 10;
    padding: 24px;
  }
  .dialog {
    width: min(620px, 100%);
    max-height: calc(100vh - 48px);
    display: flex;
    flex-direction: column;
    background: var(--paper);
    border-radius: 4px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
  }
  .inner {
    display: contents;
  }
  header,
  footer {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 14px 20px;
  }
  header {
    border-bottom: 2px solid var(--graphite);
    justify-content: space-between;
  }
  header h2 {
    margin: 0;
    font-family: var(--font-head);
    font-weight: 800;
    font-size: 20px;
  }
  footer {
    border-top: 1px solid var(--line);
    justify-content: flex-end;
  }
  .body {
    overflow-y: auto;
    padding: 4px 20px 16px;
  }
  section {
    padding: 14px 0;
    border-bottom: 1px solid var(--line);
  }
  section:last-child {
    border-bottom: 0;
  }
  h3 {
    margin: 0 0 6px;
    font-family: var(--font-head);
    font-weight: 700;
    font-size: 15px;
  }
  .hint {
    margin: 4px 0 8px;
    font-size: 12.5px;
    color: var(--graphite-soft);
    line-height: 1.55;
  }
  .hint.warn {
    color: #8a4b2a;
  }
  .field {
    display: grid;
    grid-template-columns: 80px 1fr;
    align-items: center;
    gap: 10px;
    margin: 8px 0;
  }
  .field > span:first-child {
    font-size: 13px;
    color: var(--graphite-soft);
  }
  input:not([type='checkbox']) {
    font: inherit;
    border: 1px solid #d6d3c6;
    border-radius: 3px;
    padding: 5px 8px;
    background: #fff;
    min-width: 0;
  }
  .narrow input {
    width: 80px;
    margin-right: 6px;
  }
  .inline {
    display: inline-flex;
    align-items: center;
  }
  .inline.grow {
    display: flex;
    gap: 6px;
  }
  .inline.grow input {
    flex: 1;
  }
  h4 {
    margin: 14px 0 2px;
    font-size: 13px;
    font-weight: 600;
  }
  .tone {
    display: grid;
    grid-template-columns: 20px 130px 1fr;
    gap: 6px;
    align-items: center;
    margin: 4px 0;
  }
  .tn {
    font-family: var(--font-hand);
    font-size: 19px;
    color: var(--pen-blue);
    text-align: center;
  }
  .nums {
    display: grid;
    gap: 4px;
    font-size: 13px;
  }
  .nums input {
    width: 56px;
    margin: 0 4px 0 8px;
  }
  .row-start {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .test {
    margin-top: 12px;
    padding: 10px 12px;
    border: 1px solid var(--rule-soft);
    border-radius: 3px;
    background: #fff;
  }
  .test-title {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
  }
  .test-row {
    display: flex;
    gap: 6px;
  }
  .test-row input {
    flex: 1;
  }
  .test-result {
    margin-top: 8px;
    padding: 8px 10px;
    border-left: 3px solid var(--cover);
    background: var(--paper);
    font-size: 13px;
  }
  .test-result.fail {
    border-left-color: var(--margin);
  }
  .test-result p {
    margin: 0;
    line-height: 1.6;
  }
  .tr-msg {
    color: var(--cover);
    font-weight: 500;
  }
  .test-result.fail .tr-msg {
    color: var(--margin);
  }
  .tr-reply {
    margin-top: 4px !important;
    font-family: var(--font-head);
    color: var(--graphite);
  }
  .tr-detail {
    margin-top: 4px !important;
    font-size: 12px;
    color: var(--graphite-soft);
    word-break: break-all;
    white-space: pre-line;
  }
  .ver {
    font-size: 13px;
    margin-right: 4px;
  }
  .data-note {
    font-size: 12.5px;
    color: var(--cover);
  }
  .data-note.error {
    color: var(--margin);
  }
  .presets {
    display: flex;
    gap: 6px;
    margin: -2px 0 6px 90px;
  }
  .chip {
    border: 1px solid #c9c6ba;
    background: var(--paper);
    border-radius: 12px;
    padding: 1px 10px;
    font-size: 12px;
  }
  .chip.on {
    border-color: var(--cover);
    color: var(--cover);
    font-weight: 600;
  }
  .check {
    display: flex;
    gap: 8px;
    align-items: center;
    margin: 6px 0;
  }
  .times {
    display: flex;
    gap: 6px;
    align-items: center;
    margin: 4px 0 0 26px;
    font-size: 13px;
  }
  .ghost {
    background: var(--paper);
    border: 1px solid #bdbaae;
    font-size: 12.5px;
    padding: 3px 12px;
    border-radius: 3px;
    color: var(--graphite-soft);
  }
  .ghost:hover:not(:disabled) {
    border-color: var(--graphite);
    color: var(--graphite);
  }
  .primary {
    border: 0;
    background: var(--cover);
    color: #fff;
    font-size: 13px;
    padding: 5px 18px;
    border-radius: 3px;
    font-weight: 500;
  }
  button:disabled {
    opacity: 0.55;
  }
  .link {
    background: none;
    border: 0;
    padding: 0;
    color: var(--pen-blue);
    text-decoration: underline;
    font-size: 12.5px;
  }
  .notice {
    margin: 0 auto 0 0;
    font-size: 12.5px;
    color: var(--cover);
  }
  .notice.error {
    color: var(--margin);
  }
</style>
