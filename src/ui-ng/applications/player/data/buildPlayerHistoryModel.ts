import { compareGameDates } from '@/domain/date'
import {
  getPlayerContractStatus,
  type PlayerContract,
} from '@/domain/contract'
import type { EcosystemTransitionType } from '@/domain/career'
import {
  formatInjuryKind,
  isInjuryActive,
  type InjuryRecord,
  type InjurySeverity,
} from '@/domain/injury'
import type { ContractId, InjuryId, PlayerId, SeasonId, TeamId } from '@/domain/ids'
import type { PlayerTransaction, PlayerTransactionKind } from '@/domain/transaction'
import {
  getPlayerContracts,
  getPlayerTransactions,
  type GameWorld,
} from '@/domain/world'
import {
  calculatePlayerStatAverages,
  getPlayerGameLogs,
  getPlayerSeasonStatLines,
} from '@/engine/stats/PlayerHistory'

import {
  calendarDaysBetween,
  formatDurationLabel,
} from './buildPlayerMedicalModel'
import { formatSeasonSpanLabel, resolveSeasonLabelForYear } from './buildPlayerContractModel'
import { formatGameDateLabel } from './presentationHelpers'

export type HistoryEventType =
  | 'contract'
  | 'transaction'
  | 'medical'
  | 'trade'
  | 'draft'
  | 'ecosystem'
  | 'season'

export type HistoryEventSource =
  | 'CONTRACT_RECORD'
  | 'TRANSACTION_RECORD'
  | 'MEDICAL_RECORD'
  | 'TRADE_RECORD'
  | 'DRAFT_RECORD'
  | 'ECOSYSTEM_RECORD'
  | 'GAME_LOG_DERIVATION'

export type HistoryDatePrecision = 'exact' | 'season'

export type HistoryFilterId =
  | 'all'
  | 'contract'
  | 'transaction'
  | 'medical'
  | 'season'
  | 'trade'
  | 'draft'
  | 'ecosystem'

export interface PlayerHistoryItemModel {
  readonly id: string
  readonly type: HistoryEventType
  readonly source: HistoryEventSource
  readonly filterCategory: Exclude<HistoryFilterId, 'all'>
  readonly dateLabel: string
  readonly datePrecision: HistoryDatePrecision
  readonly sortDate: string
  readonly title: string
  readonly detail: string
  readonly contextLabel: string | null
}

export interface HistoryScopeModel {
  readonly headline: string
  readonly scopeNote: string
  readonly gapsNote: string
}

export interface HistorySummaryModel {
  readonly contractCount: number
  readonly transactionCount: number
  readonly medicalCount: number
  readonly seasonCount: number
  readonly tradeCount: number
  readonly draftCount: number
  readonly ecosystemCount: number
  readonly gameCount: number
}

export interface HistoryFilterModel {
  readonly id: HistoryFilterId
  readonly label: string
  readonly count: number
}

export interface HistoryInspectorContractDetail {
  readonly kind: 'contract'
  readonly teamName: string
  readonly termLabel: string
  readonly statusLabel: string
  readonly sourceNote: string
}

export interface HistoryInspectorTransactionDetail {
  readonly kind: 'transaction'
  readonly transactionLabel: string
  readonly occurredOnLabel: string
  readonly teamContext: string
  readonly sourceNote: string
}

export interface HistoryInspectorMedicalDetail {
  readonly kind: 'medical'
  readonly injuryLabel: string
  readonly severityLabel: string
  readonly statusLabel: 'Active' | 'Recovered'
  readonly injuredOnLabel: string
  readonly expectedReturnLabel: string
  readonly durationLabel: string
  readonly sourceNote: string
}

export interface HistoryInspectorTradeDetail {
  readonly kind: 'trade'
  readonly executedOnLabel: string
  readonly fromTeamName: string
  readonly toTeamName: string
  readonly sourceNote: string
}

export interface HistoryInspectorDraftDetail {
  readonly kind: 'draft'
  readonly selectedOnLabel: string
  readonly teamName: string
  readonly roundLabel: string
  readonly sourceNote: string
}

export interface HistoryInspectorEcosystemDetail {
  readonly kind: 'ecosystem'
  readonly transitionLabel: string
  readonly effectiveOnLabel: string
  readonly routeLabel: string
  readonly sourceNote: string
}

export interface HistoryInspectorSeasonDetail {
  readonly kind: 'season'
  readonly seasonLabel: string
  readonly competitionLabel: string | null
  readonly gamesPlayed: number
  readonly pointsPerGame: string
  readonly sourceNote: string
}

export type HistoryInspectorDetail =
  | HistoryInspectorContractDetail
  | HistoryInspectorTransactionDetail
  | HistoryInspectorMedicalDetail
  | HistoryInspectorTradeDetail
  | HistoryInspectorDraftDetail
  | HistoryInspectorEcosystemDetail
  | HistoryInspectorSeasonDetail

export interface PlayerHistoryModel {
  readonly scope: HistoryScopeModel
  readonly summary: HistorySummaryModel
  readonly filters: readonly HistoryFilterModel[]
  readonly items: readonly PlayerHistoryItemModel[]
  readonly emptyMessage: string | null
  readonly defaultSelectedItemId: string | null
}

const SCOPE_NOTE =
  'History reflects records persisted in this save. Coverage may be partial and does not imply pre-save or real-world career completeness.'
const GAPS_NOTE =
  'No team-assignment ledger, waiver/loan ledger, awards, national-team history, or rating progression history is currently persisted.'

const TYPE_ORDER: Record<HistoryEventType, number> = {
  transaction: 10,
  trade: 20,
  draft: 25,
  ecosystem: 30,
  contract: 40,
  medical: 50,
  season: 60,
}

const TRANSACTION_LABELS: Record<PlayerTransactionKind, string> = {
  signedFreeAgent: 'Signed',
  released: 'Released',
  contractExpired: 'Contract expired',
}

const ECOSYSTEM_LABELS: Record<EcosystemTransitionType, string> = {
  ncaaToNbaDraft: 'NCAA to NBA draft',
  ncaaToFiba: 'NCAA to FIBA',
  fibaToNba: 'FIBA to NBA',
  nbaToFiba: 'NBA to FIBA',
}

const SEVERITY_LABELS: Record<InjurySeverity, string> = {
  minor: 'Minor',
  moderate: 'Moderate',
  serious: 'Serious',
}

const STATUS_LABELS = {
  scheduled: 'Scheduled',
  active: 'Active',
  expired: 'Expired',
  terminated: 'Terminated',
} as const

function teamName(world: GameWorld, teamId: TeamId | undefined): string {
  if (teamId === undefined) return '—'
  return world.teams[teamId]?.name ?? teamId
}

function contractTermLabel(
  world: GameWorld,
  contract: PlayerContract,
  onDate: typeof world.currentDate,
): string {
  const start = formatGameDateLabel(contract.term.startsOn)
  const status = getPlayerContractStatus(contract, onDate)
  if (status === 'active' || status === 'scheduled') {
    return `${start} → Present`
  }
  if (contract.termination !== undefined) {
    return `${start} → ${formatGameDateLabel(contract.termination.terminatedOn)}`
  }
  return `${start} → ${formatGameDateLabel(contract.term.expiresOn)}`
}

function seasonSortDate(world: GameWorld, seasonId: SeasonId): string {
  return world.seasons[seasonId]?.startDate ?? `${seasonId}-07-01`
}

function seasonDateLabel(world: GameWorld, seasonId: SeasonId): string {
  const season = world.seasons[seasonId]
  if (season?.label !== undefined) return season.label
  const year = Number(seasonId.slice(0, 4))
  if (Number.isFinite(year)) {
    return resolveSeasonLabelForYear(world, year) ?? formatSeasonSpanLabel(year)
  }
  return seasonId
}

function compareHistoryItems(left: PlayerHistoryItemModel, right: PlayerHistoryItemModel): number {
  const dateCompare = right.sortDate.localeCompare(left.sortDate)
  if (dateCompare !== 0) return dateCompare
  const typeCompare = TYPE_ORDER[left.type] - TYPE_ORDER[right.type]
  if (typeCompare !== 0) return typeCompare
  return left.id.localeCompare(right.id)
}

function buildContractEvents(
  world: GameWorld,
  playerId: PlayerId,
  onDate: typeof world.currentDate,
): PlayerHistoryItemModel[] {
  return getPlayerContracts(world, playerId).map((contract) => ({
    id: `contract:${contract.id}`,
    type: 'contract',
    source: 'CONTRACT_RECORD',
    filterCategory: 'contract',
    dateLabel: formatGameDateLabel(contract.term.startsOn),
    datePrecision: 'exact',
    sortDate: contract.term.startsOn,
    title: 'Contract',
    detail: teamName(world, contract.teamId),
    contextLabel: contractTermLabel(world, contract, onDate),
  }))
}

function shouldSkipSignedTransaction(
  transaction: PlayerTransaction,
  contracts: readonly PlayerContract[],
): boolean {
  if (transaction.kind !== 'signedFreeAgent' || transaction.contractId === undefined) return false
  const contract = contracts.find((entry) => entry.id === transaction.contractId)
  return contract !== undefined && contract.term.startsOn === transaction.occurredOn
}

function buildTransactionEvents(
  world: GameWorld,
  playerId: PlayerId,
  contracts: readonly PlayerContract[],
): PlayerHistoryItemModel[] {
  return getPlayerTransactions(world, playerId)
    .filter((transaction) => !shouldSkipSignedTransaction(transaction, contracts))
    .map((transaction) => ({
      id: `transaction:${transaction.id}`,
      type: 'transaction',
      source: 'TRANSACTION_RECORD',
      filterCategory: 'transaction',
      dateLabel: formatGameDateLabel(transaction.occurredOn),
      datePrecision: 'exact',
      sortDate: transaction.occurredOn,
      title: TRANSACTION_LABELS[transaction.kind],
      detail:
        transaction.kind === 'signedFreeAgent'
          ? teamName(world, transaction.toTeamId)
          : teamName(world, transaction.fromTeamId),
      contextLabel: transaction.contractId === undefined ? null : `Contract ${transaction.contractId}`,
    }))
}

function buildMedicalEvents(
  world: GameWorld,
  playerId: PlayerId,
  onDate: typeof world.currentDate,
): PlayerHistoryItemModel[] {
  return Object.values(world.injuriesById)
    .filter((injury) => injury.playerId === playerId)
    .sort((left, right) => compareGameDates(right.injuredOn, left.injuredOn) || left.id.localeCompare(right.id))
    .map((injury) => {
      const status = isInjuryActive(injury, onDate) ? 'Active' : 'Recovered'
      return {
        id: `medical:${injury.id}`,
        type: 'medical',
        source: 'MEDICAL_RECORD',
        filterCategory: 'medical',
        dateLabel: formatGameDateLabel(injury.injuredOn),
        datePrecision: 'exact',
        sortDate: injury.injuredOn,
        title: formatInjuryKind(injury.kind),
        detail: `${SEVERITY_LABELS[injury.severity]} · ${status}`,
        contextLabel: `Return ${formatGameDateLabel(injury.expectedReturnDate)}`,
      }
    })
}

function buildTradeEvents(world: GameWorld, playerId: PlayerId): PlayerHistoryItemModel[] {
  const events: PlayerHistoryItemModel[] = []
  for (const trade of Object.values(world.tradeHistoryById)) {
    const movement = trade.movements.find(
      (entry) => entry.asset.kind === 'player' && entry.asset.playerId === playerId,
    )
    if (movement === undefined) continue
    events.push({
      id: `trade:${trade.id}`,
      type: 'trade',
      source: 'TRADE_RECORD',
      filterCategory: 'trade',
      dateLabel: formatGameDateLabel(trade.executedAt),
      datePrecision: 'exact',
      sortDate: trade.executedAt,
      title: 'Trade',
      detail: `${teamName(world, movement.fromTeamId)} → ${teamName(world, movement.toTeamId)}`,
      contextLabel: world.seasons[trade.seasonId]?.label ?? trade.seasonId,
    })
  }
  return events
}

function buildDraftEvents(world: GameWorld, playerId: PlayerId): PlayerHistoryItemModel[] {
  const events: PlayerHistoryItemModel[] = []
  for (const pick of Object.values(world.draftPicksById)) {
    if (pick.selection?.playerId !== playerId) continue
    const draft = world.draftsById[pick.draftId]
    const selectedOn = draft?.scheduledOn ?? `${pick.draftId}-07-01`
    events.push({
      id: `draft:${pick.id}`,
      type: 'draft',
      source: 'DRAFT_RECORD',
      filterCategory: 'draft',
      dateLabel: formatGameDateLabel(selectedOn),
      datePrecision: 'exact',
      sortDate: selectedOn,
      title: 'Draft selection',
      detail: teamName(world, pick.selection.teamId),
      contextLabel: `Round ${pick.round} · Pick ${pick.order}`,
    })
  }
  return events
}

function buildEcosystemEvents(world: GameWorld, playerId: PlayerId): PlayerHistoryItemModel[] {
  return Object.values(world.ecosystemTransitionsById)
    .filter((transition) => transition.playerId === playerId)
    .map((transition) => ({
      id: `ecosystem:${transition.id}`,
      type: 'ecosystem',
      source: 'ECOSYSTEM_RECORD',
      filterCategory: 'ecosystem',
      dateLabel: formatGameDateLabel(transition.effectiveDate),
      datePrecision: 'exact',
      sortDate: transition.effectiveDate,
      title: ECOSYSTEM_LABELS[transition.transitionType],
      detail: `${teamName(world, transition.fromTeamId)} → ${teamName(world, transition.toTeamId)}`,
      contextLabel: `${transition.fromEcosystemId} → ${transition.toEcosystemId}`,
    }))
}

function buildSeasonEvents(world: GameWorld, playerId: PlayerId): PlayerHistoryItemModel[] {
  return getPlayerSeasonStatLines(world, playerId).map((stats) => {
    const averages = calculatePlayerStatAverages(stats)
    const competitionNames = [
      ...new Set(
        getPlayerGameLogs(world, playerId)
          .filter((line) => line.seasonId === stats.seasonId)
          .map((line) => world.competitions[line.competitionId]?.name)
          .filter((name): name is string => name !== undefined),
      ),
    ]
    return {
      id: `season:${stats.seasonId}`,
      type: 'season',
      source: 'GAME_LOG_DERIVATION',
      filterCategory: 'season',
      dateLabel: seasonDateLabel(world, stats.seasonId),
      datePrecision: 'season',
      sortDate: seasonSortDate(world, stats.seasonId),
      title: 'Season participation',
      detail: `${stats.gamesPlayed} GP · ${averages.ppg.toFixed(1)} PPG`,
      contextLabel: competitionNames.length > 0 ? competitionNames.join(' · ') : null,
    }
  })
}

function buildFilters(items: readonly PlayerHistoryItemModel[]): readonly HistoryFilterModel[] {
  const counts = new Map<Exclude<HistoryFilterId, 'all'>, number>()
  for (const item of items) {
    counts.set(item.filterCategory, (counts.get(item.filterCategory) ?? 0) + 1)
  }

  const labels: Record<Exclude<HistoryFilterId, 'all'>, string> = {
    contract: 'Contracts',
    transaction: 'Transactions',
    medical: 'Medical',
    season: 'Seasons',
    trade: 'Trades',
    draft: 'Draft',
    ecosystem: 'Ecosystem',
  }

  const filters: HistoryFilterModel[] = [{ id: 'all', label: 'All', count: items.length }]
  for (const [id, label] of Object.entries(labels) as [Exclude<HistoryFilterId, 'all'>, string][]) {
    const count = counts.get(id) ?? 0
    if (count > 0) filters.push({ id, label, count })
  }
  return filters
}

export function buildPlayerHistoryModel(
  world: GameWorld,
  playerId: PlayerId,
): PlayerHistoryModel | undefined {
  if (world.players[playerId] === undefined) return undefined

  const onDate = world.currentDate
  const contracts = getPlayerContracts(world, playerId)
  const items = [
    ...buildContractEvents(world, playerId, onDate),
    ...buildTransactionEvents(world, playerId, contracts),
    ...buildMedicalEvents(world, playerId, onDate),
    ...buildTradeEvents(world, playerId),
    ...buildDraftEvents(world, playerId),
    ...buildEcosystemEvents(world, playerId),
    ...buildSeasonEvents(world, playerId),
  ].sort(compareHistoryItems)

  const summary: HistorySummaryModel = {
    contractCount: items.filter((item) => item.type === 'contract').length,
    transactionCount: items.filter((item) => item.type === 'transaction').length,
    medicalCount: items.filter((item) => item.type === 'medical').length,
    seasonCount: items.filter((item) => item.type === 'season').length,
    tradeCount: items.filter((item) => item.type === 'trade').length,
    draftCount: items.filter((item) => item.type === 'draft').length,
    ecosystemCount: items.filter((item) => item.type === 'ecosystem').length,
    gameCount: getPlayerGameLogs(world, playerId).length,
  }

  return {
    scope: {
      headline: 'Recorded career history',
      scopeNote: SCOPE_NOTE,
      gapsNote: GAPS_NOTE,
    },
    summary,
    filters: buildFilters(items),
    items,
    emptyMessage:
      items.length === 0
        ? 'No recorded career history is available for this player in the current save.'
        : null,
    defaultSelectedItemId: items[0]?.id ?? null,
  }
}

function findInjury(world: GameWorld, injuryId: InjuryId): InjuryRecord | undefined {
  return world.injuriesById[injuryId]
}

function findContract(world: GameWorld, contractId: ContractId): PlayerContract | undefined {
  return world.contractsById[contractId]
}

export function findHistoryInspectorDetail(
  world: GameWorld,
  playerId: PlayerId,
  model: PlayerHistoryModel,
  selectedItemId: string | null,
  onDate: typeof world.currentDate = world.currentDate,
): HistoryInspectorDetail | undefined {
  if (selectedItemId === null) return undefined
  const item = model.items.find((entry) => entry.id === selectedItemId)
  if (item === undefined) return undefined

  if (item.type === 'contract') {
    const contractId = item.id.replace('contract:', '') as ContractId
    const contract = findContract(world, contractId)
    if (contract === undefined) return undefined
    return {
      kind: 'contract',
      teamName: teamName(world, contract.teamId),
      termLabel: contractTermLabel(world, contract, onDate),
      statusLabel: STATUS_LABELS[getPlayerContractStatus(contract, onDate)],
      sourceNote: 'Contract record · chronological summary only',
    }
  }

  if (item.type === 'transaction') {
    const transactionId = item.id.replace('transaction:', '')
    const transaction = Object.values(world.playerTransactionsById).find((entry) => entry.id === transactionId)
    if (transaction === undefined) return undefined
    return {
      kind: 'transaction',
      transactionLabel: TRANSACTION_LABELS[transaction.kind],
      occurredOnLabel: formatGameDateLabel(transaction.occurredOn),
      teamContext:
        transaction.kind === 'signedFreeAgent'
          ? teamName(world, transaction.toTeamId)
          : teamName(world, transaction.fromTeamId),
      sourceNote: 'Market transaction record',
    }
  }

  if (item.type === 'medical') {
    const injuryId = item.id.replace('medical:', '') as InjuryId
    const injury = findInjury(world, injuryId)
    if (injury === undefined) return undefined
    return {
      kind: 'medical',
      injuryLabel: formatInjuryKind(injury.kind),
      severityLabel: SEVERITY_LABELS[injury.severity],
      statusLabel: isInjuryActive(injury, onDate) ? 'Active' : 'Recovered',
      injuredOnLabel: formatGameDateLabel(injury.injuredOn),
      expectedReturnLabel: formatGameDateLabel(injury.expectedReturnDate),
      durationLabel: formatDurationLabel(calendarDaysBetween(injury.injuredOn, injury.expectedReturnDate)),
      sourceNote: 'Medical record · see Medical tab for recovery detail',
    }
  }

  if (item.type === 'trade') {
    const tradeId = item.id.replace('trade:', '')
    const trade = world.tradeHistoryById[tradeId]
    if (trade === undefined) return undefined
    const movement = trade.movements.find((entry) => entry.asset.kind === 'player')
    if (movement === undefined || movement.asset.kind !== 'player') return undefined
    return {
      kind: 'trade',
      executedOnLabel: formatGameDateLabel(trade.executedAt),
      fromTeamName: teamName(world, movement.fromTeamId),
      toTeamName: teamName(world, movement.toTeamId),
      sourceNote: 'Trade record',
    }
  }

  if (item.type === 'draft') {
    const pickId = item.id.replace('draft:', '')
    const pick = world.draftPicksById[pickId]
    if (pick?.selection === undefined) return undefined
    const draft = world.draftsById[pick.draftId]
    return {
      kind: 'draft',
      selectedOnLabel: formatGameDateLabel(draft?.scheduledOn ?? pick.draftId),
      teamName: teamName(world, pick.selection.teamId),
      roundLabel: `Round ${pick.round} · Pick ${pick.order}`,
      sourceNote: 'Draft selection record',
    }
  }

  if (item.type === 'ecosystem') {
    const transitionId = item.id.replace('ecosystem:', '')
    const transition = world.ecosystemTransitionsById[transitionId]
    if (transition === undefined) return undefined
    return {
      kind: 'ecosystem',
      transitionLabel: ECOSYSTEM_LABELS[transition.transitionType],
      effectiveOnLabel: formatGameDateLabel(transition.effectiveDate),
      routeLabel: `${teamName(world, transition.fromTeamId)} → ${teamName(world, transition.toTeamId)}`,
      sourceNote: 'Cross-ecosystem transition record',
    }
  }

  const seasonId = item.id.replace('season:', '') as SeasonId
  const stats = getPlayerSeasonStatLines(world, playerId).find((entry) => entry.seasonId === seasonId)
  if (stats === undefined) return undefined
  const averages = calculatePlayerStatAverages(stats)
  const competitionNames = [
    ...new Set(
      getPlayerGameLogs(world, playerId)
        .filter((line) => line.seasonId === seasonId)
        .map((line) => world.competitions[line.competitionId]?.name)
        .filter((name): name is string => name !== undefined),
    ),
  ]

  return {
    kind: 'season',
    seasonLabel: seasonDateLabel(world, seasonId),
    competitionLabel: competitionNames.length > 0 ? competitionNames.join(' · ') : null,
    gamesPlayed: stats.gamesPlayed,
    pointsPerGame: averages.ppg.toFixed(1),
    sourceNote: 'Derived from persisted game logs · not an explicit career event',
  }
}

export function filterHistoryItems(
  items: readonly PlayerHistoryItemModel[],
  filterId: HistoryFilterId,
): readonly PlayerHistoryItemModel[] {
  if (filterId === 'all') return items
  return items.filter((item) => item.filterCategory === filterId)
}
