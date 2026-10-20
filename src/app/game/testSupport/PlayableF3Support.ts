import type { GameDate } from '@/domain/date'
import type { PlayerId, TeamId } from '@/domain/ids'
import { getTeamRoster, type GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { hashStringToSeed } from '@/engine/random'
import { assessPlayerContractSigningReadiness } from '@/app/governance'
import { assessRoutedFreeAgentOfferIntelligence } from '@/app/marketIntelligence'
import { assessFormalOfferPreparation } from '@/engine/marketIntelligence'
import { useGameStore } from '@/stores/gameStore'
import { advanceGameDay } from '../advanceGameDay'
import { instantResult } from '../matchResolution'
import { matchSeedFor, userGameToday } from './PlayableF2Support'

/**
 * F3 harness. Every decision is a call to a `gameStore` action, the same ones the Courtside Market, Contracts and Staff screens
 * call; days pass through the production day boundary (`advanceGameDay`) and the user's games through `instantResult`.
 */
export { createF2Day0 as createF3Day0, matchSeedFor, userGameToday } from './PlayableF2Support'

export type F3Store = ReturnType<typeof useGameStore.getState>
export interface F3Step { readonly date: GameDate; readonly step: string; readonly detail: string }

const F3_SALT = 11
export const f3Store = (): F3Store => useGameStore.getState()
export const f3World = (): GameWorld => useGameStore.getState().world!

function daySeedFactory(date: GameDate): () => number {
  let index = 0
  return () => hashStringToSeed(`f3-day:${date}:${index++}`)
}

/** One calendar day exactly as the Home CONTINUE button runs it: the user's game of the day (if any) is played, then the boundary advances. */
export function f3AdvanceDay(salt = F3_SALT): GameWorld {
  let current = f3World()
  const game = userGameToday(current)
  if (game !== undefined) current = instantResult(current, undefined, matchSeedFor(salt, game.id))
  current = advanceGameDay(current, daySeedFactory(current.currentDate))
  f3Store().replaceWorld(current)
  return current
}

export function f3AdvanceDays(days: number, salt = F3_SALT): GameWorld {
  for (let index = 0; index < days; index += 1) f3AdvanceDay(salt)
  return f3World()
}

export type F3SigningOutcome =
  | { readonly status: 'SIGNED'; readonly playerId: PlayerId; readonly negotiationId: string; readonly contractId: string; readonly log: readonly F3Step[]; readonly worldBeforeSigning: GameWorld; readonly worldAfterSigning: GameWorld }
  | { readonly status: 'NOT_COMPLETED'; readonly playerId: PlayerId; readonly stoppedAt: string; readonly log: readonly F3Step[] }

/**
 * Plays the canonical free-agent cycle for one candidate with the user's own actions:
 * Buscar → Contactar → (día) respuesta → Oferta preparada → (día) respuesta → [aceptar contraoferta] → Governance → (día) consejo → Firma.
 */
export function f3SignFreeAgent(playerId: PlayerId, options: { readonly salt?: number } = {}): F3SigningOutcome {
  const salt = options.salt ?? F3_SALT
  const store = f3Store()
  const team = getUserTeam(f3World())!
  const log: F3Step[] = []
  const note = (step: string, detail: string) => log.push({ date: f3World().currentDate, step, detail })
  const stop = (stoppedAt: string): F3SigningOutcome => ({ status: 'NOT_COMPLETED', playerId, stoppedAt, log })
  const negotiationFor = () => Object.values(f3World().negotiationsById).find((item) => item.playerId === playerId && item.teamId === team.id)

  const offer = assessRoutedFreeAgentOfferIntelligence(f3World(), team.id, playerId).find((item) => item.playerId === playerId)
  if (offer === undefined || offer.contactReadiness !== 'READY_TO_CONTACT') return stop(`CONTACT_NOT_READY:${offer?.contactReadiness ?? 'NO_OFFER'}`)
  store.contactFreeAgent(team.id, playerId, offer.sourceProposalId!)
  const contact = negotiationFor()
  if (contact?.status !== 'CONTACTED') return stop('CONTACT_NOT_CREATED')
  note('contact', contact.id)

  f3AdvanceDay(salt)
  const answered = negotiationFor()
  const response = answered !== undefined && 'contactResponse' in answered ? answered.contactResponse : undefined
  note('contactResponse', response?.outcome ?? 'NONE')
  if (answered?.status !== 'CONTACTED' || response?.outcome !== 'OPEN_TO_TALKS') return stop(`CONTACT_RESPONSE:${response?.outcome ?? 'NONE'}`)

  const current = assessRoutedFreeAgentOfferIntelligence(f3World(), team.id, playerId, answered.sourcePlanId).find((item) => item.sourceProposalId === answered.sourceProposalId)
  const preparation = current === undefined ? undefined : assessFormalOfferPreparation(f3World(), current)
  note('preparation', `${preparation?.readiness ?? 'NONE'} ${preparation?.salaryProposal?.amount ?? '?'} x ${preparation?.termProposalYears ?? '?'}`)
  if (preparation?.readiness !== 'READY_TO_SUBMIT_OFFER') return stop(`PREPARATION:${preparation?.readiness ?? 'NONE'}:${preparation?.blockers.join('|') ?? ''}`)
  store.submitFreeAgentOffer(team.id, answered.id, answered.sourceProposalId!)
  if (negotiationFor()?.status !== 'OPEN') return stop('OFFER_NOT_SUBMITTED')
  note('offer', 'OPEN')

  f3AdvanceDay(salt)
  let negotiation = negotiationFor()
  note('playerResponse', negotiation?.status ?? 'NONE')
  if (negotiation?.status === 'COUNTERED') {
    store.decideFreeAgentCounter(team.id, negotiation.id, negotiation.round, { kind: 'ACCEPT_COUNTER' })
    negotiation = negotiationFor()
    note('acceptCounter', negotiation?.status ?? 'NONE')
  }
  if (negotiation?.status !== 'ACCEPTED') return stop(`RESPONSE:${negotiation?.status ?? 'NONE'}`)

  const readiness = assessPlayerContractSigningReadiness(f3World(), team.id, negotiation.id)
  const proposerBodyId = Object.values(f3World().governanceAppointmentsById)
    .filter((item) => item.actor.kind === 'COACH' && item.actor.id === f3World().userCoachId && readiness.executorBodyIds.includes(item.bodyId))
    .map((item) => item.bodyId)[0]
  store.startFreeAgentSigningGovernance(team.id, negotiation.id, negotiation.sourceProposalId!, proposerBodyId)
  note('governanceStarted', assessPlayerContractSigningReadiness(f3World(), team.id, negotiation.id).status)

  f3AdvanceDay(salt)
  const approved = assessPlayerContractSigningReadiness(f3World(), team.id, negotiation.id)
  note('board', approved.status)
  if (approved.status !== 'APPROVED') return stop(`GOVERNANCE:${approved.status}:${approved.blocker ?? ''}`)
  const worldBeforeSigning = f3World()
  store.completeFreeAgentSigning(team.id, negotiation.id, negotiation.sourceProposalId!)
  const worldAfterSigning = f3World()
  const signed = negotiationFor()
  if (signed?.status !== 'SIGNED' || !('signedContractId' in signed) || signed.signedContractId === undefined) return stop(`SIGNING:${signed?.status ?? 'NONE'}`)
  note('signed', signed.signedContractId)
  return { status: 'SIGNED', playerId, negotiationId: negotiation.id, contractId: signed.signedContractId, log, worldBeforeSigning, worldAfterSigning }
}

/** Tries the candidates in order, as a manager would when one declines; returns the first completed signing. */
export function f3SignFirstViable(candidateIds: readonly PlayerId[], salt = F3_SALT): { readonly signed?: Extract<F3SigningOutcome, { status: 'SIGNED' }>; readonly attempts: readonly F3SigningOutcome[] } {
  const attempts: F3SigningOutcome[] = []
  for (const playerId of candidateIds) {
    const outcome = f3SignFreeAgent(playerId, { salt })
    attempts.push(outcome)
    if (outcome.status === 'SIGNED') return { signed: outcome, attempts }
  }
  return { attempts }
}

export const f3RosterIds = (world: GameWorld, teamId: TeamId): readonly string[] => getTeamRoster(world, teamId).map((player) => player.id)
