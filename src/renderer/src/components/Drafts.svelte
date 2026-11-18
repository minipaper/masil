<script lang="ts">
  import { formatElapsed, progressText, SLOW_READING_MS } from '@shared/progress'
  import type { DraftItem } from '@shared/types'
  import { appState } from '../lib/app-state.svelte'

  const api = window.masil

  // 패널에서 고친 내용 (초안 id → 글). 새 초안이 오면 비운다.
  let edits = $state<Record<number, string>>({})
  let usedId = $state<number | null>(null)
  let message = $state<{ ok: boolean; text: string } | null>(null)
  let filling = $state(false)

  let lastKey = ''
  $effect(() => {
    const d = appState.drafts
    const key = d ? `${d.blogId}/${d.logNo}/${d.drafts.map((x) => x.id).join(',')}` : ''
    if (key !== lastKey) {
      lastKey = key
      edits = {}
      usedId = null
      message = null
    }
  })

  const drafts = $derived(appState.drafts?.drafts ?? [])
  const status = $derived(appState.drafts?.status ?? 'idle')
  const hasPost = $derived(appState.currentPost !== null)
  const toneCount = $derived(appState.settings?.ai.tones.length ?? 2)
  const countWord = $derived(['한', '두', '세'][toneCount - 1] ?? String(toneCount))

  // 쓰는 동안 경과 시간이 1초마다 오르게 한다
  const progress = $derived(status === 'loading' ? (appState.drafts?.progress ?? null) : null)
  let now = $state(Date.now())
  $effect(() => {
    if (!progress) return
    now = Date.now()
    const timer = setInterval(() => (now = Date.now()), 1000)
    return () => clearInterval(timer)
  })
  const elapsedMs = $derived(status === 'ready' ? (appState.drafts?.elapsedMs ?? null) : null)

  function textOf(d: DraftItem): string {
    return edits[d.id] ?? d.text
  }

  async function fill(d: DraftItem): Promise<void> {
    if (filling) return
    filling = true
    message = null
    try {
      const res = await api.drafts.fill(textOf(d), d.tone)
      message = { ok: res.ok, text: res.message }
      if (res.ok) usedId = d.id
    } finally {
      filling = false
    }
  }

  // 단축키 1/2/3: 앱 화면에 포커스가 있고 입력 중이 아닐 때
  function onKey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey || appState.settingsOpen) return
    const t = e.target as HTMLElement | null
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
    const idx = ['1', '2', '3'].indexOf(e.key)
    const d = drafts[idx]
    if (idx >= 0 && d) {
      e.preventDefault()
      void fill(d)
    }
  }

  function autosize(node: HTMLTextAreaElement): void {
    const fit = (): void => {
      node.style.height = 'auto'
      node.style.height = `${node.scrollHeight + 2}px`
    }
    fit()
    // 글꼴이 늦게 로드되면 줄 높이가 달라지므로 다시 잰다
    void document.fonts.ready.then(fit)
    node.addEventListener('input', fit)
  }
</script>

<svelte:window onkeydown={onKey} />

{#if !hasPost}
  <p class="note">글을 열면 초안 {countWord} 개를 써 둘게요.</p>
{:else}
  {#if appState.drafts?.needsSetup}
    <p class="note">
      초안을 쓰려면 AI 연결이 필요해요.{#if appState.drafts.error} {appState.drafts.error}{/if}
      <button type="button" class="link" onclick={() => appState.openSettings(true)}>설정 열기</button>
    </p>
  {:else if status === 'idle'}
    <p class="note">
      <button type="button" class="link" onclick={() => api.drafts.generate()}>초안 쓰기</button>를 누르면 {countWord} 가지 톤으로 써 둘게요.
    </p>
  {/if}

  {#if status === 'loading'}
    {#if progress}
      <p class="note busy">{progressText(progress, now)}</p>
      {#if progress.phase === 'reading' && now - progress.startedAt >= SLOW_READING_MS}
        <p class="note slow">처음엔 모델을 불러오느라 더 걸릴 수 있어요.</p>
      {/if}
      <!-- 화면 읽기 프로그램에는 1초마다가 아니라 단계가 바뀔 때만 알린다 -->
      <span class="sr-only" aria-live="polite">{progress.phase === 'reading' ? '본문을 읽는 중' : progress.phase === 'retrying' ? '다시 쓰는 중' : `초안 ${progress.current}번 쓰는 중`}</span>
    {:else}
      <p class="note busy" aria-live="polite">초안을 쓰는 중이에요…</p>
    {/if}
  {/if}
  {#if elapsedMs !== null}
    <p class="note took">{formatElapsed(elapsedMs)} 걸렸어요.</p>
  {/if}
  {#if status === 'error' && appState.drafts?.error}
    <p class="note error" role="alert">
      {appState.drafts.error}
      {#if appState.drafts.needsSetup}<button type="button" class="link" onclick={() => appState.openSettings(true)}>설정 열기</button>{/if}
    </p>
  {/if}

  {#each drafts as d, i (d.id)}
    <div class="draft" class:used={usedId === d.id} class:dim={status === 'loading'}>
      <span class="num" aria-hidden="true">{i + 1}</span>
      <div class="tone">
        <span>{d.tone}</span>
        {#if usedId === d.id}<span class="used-note">댓글창에 채움</span>{/if}
      </div>
      <textarea
        class="text"
        rows="1"
        aria-label="{i + 1}번 초안 ({d.tone})"
        value={textOf(d)}
        oninput={(e) => (edits[d.id] = e.currentTarget.value)}
        use:autosize
      ></textarea>
      <div class="row">
        <button class="fill" type="button" disabled={filling || status === 'loading'} onclick={() => fill(d)}>
          채우기 <kbd>{i + 1}</kbd>
        </button>
      </div>
    </div>
  {/each}

  {#if message}
    <p class="note result" class:error={!message.ok} role="status">{message.text}</p>
  {/if}
{/if}

<style>
  .note {
    margin: 0;
    line-height: 28px;
    font-size: 13px;
    color: var(--graphite-soft);
  }
  .note.busy {
    color: var(--pen-blue);
    font-variant-numeric: tabular-nums;
  }
  .note.slow,
  .note.took {
    line-height: 1.6;
    font-size: 12px;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  .note.error {
    color: var(--margin);
    line-height: 1.6;
    background: var(--paper);
    padding: 4px 0;
  }
  .note.result {
    background: var(--paper);
    line-height: 1.6;
    padding: 6px 0;
    color: var(--cover);
  }
  .link {
    background: none;
    border: 0;
    padding: 0;
    color: var(--pen-blue);
    text-decoration: underline;
    text-underline-offset: 3px;
    font-size: 13px;
  }
  .draft {
    position: relative;
    padding-top: 28px;
  }
  .draft.dim {
    opacity: 0.55;
  }
  .num {
    position: absolute;
    left: -40px;
    top: 22px;
    width: 36px;
    text-align: center;
    font-family: var(--font-hand);
    font-size: 30px;
    line-height: 1;
    color: var(--pen-blue);
  }
  .draft.used .num::after {
    content: '';
    position: absolute;
    left: 6px;
    top: -4px;
    width: 24px;
    height: 36px;
    border: 1.5px solid var(--pen-blue);
    border-radius: 50%;
    transform: rotate(-12deg);
  }
  .tone {
    font-size: 12px;
    color: var(--graphite-soft);
    line-height: 28px;
    height: 28px;
    display: flex;
    justify-content: space-between;
  }
  .used-note {
    font-family: var(--font-hand);
    font-size: 16px;
    color: var(--pen-blue);
  }
  /* 초안 본문은 줄 없는 종이 위에 (가독성) */
  .text {
    display: block;
    width: calc(100% + 16px);
    margin: 0 -8px;
    padding: 8px 8px 9px;
    font-family: var(--font-head);
    font-size: 14.5px;
    line-height: 26px;
    color: var(--graphite);
    background: var(--paper);
    border: 1px solid var(--rule-soft);
    border-radius: 3px;
    resize: none;
    overflow: hidden;
  }
  .text:focus {
    outline: none;
    border-color: var(--pencil-y);
    box-shadow: 0 0 0 2px rgba(243, 196, 64, 0.25);
  }
  .row {
    height: 28px;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    margin-top: 2px;
  }
  .fill {
    border: 0;
    background: var(--cover);
    color: #fff;
    font-size: 12.5px;
    padding: 2px 10px 2px 12px;
    border-radius: 3px;
    display: inline-flex;
    gap: 8px;
    align-items: center;
    height: 24px;
  }
  .fill:hover:not(:disabled) {
    background: var(--cover-deep);
  }
  .fill:disabled {
    opacity: 0.5;
  }
  .fill kbd {
    font-family: var(--font-body);
    font-size: 11px;
    background: rgba(255, 255, 255, 0.18);
    padding: 0 6px;
    border-radius: 2px;
    line-height: 16px;
  }
</style>
