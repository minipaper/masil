<script lang="ts">
  import { MIN_CHECK_INTERVAL_MINUTES } from '@shared/policy'
  import type { Settings } from '@shared/types'
  import { appState } from '../lib/app-state.svelte'

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
    launchAtLogin: initial.launchAtLogin
  })
  let apiKey = $state('')
  let hasKey = $state(initial.hasApiKey)
  let saving = $state(false)
  let testing = $state(false)
  let notice = $state<{ ok: boolean; text: string } | null>(null)

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
      ai: {
        ...initial.ai,
        baseUrl: form.baseUrl,
        model: form.model,
        autoGenerate: form.autoGenerate,
        sendImages: form.sendImages
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
    } finally {
      saving = false
    }
  }

  async function test(): Promise<void> {
    testing = true
    notice = null
    try {
      if (!(await persist())) return
      notice = await api.ai.test().then((r) => ({ ok: r.ok, text: r.message }))
    } finally {
      testing = false
    }
  }

  async function removeKey(): Promise<void> {
    const res = await api.ai.setKey(null)
    hasKey = res.settings.hasApiKey
    notice = { ok: true, text: 'API 키를 지웠어요.' }
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
        <div class="row-end">
          <button type="button" class="ghost" disabled={testing || saving} onclick={test}>{testing ? '확인 중' : '연결 확인'}</button>
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
      </section>

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
        <h3>시작</h3>
        <label class="check">
          <input type="checkbox" bind:checked={form.launchAtLogin} />
          <span>Windows를 켜면 마실을 트레이에 띄워 두기</span>
        </label>
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
  .row-end {
    display: flex;
    justify-content: flex-end;
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
