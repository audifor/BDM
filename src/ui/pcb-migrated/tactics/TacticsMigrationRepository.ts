/** UI-only temporary adapter for the PCB tactics migration.  It intentionally
 * has no GameWorld, save, or MatchEngine dependency. */
export type TacticPlayer = { id: string; name: string; pos: string; rating: number; defense: number; stamina: number }
export type PlayPoint = { x: number; y: number }
export type PlayAction = { id: string; type: 'move' | 'pass' | 'dribble' | 'screen'; from: PlayPoint; to: PlayPoint }
export type PlayFrame = { players: PlayPoint[]; actions: PlayAction[]; defenders: PlayPoint[] }
export type SavedPlay = { id: string; name: string; frames: PlayFrame[]; createdAt: string }

export const TACTICS_PLAYERS: readonly TacticPlayer[] = [
  { id: 'p1', name: 'Marcus Cole', pos: 'PG', rating: 82, defense: 75, stamina: 86 }, { id: 'p2', name: 'Ethan Brooks', pos: 'SG', rating: 79, defense: 70, stamina: 82 },
  { id: 'p3', name: 'Julian Price', pos: 'SF', rating: 81, defense: 78, stamina: 80 }, { id: 'p4', name: 'Malik Grant', pos: 'PF', rating: 77, defense: 81, stamina: 76 },
  { id: 'p5', name: 'Noah Bennett', pos: 'C', rating: 80, defense: 84, stamina: 78 }, { id: 'p6', name: 'Leo Carter', pos: 'PG', rating: 74, defense: 68, stamina: 75 },
  { id: 'p7', name: 'Andre Mills', pos: 'SG', rating: 76, defense: 72, stamina: 77 }, { id: 'p8', name: 'Victor Hale', pos: 'SF', rating: 73, defense: 76, stamina: 74 },
  { id: 'p9', name: 'Owen Fox', pos: 'PF', rating: 72, defense: 75, stamina: 72 }, { id: 'p10', name: 'Darius King', pos: 'C', rating: 75, defense: 79, stamina: 73 },
]
export const TACTICS_OPPONENTS = [
  { id: 'o1', name: 'T. Walker', pos: 'PG', threat: 86, height: '188 cm' }, { id: 'o2', name: 'J. Lewis', pos: 'SG', threat: 81, height: '193 cm' },
  { id: 'o3', name: 'R. Stone', pos: 'SF', threat: 78, height: '201 cm' }, { id: 'o4', name: 'C. White', pos: 'PF', threat: 80, height: '207 cm' }, { id: 'o5', name: 'D. Young', pos: 'C', threat: 84, height: '213 cm' },
] as const
export const INITIAL_FRAME = (): PlayFrame => ({ players: [{ x: 250, y: 385 }, { x: 70, y: 300 }, { x: 430, y: 300 }, { x: 160, y: 145 }, { x: 340, y: 145 }], actions: [], defenders: [] })

export class TacticsMigrationRepository {
  private plays: SavedPlay[] = []
  savePlay(play: SavedPlay) { this.plays = [...this.plays, play]; return play }
  loadPlays() { return this.plays }
  deletePlay(id: string) { this.plays = this.plays.filter((play) => play.id !== id) }
}
