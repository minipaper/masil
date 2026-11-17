import { DEFAULT_CHECK_INTERVAL_MINUTES, clampCheckInterval } from '@shared/policy'
import type { Settings } from '@shared/types'
import type { DB } from './db'
import { readSetting, writeSetting } from './repo'

export const DEFAULT_SETTINGS: Settings = {
  checkIntervalMinutes: DEFAULT_CHECK_INTERVAL_MINUTES,
  quietHours: { enabled: false, start: '23:00', end: '08:00' },
  launchAtLogin: false,
  myBlogId: null,
  paneWidths: { left: 352, right: 380 },
  rightCollapsed: false
}

const KEY = 'app'

export function getSettings(db: DB): Settings {
  const saved = readSetting<Partial<Settings>>(db, KEY) ?? {}
  const merged: Settings = {
    ...DEFAULT_SETTINGS,
    ...saved,
    quietHours: { ...DEFAULT_SETTINGS.quietHours, ...saved.quietHours },
    paneWidths: { ...DEFAULT_SETTINGS.paneWidths, ...saved.paneWidths }
  }
  merged.checkIntervalMinutes = clampCheckInterval(merged.checkIntervalMinutes)
  return merged
}

export function updateSettings(db: DB, patch: Partial<Settings>): Settings {
  const next: Settings = {
    ...getSettings(db),
    ...patch
  }
  next.checkIntervalMinutes = clampCheckInterval(next.checkIntervalMinutes)
  next.paneWidths = {
    left: Math.min(560, Math.max(280, Math.round(next.paneWidths.left))),
    right: Math.min(560, Math.max(300, Math.round(next.paneWidths.right)))
  }
  writeSetting(db, KEY, next)
  return next
}
