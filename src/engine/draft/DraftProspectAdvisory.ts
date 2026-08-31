import { organizationIdForTeam, type TeamId } from '@/domain/ids'
import { deriveOrganizationPlayerValuation } from '@/domain/intelligence'
import { createDelegationOutcome, delegationOutcomeIdFromString } from '@/domain/responsibility'
import { resolveAdvisoryResponsibility, scoutingQuality } from '@/engine/staff'
import type { GameWorld } from '@/domain/world'
import { getAvailableDraftProspects, getCurrentDraftPick } from './DraftEngine'

/**
 * Draft prospect advisory (docs/STAFF_SYSTEM_V2.md §18). Reuses the existing Wave 3
 * `prospectReport` advisory responsibility as the Staff seam for Draft evaluation — no new
 * `ResponsibilityKind` is introduced. `prospectReport`'s eligible roles are scouting-department
 * (`regionalScout`/`collegeScout`/`internationalScout`/`proScout`), so its quality is bounded by
 * the existing `scoutingQuality` `DecisionQualityFn` — the same quality function already used for
 * every other scouting-department advisory output, never a new medical/recruiting-flavored one.
 *
 * When a Draft is `inProgress` and a team is genuinely on the clock with a valid `advisory`
 * `prospectReport` holder, records a `DelegationOutcome` recommending a prospect from
 * `getAvailableDraftProspects`, ranked exclusively via the existing
 * `deriveOrganizationPlayerValuation({ context: 'DRAFT' })` path (`OrganizationKnowledge` +
 * existing evidence/reports only — the exact same source `chooseAiDraftProspect` already uses for
 * AI drafting, so this NEVER reads `Player.basketball.ratings` or exact potential).
 *
 * `applied: false` always. This module never calls `makeDraftSelection` and provides no helper
 * that could convert the recommendation into an irreversible pick — the Draft Engine / user
 * remains the sole owner of that decision.
 *
 * Exactly-once per `(responsibility, draft, pick)`: the outcome id is derived from
 * `(responsibilityId, draftId, draftPickId)`.
 */
export function progressDraftProspectAdvisories(world: GameWorld, draftId: string): GameWorld {
  const draft = world.draftsById[draftId]
  if (draft === undefined || draft.status !== 'inProgress') return world
  const pick = getCurrentDraftPick(world, draftId)
  if (pick === undefined) return world
  const teamId = pick.ownerTeamId as TeamId

  const resolution = resolveAdvisoryResponsibility(world, teamId, 'prospectReport')
  if (resolution === undefined) return world

  const outcomeId = delegationOutcomeIdFromString(`delegation-outcome:${resolution.responsibilityId}:${draftId}:${pick.id}`)
  if (world.delegationOutcomesById[outcomeId] !== undefined) return world

  const recommendedPlayerId = rankAvailableProspects(world, teamId, draftId)[0]
  if (recommendedPlayerId === undefined) return world

  const seed = `staff-decision-quality-v1:${resolution.responsibilityId}:${world.currentDate}`
  const qualityScore = scoutingQuality(resolution.context, seed)
  const outcome = createDelegationOutcome({
    id: outcomeId,
    responsibilityId: resolution.responsibilityId,
    staffId: resolution.staffId,
    decidedOn: world.currentDate,
    kind: 'prospectReport',
    applied: false,
    qualityScore,
    payload: { draftId, draftPickId: pick.id, recommendedPlayerId },
  })
  return { ...world, delegationOutcomesById: { ...world.delegationOutcomesById, [outcomeId]: outcome } }
}

/** Ranks available prospects using ONLY the existing Draft organization valuation path — identical knowledge source to `chooseAiDraftProspect`, never hidden Player truth. */
function rankAvailableProspects(world: GameWorld, teamId: TeamId, draftId: string) {
  const organizationId = organizationIdForTeam(teamId)
  const policy = world.organizationEvaluationPoliciesById[organizationId]
  return getAvailableDraftProspects(world, draftId).slice().sort((a, b) => {
    const first = world.players[a]!
    const second = world.players[b]!
    const firstValue = deriveOrganizationPlayerValuation({ organizationId, playerId: a, knowledge: world.organizationKnowledge, currentDate: world.currentDate, context: 'DRAFT', publicPosition: first.basketball.primaryPosition, policy })
    const secondValue = deriveOrganizationPlayerValuation({ organizationId, playerId: b, knowledge: world.organizationKnowledge, currentDate: world.currentDate, context: 'DRAFT', publicPosition: second.basketball.primaryPosition, policy })
    return secondValue.priorityScore - firstValue.priorityScore || a.localeCompare(b)
  })
}
