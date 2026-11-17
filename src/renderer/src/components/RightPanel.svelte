<script lang="ts">
  import type { NeighborPatch } from '@shared/types'
  import { appState } from '../lib/app-state.svelte'
  import Drafts from './Drafts.svelte'
  import History from './History.svelte'
  import MemoEditor from './MemoEditor.svelte'

  let { oncollapse }: { oncollapse: () => void } = $props()

  let sheet = $state<HTMLDivElement | null>(null)
  let editing = $state(false)
  const neighbor = $derived(appState.selectedNeighbor)

  const sections = [
    { id: 'sec-drafts', label: '초안' },
    { id: 'sec-memo', label: '수첩' },
    { id: 'sec-history', label: '지난 댓글' }
  ] as const
  let current = $state<string>('sec-drafts')

  function jump(id: string): void {
    current = id
    sheet?.querySelector(`#${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function saveMemo(patch: NeighborPatch): Promise<void> {
    if (!neighbor) return
    await window.masil.neighbors.update(neighbor.id, patch)
    editing = false
    await appState.refresh()
  }

  const SPEECH = { polite: '존댓말', casual: '반말' } as const
</script>

<aside class="page right">
  <nav class="index" aria-label="오른쪽 패널 색인">
    {#each sections as s, i (s.id)}
      <button type="button" class="t{i + 1}" aria-current={current === s.id} onclick={() => jump(s.id)}>{s.label}</button>
    {/each}
  </nav>
  <div class="sheet" bind:this={sheet}>
    <section id="sec-drafts">
      <div class="sh">
        <h2>댓글 초안</h2>
        <div class="sh-btns">
          {#if appState.currentPost && !appState.drafts?.needsSetup}
            <button type="button" disabled={appState.drafts?.status === 'loading'} onclick={() => window.masil.drafts.generate()}>다시 쓰기</button>
          {/if}
          <button type="button" onclick={oncollapse} aria-label="오른쪽 패널 접기">접기</button>
        </div>
      </div>
      <Drafts />
    </section>

    <section id="sec-memo" class="block">
      <div class="sh">
        <h2>{neighbor ? `${neighbor.honorific || neighbor.nickname} 수첩` : '이웃 수첩'}</h2>
        {#if neighbor && !editing}<button type="button" onclick={() => (editing = true)}>고치기</button>{/if}
      </div>
      {#if !neighbor}
        <p class="note">글을 열면 그 이웃의 호칭, 말투, 메모를 보여 드려요.</p>
      {:else if editing}
        <div class="editor"><MemoEditor {neighbor} onsave={saveMemo} oncancel={() => (editing = false)} /></div>
      {:else}
        <dl class="fields">
          <dt>호칭</dt><dd>{neighbor.honorific || '정하지 않음'}</dd>
          <dt>말투</dt><dd>{SPEECH[neighbor.speech]}</dd>
          <dt>친밀도</dt><dd><span class="near" aria-label="친밀도 {neighbor.closeness}">{'●'.repeat(neighbor.closeness)}{'○'.repeat(3 - neighbor.closeness)}</span></dd>
          {#if neighbor.memo}<dd class="free">{neighbor.memo}</dd>{/if}
        </dl>
      {/if}
    </section>

    <section id="sec-history" class="block">
      <div class="sh">
        <h2>{neighbor ? `${neighbor.honorific || neighbor.nickname}께 남긴 댓글` : '지난 댓글'}</h2>
        {#if appState.history.length > 0}<small>{appState.history.length}개</small>{/if}
      </div>
      <History />
    </section>
  </div>
</aside>

<style>
  .right {
    position: relative;
    overflow: visible !important;
  }
  .index {
    position: absolute;
    right: -28px;
    top: 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    z-index: 1;
  }
  .index button {
    writing-mode: vertical-rl;
    border: 0;
    width: 28px;
    padding: 12px 0;
    font-size: 12.5px;
    font-weight: 500;
    border-radius: 0 5px 5px 0;
    color: var(--graphite);
  }
  .index .t1 {
    background: var(--tab-1);
  }
  .index .t2 {
    background: var(--tab-2);
  }
  .index .t3 {
    background: var(--tab-3);
  }
  .index button[aria-current='true'] {
    width: 32px;
    margin-left: -4px;
    font-weight: 600;
  }
  .sheet {
    height: 100%;
    overflow-y: auto;
    border-radius: 3px;
    padding: 14px 18px 24px 52px;
    background-image:
      linear-gradient(90deg, transparent 40px, var(--margin) 40px, var(--margin) 41px, transparent 41px),
      repeating-linear-gradient(var(--paper) 0 27px, var(--line) 27px 28px);
    background-attachment: local;
  }
  .sh {
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: 28px;
  }
  .sh h2 {
    margin: 0;
    font-family: var(--font-head);
    font-weight: 800;
    font-size: 17px;
  }
  .sh button {
    background: var(--paper);
    border: 1px solid #bdbaae;
    font-size: 12px;
    padding: 1px 10px;
    border-radius: 3px;
    color: var(--graphite-soft);
  }
  .sh-btns {
    display: flex;
    gap: 4px;
  }
  .sh small {
    font-size: 12px;
    color: var(--graphite-soft);
  }
  .sh button:disabled {
    opacity: 0.5;
  }
  .sh button:hover {
    border-color: var(--graphite);
    color: var(--graphite);
  }
  .block {
    padding-top: 28px;
  }
  .note {
    margin: 0;
    line-height: 28px;
    font-size: 13px;
    color: var(--graphite-soft);
  }
  .fields {
    display: grid;
    grid-template-columns: 52px 1fr;
    font-size: 13px;
    line-height: 28px;
    margin: 0;
  }
  .fields dt {
    color: var(--graphite-soft);
  }
  .fields dd {
    margin: 0;
  }
  .fields .free {
    grid-column: 1 / -1;
    font-family: var(--font-hand);
    font-size: 18px;
    color: var(--pen-blue);
  }
  .near {
    color: var(--margin);
    letter-spacing: 1px;
  }
  .editor {
    background: var(--paper);
    border: 1px solid var(--rule-soft);
    border-radius: 3px;
    padding: 4px 10px 8px;
    margin: 0 -10px;
  }
</style>
