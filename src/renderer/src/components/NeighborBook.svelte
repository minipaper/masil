<script lang="ts">
  import { daysSince, formatLastComment } from '@shared/format'
  import type { Neighbor, NeighborPatch } from '@shared/types'
  import { appState } from '../lib/app-state.svelte'
  import MemoEditor from './MemoEditor.svelte'

  /** quiet=true면 "오래 못 간 집" 순서 */
  let { quiet = false }: { quiet?: boolean } = $props()

  const api = window.masil
  let input = $state('')
  let adding = $state(false)
  let message = $state<{ kind: 'ok' | 'error'; text: string } | null>(null)
  let editingId = $state<number | null>(null)
  let confirmDeleteId = $state<number | null>(null)

  const list = $derived.by(() => {
    if (!quiet) return appState.neighbors
    return [...appState.neighbors].sort((a, b) => (a.lastCommentAt ?? '').localeCompare(b.lastCommentAt ?? ''))
  })

  function isQuiet(n: Neighbor): boolean {
    return n.pendingCount > 0 && (!n.lastCommentAt || daysSince(n.lastCommentAt) > 30)
  }

  async function add(e: SubmitEvent): Promise<void> {
    e.preventDefault()
    if (!input.trim() || adding) return
    adding = true
    message = null
    try {
      const res = await api.neighbors.add(input)
      if (res.ok) {
        message = { kind: 'ok', text: `${res.neighbor.nickname} 님을 명단에 적었어요. 지금 있는 글은 읽은 것으로 두고, 앞으로 올라오는 글부터 알려 드릴게요.` }
        input = ''
        await appState.refresh()
      } else {
        message = { kind: 'error', text: res.message }
      }
    } finally {
      adding = false
    }
  }

  async function save(id: number, patch: NeighborPatch): Promise<void> {
    await api.neighbors.update(id, patch)
    editingId = null
    await appState.refresh()
  }

  async function remove(id: number): Promise<void> {
    await api.neighbors.remove(id)
    confirmDeleteId = null
    await appState.refresh()
  }
</script>

{#if !quiet}
  <form class="add" onsubmit={add}>
    <label for="neighbor-input">블로그 ID나 주소</label>
    <div class="row">
      <input id="neighbor-input" bind:value={input} placeholder="예: springrain 또는 blog.naver.com/springrain" disabled={adding} />
      <button type="submit" disabled={adding || !input.trim()}>{adding ? '확인 중' : '추가'}</button>
    </div>
    {#if message}<p class="msg" class:error={message.kind === 'error'} role="status">{message.text}</p>{/if}
  </form>
{/if}

{#if list.length === 0}
  <p class="empty">{quiet ? '이웃을 등록하면 오래 못 간 집을 여기서 챙겨 드릴게요.' : '아직 명단이 비어 있어요.'}</p>
{:else}
  <ul>
    {#each list as n (n.id)}
      <li class:quiet={quiet && isQuiet(n)}>
        <div class="head">
          <div class="who">
            <span class="nm">{n.honorific || n.nickname}</span>
            <span class="id">{n.blogId}{#if n.failCount > 0}<em> 확인 실패 {n.failCount}회</em>{/if}</span>
            <span class="last">
              {formatLastComment(n.lastCommentAt)}{#if n.pendingCount > 0}, 들를 글 {n.pendingCount}편{/if}
            </span>
          </div>
          <div class="btns">
            <button type="button" onclick={() => (editingId = editingId === n.id ? null : n.id)}>수첩</button>
            <button type="button" onclick={() => (confirmDeleteId = n.id)}>지우기</button>
          </div>
        </div>
        {#if confirmDeleteId === n.id}
          <div class="confirm" role="alert">
            <span>명단에서 지울까요? 남긴 댓글 기록은 그대로 둬요.</span>
            <button type="button" onclick={() => (confirmDeleteId = null)}>취소</button>
            <button type="button" class="danger" onclick={() => remove(n.id)}>지우기</button>
          </div>
        {/if}
        {#if editingId === n.id}
          <MemoEditor neighbor={n} onsave={(patch) => save(n.id, patch)} oncancel={() => (editingId = null)} />
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .add {
    padding: 12px 18px;
    border-bottom: 1px solid var(--line);
  }
  .add label {
    font-size: 12px;
    color: var(--graphite-soft);
  }
  .row {
    display: flex;
    gap: 6px;
    margin-top: 4px;
  }
  .row input {
    flex: 1;
    font: inherit;
    border: 1px solid #d6d3c6;
    border-radius: 3px;
    padding: 4px 8px;
    background: #fff;
    min-width: 0;
  }
  .row button {
    border: 0;
    background: var(--cover);
    color: #fff;
    padding: 0 14px;
    border-radius: 3px;
  }
  .row button:disabled {
    opacity: 0.55;
  }
  .msg {
    margin: 6px 0 0;
    font-size: 12.5px;
    color: var(--cover);
  }
  .msg.error {
    color: var(--margin);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    padding: 10px 18px;
    border-bottom: 1px solid var(--line);
  }
  li.quiet {
    background: linear-gradient(90deg, rgba(214, 92, 88, 0.08), transparent 70%);
  }
  .head {
    display: flex;
    gap: 8px;
    align-items: flex-start;
  }
  .who {
    flex: 1;
    min-width: 0;
  }
  .nm {
    font-weight: 600;
    display: block;
  }
  .id,
  .last {
    display: block;
    font-size: 12px;
    color: var(--graphite-soft);
  }
  .id em {
    font-style: normal;
    color: var(--margin);
  }
  li.quiet .last {
    color: var(--margin);
  }
  .btns {
    display: flex;
    gap: 4px;
  }
  .btns button,
  .confirm button {
    background: var(--paper);
    border: 1px solid #bdbaae;
    font-size: 12px;
    padding: 1px 8px;
    border-radius: 3px;
    color: var(--graphite-soft);
  }
  .btns button:hover,
  .confirm button:hover {
    border-color: var(--graphite);
    color: var(--graphite);
  }
  .confirm {
    display: flex;
    gap: 6px;
    align-items: center;
    margin-top: 8px;
    font-size: 12.5px;
  }
  .confirm span {
    flex: 1;
  }
  .confirm .danger {
    border-color: var(--margin);
    color: var(--margin);
  }
  .empty {
    padding: 20px 18px;
    color: var(--graphite-soft);
    margin: 0;
  }
</style>
