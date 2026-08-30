/** UI-only temporary adapter for the PCB tactics migration's local/session-scoped
 * play designer and play catalog. It intentionally has no GameWorld, save, or
 * MatchEngine dependency — this is ephemeral UI tool state, not domain data. */
export type PlayPoint = { x: number; y: number }
export type PlayAction = { id: string; type: 'move' | 'pass' | 'dribble' | 'screen'; from: PlayPoint; to: PlayPoint }
export type PlayFrame = { players: PlayPoint[]; actions: PlayAction[]; defenders: PlayPoint[] }
export type SavedPlay = { id: string; name: string; frames: PlayFrame[]; createdAt: string }

export const INITIAL_FRAME = (): PlayFrame => ({ players: [{ x: 250, y: 385 }, { x: 70, y: 300 }, { x: 430, y: 300 }, { x: 160, y: 145 }, { x: 340, y: 145 }], actions: [], defenders: [] })

export class TacticsMigrationRepository {
  private plays: SavedPlay[] = []
  savePlay(play: SavedPlay) { this.plays = [...this.plays, play]; return play }
  loadPlays() { return this.plays }
  deletePlay(id: string) { this.plays = this.plays.filter((play) => play.id !== id) }
}
