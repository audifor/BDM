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
  getPlayerRosterTeamId,
  getPlayerTransactions,
  type GameWorld,
} from '@/domain/world'
import { boxScoreValuation } from '@/engine/stats/boxScoreValuation'
import {
  calculatePlayerStatAverages,
  getPlayerGameLogs,
  getPlayerSeasonStatLines,
  getPlayerSeasonStats,
} from '@/engine/stats/PlayerHistory'

import {
  calendarDaysBetween,
  formatDurationLabel,
} from './buildPlayerMedicalModel'
import { buildPlayerDevelopmentModel } from './buildPlayerDevelopmentModel'
import { formatSeasonSpanLabel, resolveSeasonLabelForYear } from './buildPlayerContractModel'
import type { OverviewGapModel } from './playerWorkspaceModel'
import { formatGameDateLabel, opponentShortCode } from './presentationHelpers'

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

/** Event family an item belongs to. Every item carries the one it was built from. */
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
  | HistoryMilestoneDetailModel

/** One season of the career, as the team-history table shows it. */
export interface HistoryTeamSeasonRowModel {
  readonly id: string
  readonly seasonLabel: string
  readonly teamName: string
  readonly competitionLabel: string
  readonly roleLabel: string
  readonly gamesPlayed: number
  readonly minutesPerGame: string
  readonly pointsPerGame: string
  readonly reboundsPerGame: string
  readonly assistsPerGame: string
  readonly valuationPerGame: string
  /** Selection id that opens this season in the detail panel. */
  readonly selectionId: string
}

/** A dated career milestone read off the saved records. */
export interface HistoryMilestoneRowModel {
  readonly id: string
  readonly dateLabel: string
  readonly label: string
  readonly detail: string
  /** Value the milestone reports, when it reports one. */
  readonly value: string | null
  /** Selection id that opens this milestone in the detail panel. */
  readonly selectionId: string
}

/** One node of the career timeline. Every event is derived from a record, never authored. */
export interface HistoryTimelineEventModel {
  readonly id: string
  readonly type: 'debut' | 'breakout' | 'transfer' | 'career-high' | 'contract'
  readonly dateLabel: string
  readonly sortDate: string
  readonly title: string
  readonly subtitle: string
  readonly selectionId: string
}

/** One row of the contract ledger. */
export interface HistoryContractRowModel {
  readonly id: string
  readonly dateLabel: string
  readonly teamName: string
  readonly salaryLabel: string
  readonly statusLabel: string
  readonly tone: 'positive' | 'accent'
  readonly selectionId: string
}

/** One honour. `derived` is false when the save holds no ledger for it. */
export interface HistoryHonourRowModel {
  readonly id: string
  readonly label: string
  readonly seasonLabel: string | null
  readonly derived: boolean
  readonly selectionId: string | null
}

export interface HistoryDetailStatModel {
  readonly id: string
  readonly label: string
  readonly value: string
}

export interface HistoryDetailMetaModel {
  readonly id: string
  readonly label: string
  readonly value: string
}

/**
 * Detail of a timeline event, a performance milestone or a development transition. Numbers come
 * from the recorded box score or record; the prose is a reading of them, never authored copy.
 */
export interface HistoryMilestoneDetailModel {
  readonly kind: 'milestone'
  readonly title: string
  readonly dateLabel: string
  readonly contextLabel: string | null
  readonly description: string
  readonly stats: readonly HistoryDetailStatModel[]
  readonly metadata: readonly HistoryDetailMetaModel[]
  readonly imageNote: string
  readonly sourceNote: string
}

export interface HistoryCareerTotalsModel {
  readonly games: number
  readonly minutesPerGame: string
  readonly pointsPerGame: string
  readonly reboundsPerGame: string
  readonly assistsPerGame: string
  readonly valuationPerGame: string
  readonly note: string
}

export interface PlayerHistoryModel {
  readonly scope: HistoryScopeModel
  readonly summary: HistorySummaryModel
  readonly items: readonly PlayerHistoryItemModel[]
  /** The career arc: debut, breakout, transfer, career high and contract, in date order. */
  readonly timeline: readonly HistoryTimelineEventModel[]
  readonly contractHistory: readonly HistoryContractRowModel[]
  readonly honours: readonly HistoryHonourRowModel[]
  readonly honoursNote: string
  readonly transactions: readonly HistoryMilestoneRowModel[]
  readonly teamHistory: readonly HistoryTeamSeasonRowModel[]
  readonly performanceMilestones: readonly HistoryMilestoneRowModel[]
  readonly developmentMilestones: readonly HistoryMilestoneRowModel[]
  readonly careerTotals: HistoryCareerTotalsModel
  readonly gaps: readonly OverviewGapModel[]
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
  const careerTotals = buildCareerTotals(world, playerId)

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
    items,
    timeline: buildCareerTimeline(world, playerId),
    contractHistory: buildContractHistory(world, playerId),
    honours: buildHonours(world, playerId, careerTotals),
    honoursNote: HONOURS_NOTE,
    transactions: buildTransactions(world, playerId),
    teamHistory: buildTeamHistory(world, playerId),
    performanceMilestones: buildPerformanceMilestones(world, playerId),
    developmentMilestones: (buildPlayerDevelopmentModel(world, playerId)?.longitudinal.events ?? []).map(
      (event) => ({
        id: event.id,
        dateLabel: event.dateLabel,
        label: event.label,
        detail: event.detail,
        value: event.impact === null ? null : String(event.impact),
        selectionId: `development:${event.id.replace('transition:', '')}`,
      }),
    ),
    careerTotals,
    gaps: buildHistoryGaps(),
    emptyMessage:
      items.length === 0
        ? 'No recorded career history is available for this player in the current save.'
        : null,
    defaultSelectedItemId: items[0]?.id ?? null,
  }
}

/** One row per season the save holds, taken from the season aggregates the engine already keeps. */
function buildTeamHistory(
  world: GameWorld,
  playerId: PlayerId,
): readonly HistoryTeamSeasonRowModel[] {
  const rosterTeamId = getPlayerRosterTeamId(world, playerId)

  return Object.values(world.seasons)
    .sort((left, right) => right.startDate.localeCompare(left.startDate) || left.id.localeCompare(right.id))
    .flatMap((season) => {
      const stats = getPlayerSeasonStats(world, playerId, season.id)
      if (stats.gamesPlayed === 0) return []
      const averages = calculatePlayerStatAverages(stats)
      return [
        {
          id: season.id,
          seasonLabel: season.label,
          selectionId: `season:${season.id}`,
          teamName:
            rosterTeamId === undefined ? 'Free agent' : world.teams[rosterTeamId]?.name ?? 'Club not tracked',
          competitionLabel: world.competitions[season.competitionId]?.name ?? 'Competition not tracked',
          roleLabel:
            stats.gamesStarted === 0
              ? 'Bench'
              : stats.gamesStarted === stats.gamesPlayed
                ? 'Starter'
                : `Rotation (${stats.gamesStarted} of ${stats.gamesPlayed} starts)`,
          gamesPlayed: stats.gamesPlayed,
          minutesPerGame: averages.mpg.toFixed(1),
          pointsPerGame: averages.ppg.toFixed(1),
          reboundsPerGame: averages.rpg.toFixed(1),
          assistsPerGame: averages.apg.toFixed(1),
          valuationPerGame: (boxScoreValuation(stats) / stats.gamesPlayed).toFixed(1),
        },
      ]
    })
}

/** Career bests, read from the tracked game log rather than from an authored biography. */
function buildPerformanceMilestones(
  world: GameWorld,
  playerId: PlayerId,
): readonly HistoryMilestoneRowModel[] {
  const logs = orderedGameLogs(world, playerId)
  if (logs.length === 0) return []

  const milestones: HistoryMilestoneRowModel[] = []
  const push = (
    id: string,
    line: (typeof logs)[number],
    label: string,
    value: number,
    detail: string,
  ): void => {
    milestones.push({
      id,
      dateLabel: formatGameDateLabel(line.gameDate),
      label,
      detail,
      value: String(value),
      selectionId: `performance:${id}`,
    })
  }

  const scoring = bestGame(logs, (line) => line.stats.points)
  if (scoring !== undefined && scoring.stats.points > 0) {
    push(
      CAREER_HIGH_SELECTION,
      scoring,
      'Career High (Points)',
      scoring.stats.points,
      `vs ${opponentShortCode(teamName(world, scoring.opponentTeamId))} · ${scoring.stats.fieldGoalsMade}/${scoring.stats.fieldGoalsAttempted} from the field`,
    )
  }

  const playmaking = bestGame(logs, (line) => line.stats.assists)
  if (playmaking !== undefined && playmaking.stats.assists > 0) {
    push(
      'most-assists',
      playmaking,
      'Most Assists (Game)',
      playmaking.stats.assists,
      `vs ${opponentShortCode(teamName(world, playmaking.opponentTeamId))} · ${playmaking.stats.turnovers} turnovers`,
    )
  }

  const rebounding = bestGame(logs, (line) => line.stats.rebounds)
  if (rebounding !== undefined && rebounding.stats.rebounds > 0) {
    push(
      'most-rebounds',
      rebounding,
      'Most Rebounds (Game)',
      rebounding.stats.rebounds,
      `vs ${opponentShortCode(teamName(world, rebounding.opponentTeamId))} · ${rebounding.stats.offensiveRebounds} offensive`,
    )
  }

  const firstTwenty = logs.find((line) => line.stats.points >= 20)
  if (firstTwenty !== undefined) {
    push(
      'twenty-points',
      firstTwenty,
      '20+ Points Game',
      firstTwenty.stats.points,
      `First game of 20 points or more, vs ${opponentShortCode(teamName(world, firstTwenty.opponentTeamId))}`,
    )
  }

  const firstTenAssists = logs.find((line) => line.stats.assists >= 10)
  if (firstTenAssists !== undefined) {
    push(
      'ten-assists',
      firstTenAssists,
      '10+ Assists Game',
      firstTenAssists.stats.assists,
      `First game of 10 assists or more, vs ${opponentShortCode(teamName(world, firstTenAssists.opponentTeamId))}`,
    )
  }

  return milestones.sort(
    (left, right) => right.dateLabel.localeCompare(left.dateLabel) || left.id.localeCompare(right.id),
  )
}

/** Aggregated totals over every season the save holds, with the scope stated. */
function buildCareerTotals(world: GameWorld, playerId: PlayerId): HistoryCareerTotalsModel {
  let games = 0
  let points = 0
  let rebounds = 0
  let assists = 0
  let seconds = 0
  let valuation = 0

  for (const season of Object.values(world.seasons)) {
    const stats = getPlayerSeasonStats(world, playerId, season.id)
    if (stats.gamesPlayed === 0) continue
    games += stats.gamesPlayed
    points += stats.points
    rebounds += stats.rebounds
    assists += stats.assists
    seconds += stats.secondsPlayed
    valuation += boxScoreValuation(stats)
  }

  const perGame = (total: number) => (games === 0 ? '0.0' : (total / games).toFixed(1))
  return {
    games,
    minutesPerGame: games === 0 ? '0.0' : (seconds / 60 / games).toFixed(1),
    pointsPerGame: perGame(points),
    reboundsPerGame: perGame(rebounds),
    assistsPerGame: perGame(assists),
    valuationPerGame: perGame(valuation),
    note: 'Totals cover every season this save holds; earlier seasons were never persisted.',
  }
}

/** Every game the player appears in, oldest first. */
function orderedGameLogs(
  world: GameWorld,
  playerId: PlayerId,
): readonly ReturnType<typeof getPlayerGameLogs>[number][] {
  return [...getPlayerGameLogs(world, playerId)].sort((left, right) =>
    left.gameDate.localeCompare(right.gameDate) || left.gameId.localeCompare(right.gameId),
  )
}

function bestGame(
  logs: readonly ReturnType<typeof getPlayerGameLogs>[number][],
  pick: (line: ReturnType<typeof getPlayerGameLogs>[number]) => number,
): ReturnType<typeof getPlayerGameLogs>[number] | undefined {
  return [...logs].sort(
    (left, right) => pick(right) - pick(left) || left.gameDate.localeCompare(right.gameDate),
  )[0]
}

export const CAREER_HIGH_SELECTION = 'career-high-points'
export const DEBUT_SELECTION = 'debut-game'

/**
 * The career arc: the five milestones the reference draws, each one taken from a record the save
 * holds. A milestone whose record does not exist is simply absent.
 */
function buildCareerTimeline(
  world: GameWorld,
  playerId: PlayerId,
): readonly HistoryTimelineEventModel[] {
  const logs = orderedGameLogs(world, playerId)
  const seasons = Object.values(world.seasons).sort((left, right) =>
    left.startDate.localeCompare(right.startDate) || left.id.localeCompare(right.id),
  )
  const contracts = [...getPlayerContracts(world, playerId)].sort((left, right) =>
    left.term.startsOn.localeCompare(right.term.startsOn),
  )
  const events: HistoryTimelineEventModel[] = []

  const first = logs[0]
  if (first !== undefined) {
    events.push({
      id: 'debut',
      type: 'debut',
      dateLabel: formatGameDateLabel(first.gameDate),
      sortDate: first.gameDate,
      title: 'Debut',
      subtitle: 'First team appearance',
      selectionId: `timeline:debut`,
    })
  }

  // Breakout: the first season the player was given a start, which is when a rotation place shows.
  const breakoutSeason = seasons.find((season) => {
    const stats = getPlayerSeasonStats(world, playerId, season.id)
    return stats.gamesStarted > 0
  })
  if (breakoutSeason !== undefined) {
    const stats = getPlayerSeasonStats(world, playerId, breakoutSeason.id)
    events.push({
      id: 'breakout',
      type: 'breakout',
      dateLabel: formatGameDateLabel(breakoutSeason.startDate),
      sortDate: breakoutSeason.startDate,
      title: 'Breakout',
      subtitle: 'Established in rotation',
      selectionId: `timeline:breakout:${breakoutSeason.id}`,
    })
    void stats
  }

  // Transfer: the market move that took the player to the club he currently plays for.
  const transfers = getPlayerTransactions(world, playerId)
    .filter((transaction) => transaction.kind === 'signedFreeAgent' && transaction.toTeamId !== undefined)
    .sort((left, right) => left.occurredOn.localeCompare(right.occurredOn))
  const transfer = transfers.at(-1)
  if (transfer !== undefined && transfers.length > 1) {
    events.push({
      id: 'transfer',
      type: 'transfer',
      dateLabel: formatGameDateLabel(transfer.occurredOn),
      sortDate: transfer.occurredOn,
      title: 'Transfer',
      subtitle: `Joined ${teamName(world, transfer.toTeamId)}`,
      selectionId: `timeline:transfer:${transfer.id}`,
    })
  }

  const scoring = bestGame(logs, (line) => line.stats.points)
  if (scoring !== undefined && scoring.stats.points > 0) {
    events.push({
      id: 'career-high',
      type: 'career-high',
      dateLabel: formatGameDateLabel(scoring.gameDate),
      sortDate: scoring.gameDate,
      title: 'Career High',
      subtitle: `${scoring.stats.points} PTS vs ${opponentShortCode(teamName(world, scoring.opponentTeamId))}`,
      selectionId: `timeline:${CAREER_HIGH_SELECTION}`,
    })
  }

  const latestContract = contracts.at(-1)
  if (latestContract !== undefined) {
    const earlier = contracts.some(
      (contract) => contract.id !== latestContract.id && contract.teamId === latestContract.teamId,
    )
    events.push({
      id: 'contract',
      type: 'contract',
      dateLabel: formatGameDateLabel(latestContract.term.startsOn),
      sortDate: latestContract.term.startsOn,
      title: earlier ? 'New Contract' : 'First Contract',
      subtitle: earlier ? 'Contract extension' : 'Turned professional',
      selectionId: `contract:${latestContract.id}`,
    })
  }

  return events.sort((left, right) => left.sortDate.localeCompare(right.sortDate))
}

/** The contract ledger, newest first. `Extension` marks a second deal with the same club. */
function buildContractHistory(
  world: GameWorld,
  playerId: PlayerId,
): readonly HistoryContractRowModel[] {
  const contracts = [...getPlayerContracts(world, playerId)].sort((left, right) =>
    right.term.startsOn.localeCompare(left.term.startsOn),
  )

  return contracts.map((contract) => {
    const earlierWithTeam = contracts.some(
      (candidate) =>
        candidate.id !== contract.id &&
        candidate.teamId === contract.teamId &&
        candidate.term.startsOn < contract.term.startsOn,
    )
    return {
      id: contract.id,
      dateLabel: formatGameDateLabel(contract.term.startsOn),
      teamName: teamName(world, contract.teamId),
      salaryLabel: contract.compensation.annualSalary.toLocaleString('en-US'),
      statusLabel: earlierWithTeam ? 'Extension' : 'Signed',
      tone: earlierWithTeam ? 'accent' : 'positive',
      selectionId: `contract:${contract.id}`,
    }
  })
}

const HONOURS_NOTE =
  'Awards are not persisted: no trophy, all-league or award ledger exists in the world model, so only honours that can be read from records are listed.'

/**
 * Honours read from records: the career best and the game-count thresholds actually crossed.
 * Everything else is named in the note instead of being invented.
 */
function buildHonours(
  world: GameWorld,
  playerId: PlayerId,
  totals: HistoryCareerTotalsModel,
): readonly HistoryHonourRowModel[] {
  const honours: HistoryHonourRowModel[] = []
  const scoring = bestGame(orderedGameLogs(world, playerId), (line) => line.stats.points)

  if (scoring !== undefined && scoring.stats.points > 0) {
    honours.push({
      id: 'career-high',
      label: `Career high — ${scoring.stats.points} points`,
      seasonLabel: seasonLabelOfGame(world, scoring.seasonId),
      derived: true,
      selectionId: `performance:${CAREER_HIGH_SELECTION}`,
    })
  }

  const threshold = [100, 50, 25, 10].find((value) => totals.games >= value)
  if (threshold !== undefined) {
    honours.push({
      id: 'games-threshold',
      label: `${threshold}+ professional games`,
      seasonLabel: seasonReachingGameCount(world, playerId, threshold),
      derived: true,
      selectionId: null,
    })
  }

  return honours
}

function seasonLabelOfGame(world: GameWorld, seasonId: SeasonId): string | null {
  return world.seasons[seasonId]?.label ?? null
}

/** Season in which the player's career game count first reached the threshold. */
function seasonReachingGameCount(
  world: GameWorld,
  playerId: PlayerId,
  threshold: number,
): string | null {
  const seasons = Object.values(world.seasons).sort((left, right) =>
    left.startDate.localeCompare(right.startDate) || left.id.localeCompare(right.id),
  )
  let games = 0
  for (const season of seasons) {
    games += getPlayerSeasonStats(world, playerId, season.id).gamesPlayed
    if (games >= threshold) return season.label
  }
  return null
}

/** Formal movements recorded for the player: the transaction ledger, newest first. */
function buildTransactions(
  world: GameWorld,
  playerId: PlayerId,
): readonly HistoryMilestoneRowModel[] {
  return getPlayerTransactions(world, playerId)
    .sort((left, right) => right.occurredOn.localeCompare(left.occurredOn))
    .map((transaction) => ({
      id: transaction.id,
      dateLabel: formatGameDateLabel(transaction.occurredOn),
      label:
        transaction.kind === 'signedFreeAgent'
          ? `Signed with ${teamName(world, transaction.toTeamId)}`
          : TRANSACTION_LABELS[transaction.kind],
      detail: '',
      value: null,
      selectionId: `transaction:${transaction.id}`,
    }))
}

/** Reference blocks the save has no record for. */
function buildHistoryGaps(): readonly OverviewGapModel[] {
  return [
    {
      id: 'honours',
      label: 'Honours & milestones',
      reason: 'No trophy or award record is stored for a player, so none can be listed.',
    },
    {
      id: 'international',
      label: 'International career',
      reason: 'National team appearances are not part of the world model.',
    },
    {
      id: 'pre-save-seasons',
      label: 'Seasons before this save',
      reason: 'The world only holds the seasons it has simulated, so earlier career seasons do not exist.',
    },
  ]
}

function findInjury(world: GameWorld, injuryId: InjuryId): InjuryRecord | undefined {
  return world.injuriesById[injuryId]
}

function findContract(world: GameWorld, contractId: ContractId): PlayerContract | undefined {
  return world.contractsById[contractId]
}

const NO_IMAGE_NOTE = 'No photograph is stored for this event.'

function statRows(
  stats: ReturnType<typeof getPlayerGameLogs>[number]['stats'],
): readonly HistoryDetailStatModel[] {
  return [
    { id: 'pts', label: 'PTS', value: String(stats.points) },
    { id: 'reb', label: 'REB', value: String(stats.rebounds) },
    { id: 'ast', label: 'AST', value: String(stats.assists) },
    { id: 'stl', label: 'STL', value: String(stats.steals) },
    { id: 'val', label: 'VAL', value: String(boxScoreValuation(stats)) },
  ]
}

function minutesOf(stats: ReturnType<typeof getPlayerGameLogs>[number]['stats']): number {
  return Math.round(stats.secondsPlayed / 60)
}

/** Detail of one recorded game, shared by the debut and every performance milestone. */
function buildGameMilestoneDetail(
  world: GameWorld,
  line: ReturnType<typeof getPlayerGameLogs>[number],
  title: string,
  description: string,
  sourceNote = 'Derived from the persisted game log',
): HistoryMilestoneDetailModel {
  const team = teamName(world, line.teamId)
  const opponent = teamName(world, line.opponentTeamId)

  return {
    kind: 'milestone',
    title,
    dateLabel: formatGameDateLabel(line.gameDate),
    contextLabel: `${team} vs ${opponent}`,
    description,
    stats: statRows(line.stats),
    metadata: [
      { id: 'competition', label: 'Competition', value: world.competitions[line.competitionId]?.name ?? '—' },
      { id: 'date', label: 'Date', value: formatGameDateLabel(line.gameDate) },
      { id: 'team', label: 'Team', value: team },
      { id: 'opponent', label: 'Opponent', value: opponent },
      { id: 'role', label: 'Role', value: line.started ? 'Starter' : 'Bench Player' },
      { id: 'minutes', label: 'Minutes', value: String(minutesOf(line.stats)) },
    ],
    imageNote: NO_IMAGE_NOTE,
    sourceNote,
  }
}

/** Season-shaped milestone: the breakout season and the recorded transitions use it. */
function buildSeasonMilestoneDetail(
  world: GameWorld,
  playerId: PlayerId,
  seasonId: SeasonId,
  title: string,
  description: string,
  sourceNote: string,
): HistoryMilestoneDetailModel | undefined {
  const season = world.seasons[seasonId]
  if (season === undefined) return undefined
  const stats = getPlayerSeasonStats(world, playerId, seasonId)
  if (stats.gamesPlayed === 0) return undefined
  const averages = calculatePlayerStatAverages(stats)
  const rosterTeamId = getPlayerRosterTeamId(world, playerId)

  return {
    kind: 'milestone',
    title,
    dateLabel: formatGameDateLabel(season.startDate),
    contextLabel: teamName(world, rosterTeamId),
    description,
    stats: [
      { id: 'pts', label: 'PTS', value: averages.ppg.toFixed(1) },
      { id: 'reb', label: 'REB', value: averages.rpg.toFixed(1) },
      { id: 'ast', label: 'AST', value: averages.apg.toFixed(1) },
      { id: 'stl', label: 'STL', value: averages.spg.toFixed(1) },
      { id: 'val', label: 'VAL', value: (boxScoreValuation(stats) / stats.gamesPlayed).toFixed(1) },
    ],
    metadata: [
      { id: 'competition', label: 'Competition', value: world.competitions[season.competitionId]?.name ?? '—' },
      { id: 'season', label: 'Season', value: season.label },
      { id: 'starts', label: 'Starts', value: `${stats.gamesStarted} of ${stats.gamesPlayed}` },
      { id: 'role', label: 'Role', value: stats.gamesStarted > 0 ? 'Rotation' : 'Bench' },
      { id: 'minutes', label: 'Minutes per game', value: averages.mpg.toFixed(1) },
      { id: 'games', label: 'Games', value: String(stats.gamesPlayed) },
    ],
    imageNote: NO_IMAGE_NOTE,
    sourceNote,
  }
}

/** Market move: the date, the club joined and the club left, with no invented box score. */
function buildTransferMilestoneDetail(
  world: GameWorld,
  transaction: PlayerTransaction,
): HistoryMilestoneDetailModel {
  const toTeam = teamName(world, transaction.toTeamId)
  return {
    kind: 'milestone',
    title: 'Transfer',
    dateLabel: formatGameDateLabel(transaction.occurredOn),
    contextLabel: `Joined ${toTeam}`,
    description: `Signed for ${toTeam} on ${formatGameDateLabel(transaction.occurredOn)}, arriving from ${teamName(world, transaction.fromTeamId)}.`,
    stats: [],
    metadata: [
      { id: 'date', label: 'Date', value: formatGameDateLabel(transaction.occurredOn) },
      { id: 'team', label: 'Team', value: toTeam },
      { id: 'from', label: 'Previous team', value: teamName(world, transaction.fromTeamId) },
      { id: 'contract', label: 'Contract', value: transaction.contractId ?? '—' },
    ],
    imageNote: NO_IMAGE_NOTE,
    sourceNote: 'Market transaction record · no box score is attached to this event',
  }
}

/** The game a performance milestone points at, or undefined when the id is unknown. */
function gameForMilestone(
  world: GameWorld,
  playerId: PlayerId,
  milestoneId: string,
): ReturnType<typeof getPlayerGameLogs>[number] | undefined {
  const logs = orderedGameLogs(world, playerId)
  switch (milestoneId) {
    case CAREER_HIGH_SELECTION:
      return bestGame(logs, (line) => line.stats.points)
    case 'most-assists':
      return bestGame(logs, (line) => line.stats.assists)
    case 'most-rebounds':
      return bestGame(logs, (line) => line.stats.rebounds)
    case 'twenty-points':
      return logs.find((line) => line.stats.points >= 20)
    case 'ten-assists':
      return logs.find((line) => line.stats.assists >= 10)
    case DEBUT_SELECTION:
      return logs[0]
    default:
      return undefined
  }
}

const MILESTONE_TITLES: Record<string, string> = {
  [CAREER_HIGH_SELECTION]: 'Career High',
  'most-assists': 'Most Assists',
  'most-rebounds': 'Most Rebounds',
  'twenty-points': '20+ Points Game',
  'ten-assists': '10+ Assists Game',
  [DEBUT_SELECTION]: 'Debut',
}

/** Reading of a game milestone, written from the box score it shows. */
function describeGameMilestone(
  milestoneId: string,
  line: ReturnType<typeof getPlayerGameLogs>[number],
): string {
  const stats = line.stats
  const shot = `${stats.fieldGoalsMade}/${stats.fieldGoalsAttempted} from the field`
  const minutes = minutesOf(stats)

  switch (milestoneId) {
    case DEBUT_SELECTION:
      return `First recorded appearance, ${line.started ? 'in the starting five' : 'coming off the bench'}, with ${stats.points} points on ${shot} in ${minutes} minutes.`
    case CAREER_HIGH_SELECTION:
      return `Highest scoring game on record: ${stats.points} points on ${shot} and ${stats.threePointMade}/${stats.threePointAttempted} from three in ${minutes} minutes.`
    case 'most-assists':
      return `Most assists in a single game: ${stats.assists} in ${minutes} minutes, with ${stats.points} points and ${stats.turnovers} turnovers.`
    case 'most-rebounds':
      return `Most rebounds in a single game: ${stats.rebounds} (${stats.offensiveRebounds} offensive) in ${minutes} minutes.`
    case 'twenty-points':
      return `First game of ${stats.points} points or more, on ${shot} in ${minutes} minutes.`
    case 'ten-assists':
      return `First game of ${stats.assists} assists or more, in ${minutes} minutes.`
    default:
      return `${stats.points} points on ${shot} in ${minutes} minutes.`
  }
}

/** Detail for the selection ids the timeline and the milestone tables produce. */
function buildMilestoneSelectionDetail(
  world: GameWorld,
  playerId: PlayerId,
  model: PlayerHistoryModel,
  selectionId: string,
): HistoryInspectorDetail | undefined {
  if (selectionId.startsWith('timeline:')) {
    const event = model.timeline.find((entry) => entry.selectionId === selectionId)
    if (event === undefined) return undefined
    if (event.type === 'breakout') {
      const seasonId = selectionId.replace('timeline:breakout:', '') as SeasonId
      const stats = getPlayerSeasonStats(world, playerId, seasonId)
      return buildSeasonMilestoneDetail(
        world,
        playerId,
        seasonId,
        'Breakout',
        `Established in the rotation: ${stats.gamesStarted} starts in ${stats.gamesPlayed} games at ${minutesPerGame(stats)} minutes per game.`,
        'Derived from the persisted season record',
      )
    }
    if (event.type === 'transfer') {
      const transactionId = selectionId.replace('timeline:transfer:', '')
      const transaction = getPlayerTransactions(world, playerId).find((entry) => entry.id === transactionId)
      return transaction === undefined ? undefined : buildTransferMilestoneDetail(world, transaction)
    }
    const milestoneId = selectionId === 'timeline:debut' ? DEBUT_SELECTION : CAREER_HIGH_SELECTION
    const line = gameForMilestone(world, playerId, milestoneId)
    return line === undefined
      ? undefined
      : buildGameMilestoneDetail(
          world,
          line,
          MILESTONE_TITLES[milestoneId] ?? event.title,
          describeGameMilestone(milestoneId, line),
        )
  }

  if (selectionId.startsWith('performance:')) {
    const milestoneId = selectionId.replace('performance:', '')
    const line = gameForMilestone(world, playerId, milestoneId)
    return line === undefined
      ? undefined
      : buildGameMilestoneDetail(
          world,
          line,
          MILESTONE_TITLES[milestoneId] ?? 'Performance milestone',
          describeGameMilestone(milestoneId, line),
        )
  }

  if (selectionId.startsWith('development:')) {
    const seasonId = selectionId.replace('development:', '') as SeasonId
    const row = model.developmentMilestones.find((entry) => entry.selectionId === selectionId)
    if (row === undefined) return undefined
    const movement = row.value ?? '0'
    return buildSeasonMilestoneDetail(
      world,
      playerId,
      seasonId,
      row.label,
      `${movement} rating points moved when the season closed.`,
      'Rating history record',
    )
  }

  return undefined
}

function minutesPerGame(stats: ReturnType<typeof getPlayerSeasonStats>): string {
  return stats.gamesPlayed === 0 ? '0.0' : (stats.secondsPlayed / 60 / stats.gamesPlayed).toFixed(1)
}

export function findHistoryInspectorDetail(
  world: GameWorld,
  playerId: PlayerId,
  model: PlayerHistoryModel,
  selectedItemId: string | null,
  onDate: typeof world.currentDate = world.currentDate,
): HistoryInspectorDetail | undefined {
  if (selectedItemId === null) return undefined

  const milestone = buildMilestoneSelectionDetail(world, playerId, model, selectedItemId)
  if (milestone !== undefined) return milestone

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
