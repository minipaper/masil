<script lang="ts">
  import { daysSince, formatPostTime } from '@shared/format'
  import { ROLL_FILTERS, ROLL_SORTS, rollCounts, rollRows, type RollSort } from '@shared/roll'
  import type { Post } from '@shared/types'
  import { appState } from '../lib/app-state.svelte'
  import Mark from './Mark.svelte'

  const QUIET_DAYS = 30

  function readKind(p: Post): 'read' | 'skip' | 'none' {
    if (p.status === 'skipped') return 'skip'
    return p.status === 'new' ? 'none' : 'read'
  }

  // 이웃마다 최근 글 하나만, 고른 필터와 정렬로
  const rows = $derived(rollRows(appState.posts, appState.rollFilter, appState.rollSort, appState.returnVisitIds))
  const counts = $derived(rollCounts(appState.posts, appState.returnVisitIds))

  /** 새 글이 있는데 오래 못 간 이웃이면 "34일 만" 표시 */
  function lateLabel(p: Post): string | null {
    if (p.status !== 'new' && p.status !== 'read') return null
    const n = appState.neighbors.find((x) => x.id === p.neighborId)
    if (!n?.lastCommentAt) return null
    const days = daysSince(n.lastCommentAt)
    return days > QUIET_DAYS ? `${days}일 만` : null
  }
</script>

{#if appState.posts.length === 0}
  <div class="empty">
    {#if appState.neighbors.length === 0}
      <p>아직 등록한 이웃이 없어요.</p>
      <button type="button" class="link" onclick={() => (appState.leftTab = 'neighbors')}>이웃 명단에서 추가하기</button>
    {:else}
      <p>새 글이 없어요. 새 글이 올라오면 여기에 적어 둘게요.</p>
    {/if}
  </div>
{:else}
  <div class="tools">
    <div class="chips" role="group" aria-label="보여 줄 글">
      {#each ROLL_FILTERS as f (f.id)}
        <button type="button" class:on={appState.rollFilter === f.id} aria-pressed={appState.rollFilter === f.id} onclick={() => appState.setRollFilter(f.id)}>
          {f.label} <small>{counts[f.id]}</small>
        </button>
      {/each}
    </div>
    <select aria-label="정렬" value={appState.rollSort} onchange={(e) => appState.setRollSort(e.currentTarget.value as RollSort)}>
      {#each ROLL_SORTS as s (s.id)}<option value={s.id}>{s.label}</option>{/each}
    </select>
  </div>
  {#if rows.length === 0}
    <p class="none">이 조건에 맞는 글이 없어요.</p>
  {/if}
  <table>
    <thead>
      <tr><th>이웃과 새 글</th><th>읽음</th><th>공감</th><th>댓글</th></tr>
    </thead>
    <tbody>
      {#each rows as { post: p, more } (p.id)}
        {@const late = lateLabel(p)}
        <tr
          class:current={p.id === appState.selectedPostId}
          class:done={p.status === 'commented' || p.status === 'skipped'}
        >
          <td class="who">
            <button type="button" class="row-btn" onclick={() => appState.openPost(p.id)}>
              <span class="nm">{p.neighborName}{#if appState.returnVisitIds.has(p.blogId)}<span class="visit" title="내 글에 댓글을 달아 준 이웃이에요">답방</span>{/if}{#if late}<span class="late">{late}</span>{/if}</span>
              <span class="pt">{p.title}</span>
              <span class="tm">{formatPostTime(p.publishedAt)}{#if more > 0}<span class="more" title="예전 글은 가리고 가장 최근 글만 보여 줘요">, 이 이웃의 다른 새 글 {more}편</span>{/if}</span>
            </button>
          </td>
          <td class="mark"><Mark kind={readKind(p)} label={p.status === 'skipped' ? '건너뜀' : readKind(p) === 'read' ? '읽음' : '아직'} /></td>
          <td class="mark"><Mark kind={p.liked ? 'read' : 'none'} label={p.liked ? '공감함' : '아직'} /></td>
          <td class="mark"><Mark kind={p.status === 'commented' ? 'comment' : 'none'} label={p.status === 'commented' ? '댓글 남김' : '아직'} /></td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

<style>
  .tools {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px 8px 18px;
    border-bottom: 1px solid var(--line);
    flex-wrap: wrap;
  }
  .chips {
    display: flex;
    gap: 4px;
    flex: 1 1 auto;
    flex-wrap: wrap;
  }
  .chips button {
    background: var(--paper);
    border: 1px solid #bdbaae;
    border-radius: 12px;
    font-size: 12px;
    padding: 1px 9px;
    color: var(--graphite-soft);
  }
  .chips button small {
    font-family: var(--font-head);
    font-size: 11px;
    margin-left: 2px;
  }
  .chips button.on {
    background: var(--cover);
    border-color: var(--cover);
    color: #fff;
  }
  .tools select {
    font-size: 12px;
    padding: 1px 4px;
    border: 1px solid #bdbaae;
    border-radius: 3px;
    background: var(--paper);
    color: var(--graphite);
  }
  .none {
    margin: 0;
    padding: 16px 18px;
    font-size: 13px;
    color: var(--graphite-soft);
  }
  .more {
    color: var(--graphite-soft);
  }
  .visit {
    margin-left: 6px;
    padding: 0 5px;
    font-size: 11px;
    font-weight: 600;
    color: var(--margin);
    border: 1px solid var(--margin);
    border-radius: 3px;
    transform: rotate(-3deg);
    display: inline-block;
    line-height: 16px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  thead th {
    position: sticky;
    top: 0;
    background: var(--paper);
    font-weight: 500;
    font-size: 11.5px;
    color: var(--graphite-soft);
    text-align: center;
    padding: 8px 0 5px;
    border-bottom: 1px solid var(--graphite);
  }
  thead th:first-child {
    text-align: left;
    padding-left: 18px;
  }
  tbody td {
    border-bottom: 1px solid var(--line);
    vertical-align: middle;
  }
  td.who {
    padding: 0;
  }
  td.mark {
    width: 34px;
    text-align: center;
    border-left: 1px solid var(--line);
  }
  tbody tr:hover td {
    background: #f8f7ef;
  }
  tbody tr.current td {
    background: linear-gradient(transparent 12%, var(--hl) 12%, var(--hl) 88%, transparent 88%);
  }
  .row-btn {
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: 0;
    padding: 9px 8px 9px 18px;
  }
  .nm {
    font-weight: 600;
    font-size: 13.5px;
    display: block;
    line-height: 1.3;
  }
  .pt {
    display: block;
    font-size: 12.5px;
    line-height: 1.4;
    margin-top: 1px;
  }
  .tm {
    font-size: 11.5px;
    color: var(--graphite-soft);
  }
  tr.done .pt {
    color: var(--graphite-soft);
  }
  .late {
    font-family: var(--font-hand);
    font-size: 15px;
    font-weight: 400;
    color: var(--margin);
    margin-left: 6px;
  }
  .empty {
    padding: 28px 18px;
    color: var(--graphite-soft);
  }
  .empty p {
    margin: 0 0 8px;
  }
  .link {
    background: none;
    border: 0;
    padding: 0;
    color: var(--pen-blue);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
</style>
