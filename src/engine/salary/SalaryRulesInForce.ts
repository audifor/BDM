import type { GameDate } from '@/domain/date'
import type { TeamId } from '@/domain/ids'
import type { SalaryRules } from '@/domain/salary'
import type { GameWorld } from '@/domain/world'

/**
 * The SalaryRules that govern a contract effective on `date` for a team. Rules are season scoped: inside a season window they are that
 * season's. A date between two seasons (a contract that starts or expires on 1 July, the off-season) is governed by the rules of the last
 * season that ended before it, which stay in force until the next season begins. Before the team's first season, or when the governing
 * season has no rules, nothing is in force (callers keep failing closed). Pure; never creates rules.
 */
export function salaryRulesInForce(world: GameWorld, teamId: TeamId, date: GameDate): readonly SalaryRules[] {
  const seasons = Object.values(world.seasons).filter((season) => (season.participantTeamIds ?? world.competitions[season.competitionId]?.participantTeamIds ?? []).includes(teamId))
  const containing = seasons.filter((season) => season.startDate <= date && date <= season.endDate).sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id))
  const governing = containing.length > 0
    ? containing
    : seasons.filter((season) => season.endDate < date).sort((a, b) => b.endDate.localeCompare(a.endDate) || a.id.localeCompare(b.id)).slice(0, 1)
  return governing.map((season) => world.salaryRulesBySeasonId[season.id]).filter((rules): rules is SalaryRules => rules !== undefined)
}
