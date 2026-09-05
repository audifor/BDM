import { getPlayerContractStatus } from '@/domain/contract'
import { formatInjuryKind } from '@/domain/injury'
import type { Player } from '@/domain/player'
import type { TeamId } from '@/domain/ids'
import {
  getCareerFatigueForPlayer,
  getCurrentPlayerContract,
  getCurrentPlayerInjury,
  getMoraleBandForPerson,
  type GameWorld,
} from '@/domain/world'
import { formatGameDateLabel } from '@/ui-ng/applications/player/data/presentationHelpers'
import {
  type RosterStaffCommentsModel,
  buildRosterStaffComments,
} from '@/ui-ng/applications/roster/buildRosterStaffComments'
import {
  SUMMARY_SIGNAL_ORG_DIMENSION,
  buildRosterRatingEvaluationLookup,
} from '@/ui-ng/applications/roster/rosterRatingPresentation'

export type RosterInspectorZoneId = 'staff' | 'contract' | 'status' | 'notes'

export interface RosterInspectorFact {
  readonly label: string
  readonly value: string
}

export interface RosterInspectorZone {
  readonly id: RosterInspectorZoneId
  readonly title: string
  readonly facts: readonly RosterInspectorFact[]
  readonly staff: RosterStaffCommentsModel | undefined
}

export interface RosterInspectorDossier {
  readonly zones: readonly RosterInspectorZone[]
}

const MORALE_BAND_LABELS = {
  veryLow: 'Very Low',
  low: 'Low',
  stable: 'Stable',
  good: 'Good',
  excellent: 'Excellent',
} as const

const DEVELOPMENT_STAGE_LABELS = {
  early: 'Early',
  developing: 'Developing',
  prime: 'Prime',
  declining: 'Declining',
} as const

const CONTRACT_STATUS_LABELS = {
  scheduled: 'Scheduled',
  active: 'Active',
  expired: 'Expired',
  terminated: 'Terminated',
} as const

function compactMoney(value: number) {
  return value >= 1_000_000
    ? `$${Math.round(value / 1_000_000)}M`
    : `$${Math.round(value / 1_000)}K`
}

export function buildRosterInspectorDossier(
  world: GameWorld,
  teamId: TeamId,
  player: Player,
): RosterInspectorDossier {
  const staff = buildRosterStaffComments(world, teamId, player.id)
  const contract = getCurrentPlayerContract(world, player.id)
  const injury = getCurrentPlayerInjury(world, player.id)
  const moraleBand = getMoraleBandForPerson(world, player.id)
  const lookup = buildRosterRatingEvaluationLookup(world, teamId)
  const dimensions = Object.values(SUMMARY_SIGNAL_ORG_DIMENSION)
  const knownSignals = dimensions.filter((dimension) => lookup(player, dimension).mode !== 'UNKNOWN').length

  const zones: RosterInspectorZone[] = []

  if (staff.groups.length > 0) {
    zones.push({
      id: 'staff',
      title: 'STAFF',
      facts: [],
      staff,
    })
  }

  zones.push({
    id: 'contract',
    title: 'CONTRACT',
    facts:
      contract === undefined
        ? [
            { label: 'Status', value: 'Beca' },
            { label: 'Salary', value: '—' },
            { label: 'Expiration', value: '—' },
          ]
        : [
            { label: 'Status', value: CONTRACT_STATUS_LABELS[getPlayerContractStatus(contract, world.currentDate)] },
            { label: 'Salary', value: compactMoney(contract.compensation.annualSalary) },
            { label: 'Expiration', value: formatGameDateLabel(contract.term.expiresOn) },
          ],
    staff: undefined,
  })

  const statusFacts: RosterInspectorFact[] = [
    { label: 'Availability', value: injury === undefined ? 'Available' : 'Out' },
    { label: 'Fitness', value: String(getCareerFatigueForPlayer(world, player.id)) },
  ]
  if (moraleBand !== undefined) {
    statusFacts.push({ label: 'Morale', value: MORALE_BAND_LABELS[moraleBand] })
  }
  if (injury !== undefined) {
    statusFacts.push({
      label: 'Injury',
      value: `${formatInjuryKind(injury.kind)} · ${formatGameDateLabel(injury.expectedReturnDate)}`,
    })
  }
  statusFacts.push({ label: 'Stage', value: DEVELOPMENT_STAGE_LABELS[player.development.developmentStage] })

  zones.push({
    id: 'status',
    title: 'STATUS',
    facts: statusFacts,
    staff: undefined,
  })

  zones.push({
    id: 'notes',
    title: 'NOTES',
    facts: [{ label: 'Scouting', value: `${knownSignals} / ${dimensions.length}` }],
    staff: undefined,
  })

  return { zones }
}
