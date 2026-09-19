import { compareGameDates, type GameDate } from '@/domain/date'
import {
  getContractYearCompensation,
  getPlayerContractStatus,
  type PlayerContract,
  type PlayerContractStatus,
} from '@/domain/contract'
import type { ContractId, PlayerId, TeamId } from '@/domain/ids'
import {
  getCurrentPlayerContract,
  getPlayerContracts,
  getPlayerRosterTeamId,
  isPlayerFreeAgent,
  type GameWorld,
} from '@/domain/world'

import { formatGameDateLabel } from './presentationHelpers'
// One date-difference helper for the whole app: it lives with the medical model, its first
// consumer, and every other page imports it from there rather than re-deriving the arithmetic.
import { calendarDaysBetween } from './buildPlayerMedicalModel'
import type { OverviewGapModel } from './playerWorkspaceModel'

export type ContractViewStatus = 'none' | PlayerContractStatus

export type ContractTimelineState = 'signed' | 'past' | 'current' | 'future' | 'expires'

export interface ContractMoneyPresentation {
  readonly amount: number
  readonly currencyCode: null
  readonly formatted: string
}

export interface ContractStatusBandModel {
  readonly teamName: string
  readonly contractType: string
  readonly statusLabel: string
  readonly statusTone: 'active' | 'expiring' | 'scheduled' | 'terminated' | 'expired' | 'none'
  readonly startDate: string
  readonly endDate: string
  readonly seasonsRemaining: string | null
  readonly currentSeasonLabel: string | null
  readonly isFreeAgent: boolean
}

export interface ContractAgreementModel {
  readonly contractId: ContractId
  readonly teamName: string
  readonly contractType: string
  readonly statusLabel: string
  readonly startDate: string
  readonly endDate: string
  readonly remainingLabel: string | null
}

export interface ContractTimelineNodeModel {
  readonly id: string
  readonly seasonLabel: string
  readonly state: ContractTimelineState
  readonly markerLabel: string | null
  readonly guaranteeLabel: string | null
}

export interface ContractFinancialRowModel {
  readonly id: string
  readonly seasonLabel: string
  readonly baseSalary: ContractMoneyPresentation
  readonly guaranteed: ContractMoneyPresentation
  readonly capHit: ContractMoneyPresentation
  readonly guaranteeState: string
  readonly isCurrent: boolean
}

export interface ContractHistoryEntryModel {
  readonly id: ContractId
  readonly teamName: string
  readonly termLabel: string
  readonly statusLabel: string
}

export interface ContractRightsItemModel {
  readonly label: string
  readonly value: string
}

export interface ContractRightsModel {
  readonly status: 'available' | 'unavailable'
  readonly items: readonly ContractRightsItemModel[]
}

export interface ContractInspectorSeasonDetail {
  readonly kind: 'season'
  readonly seasonLabel: string
  readonly baseSalary: ContractMoneyPresentation
  readonly guaranteed: ContractMoneyPresentation
  readonly capHit: ContractMoneyPresentation
  readonly guaranteeState: string
  readonly contractStatus: string
}

/** The three headline money figures of the season the schedule is anchored on. */
export interface ContractMoneySnapshotModel {
  readonly status: 'available' | 'unavailable'
  readonly seasonLabel: string | null
  readonly baseSalary: string | null
  readonly guaranteed: string | null
  readonly capHit: string | null
  readonly note: string
}

/** Dated, decision-shaped readings taken from the contract term itself. */
export interface ContractIntelligenceModel {
  readonly nextKeyDateLabel: string
  readonly nextKeyDateNote: string
  readonly expiryRiskLabel: string
  readonly expiryRiskTone: 'low' | 'moderate' | 'high'
  readonly expiryRiskNote: string
  readonly decisionLabel: string
  readonly decisionNote: string
  readonly events: readonly {
    readonly id: string
    readonly dateLabel: string
    readonly label: string
    readonly tone: 'positive' | 'neutral'
  }[]
}

export interface PlayerContractModel {
  readonly viewStatus: ContractViewStatus
  readonly emptyMessage: string | null
  readonly compensationCurrencyCode: null
  readonly compensationContextNote: 'Currency not tracked' | null
  readonly statusBand: ContractStatusBandModel | null
  readonly agreement: ContractAgreementModel | null
  readonly timeline: readonly ContractTimelineNodeModel[]
  readonly financialSchedule: readonly ContractFinancialRowModel[]
  readonly history: readonly ContractHistoryEntryModel[]
  readonly rights: ContractRightsModel
  readonly snapshot: ContractMoneySnapshotModel
  readonly intelligence: ContractIntelligenceModel
  readonly gaps: readonly OverviewGapModel[]
  readonly defaultSelectedItemId: string | null
}

const STATUS_LABELS: Record<PlayerContractStatus, string> = {
  active: 'Active',
  scheduled: 'Scheduled',
  expired: 'Expired',
  terminated: 'Terminated',
}

const CONTRACT_KIND_LABELS = {
  standard: 'Standard',
} as const

const COMPENSATION_CONTEXT_NOTE = 'Currency not tracked' as const

export function presentContractMoney(amount: number): ContractMoneyPresentation {
  return {
    amount,
    currencyCode: null,
    formatted: new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(amount),
  }
}

function teamName(world: GameWorld, teamId: TeamId): string {
  return world.teams[teamId]?.name ?? teamId
}

function contractYearCount(contract: PlayerContract): number {
  if (contract.compensation.years !== undefined) {
    return contract.compensation.years.length
  }
  const startYear = Number(contract.term.startsOn.slice(0, 4))
  const endYear = Number(contract.term.expiresOn.slice(0, 4))
  return Math.max(1, endYear - startYear)
}

function contractYearIndex(contract: PlayerContract, onDate: GameDate): number {
  return Math.max(0, Number(onDate.slice(0, 4)) - Number(contract.term.startsOn.slice(0, 4)))
}

function dateInContractYear(contract: PlayerContract, yearIndex: number): GameDate {
  const year = Number(contract.term.startsOn.slice(0, 4)) + yearIndex
  return `${year}-07-01` as GameDate
}

export function resolveSeasonLabelForYear(world: GameWorld, year: number): string | undefined {
  const season = Object.values(world.seasons).find((entry) => Number(entry.startDate.slice(0, 4)) === year)
  return season?.label
}

export function formatSeasonSpanLabel(startYear: number): string {
  const next = String(startYear + 1).slice(-2)
  return `${startYear}/${next}`
}

function guaranteeStateLabel(cashSalary: number, guaranteedAmount: number): string {
  if (guaranteedAmount <= 0) return 'Non-guaranteed'
  if (guaranteedAmount >= cashSalary) return 'Guaranteed'
  return 'Partially guaranteed'
}

export function deriveSeasonsRemainingLabel(contract: PlayerContract, onDate: GameDate): string | null {
  const status = getPlayerContractStatus(contract, onDate)
  if (status !== 'active' && status !== 'scheduled') return null
  if (compareGameDates(onDate, contract.term.expiresOn) >= 0) return null

  const remainingYears = Math.max(
    1,
    Number(contract.term.expiresOn.slice(0, 4)) - Number(onDate.slice(0, 4)),
  )
  return remainingYears === 1 ? '1 season remaining' : `${remainingYears} seasons remaining`
}

export function isExpiringThisSeason(world: GameWorld, contract: PlayerContract, onDate: GameDate): boolean {
  const season = world.seasons[world.currentSeasonId]
  if (season === undefined) return false
  if (getPlayerContractStatus(contract, onDate) !== 'active') return false
  return (
    compareGameDates(contract.term.expiresOn, onDate) > 0 &&
    compareGameDates(contract.term.expiresOn, season.endDate) <= 0
  )
}

function buildFinancialRows(
  world: GameWorld,
  contract: PlayerContract,
  onDate: GameDate,
): readonly ContractFinancialRowModel[] {
  const years = contractYearCount(contract)
  const currentIndex = contractYearIndex(contract, onDate)

  return Array.from({ length: years }, (_, index) => {
    const compensation = getContractYearCompensation(contract, dateInContractYear(contract, index))
    const startYear = Number(contract.term.startsOn.slice(0, 4)) + index
    const seasonLabel =
      resolveSeasonLabelForYear(world, startYear) ?? formatSeasonSpanLabel(startYear)

    return {
      id: `season-${index}`,
      seasonLabel,
      baseSalary: presentContractMoney(compensation.cashSalary),
      guaranteed: presentContractMoney(compensation.guaranteedAmount),
      capHit: presentContractMoney(compensation.capHit),
      guaranteeState: guaranteeStateLabel(compensation.cashSalary, compensation.guaranteedAmount),
      isCurrent: index === Math.min(currentIndex, years - 1),
    }
  })
}

function buildTimeline(
  world: GameWorld,
  contract: PlayerContract,
  onDate: GameDate,
  financialRows: readonly ContractFinancialRowModel[],
): readonly ContractTimelineNodeModel[] {
  const currentIndex = financialRows.findIndex((row) => row.isCurrent)
  const expiresIndex = financialRows.length - 1

  return financialRows.map((row, index) => {
    let state: ContractTimelineState = 'future'
    if (index === 0) state = 'signed'
    else if (index < currentIndex) state = 'past'
    else if (row.isCurrent) state = 'current'
    else if (index > currentIndex) state = 'future'

    const markerLabel =
      index === expiresIndex && compareGameDates(onDate, contract.term.expiresOn) < 0
        ? 'EXPIRES'
        : null

    return {
      id: row.id,
      seasonLabel: row.seasonLabel,
      state: index === 0 ? 'signed' : state,
      markerLabel,
      guaranteeLabel: row.guaranteeState,
    }
  })
}

function buildHistory(
  world: GameWorld,
  contracts: readonly PlayerContract[],
  activeContract: PlayerContract | undefined,
  onDate: GameDate,
): readonly ContractHistoryEntryModel[] {
  return contracts
    .filter((contract) => contract.id !== activeContract?.id)
    .map((contract) => ({
      id: contract.id,
      teamName: teamName(world, contract.teamId),
      termLabel: `${formatGameDateLabel(contract.term.startsOn)} – ${formatGameDateLabel(contract.term.expiresOn)}`,
      statusLabel: STATUS_LABELS[getPlayerContractStatus(contract, onDate)],
    }))
}

function buildRights(world: GameWorld, playerId: PlayerId, onDate: GameDate): ContractRightsModel {
  const items: ContractRightsItemModel[] = []
  const rosterTeamId = getPlayerRosterTeamId(world, playerId)
  if (rosterTeamId !== undefined) {
    items.push({ label: 'Roster', value: teamName(world, rosterTeamId) })
  }

  if (isPlayerFreeAgent(world, playerId, onDate)) {
    items.push({ label: 'Availability', value: 'Free agent' })
  }

  const rights = Object.values(world.playerRightsById).filter(
    (entry) => entry.playerId === playerId && entry.status === 'active',
  )
  for (const entry of rights) {
    items.push({
      label: `${entry.rightsType === 'draft' ? 'Draft' : 'International'} rights`,
      value: teamName(world, entry.ownerTeamId),
    })
  }

  if (items.length === 0) {
    return { status: 'unavailable', items: [] }
  }

  return { status: 'available', items }
}

function resolvePrimaryContract(
  world: GameWorld,
  playerId: PlayerId,
  onDate: GameDate,
): PlayerContract | undefined {
  const current = getCurrentPlayerContract(world, playerId)
  if (current !== undefined) return current

  return getPlayerContracts(world, playerId).find(
    (contract) => getPlayerContractStatus(contract, onDate) === 'scheduled',
  )
}

export function buildPlayerContractModel(world: GameWorld, playerId: PlayerId): PlayerContractModel {
  const onDate = world.currentDate
  const contracts = getPlayerContracts(world, playerId)
  const primaryContract = resolvePrimaryContract(world, playerId, onDate)
  const currentSeason = world.seasons[world.currentSeasonId]
  const rights = buildRights(world, playerId, onDate)

  if (primaryContract === undefined) {
    return {
      viewStatus: 'none',
      emptyMessage: 'No active contract',
      compensationCurrencyCode: null,
      compensationContextNote: null,
      statusBand: {
        teamName: getPlayerRosterTeamId(world, playerId) === undefined ? '—' : teamName(world, getPlayerRosterTeamId(world, playerId)!),
        contractType: '—',
        statusLabel: isPlayerFreeAgent(world, playerId, onDate) ? 'Free agent' : 'No active contract',
        statusTone: 'none',
        startDate: '—',
        endDate: '—',
        seasonsRemaining: null,
        currentSeasonLabel: currentSeason?.label ?? null,
        isFreeAgent: isPlayerFreeAgent(world, playerId, onDate),
      },
      agreement: null,
      timeline: [],
      financialSchedule: [],
      history: buildHistory(world, contracts, undefined, onDate),
      rights,
      snapshot: {
        status: 'unavailable',
        seasonLabel: null,
        baseSalary: null,
        guaranteed: null,
        capHit: null,
        note: 'No contract is recorded, so there is no compensation schedule to show.',
      },
      intelligence: {
        nextKeyDateLabel: '—',
        nextKeyDateNote: 'No contract is recorded for this player.',
        expiryRiskLabel: '—',
        expiryRiskTone: 'low',
        expiryRiskNote: 'No contract is recorded for this player.',
        decisionLabel: '—',
        decisionNote: 'No contract decision applies.',
        events: [],
      },
      gaps: buildContractGaps(),
      defaultSelectedItemId: null,
    }
  }

  const status = getPlayerContractStatus(primaryContract, onDate)
  const expiring = isExpiringThisSeason(world, primaryContract, onDate)
  const statusLabel = expiring ? 'Expiring this season' : STATUS_LABELS[status]
  const statusTone = expiring
    ? 'expiring'
    : status === 'active'
      ? 'active'
      : status === 'scheduled'
        ? 'scheduled'
        : status === 'terminated'
          ? 'terminated'
          : 'expired'

  const financialSchedule = buildFinancialRows(world, primaryContract, onDate)
  const currentRow = financialSchedule.find((row) => row.isCurrent) ?? financialSchedule[0]

  return {
    viewStatus: status,
    emptyMessage: null,
    compensationCurrencyCode: null,
    compensationContextNote: COMPENSATION_CONTEXT_NOTE,
    statusBand: {
      teamName: teamName(world, primaryContract.teamId),
      contractType: CONTRACT_KIND_LABELS[primaryContract.kind],
      statusLabel,
      statusTone,
      startDate: formatGameDateLabel(primaryContract.term.startsOn),
      endDate: formatGameDateLabel(primaryContract.term.expiresOn),
      seasonsRemaining: deriveSeasonsRemainingLabel(primaryContract, onDate),
      currentSeasonLabel: currentSeason?.label ?? null,
      isFreeAgent: false,
    },
    agreement: {
      contractId: primaryContract.id,
      teamName: teamName(world, primaryContract.teamId),
      contractType: CONTRACT_KIND_LABELS[primaryContract.kind],
      statusLabel,
      startDate: formatGameDateLabel(primaryContract.term.startsOn),
      endDate: formatGameDateLabel(primaryContract.term.expiresOn),
      remainingLabel: deriveSeasonsRemainingLabel(primaryContract, onDate),
    },
    timeline: buildTimeline(world, primaryContract, onDate, financialSchedule),
    financialSchedule,
    history: buildHistory(world, contracts, primaryContract, onDate),
    rights,
    snapshot: buildMoneySnapshot(world, primaryContract, financialSchedule, currentRow),
    intelligence: buildContractIntelligence(world, primaryContract, status, contracts, onDate),
    gaps: buildContractGaps(),
    defaultSelectedItemId: currentRow?.id ?? null,
  }
}

/**
 * The three money figures the reference puts side by side, taken from the season the schedule is
 * anchored on rather than recomputed.
 */
function buildMoneySnapshot(
  world: GameWorld,
  contract: PlayerContract,
  schedule: readonly ContractFinancialRowModel[],
  row: ContractFinancialRowModel | undefined,
): ContractMoneySnapshotModel {
  if (row === undefined) {
    return {
      status: 'unavailable',
      seasonLabel: null,
      baseSalary: null,
      guaranteed: null,
      capHit: null,
      note: 'No compensation schedule is recorded for this contract.',
    }
  }

  const isCurrent = row.isCurrent
  return {
    status: 'available',
    seasonLabel: row.seasonLabel,
    baseSalary: row.baseSalary.formatted,
    guaranteed: row.guaranteed.formatted,
    capHit: row.capHit.formatted,
    note: isCurrent
      ? `Figures for ${row.seasonLabel}, the season in progress.`
      : `${row.seasonLabel} is the first season of this deal; the current season is not part of it.`,
  }
}

/**
 * Expiry risk and the decision it implies, both read from the contract term. The engine stores no
 * negotiation state, so the panel reports dates instead of inventing a market reading.
 */
function buildContractIntelligence(
  world: GameWorld,
  contract: PlayerContract,
  status: string,
  contracts: readonly PlayerContract[],
  onDate: GameDate,
): ContractIntelligenceModel {
  const daysToExpiry = calendarDaysBetween(onDate, contract.term.expiresOn)
  const expiryRiskTone: ContractIntelligenceModel['expiryRiskTone'] =
    daysToExpiry <= 365 ? 'high' : daysToExpiry <= 730 ? 'moderate' : 'low'

  return {
    nextKeyDateLabel: formatGameDateLabel(contract.term.expiresOn),
    nextKeyDateNote: `Contract ${status === 'scheduled' ? 'starts' : 'ends'} in ${daysToExpiry} days.`,
    expiryRiskLabel:
      expiryRiskTone === 'high' ? 'High' : expiryRiskTone === 'moderate' ? 'Moderate' : 'Low',
    expiryRiskTone,
    expiryRiskNote: `${daysToExpiry} days of contract remain (${deriveSeasonsRemainingLabel(contract, onDate) ?? 'duration not tracked'}).`,
    decisionLabel: daysToExpiry <= 365 ? 'Yes' : 'No',
    decisionNote:
      daysToExpiry <= 365
        ? `Contract expires ${formatGameDateLabel(contract.term.expiresOn)}.`
        : 'No contract decision is due yet.',
    events: contracts
      .map((entry) => ({
        id: entry.id,
        dateLabel: formatGameDateLabel(entry.term.startsOn),
        label:
          entry.id === contract.id
            ? `Contract ${status === 'scheduled' ? 'starts' : 'signed'} · ${teamName(world, entry.teamId)}`
            : `Previous deal · ${teamName(world, entry.teamId)}`,
        tone: (entry.termination === undefined ? 'positive' : 'neutral') as 'positive' | 'neutral',
      }))
      .sort((left, right) => right.dateLabel.localeCompare(left.dateLabel)),
  }
}

/** Reference blocks the save has no data for. */
function buildContractGaps(): readonly OverviewGapModel[] {
  return [
    {
      id: 'clauses',
      label: 'Clauses & options',
      reason: 'The contract model holds a term and compensation only: no option, buyout or trade clause is stored.',
    },
    {
      id: 'registration',
      label: 'Registration fields',
      reason: 'Only draft and international rights are recorded; domestic and FIBA registration are not.',
    },
    {
      id: 'negotiation',
      label: 'Negotiation intelligence',
      reason: 'No negotiation state is persisted, so no demand, stance or outcome can be reported.',
    },
    {
      id: 'market',
      label: 'Market context',
      reason: 'The world carries no market valuation model for players.',
    },
    {
      id: 'decision-center',
      label: 'Decision center actions',
      reason: 'Player contract negotiation does not exist yet: no action can be offered here.',
    },
    {
      id: 'bonuses',
      label: 'Bonus column',
      reason: 'Compensation records salary, guarantee and cap hit; bonuses are not part of the model.',
    },
  ]
}

export function findContractInspectorDetail(
  model: PlayerContractModel,
  selectedItemId: string | null,
): ContractInspectorSeasonDetail | undefined {
  if (selectedItemId === null) return undefined
  const row = model.financialSchedule.find((entry) => entry.id === selectedItemId)
  if (row === undefined || model.agreement === null) return undefined

  return {
    kind: 'season',
    seasonLabel: row.seasonLabel,
    baseSalary: row.baseSalary,
    guaranteed: row.guaranteed,
    capHit: row.capHit,
    guaranteeState: row.guaranteeState,
    contractStatus: model.agreement.statusLabel,
  }
}
