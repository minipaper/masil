<script lang="ts">
  import { formatPostTime } from '@shared/format'
  import type { ReplyItem } from '@shared/types'
  import { appState } from '../lib/app-state.svelte'

  const api = window.masil

  // 고친 답글 (댓글 번호/톤 → 글)
  let edits = $state<Record<string, string>>({})
  let filled = $state<string | null>(null)
  let message = $state<{ ok: boolean; text: string } | null>(null)
  let filling = $state(false)

  const r = $derived(appState.replies)
  const keyOf = (c: ReplyItem, tone: string): string => `${c.commentNo}/${tone}`

  async function fill(c: ReplyItem, tone: string, text: string): Promise<void> {
    if (filling) return
    filling = true
    message = null
    try {
      const res = await api.replies.fill(c.commentNo, edits[keyOf(c, tone)] ?? text)
      message = { ok: res.ok, text: res.message }
      if (res.ok) filled = keyOf(c, tone)
    } finally {
      filling = false
    }
  }

  function autosize(node: HTMLTextAreaElement): void {
    const fit = (): void => {
      node.style.height = 'auto'
      node.style.height = `${node.scrollHeight + 2}px`
    }
    fit()
    void document.fonts.ready.then(fit)
    node.addEventListener('input', fit)
  }
</script>

{#if !r}
  <p class="note">내 글을 열면 달린 댓글을 읽어 답글 초안을 써 둘게요.</p>
{:else}
  {#if r.items.length === 0}
    <p class="note">
      {#if r.needsOpen}
        웹뷰에서 "댓글"을 눌러 펼치면 달린 댓글을 읽어 올게요.
      {:else}
        아직 읽어 온 댓글이 없어요. 댓글이 달리면 여기에 보여 드려요.
      {/if}
    </p>
  {/if}

  {#each r.items as c (c.commentNo)}
    <div class="cmt">
      <div class="who">
        <span class="nk">{c.nick || c.blogId}</span>
        <span class="tm">{formatPostTime(c.at)}</span>
      </div>
      <p class="said">{c.text || '(내용 없음)'}</p>

      {#if c.status === 'idle' || (c.status === 'error' && c.drafts.length === 0)}
        <div class="row">
          {#if c.error}<span class="err" role="alert">{c.error}</span>{/if}
          <button type="button" class="ghost" onclick={() => api.replies.generate(c.commentNo)}>답글 초안</button>
        </div>
      {:else if c.status === 'loading'}
        <p class="note busy" aria-live="polite">답글을 쓰는 중이에요…</p>
      {/if}

      {#each c.drafts as d (d.tone)}
        <div class="draft" class:used={filled === keyOf(c, d.tone)}>
          <div class="tone">
            <span>{d.tone}</span>
            {#if filled === keyOf(c, d.tone)}<span class="used-note">답글 칸에 채움</span>{/if}
          </div>
          <textarea
            class="text"
            rows="1"
            aria-label="{c.nick}님 댓글에 답글 ({d.tone})"
            value={edits[keyOf(c, d.tone)] ?? d.text}
            oninput={(e) => (edits[keyOf(c, d.tone)] = e.currentTarget.value)}
            use:autosize
          ></textarea>
          <div class="row">
            <button type="button" class="fill" disabled={filling} onclick={() => fill(c, d.tone, d.text)}>채우기</button>
          </div>
        </div>
      {/each}
      {#if c.status === 'ready' || (c.status === 'error' && c.drafts.length > 0)}
        <div class="row">
          {#if c.error}<span class="err" role="alert">{c.error}</span>{/if}
          <button type="button" class="ghost" onclick={() => api.replies.generate(c.commentNo)}>다시 쓰기</button>
        </div>
      {/if}
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
  }
  .note.result {
    background: var(--paper);
    line-height: 1.6;
    padding: 6px 0;
    color: var(--cover);
  }
  .note.error {
    color: var(--margin);
  }
  .cmt {
    padding: 6px 0 10px;
    border-bottom: 1px dashed var(--rule-soft);
  }
  .who {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    line-height: 28px;
  }
  .nk {
    font-weight: 600;
    font-size: 13.5px;
  }
  .tm {
    font-family: var(--font-head);
    font-size: 11.5px;
    color: var(--graphite-soft);
  }
  .said {
    margin: 0;
    font-size: 13px;
    line-height: 1.6;
    color: var(--graphite);
    background: var(--paper);
    border-left: 3px solid var(--rule-soft);
    padding: 4px 8px;
  }
  .draft {
    margin-top: 4px;
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
  .text {
    display: block;
    width: calc(100% + 16px);
    margin: 0 -8px;
    padding: 8px 8px 9px;
    font-family: var(--font-head);
    font-size: 14px;
    line-height: 24px;
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
    min-height: 28px;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 8px;
    margin-top: 2px;
  }
  .err {
    margin-right: auto;
    font-size: 12px;
    color: var(--margin);
  }
  .fill {
    border: 0;
    background: var(--cover);
    color: #fff;
    font-size: 12.5px;
    padding: 2px 12px;
    border-radius: 3px;
    height: 24px;
  }
  .fill:hover:not(:disabled) {
    background: var(--cover-deep);
  }
  .fill:disabled {
    opacity: 0.5;
  }
  .ghost {
    background: var(--paper);
    border: 1px solid #bdbaae;
    font-size: 12px;
    padding: 1px 10px;
    border-radius: 3px;
    color: var(--graphite-soft);
  }
  .ghost:hover {
    border-color: var(--graphite);
    color: var(--graphite);
  }
</style>
