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
    defaultSelectedItemId: currentRow?.id ?? null,
  }
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
