import { updateGameWorld, type GameWorld } from '@/domain/world'
import { createTransferPortalRuleset, type TransferPortalRuleset } from '@/domain/eligibility'
import type { SeasonId } from '@/domain/ids'

const NCAA_TRANSFER_SOURCE = 'https://web3.ncaa.org/lsdbi/reports/getReport/90008'

/** Ensures every NCAA season has effective-dated portal rules, carrying forward with explicit provenance. */
export function ensureTransferPortalRuleset(world: GameWorld, seasonId: SeasonId): GameWorld {
  const season = world.seasons[seasonId]
  if (season === undefined) return world
  const competition = world.competitions[season.competitionId]
  const ecosystem = competition === undefined ? undefined : world.ecosystems[competition.ecosystemId]
  if (ecosystem?.kind !== 'ncaaLike') return world
  const id = `transfer:${ecosystem.id}:${season.id}`
  if (world.transferPortalRulesetsById[id] !== undefined) return world
  let rulesets = Object.values(world.transferPortalRulesetsById)
  const baselineId = `transfer:${ecosystem.id}:2026-27`
  const officialSeason = season.label === '2026-27' || season.startDate.startsWith('2026-')
  if (officialSeason) {
    const official = createTransferPortalRuleset({
      id, version: '2026-27.1', ecosystemId: ecosystem.id, effectiveFrom: season.startDate,
      provenance: 'OFFICIAL_SOURCE', sourceUrl: NCAA_TRANSFER_SOURCE,
      basketballNotificationDays: 15, institutionProcessingBusinessDays: 2, headCoachDelayDays: 5, aidChangeNotificationDays: 30,
    })
    return updateGameWorld(world, { transferPortalRulesets: [...rulesets, official] })
  }
  if (world.transferPortalRulesetsById[baselineId] === undefined && !rulesets.some((rules) => rules.ecosystemId === ecosystem.id)) {
    const baseline = createTransferPortalRuleset({
      id: baselineId, version: '2026-27.1', ecosystemId: ecosystem.id, effectiveFrom: '2026-07-01' as never,
      provenance: 'OFFICIAL_SOURCE', sourceUrl: NCAA_TRANSFER_SOURCE,
      basketballNotificationDays: 15, institutionProcessingBusinessDays: 2, headCoachDelayDays: 5, aidChangeNotificationDays: 30,
    })
    rulesets = [...rulesets, baseline]
  }
  const previous = rulesets
    .filter((rules) => rules.ecosystemId === ecosystem.id)
    .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom))[0]
  const rules = id === baselineId ? undefined : createTransferPortalRuleset({
    id, version: `${season.label}.carry-forward.1`, ecosystemId: ecosystem.id, effectiveFrom: season.startDate,
    provenance: 'SIMULATED_CARRY_FORWARD', basedOnRulesetId: previous!.id,
    basketballNotificationDays: previous!.basketballNotificationDays,
    institutionProcessingBusinessDays: previous!.institutionProcessingBusinessDays,
    headCoachDelayDays: previous!.headCoachDelayDays,
    aidChangeNotificationDays: previous!.aidChangeNotificationDays,
  })
  return updateGameWorld(world, { transferPortalRulesets: [...Object.values(world.transferPortalRulesetsById), ...(rulesets.filter((item) => world.transferPortalRulesetsById[item.id] === undefined)), ...(rules === undefined ? [] : [rules])] })
}
