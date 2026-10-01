import { addDays, compareGameDates, parseGameDate } from '@/domain/date'
import { hasPriorRelatedInjury, injuryLifecycleStatus, type MedicalActionActor, type RehabilitationMode } from '@/domain/injury'
import type { InjuryId } from '@/domain/ids'
import { getCareerFatigueForPlayer, updateGameWorld, type GameWorld } from '@/domain/world'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'
import { canMedicalActorActForPlayer } from './MedicalActionAccess'

export type SetRehabilitationPlanResult =
  | { readonly ok: true; readonly world: GameWorld }
  | { readonly ok: false; readonly reason: 'INJURY_NOT_FOUND' | 'NOT_RECOVERING' | 'NOT_AUTHORIZED' }

export function setRehabilitationPlan(
  world: GameWorld,
  request: { readonly injuryId: InjuryId; readonly mode: RehabilitationMode; readonly actor: MedicalActionActor },
): SetRehabilitationPlanResult {
  const injury = world.injuriesById[request.injuryId]
  if (injury === undefined) return { ok: false, reason: 'INJURY_NOT_FOUND' }
  if (injuryLifecycleStatus(injury, world.currentDate) !== 'RECOVERING') return { ok: false, reason: 'NOT_RECOVERING' }
  if (!canMedicalActorActForPlayer(world, injury.playerId, request.actor)) return { ok: false, reason: 'NOT_AUTHORIZED' }
  const current = injury.rehabilitation ?? { mode: 'STANDARD_REHAB' as const, startedOn: injury.injuredOn, changedOn: injury.injuredOn, history: [] }
  if (current.mode === request.mode) return { ok: true, world }
  const updated = {
    ...injury,
    rehabilitation: {
      ...current,
      mode: request.mode,
      changedOn: world.currentDate,
      history: [...current.history, { changedOn: world.currentDate, mode: request.mode, actor: request.actor }],
    },
  }
  return { ok: true, world: updateGameWorld(world, { injuries: [...Object.values(world.injuriesById).filter((item) => item.id !== injury.id), updated] }) }
}

export function chooseAiRehabilitationMode(world: GameWorld, injuryId: InjuryId): RehabilitationMode | undefined {
  const injury = world.injuriesById[injuryId]
  if (injury === undefined) return undefined
  const relatedHistory = hasPriorRelatedInjury(injury, Object.values(world.injuriesById))
  const fatigue = getCareerFatigueForPlayer(world, injury.playerId)
  const team = Object.values(world.teams).find((candidate) => candidate.rosterPlayerIds.includes(injury.playerId))
  const gameWithinTwoDays = team !== undefined && Object.values(world.games).some((game) => game.status === 'scheduled'
    && (game.homeTeamId === team.id || game.awayTeamId === team.id)
    && compareGameDates(game.date, world.currentDate) >= 0
    && compareGameDates(game.date, addDays(world.currentDate, 2)) <= 0)
  const projectedRecoveryDays = Math.max(1, Math.round((Date.parse(parseGameDate(injury.expectedReturnDate)) - Date.parse(parseGameDate(injury.injuredOn))) / 86_400_000))
  const advice = Object.values(world.delegationOutcomesById)
    .filter((outcome) => (outcome.kind === 'treatmentRecommendation' || outcome.kind === 'returnToPlayRecommendation') && outcome.payload.injuryId === injury.id)
    .sort((a, b) => b.decidedOn.localeCompare(a.decidedOn) || a.id.localeCompare(b.id))[0]
  const recommendedDays = typeof advice?.payload.recommendedExtraDays === 'number' ? advice.payload.recommendedExtraDays : 0
  if (injury.severity === 'serious' || (injury.severity === 'moderate' && projectedRecoveryDays >= 30) || (relatedHistory && fatigue >= 60) || (gameWithinTwoDays && fatigue >= 70) || recommendedDays >= 3) return 'REST'
  if (injury.severity === 'minor' && projectedRecoveryDays <= 7 && !relatedHistory && fatigue < 50 && recommendedDays <= 0) return 'ACCELERATED_REHAB'
  return 'STANDARD_REHAB'
}

export function progressRehabilitationSetbacks(world: GameWorld): GameWorld {
  let next = world
  for (const injury of Object.values(world.injuriesById).sort((a, b) => a.id.localeCompare(b.id))) {
    if (injuryLifecycleStatus(injury, world.currentDate) !== 'RECOVERING') continue
    const elapsed = Math.round((Date.parse(parseGameDate(world.currentDate)) - Date.parse(parseGameDate(injury.injuredOn))) / 86_400_000)
    if (elapsed <= 0 || elapsed % 7 !== 0 || (injury.rehabilitationSetbacks?.length ?? 0) >= 2) continue
    const week = Math.floor(elapsed / 7)
    const eventId = `${injury.id}:rehab-week:${week}`
    if ((injury.rehabilitationSetbacks ?? []).some((setback) => setback.id === eventId)) continue
    const mode = injury.rehabilitation?.mode ?? 'STANDARD_REHAB'
    const probability = rehabilitationSetbackRisk(mode)
    const roll = new SeededRandomSource(hashStringToSeed(`rehab-setback-v1:${eventId}`)).nextFloat(0, 1)
    if (roll >= probability) continue
    const setback = { id: eventId, occurredOn: world.currentDate, mode, reason: 'REHAB_SETBACK' as const, daysAdded: 3 }
    const updated = { ...injury, rehabilitationSetbacks: [...(injury.rehabilitationSetbacks ?? []), setback] }
    next = updateGameWorld(next, { injuries: [...Object.values(next.injuriesById).filter((item) => item.id !== injury.id), updated] })
  }
  return next
}

export const REHAB_SETBACK_PROBABILITIES: Readonly<Record<RehabilitationMode, number>> = {
  REST: .0025,
  STANDARD_REHAB: .005,
  ACCELERATED_REHAB: .015,
}

export function rehabilitationSetbackRisk(mode: RehabilitationMode): number {
  return REHAB_SETBACK_PROBABILITIES[mode]
}
