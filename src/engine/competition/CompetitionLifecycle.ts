import type { GameDate } from '@/domain/date'
import type { CompetitionId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { isCompetitionComplete } from '@/engine/season'

export type CompetitionTemporalStatus = 'scheduled' | 'active' | 'completed'
export function getCompetitionSeason(world: GameWorld, competitionId: CompetitionId) { const season = Object.values(world.seasons).filter((candidate) => candidate.competitionId === competitionId).sort((a, b) => b.startDate.localeCompare(a.startDate) || b.id.localeCompare(a.id))[0]; if (season === undefined) throw new Error(`Competition has no Season: ${competitionId}`); return season }
export function getCompetitionTemporalStatus(world: GameWorld, competitionId: CompetitionId, date: GameDate = world.currentDate): CompetitionTemporalStatus { const season = getCompetitionSeason(world, competitionId); if (isCompetitionComplete(world, competitionId)) return 'completed'; return date < season.startDate ? 'scheduled' : 'active' }
export function isCompetitionActiveOnDate(world: GameWorld, competitionId: CompetitionId, date: GameDate): boolean { const season = getCompetitionSeason(world, competitionId); return date >= season.startDate && date <= season.endDate && !isCompetitionComplete(world, competitionId) }
