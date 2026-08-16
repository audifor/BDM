import type { PlayerId, TeamId } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import type { DraftPick } from '@/domain/draft'
import type { Draft, DraftRules } from '@/domain/draft'
import type { EcosystemId, SeasonId } from '@/domain/ids'
import { calculateStandings } from '@/engine/competition/standings'
import { createPlayer, calculateAge } from '@/domain/player'
import { playerIdFromString } from '@/domain/ids'
import { addDays, addYears } from '@/domain/date'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'
import { calculateBootstrapAbilityProxy } from '@/domain/player'

export function createDraftForCompletedSeason(world: GameWorld, ecosystemId: EcosystemId, sourceSeasonId: SeasonId, rules: DraftRules, prospectPlayerIds: readonly PlayerId[]): GameWorld {
  const ecosystem = world.ecosystems[ecosystemId]; const season = world.seasons[sourceSeasonId]
  if (!ecosystem || ecosystem.kind !== 'nbaLike' || !season || world.competitions[season.competitionId]?.ecosystemId !== ecosystemId || world.seasonHistoryBySeasonId[sourceSeasonId] === undefined) throw new Error('Draft requires a completed NBA-like season')
  const id = `draft:${ecosystemId}:${sourceSeasonId}`; if (world.draftsById[id] !== undefined) return world
  const order = calculateStandings(world, sourceSeasonId).slice().reverse().map((line) => line.teamId)
  const required = order.length * rules.rounds; if ((prospectPlayerIds.length !== 0 && prospectPlayerIds.length < required) || new Set(prospectPlayerIds).size !== prospectPlayerIds.length) throw new Error('Draft class has insufficient unique prospects')
  const draft: Draft = { id, ecosystemId, sourceSeasonId, rules, scheduledOn: addDays(season.endDate, rules.scheduledAfterDays), status: 'scheduled', prospectPlayerIds }
  const picks: DraftPick[] = Array.from({ length: rules.rounds }, (_, roundIndex) => order.map((teamId, index) => ({ id: `draft-pick:${id}:round:${roundIndex + 1}:original:${teamId}`, draftId: id, round: roundIndex + 1, order: roundIndex * order.length + index + 1, originalTeamId: teamId, ownerTeamId: teamId }))).flat()
  return updateGameWorld(world, { drafts: [...Object.values(world.draftsById), draft], draftPicks: [...Object.values(world.draftPicksById), ...picks] })
}
export function openDraft(world: GameWorld, draftId: string): GameWorld { const draft = world.draftsById[draftId]; if (!draft || draft.status !== 'scheduled' || world.currentDate < draft.scheduledOn || world.seasonHistoryBySeasonId[draft.sourceSeasonId] === undefined) return world; return updateGameWorld(world, { drafts: Object.values(world.draftsById).map((item) => item.id === draftId ? { ...item, status: 'inProgress' } : item) }) }
export function generateDraftProspects(world: GameWorld, draftId: string, count: number): GameWorld {
  const draft = world.draftsById[draftId]; if (!draft || draft.prospectPlayerIds.length > 0 || !Number.isInteger(count) || count < 1) throw new Error('Draft prospects cannot be generated')
  const template = Object.values(world.players)[0]; if (!template) throw new Error('Draft prospects require a player template')
  const prospects = Array.from({ length: count }, (_, index) => { const id = playerIdFromString(`draft-prospect:${draftId}:${index + 1}`); const random = new SeededRandomSource(hashStringToSeed(`draft-prospect:${draftId}:${index + 1}`)); const positions = ['PG','SG','SF','PF','C'] as const; const rating = () => random.nextInt(45, 75); const bioDate = addYears(draft.scheduledOn, -19); return createPlayer({ id, firstName: `Prospect${index + 1}`, lastName: `Class${draftId.slice(-6)}`, gender: template.gender, nationalityId: template.nationalityId, basketball: { primaryPosition: positions[index % positions.length]!, ratings: { finishing: rating(), shooting: rating(), playmaking: rating(), perimeterDefense: rating(), interiorDefense: rating(), rebounding: rating(), athleticism: rating() } }, bio: { dateOfBirth: bioDate, heightCm: random.nextInt(180, 215), weightKg: random.nextInt(75, 115) } }) })
  return updateGameWorld(world, { players: [...Object.values(world.players), ...prospects], drafts: Object.values(world.draftsById).map((item) => item.id === draftId ? { ...item, prospectPlayerIds: prospects.map((player) => player.id) } : item) })
}
export function chooseAiDraftProspect(world: GameWorld, draftId: string): PlayerId | undefined { return getAvailableDraftProspects(world, draftId).slice().sort((a, b) => { const first = world.players[a]!; const second = world.players[b]!; return (calculateBootstrapAbilityProxy(second.basketball.ratings) + second.potential.ceiling * 0.25) - (calculateBootstrapAbilityProxy(first.basketball.ratings) + first.potential.ceiling * 0.25) || a.localeCompare(b) })[0] }
export function progressDraftAi(world: GameWorld, draftId: string): GameWorld { let current = world; const userTeamId = Object.values(current.teams).find((team) => team.coachId === current.userCoachId)?.id; for (;;) { const pick = getCurrentDraftPick(current, draftId); if (!pick || pick.ownerTeamId === userTeamId) return current; const prospect = chooseAiDraftProspect(current, draftId); if (!prospect) return current; current = makeDraftSelection(current, draftId, pick.ownerTeamId, prospect) } }

export function getDraftPicks(world: GameWorld, draftId: string): readonly DraftPick[] { return Object.values(world.draftPicksById).filter((pick) => pick.draftId === draftId).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)) }
export function getCurrentDraftPick(world: GameWorld, draftId: string): DraftPick | undefined { return getDraftPicks(world, draftId).find((pick) => pick.selection === undefined) }
export function getAvailableDraftProspects(world: GameWorld, draftId: string): readonly PlayerId[] { const draft = world.draftsById[draftId]; if (!draft) throw new Error('Draft does not exist'); const selected = new Set(getDraftPicks(world, draftId).flatMap((pick) => pick.selection === undefined ? [] : [pick.selection.playerId])); return draft.prospectPlayerIds.filter((id) => !selected.has(id)) }
export function makeDraftSelection(world: GameWorld, draftId: string, selectingTeamId: TeamId, playerId: PlayerId): GameWorld {
  const draft = world.draftsById[draftId]; if (!draft || draft.status !== 'inProgress') throw new Error('Draft is not in progress')
  const pick = getCurrentDraftPick(world, draftId); if (!pick || pick.ownerTeamId !== selectingTeamId || !getAvailableDraftProspects(world, draftId).includes(playerId)) throw new Error('Draft selection is invalid')
  const team = world.teams[selectingTeamId]!; if (team.rosterPlayerIds.includes(playerId)) throw new Error('Draft prospect is already rostered')
  const picks = Object.values(world.draftPicksById).map((item) => item.id === pick.id ? { ...item, selection: { playerId, teamId: selectingTeamId } } : item)
  const complete = picks.filter((item) => item.draftId === draftId).every((item) => item.selection !== undefined)
  return updateGameWorld(world, { teams: Object.values(world.teams).map((item) => item.id === selectingTeamId ? { ...item, rosterPlayerIds: [...item.rosterPlayerIds, playerId] } : item), draftPicks: picks, drafts: Object.values(world.draftsById).map((item) => item.id === draftId ? { ...item, status: complete ? 'completed' : 'inProgress' } : item) })
}
