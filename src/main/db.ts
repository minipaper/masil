import { join } from 'node:path'
import Database from 'better-sqlite3'
import { app } from 'electron'

export type DB = Database.Database

/**
 * 스키마 마이그레이션. 배열 순서 = PRAGMA user_version.
 * 이미 배포된 항목은 고치지 말고 뒤에 새 항목을 추가한다.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE neighbors (
    id              INTEGER PRIMARY KEY,
    blog_id         TEXT NOT NULL UNIQUE,
    nickname        TEXT NOT NULL,
    blog_title      TEXT,
    honorific       TEXT NOT NULL DEFAULT '',
    speech          TEXT NOT NULL DEFAULT 'polite' CHECK (speech IN ('polite','casual')),
    closeness       INTEGER NOT NULL DEFAULT 2 CHECK (closeness BETWEEN 1 AND 3),
    memo            TEXT NOT NULL DEFAULT '',
    created_at      TEXT NOT NULL,
    last_checked_at TEXT,
    last_attempt_at TEXT,
    fail_count      INTEGER NOT NULL DEFAULT 0,
    etag            TEXT,
    last_modified   TEXT
  );

  CREATE TABLE posts (
    id            INTEGER PRIMARY KEY,
    neighbor_id   INTEGER NOT NULL REFERENCES neighbors(id) ON DELETE CASCADE,
    log_no        TEXT NOT NULL,
    title         TEXT NOT NULL,
    url           TEXT NOT NULL,
    category      TEXT,
    tags          TEXT NOT NULL DEFAULT '[]',
    excerpt       TEXT NOT NULL DEFAULT '',
    published_at  TEXT NOT NULL,
    discovered_at TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','read','commented','skipped','old')),
    liked         INTEGER NOT NULL DEFAULT 0,
    opened_at     TEXT,
    acted_at      TEXT,
    UNIQUE (neighbor_id, log_no)
  );
  CREATE INDEX posts_status ON posts(status, published_at);

  -- AI 초안. batch_id = 한 번 생성할 때 나온 초안 묶음.
  -- 이웃이 아닌 글에서도 쓸 수 있도록 posts 행이 아니라 blog_id/log_no로 묶는다.
  CREATE TABLE drafts (
    id         INTEGER PRIMARY KEY,
    blog_id    TEXT NOT NULL,
    log_no     TEXT NOT NULL,
    batch_id   TEXT NOT NULL,
    tone       TEXT NOT NULL,
    text       TEXT NOT NULL,
    model      TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX drafts_post ON drafts(blog_id, log_no, created_at);

  -- 내가 등록한 댓글 최종본 (M2). 이웃을 지웠다 다시 등록해도 기록이 이어지도록 blog_id로 묶는다.
  CREATE TABLE comments (
    id           INTEGER PRIMARY KEY,
    blog_id      TEXT NOT NULL,
    log_no       TEXT NOT NULL,
    post_title   TEXT NOT NULL DEFAULT '',
    text         TEXT NOT NULL,
    draft_text   TEXT,
    draft_tone   TEXT,
    is_secret    INTEGER NOT NULL DEFAULT 0,
    status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','failed')),
    clicked_at   TEXT NOT NULL,
    confirmed_at TEXT
  );
  CREATE INDEX comments_blog ON comments(blog_id, clicked_at);

  -- 내 댓글 스타일 가이드 (M3). 한 번에 active는 하나.
  CREATE TABLE style_guides (
    id             INTEGER PRIMARY KEY,
    content        TEXT NOT NULL,
    source         TEXT NOT NULL CHECK (source IN ('manual','ai')),
    status         TEXT NOT NULL CHECK (status IN ('active','proposed','rejected','archived')),
    based_on_count INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL
  );

  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `
]

let db: DB | null = null

export function dbPath(): string {
  return join(app.getPath('userData'), 'masil.sqlite')
}

export function openDb(file = dbPath()): DB {
  const conn = new Database(file)
  conn.pragma('journal_mode = WAL')
  conn.pragma('foreign_keys = ON')
  migrate(conn)
  return conn
}

export function migrate(conn: DB): void {
  const current = conn.pragma('user_version', { simple: true }) as number
  for (let v = current; v < MIGRATIONS.length; v++) {
    conn.transaction(() => {
      conn.exec(MIGRATIONS[v]!)
      conn.pragma(`user_version = ${v + 1}`)
    })()
  }
}

export function getDb(): DB {
  if (!db) db = openDb()
  return db
}

export function closeDb(): void {
  db?.close()
  db = null
}
