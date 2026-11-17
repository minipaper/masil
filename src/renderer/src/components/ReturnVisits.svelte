<script lang="ts">
  import { formatPostTime } from '@shared/format'
  import { appState } from '../lib/app-state.svelte'

  const api = window.masil
  let adding = $state<string | null>(null)
  let note = $state<string | null>(null)

  const s = $derived(appState.visitStatus)
  const myBlogId = $derived(appState.settings?.myBlogId ?? null)
  const postsToCheck = $derived(appState.settings?.replyCheckPosts ?? 3)

  async function add(blogId: string): Promise<void> {
    adding = blogId
    note = null
    try {
      const res = await api.neighbors.add(blogId)
      note = res.ok ? `${res.neighbor.name} 님을 명단에 적었어요.` : res.message
      await appState.refresh()
    } finally {
      adding = null
    }
  }
</script>

<div class="head">
  {#if s?.running}
    <p class="status" role="status">
      내 글을 차례로 여는 중 <b>{s.done}</b>/{s.total || '?'}{#if s.found > 0}, 새 댓글 {s.found}개{/if}
    </p>
    <progress max={s.total || 1} value={s.done}></progress>
    <button type="button" class="ghost" onclick={() => api.visits.cancel()}>그만하기</button>
  {:else}
    <button type="button" class="primary" disabled={!myBlogId} onclick={() => api.visits.scan()}>답방 갈 곳 찾아보기</button>
    <p class="hint">
      {#if !myBlogId}
        설정의 "내 블로그"에서 블로그 ID를 먼저 찾아 주세요.
      {:else}
        내 최신 글 {postsToCheck}편을 가운데에 차례로 열어 댓글 단 분을 찾아요. 글 사이에 몇 초씩 쉬어요.
        {#if s?.lastAt}마지막으로 찾은 때: {formatPostTime(s.lastAt)}.{/if}
      {/if}
    </p>
    {#if s?.message}<p class="msg" role="status">{s.message}</p>{/if}
  {/if}
</div>

{#if note}<p class="msg pad" role="status">{note}</p>{/if}

{#if appState.returnVisits.length === 0}
  <p class="empty">
    {#if s?.lastAt}지금은 답방할 곳이 없어요. 모두 다녀왔거나, 최근 30일 안에 내 글에 달린 댓글이 없어요.{:else}아직 찾아본 적이 없어요.{/if}
  </p>
{:else}
  <ul>
    {#each appState.returnVisits as v (v.blogId)}
      <li>
        <div class="who">
          <span class="nm">{v.name}{#if v.count > 1}<span class="cnt">댓글 {v.count}개</span>{/if}</span>
          <span class="sub">{formatPostTime(v.lastAt)} 「{v.postTitle || '내 글'}」에 댓글</span>
          <span class="sub id">{v.blogId}{#if !v.neighborId}, 이웃 명단에 없음{/if}</span>
        </div>
        <div class="btns">
          <button type="button" onclick={() => api.naver.open(v.blogId)}>블로그</button>
          {#if !v.neighborId}
            <button type="button" disabled={adding !== null} onclick={() => add(v.blogId)}>{adding === v.blogId ? '확인 중' : '명단에 추가'}</button>
          {/if}
        </div>
      </li>
    {/each}
  </ul>
  <p class="foot">그 블로그에 댓글을 남기면 이 목록에서 빠져요.</p>
{/if}

<style>
  .head {
    padding: 12px 18px;
    border-bottom: 1px solid var(--line);
  }
  .primary {
    border: 0;
    background: var(--cover);
    color: #fff;
    font-size: 13px;
    padding: 5px 14px;
    border-radius: 3px;
  }
  .primary:disabled {
    opacity: 0.5;
  }
  .ghost {
    background: var(--paper);
    border: 1px solid #bdbaae;
    font-size: 12px;
    padding: 1px 10px;
    border-radius: 3px;
    color: var(--graphite-soft);
    margin-top: 6px;
  }
  .hint,
  .foot {
    margin: 8px 0 0;
    font-size: 12px;
    line-height: 1.55;
    color: var(--graphite-soft);
  }
  .foot {
    padding: 10px 18px;
    margin: 0;
  }
  .status {
    margin: 0 0 6px;
    font-size: 13px;
  }
  .status b {
    font-family: var(--font-head);
    color: var(--pen-blue);
  }
  progress {
    width: 100%;
    accent-color: var(--cover);
  }
  .msg {
    margin: 6px 0 0;
    font-size: 12.5px;
    color: var(--cover);
    line-height: 1.5;
  }
  .msg.pad {
    padding: 0 18px 8px;
  }
  .empty {
    padding: 20px 18px;
    margin: 0;
    color: var(--graphite-soft);
    font-size: 13px;
    line-height: 1.6;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    padding: 10px 18px;
    border-bottom: 1px solid var(--line);
  }
  .who {
    flex: 1;
    min-width: 0;
  }
  .nm {
    display: block;
    font-weight: 600;
  }
  .cnt {
    margin-left: 6px;
    font-weight: 400;
    font-size: 11.5px;
    color: var(--margin);
  }
  .sub {
    display: block;
    font-size: 12px;
    color: var(--graphite-soft);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .btns {
    display: flex;
    gap: 4px;
    flex: none;
  }
  .btns button {
    background: var(--paper);
    border: 1px solid #bdbaae;
    font-size: 12px;
    padding: 1px 8px;
    border-radius: 3px;
    color: var(--graphite-soft);
  }
  .btns button:hover:not(:disabled) {
    border-color: var(--graphite);
    color: var(--graphite);
  }
</style>
