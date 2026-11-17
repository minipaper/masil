<script lang="ts">
  import type { BuddyScan, ImportProgress } from '@shared/types'
  import { appState } from '../lib/app-state.svelte'

  const api = window.masil

  // 여러 쪽을 넘겨 가며 읽은 후보를 모은다 (blogId → 후보)
  let found = $state<Record<string, BuddyScan['candidates'][number]>>({})
  let picked = $state<Record<string, boolean>>({})
  let scanning = $state(false)
  let lastScan = $state<{ count: number; added: number; inList: boolean } | null>(null)
  let note = $state<string | null>(null)
  let progress = $state<ImportProgress | null>(null)

  const loggedIn = $derived(appState.naver?.loggedIn ?? false)
  const myBlogId = $derived(appState.settings?.myBlogId ?? null)
  const list = $derived(Object.values(found))
  const fresh = $derived(list.filter((c) => !c.registered))
  const chosen = $derived(fresh.filter((c) => picked[c.blogId]).map((c) => c.blogId))

  $effect(() => {
    void api.importer.status().then((p) => (progress = p))
    return api.importer.onProgress((p) => {
      progress = p
      // 등록된 이웃은 후보 목록에서 "등록됨"으로 바꾼다
      if (!p.running) void rescanRegistered()
    })
  })

  async function rescanRegistered(): Promise<void> {
    await appState.refresh()
    const ids = new Set(appState.neighbors.map((n) => n.blogId))
    for (const c of Object.values(found)) {
      if (ids.has(c.blogId)) {
        found[c.blogId] = { ...c, registered: true }
        picked[c.blogId] = false
      }
    }
  }

  async function openPage(): Promise<void> {
    note = null
    const res = await api.importer.openPage()
    if (!res.ok) note = res.message
  }

  async function scan(): Promise<void> {
    scanning = true
    note = null
    try {
      const res = await api.importer.scan()
      let added = 0
      for (const c of res.candidates) {
        if (!found[c.blogId]) {
          found[c.blogId] = c
          added++
        }
      }
      lastScan = { count: res.candidates.length, added, inList: res.inList }
      if (res.candidates.length === 0) note = '이 화면에서는 이웃 블로그를 찾지 못했어요. 이웃 목록이 보이는 화면인지 확인해 주세요.'
    } finally {
      scanning = false
    }
  }

  function pickAll(on: boolean): void {
    for (const c of fresh) picked[c.blogId] = on
  }

  async function run(): Promise<void> {
    if (chosen.length === 0) return
    await api.importer.run(chosen)
  }

  // 3~6초 간격으로 하나씩 확인하므로 대략 걸리는 시간
  const eta = $derived(Math.max(1, Math.round((chosen.length * 4.5) / 60)))
</script>

<section class="import" aria-labelledby="import-title">
  <div class="top">
    <h3 id="import-title">이웃 가져오기</h3>
    <button type="button" class="ghost" onclick={() => (appState.importOpen = false)}>닫기</button>
  </div>

  {#if progress?.running}
    <div class="run" role="status">
      <p>
        명단에 적는 중 <b>{progress.done}</b>/{progress.total}
      </p>
      <progress max={progress.total} value={progress.done}></progress>
      <p class="hint">네이버에 부담을 주지 않도록 한 명씩 몇 초 간격으로 확인해요.</p>
      <button type="button" class="ghost" onclick={() => api.importer.cancel()}>그만하기</button>
    </div>
  {:else}
    <ol class="steps">
      <li class:done={loggedIn}>
        <span>네이버 로그인</span>
        {#if loggedIn}<em>됨</em>{:else}<button type="button" class="link" onclick={() => api.naver.nav('login')}>로그인하기</button>{/if}
      </li>
      <li class:done={!!myBlogId}>
        <span>내 블로그</span>
        {#if myBlogId}<em>{myBlogId}</em>{:else}<button type="button" class="link" disabled={!loggedIn} onclick={() => api.findMyBlog()}>찾기</button>{/if}
      </li>
      <li>
        <span>이웃 목록 열기</span>
        <button type="button" class="link" disabled={!loggedIn || !myBlogId} onclick={openPage}>웹뷰에 열기</button>
      </li>
      <li>
        <span>보이는 화면에서 읽기</span>
        <button type="button" class="primary" disabled={!loggedIn || scanning} onclick={scan}>{scanning ? '읽는 중' : '읽기'}</button>
      </li>
    </ol>
    <p class="hint">
      목록이 여러 쪽이면 웹뷰에서 쪽을 넘긴 뒤 다시 "읽기"를 눌러 주세요. 읽은 이웃은 아래에 모여요. 다른 화면(이웃 새글 등)에서도 읽을 수 있어요.
    </p>
  {/if}

  {#if note}<p class="note" role="status">{note}</p>{/if}
  {#if lastScan && lastScan.count > 0}
    <p class="hint">
      이번 화면에서 {lastScan.count}명, 새로 {lastScan.added}명을 찾았어요.
      {#if !lastScan.inList}이웃 목록 영역을 알아보지 못해 화면 전체의 블로그 링크를 읽었어요. 이웃이 아닌 블로그는 빼고 골라 주세요.{/if}
    </p>
  {/if}
  {#if progress && !progress.running && progress.total > 0}
    <p class="hint">
      지난번 가져오기: {progress.added}명 적음{#if progress.skipped > 0}, 이미 있던 {progress.skipped}명{/if}{#if progress.failed.length > 0}, 찾지 못한 {progress.failed.length}명({progress.failed.join(', ')}){/if}
    </p>
  {/if}

  {#if list.length > 0}
    <div class="pick">
      <div class="pick-head">
        <span>찾은 이웃 {list.length}명, 새 이웃 {fresh.length}명</span>
        <span>
          <button type="button" class="link" onclick={() => pickAll(true)}>모두 고르기</button>
          <button type="button" class="link" onclick={() => pickAll(false)}>모두 풀기</button>
        </span>
      </div>
      <ul>
        {#each list as c (c.blogId)}
          <li class:reg={c.registered}>
            <label>
              <input type="checkbox" disabled={c.registered || progress?.running} bind:checked={picked[c.blogId]} />
              <span class="nm">{c.name || c.blogId}</span>
              <span class="id">{c.registered ? '이미 명단에 있음' : c.blogId}</span>
            </label>
          </li>
        {/each}
      </ul>
      <div class="go">
        <button type="button" class="primary" disabled={chosen.length === 0 || progress?.running} onclick={run}>
          고른 {chosen.length}명 명단에 적기
        </button>
        {#if chosen.length > 0}<span class="hint">약 {eta}분 걸려요</span>{/if}
      </div>
    </div>
  {/if}
</section>

<style>
  .import {
    padding: 12px 18px 16px;
    border-bottom: 1px solid var(--line);
    background: var(--paper);
  }
  .top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  h3 {
    margin: 0;
    font-family: var(--font-head);
    font-weight: 700;
    font-size: 15px;
  }
  .steps {
    list-style: none;
    margin: 8px 0 4px;
    padding: 0;
    counter-reset: step;
  }
  .steps li {
    counter-increment: step;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 30px;
    font-size: 13px;
  }
  .steps li > span::before {
    content: counter(step);
    display: inline-block;
    width: 20px;
    font-family: var(--font-hand);
    font-size: 18px;
    color: var(--pen-blue);
  }
  .steps li.done > span {
    color: var(--graphite-soft);
  }
  .steps em {
    font-style: normal;
    color: var(--cover);
    font-size: 12.5px;
  }
  .hint {
    margin: 6px 0 0;
    font-size: 12px;
    line-height: 1.55;
    color: var(--graphite-soft);
  }
  .note {
    margin: 8px 0 0;
    font-size: 12.5px;
    color: var(--margin);
    line-height: 1.5;
  }
  .run p {
    margin: 6px 0;
    font-size: 13px;
  }
  .run b {
    font-family: var(--font-head);
    color: var(--pen-blue);
  }
  progress {
    width: 100%;
    accent-color: var(--cover);
  }
  .pick {
    margin-top: 10px;
    border-top: 1px dashed var(--rule-soft);
    padding-top: 8px;
  }
  .pick-head {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: var(--graphite-soft);
  }
  .pick ul {
    list-style: none;
    margin: 6px 0;
    padding: 0;
    max-height: 260px;
    overflow-y: auto;
  }
  .pick li label {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 8px;
    min-height: 28px;
    font-size: 13px;
  }
  .pick li.reg {
    color: var(--graphite-soft);
  }
  .nm {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .id {
    font-size: 11.5px;
    color: var(--graphite-soft);
  }
  .go {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .go .hint {
    margin: 0;
  }
  .ghost {
    background: var(--paper);
    border: 1px solid #bdbaae;
    font-size: 12px;
    padding: 1px 10px;
    border-radius: 3px;
    color: var(--graphite-soft);
  }
  .primary {
    border: 0;
    background: var(--cover);
    color: #fff;
    font-size: 12.5px;
    padding: 3px 12px;
    border-radius: 3px;
  }
  .link {
    background: none;
    border: 0;
    padding: 0 2px;
    color: var(--pen-blue);
    text-decoration: underline;
    text-underline-offset: 3px;
    font-size: 12.5px;
  }
  button:disabled {
    opacity: 0.45;
    cursor: default;
  }
</style>
