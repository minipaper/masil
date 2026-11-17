import { STYLE_SAMPLE_FINALS, nextStyleAt, styleGuideDue, type StyleState } from '@shared/style'
import { describeAiError, generateStyleGuide } from './ai'
import type { DB } from './db'
import * as repo from './repo'
import { getApiKey, getSettings } from './settings'

/**
 * 문체 가이드 관리. 등록이 확인된 최종본이 10개 새로 쌓이면 개정안을 만든다.
 * 개정안은 사용자가 설정 화면에서 승인해야 초안 프롬프트에 들어간다.
 */
export class StyleService {
  private busy = false
  private error: string | null = null

  constructor(
    private readonly db: DB,
    private readonly onChange: (s: StyleState) => void
  ) {}

  state(): StyleState {
    const lastBasedOn = repo.lastAiBasedOn(this.db)
    return {
      active: repo.activeGuide(this.db),
      proposal: repo.proposedGuide(this.db),
      confirmedCount: repo.countConfirmedComments(this.db),
      nextAt: nextStyleAt(lastBasedOn),
      busy: this.busy,
      error: this.error
    }
  }

  private emit(): void {
    this.onChange(this.state())
  }

  /** 댓글 등록이 확인될 때마다 부른다 */
  maybePropose(): void {
    const settings = getSettings(this.db)
    if (!settings.ai.baseUrl || !settings.ai.model) return
    if (styleGuideDue(repo.countConfirmedComments(this.db), repo.lastAiBasedOn(this.db))) void this.propose()
  }

  /** "지금 갱신" 또는 자동 갱신 */
  async propose(): Promise<void> {
    if (this.busy) return
    const count = repo.countConfirmedComments(this.db)
    if (count === 0) {
      this.error = '아직 등록한 댓글이 없어요. 댓글이 쌓이면 문체를 정리할 수 있어요.'
      this.emit()
      return
    }
    this.busy = true
    this.error = null
    this.emit()
    try {
      const settings = getSettings(this.db)
      const content = await generateStyleGuide(settings.ai, getApiKey(this.db), {
        current: repo.activeGuide(this.db)?.content ?? null,
        finals: repo.recentFinals(this.db, STYLE_SAMPLE_FINALS),
        pairs: repo.draftFinalPairs(this.db, 10)
      })
      repo.insertProposal(this.db, content, count)
    } catch (e) {
      this.error = describeAiError(e)
    } finally {
      this.busy = false
      this.emit()
    }
  }

  approve(id: number): void {
    repo.approveProposal(this.db, id)
    this.emit()
  }

  reject(id: number): void {
    repo.rejectProposal(this.db, id)
    this.emit()
  }

  saveManual(content: string): void {
    repo.saveManualGuide(this.db, content)
    this.emit()
  }
}
