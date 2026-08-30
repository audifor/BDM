/**
 * Legacy in-memory play repository, retained only so the "no fake fixtures" regression test
 * keeps a stable reference point (see TacticsPcbPage.realWorld.test.ts). It is NOT used by
 * production Designer/Jugadas persistence: real plays/playbooks are canonical GameWorld state
 * (`world.savedPlaysById` / `world.playbooksById`, see @/domain/tactics/SavedPlay.ts and
 * @/engine/tactics/PlaybookEngine.ts) so they are scoped to the actual save/career, round-trip
 * through save/load, and never leak across careers via a global localStorage key (Issue #9).
 */
export type PlayPoint = { x: number; y: number }
export type PlayAction = { id: string; type: 'move' | 'pass' | 'dribble' | 'screen'; from: PlayPoint; to: PlayPoint }
export type PlayFrame = { players: PlayPoint[]; actions: PlayAction[]; defenders: PlayPoint[] }
export type SavedPlay = { id: string; name: string; frames: PlayFrame[]; createdAt: string }
export type Playbook = { id: string; name: string; playIds: string[] }

export const INITIAL_FRAME = (): PlayFrame => ({ players: [{ x: 250, y: 385 }, { x: 70, y: 300 }, { x: 430, y: 300 }, { x: 160, y: 145 }, { x: 340, y: 145 }], actions: [], defenders: [] })

export class TacticsMigrationRepository {
  private plays: SavedPlay[] = []
  private playbooks: Playbook[] = []

  savePlay(play: SavedPlay) { this.plays = [...this.plays, play]; return play }
  loadPlays() { return this.plays }
  deletePlay(id: string) {
    this.plays = this.plays.filter((play) => play.id !== id)
    this.playbooks = this.playbooks.map((playbook) => ({ ...playbook, playIds: playbook.playIds.filter((playId) => playId !== id) }))
  }

  loadPlaybooks() { return this.playbooks }
  savePlaybook(playbook: Playbook) { this.playbooks = [...this.playbooks, playbook]; return playbook }
  updatePlaybook(playbook: Playbook) { this.playbooks = this.playbooks.map((existing) => (existing.id === playbook.id ? playbook : existing)); return playbook }
  deletePlaybook(id: string) { this.playbooks = this.playbooks.filter((playbook) => playbook.id !== id) }
}
