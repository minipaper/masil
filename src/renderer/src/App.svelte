<script lang="ts">
  // M0: 3단 레이아웃 뼈대만. 실제 목록·웹뷰·초안은 M1~M2에서 채운다.
  const isMac = window.masil.platform === 'darwin'
</script>

<div class="app">
  <header class="titlebar" class:mac={isMac}>
    <div class="label"><b>마실 공책</b></div>
  </header>

  <aside class="page roll">
    <div class="roll-head">
      <h2>오늘 출석부</h2>
      <p>아직 등록한 이웃이 없어요.</p>
    </div>
  </aside>

  <main class="page view">
    <p class="empty">왼쪽에서 글을 고르면 여기에 블로그가 열려요.</p>
  </main>

  <aside class="page right">
    <div class="sheet">
      <h2>댓글 초안</h2>
      <p class="empty">글을 열면 초안 세 개를 써 둘게요.</p>
    </div>
  </aside>
</div>

<style>
  .app {
    height: 100vh;
    display: grid;
    grid-template-rows: var(--titlebar-h) 1fr;
    grid-template-columns: 352px 1fr 380px;
    column-gap: 8px;
    padding: 0 10px 10px;
  }

  .titlebar {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    -webkit-app-region: drag;
    user-select: none;
  }
  .titlebar.mac {
    padding-left: 76px; /* 신호등 버튼 자리 */
  }
  .label {
    background: var(--paper);
    padding: 4px 14px;
    border-radius: 4px;
    box-shadow:
      inset 0 0 0 1px #d6d3c6,
      inset 0 0 0 4px var(--paper),
      inset 0 0 0 5px var(--margin);
  }
  .label b {
    font-family: var(--font-head);
    font-weight: 800;
    font-size: 19px;
  }

  .page {
    background: var(--paper);
    border-radius: 3px;
    min-height: 0;
    overflow: hidden;
  }

  .roll-head {
    padding: 16px 18px 10px;
    border-bottom: 2px solid var(--graphite);
  }
  .roll-head h2,
  .sheet h2 {
    margin: 0;
    font-family: var(--font-head);
    font-weight: 800;
    font-size: 20px;
  }
  .roll-head p {
    margin: 4px 0 0;
    color: var(--graphite-soft);
    font-size: 12.5px;
  }

  .view {
    display: grid;
    place-items: center;
    background: #fff;
  }

  .right {
    margin-right: 20px;
  }
  .sheet {
    padding: 14px 18px 24px 52px;
    height: 100%;
    background-image:
      linear-gradient(90deg, transparent 40px, var(--margin) 40px, var(--margin) 41px, transparent 41px),
      repeating-linear-gradient(var(--paper) 0 27px, var(--line) 27px 28px);
  }

  .empty {
    color: var(--graphite-soft);
    font-size: 13px;
  }
  .sheet .empty {
    background: var(--paper);
    display: inline-block;
  }
</style>
