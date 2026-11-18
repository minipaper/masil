import { REPLY_CHECK_POSTS } from '@shared/visitors'
import { parseBlogId } from '@shared/blog-id'
import { safeStorage } from 'electron'
import { DEFAULT_CHECK_INTERVAL_MINUTES, clampCheckInterval } from '@shared/policy'
import { DEFAULT_TONES, MAX_TONES, TONE_PRESETS } from '@shared/prompt'
import type { AiSettings, Settings } from '@shared/types'
import type { DB } from './db'
import { readSetting, writeSetting } from './repo'

type StoredSettings = Omit<Settings, 'hasApiKey'>

export const DEFAULT_AI: AiSettings = {
  baseUrl: 'https://api.openai.com/v1',
  model: '',
  autoGenerate: true,
  sendImages: false,
  tones: DEFAULT_TONES,
  examples: { recent: 5, neighbor: 3, pairs: 3 }
}

export const DEFAULT_SETTINGS: StoredSettings = {
  checkIntervalMinutes: DEFAULT_CHECK_INTERVAL_MINUTES,
  quietHours: { enabled: false, start: '23:00', end: '08:00' },
  launchAtLogin: false,
  myBlogId: null,
  paneWidths: { left: 352, right: 380 },
  rightCollapsed: false,
  replyCheckPosts: REPLY_CHECK_POSTS.default,
  ai: DEFAULT_AI
}

const KEY = 'app'
/** settings 테이블에서 암호화된 API 키를 담는 행 (백업에서는 뺀다) */
export const API_KEY = 'ai.key'

const clampInt = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback

function normalize(s: StoredSettings): StoredSettings {
  const ai = s.ai
  const tones = Array.isArray(ai.tones) && ai.tones.length > 0 ? ai.tones : DEFAULT_TONES
  return {
    ...s,
    checkIntervalMinutes: clampCheckInterval(s.checkIntervalMinutes),
    myBlogId: s.myBlogId ? parseBlogId(String(s.myBlogId)) : null,
    replyCheckPosts: clampInt(s.replyCheckPosts, REPLY_CHECK_POSTS.min, REPLY_CHECK_POSTS.max, REPLY_CHECK_POSTS.default),
    paneWidths: {
      left: clampInt(s.paneWidths.left, 280, 560, 352),
      right: clampInt(s.paneWidths.right, 300, 560, 380)
    },
    ai: {
      ...ai,
      baseUrl: String(ai.baseUrl ?? '').trim().replace(/\/+$/, ''),
      model: String(ai.model ?? '').trim(),
      tones: tones.slice(0, MAX_TONES).map((t, i) => ({
        name: String(t.name ?? '').trim() || TONE_PRESETS[i]?.name || `톤 ${i + 1}`,
        description: String(t.description ?? '').trim()
      })),
      examples: {
        recent: clampInt(ai.examples?.recent, 0, 10, 5),
        neighbor: clampInt(ai.examples?.neighbor, 0, 10, 3),
        pairs: clampInt(ai.examples?.pairs, 0, 10, 3)
      }
    }
  }
}

function readStored(db: DB): StoredSettings {
  const saved = readSetting<Partial<StoredSettings>>(db, KEY) ?? {}
  return normalize({
    ...DEFAULT_SETTINGS,
    ...saved,
    quietHours: { ...DEFAULT_SETTINGS.quietHours, ...saved.quietHours },
    paneWidths: { ...DEFAULT_SETTINGS.paneWidths, ...saved.paneWidths },
    ai: { ...DEFAULT_AI, ...saved.ai, examples: { ...DEFAULT_AI.examples, ...saved.ai?.examples } }
  })
}

export function getSettings(db: DB): Settings {
  return { ...readStored(db), hasApiKey: readSetting<string>(db, API_KEY) != null }
}

export function updateSettings(db: DB, patch: Partial<Settings>): Settings {
  const cur = readStored(db)
  const { hasApiKey: _ignored, ...rest } = patch
  const next = normalize({
    ...cur,
    ...rest,
    quietHours: { ...cur.quietHours, ...rest.quietHours },
    paneWidths: { ...cur.paneWidths, ...rest.paneWidths },
    ai: { ...cur.ai, ...rest.ai, examples: { ...cur.ai.examples, ...rest.ai?.examples } }
  })
  writeSetting(db, KEY, next)
  return getSettings(db)
}

// ───────── API 키: safeStorage(Windows DPAPI)로 암호화. 평문으로는 저장하지 않는다. ─────────

export function setApiKey(db: DB, key: string | null): void {
  const trimmed = key?.trim() ?? ''
  if (!trimmed) {
    db.prepare(`DELETE FROM settings WHERE key = ?`).run(API_KEY)
    return
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('이 PC에서는 키를 암호화해 저장할 수 없어요.')
  }
  writeSetting(db, API_KEY, safeStorage.encryptString(trimmed).toString('base64'))
}

/** main 프로세스 안에서만 쓴다. renderer나 웹뷰로 보내지 않는다. */
export function getApiKey(db: DB): string | null {
  const stored = readSetting<string>(db, API_KEY)
  if (!stored) return null
  try {
    return safeStorage.decryptString(Buffer.from(stored, 'base64'))
  } catch {
    return null
  }
}
