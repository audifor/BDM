/**
 * Canonical Tactics play/playbook repository (Issue #9): the single source of truth for saved
 * plays shared by the Diseñador (play designer canvas) and the Jugadas (play catalog) tabs.
 *
 * This intentionally has no GameWorld/save/MatchEngine dependency — plays are a UI/coaching-tool
 * artifact, not simulated domain state — but it IS persisted (to localStorage) so a saved play
 * survives a reload and both tabs read/write through this one repository. It replaces the prior
 * three disconnected authorities (PcbTacticsCreator's own localStorage keys, the mocked
 * PcbPlaybookManager "DB" also backed by localStorage under different keys, and an earlier
 * in-memory-only version of this class).
 */
export type PlayPoint = { x: number; y: number }
export type PlayAction = { id: string; type: 'move' | 'pass' | 'dribble' | 'screen'; from: PlayPoint; to: PlayPoint }
export type PlayFrame = { players: PlayPoint[]; actions: PlayAction[]; defenders: PlayPoint[] }
/**
 * `designerFrames` carries the play designer canvas's own richer frame representation (player
 * tokens, ball ownership, drawn action paths) as an opaque payload, verbatim, so the Diseñador's
 * full editable state round-trips through the same canonical record the Jugadas catalog reads —
 * without forcing a lossy conversion into the simpler PlayFrame shape used for catalog display.
 */
export type SavedPlay = { id: string; name: string; frames: PlayFrame[]; createdAt: string; designerFrames?: unknown }
export type Playbook = { id: string; name: string; playIds: string[] }

export const INITIAL_FRAME = (): PlayFrame => ({ players: [{ x: 250, y: 385 }, { x: 70, y: 300 }, { x: 430, y: 300 }, { x: 160, y: 145 }, { x: 340, y: 145 }], actions: [], defenders: [] })

const PLAYS_STORAGE_KEY = 'pcbasket.tactics.plays.v1'
const PLAYBOOKS_STORAGE_KEY = 'pcbasket.tactics.playbooks.v1'

function readPersisted<Value>(key: string): Value[] {
  try {
    const raw = window.localStorage?.getItem(key)
    if (raw === null || raw === undefined) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Value[]) : []
  } catch {
    return []
  }
}

function writePersisted<Value>(key: string, values: readonly Value[]): void {
  try {
    window.localStorage?.setItem(key, JSON.stringify(values))
  } catch {
    // Ignore storage failures (private browsing, quota) — data remains available for this session.
  }
}

export class TacticsMigrationRepository {
  private plays: SavedPlay[] = typeof window === 'undefined' ? [] : readPersisted<SavedPlay>(PLAYS_STORAGE_KEY)
  private playbooks: Playbook[] = typeof window === 'undefined' ? [] : readPersisted<Playbook>(PLAYBOOKS_STORAGE_KEY)

  savePlay(play: SavedPlay) { this.plays = [...this.plays, play]; writePersisted(PLAYS_STORAGE_KEY, this.plays); return play }
  loadPlays() { return this.plays }
  deletePlay(id: string) {
    this.plays = this.plays.filter((play) => play.id !== id)
    writePersisted(PLAYS_STORAGE_KEY, this.plays)
    this.playbooks = this.playbooks.map((playbook) => ({ ...playbook, playIds: playbook.playIds.filter((playId) => playId !== id) }))
    writePersisted(PLAYBOOKS_STORAGE_KEY, this.playbooks)
  }

  loadPlaybooks() { return this.playbooks }
  savePlaybook(playbook: Playbook) { this.playbooks = [...this.playbooks, playbook]; writePersisted(PLAYBOOKS_STORAGE_KEY, this.playbooks); return playbook }
  updatePlaybook(playbook: Playbook) { this.playbooks = this.playbooks.map((existing) => (existing.id === playbook.id ? playbook : existing)); writePersisted(PLAYBOOKS_STORAGE_KEY, this.playbooks); return playbook }
  deletePlaybook(id: string) { this.playbooks = this.playbooks.filter((playbook) => playbook.id !== id); writePersisted(PLAYBOOKS_STORAGE_KEY, this.playbooks) }
}
