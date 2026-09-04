import { compareGameDates, type GameDate } from '@/domain/date'
import { CAREER_FATIGUE_DAILY_RECOVERY } from '@/domain/careerFatigue/CareerFatigue'
import {
  formatInjuryKind,
  isInjuryActive,
  type InjuryRecord,
  type InjurySeverity,
} from '@/domain/injury'
import type { InjuryId, PlayerId } from '@/domain/ids'
import {
  getActiveInjuryForPlayer,
  getCareerFatigueForPlayer,
  isPlayerAvailable,
  type GameWorld,
} from '@/domain/world'
import {
  getMedicalRiskAssessments,
  type MedicalRiskBand,
} from '@/engine/injury/MedicalRiskAssessment'

import { findTeamForPlayer, formatGameDateLabel } from './presentationHelpers'

export type MedicalAvailabilityTone = 'available' | 'injured'

export interface MedicalAvailabilityBandModel {
  readonly statusLabel: 'Available' | 'Injured'
  readonly statusTone: MedicalAvailabilityTone
  readonly summary: string | null
  readonly currentDateLabel: string
  readonly limitationLabel: string | null
}

export interface MedicalFatigueModel {
  readonly value: number
  readonly dailyRecoveryRate: number
  readonly loadLabel: string
  readonly loadTone: 'low' | 'moderate' | 'elevated' | 'high'
}

export interface MedicalRiskModel {
  readonly riskScore: number
  readonly riskBand: MedicalRiskBand
  readonly riskBandLabel: string
  readonly displayLabel: string
  readonly reasons: readonly string[]
  readonly primaryReason: string | null
}

export type MedicalRiskOverviewTone = 'positive' | 'neutral' | 'warning'

export interface PlayerMedicalRiskPresentation {
  readonly status: 'available' | 'unavailable'
  readonly model?: MedicalRiskModel
  readonly displayLabel?: string
  readonly unavailableLabel?: string
  readonly overviewTone?: MedicalRiskOverviewTone | null
}

export interface MedicalActiveInjuryModel {
  readonly id: InjuryId
  readonly kindLabel: string
  readonly severityLabel: string
  readonly injuredOnLabel: string
  readonly expectedReturnLabel: string
  readonly daysRemaining: number
  readonly expectedDurationDays: number
  readonly sourceContext: string | null
}

export type MedicalRecoveryTimelineState = 'start' | 'current' | 'return'

export interface MedicalRecoveryTimelineNodeModel {
  readonly id: string
  readonly dateLabel: string
  readonly label: string
  readonly state: MedicalRecoveryTimelineState
  readonly markerLabel: string | null
}

export interface MedicalHistoryRowModel {
  readonly id: InjuryId
  readonly injuredOnLabel: string
  readonly expectedReturnLabel: string
  readonly injuryLabel: string
  readonly statusLabel: 'Active' | 'Recovered'
  readonly statusTone: 'active' | 'recovered'
  readonly durationLabel: string
  readonly severityLabel: string
}

export interface MedicalInspectorInjuryDetail {
  readonly kind: 'injury'
  readonly injuryLabel: string
  readonly severityLabel: string
  readonly statusLabel: 'Active' | 'Recovered'
  readonly injuredOnLabel: string
  readonly expectedReturnLabel: string
  readonly durationLabel: string
  readonly daysRemainingLabel: string | null
  readonly availabilityImpact: string
}

export interface PlayerMedicalModel {
  readonly availabilityBand: MedicalAvailabilityBandModel
  readonly fatigue: MedicalFatigueModel
  readonly risk: MedicalRiskModel | null
  readonly riskUnavailableLabel: string | null
  readonly activeInjury: MedicalActiveInjuryModel | null
  readonly recoveryTimeline: readonly MedicalRecoveryTimelineNodeModel[]
  readonly history: readonly MedicalHistoryRowModel[]
  readonly historyEmptyMessage: string | null
  readonly defaultSelectedEventId: InjuryId | null
}

const SEVERITY_LABELS: Record<InjurySeverity, string> = {
  minor: 'Minor',
  moderate: 'Moderate',
  serious: 'Serious',
}

const RISK_BAND_LABELS: Record<MedicalRiskBand, string> = {
  low: 'Low',
  elevated: 'Elevated',
  high: 'High',
}

/** Engine-defined injury-risk bands from getMedicalRiskAssessments (score thresholds 30 / 60). */
export function medicalRiskOverviewTone(band: MedicalRiskBand): MedicalRiskOverviewTone {
  if (band === 'high' || band === 'elevated') return 'warning'
  return 'positive'
}

export function buildMedicalRiskModel(input: {
  readonly riskBand: MedicalRiskBand
  readonly riskScore: number
  readonly reasons: readonly string[]
}): MedicalRiskModel {
  const riskBandLabel = RISK_BAND_LABELS[input.riskBand]
  return {
    riskScore: input.riskScore,
    riskBand: input.riskBand,
    riskBandLabel,
    displayLabel: `${riskBandLabel} · ${input.riskScore}`,
    reasons: input.reasons,
    primaryReason: input.reasons[0] ?? null,
  }
}

/**
 * Shared NG presentation source for injury-risk warnings.
 * Backed by engine getMedicalRiskAssessments — derived, non-persisted, per roster player.
 */
export function resolvePlayerMedicalRiskPresentation(
  world: GameWorld,
  playerId: PlayerId,
): PlayerMedicalRiskPresentation {
  const team = findTeamForPlayer(world, playerId)
  if (team === undefined) {
    return {
      status: 'unavailable',
      unavailableLabel: 'Requires roster team',
      overviewTone: null,
    }
  }

  const assessment = getMedicalRiskAssessments(world, team.id).find((entry) => entry.playerId === playerId)
  if (assessment === undefined) {
    return {
      status: 'unavailable',
      unavailableLabel: 'Not on roster',
      overviewTone: null,
    }
  }

  const model = buildMedicalRiskModel(assessment)
  return {
    status: 'available',
    model,
    displayLabel: model.displayLabel,
    overviewTone: medicalRiskOverviewTone(model.riskBand),
  }
}

/** Presentation-only fatigue load bands (not canonical domain thresholds). */
export function fatigueLoadPresentation(value: number): {
  readonly loadLabel: string
  readonly loadTone: MedicalFatigueModel['loadTone']
} {
  if (value >= 70) return { loadLabel: 'High load', loadTone: 'high' }
  if (value >= 40) return { loadLabel: 'Elevated load', loadTone: 'elevated' }
  if (value >= 20) return { loadLabel: 'Moderate load', loadTone: 'moderate' }
  return { loadLabel: 'Low load', loadTone: 'low' }
}

export function calendarDaysBetween(start: GameDate, end: GameDate): number {
  const [startYear, startMonth, startDay] = start.split('-').map(Number)
  const [endYear, endMonth, endDay] = end.split('-').map(Number)
  const startMs = Date.UTC(startYear!, startMonth! - 1, startDay!)
  const endMs = Date.UTC(endYear!, endMonth! - 1, endDay!)
  return Math.round((endMs - startMs) / 86_400_000)
}

export function formatDurationLabel(days: number): string {
  if (days === 1) return '1 day'
  return `${days} days`
}

function playerInjuries(world: GameWorld, playerId: PlayerId): InjuryRecord[] {
  return Object.values(world.injuriesById)
    .filter((injury) => injury.playerId === playerId)
    .sort(
      (left, right) =>
        compareGameDates(right.injuredOn, left.injuredOn) || left.id.localeCompare(right.id),
    )
}

function injuryStatus(injury: InjuryRecord, onDate: GameDate): 'Active' | 'Recovered' {
  return isInjuryActive(injury, onDate) ? 'Active' : 'Recovered'
}

function buildSourceContext(world: GameWorld, injury: InjuryRecord): string | null {
  if (injury.sourceGameId === undefined) return null
  const game = world.games[injury.sourceGameId]
  if (game === undefined) return null
  return `Match · ${formatGameDateLabel(game.date)}`
}

function buildActiveInjuryModel(
  world: GameWorld,
  injury: InjuryRecord,
  onDate: GameDate,
): MedicalActiveInjuryModel {
  return {
    id: injury.id,
    kindLabel: formatInjuryKind(injury.kind),
    severityLabel: SEVERITY_LABELS[injury.severity],
    injuredOnLabel: formatGameDateLabel(injury.injuredOn),
    expectedReturnLabel: formatGameDateLabel(injury.expectedReturnDate),
    daysRemaining: calendarDaysBetween(onDate, injury.expectedReturnDate),
    expectedDurationDays: calendarDaysBetween(injury.injuredOn, injury.expectedReturnDate),
    sourceContext: buildSourceContext(world, injury),
  }
}

function buildRecoveryTimeline(
  injury: InjuryRecord,
  onDate: GameDate,
): readonly MedicalRecoveryTimelineNodeModel[] {
  return [
    {
      id: 'recovery-start',
      dateLabel: formatGameDateLabel(injury.injuredOn),
      label: 'Injury occurred',
      state: 'start',
      markerLabel: null,
    },
    {
      id: 'recovery-current',
      dateLabel: formatGameDateLabel(onDate),
      label: 'Today',
      state: 'current',
      markerLabel: null,
    },
    {
      id: 'recovery-return',
      dateLabel: formatGameDateLabel(injury.expectedReturnDate),
      label: 'Expected return',
      state: 'return',
      markerLabel: null,
    },
  ]
}

function buildHistoryRow(injury: InjuryRecord, onDate: GameDate): MedicalHistoryRowModel {
  const status = injuryStatus(injury, onDate)
  return {
    id: injury.id,
    injuredOnLabel: formatGameDateLabel(injury.injuredOn),
    expectedReturnLabel: formatGameDateLabel(injury.expectedReturnDate),
    injuryLabel: formatInjuryKind(injury.kind),
    statusLabel: status,
    statusTone: status === 'Active' ? 'active' : 'recovered',
    durationLabel: formatDurationLabel(calendarDaysBetween(injury.injuredOn, injury.expectedReturnDate)),
    severityLabel: SEVERITY_LABELS[injury.severity],
  }
}

export function buildPlayerMedicalModel(world: GameWorld, playerId: PlayerId): PlayerMedicalModel {
  const onDate = world.currentDate
  const activeInjury = getActiveInjuryForPlayer(world, playerId, onDate)
  const available = isPlayerAvailable(world, playerId, onDate)
  const fatigueValue = getCareerFatigueForPlayer(world, playerId)
  const fatiguePresentation = fatigueLoadPresentation(fatigueValue)
  const riskPresentation = resolvePlayerMedicalRiskPresentation(world, playerId)
  const injuries = playerInjuries(world, playerId)
  const history = injuries.map((injury) => buildHistoryRow(injury, onDate))

  const availabilityBand: MedicalAvailabilityBandModel = {
    statusLabel: available ? 'Available' : 'Injured',
    statusTone: available ? 'available' : 'injured',
    summary: available
      ? null
      : activeInjury === undefined
        ? null
        : `Expected return · ${formatGameDateLabel(activeInjury.expectedReturnDate)}`,
    currentDateLabel: formatGameDateLabel(onDate),
    limitationLabel:
      activeInjury === undefined
        ? null
        : `${formatInjuryKind(activeInjury.kind)} · ${SEVERITY_LABELS[activeInjury.severity]}`,
  }

  return {
    availabilityBand,
    fatigue: {
      value: fatigueValue,
      dailyRecoveryRate: CAREER_FATIGUE_DAILY_RECOVERY,
      loadLabel: fatiguePresentation.loadLabel,
      loadTone: fatiguePresentation.loadTone,
    },
    risk: riskPresentation.status === 'available' ? riskPresentation.model ?? null : null,
    riskUnavailableLabel:
      riskPresentation.status === 'unavailable' ? riskPresentation.unavailableLabel ?? null : null,
    activeInjury: activeInjury === undefined ? null : buildActiveInjuryModel(world, activeInjury, onDate),
    recoveryTimeline: activeInjury === undefined ? [] : buildRecoveryTimeline(activeInjury, onDate),
    history,
    historyEmptyMessage: history.length === 0 ? 'No recorded injuries' : null,
    defaultSelectedEventId: activeInjury?.id ?? history[0]?.id ?? null,
  }
}

export function findMedicalInspectorDetail(
  model: PlayerMedicalModel,
  selectedEventId: InjuryId | null,
): MedicalInspectorInjuryDetail | undefined {
  if (selectedEventId === null) return undefined

  const injuryRow = model.history.find((entry) => entry.id === selectedEventId)
  if (injuryRow === undefined) return undefined

  const active = model.activeInjury?.id === selectedEventId
  const daysRemaining =
    active && model.activeInjury !== null
      ? formatDurationLabel(model.activeInjury.daysRemaining)
      : null

  return {
    kind: 'injury',
    injuryLabel: injuryRow.injuryLabel,
    severityLabel: injuryRow.severityLabel,
    statusLabel: injuryRow.statusLabel,
    injuredOnLabel: injuryRow.injuredOnLabel,
    expectedReturnLabel: injuryRow.expectedReturnLabel,
    durationLabel: injuryRow.durationLabel,
    daysRemainingLabel: daysRemaining,
    availabilityImpact:
      injuryRow.statusLabel === 'Active'
        ? 'Unavailable for match selection'
        : 'No current availability restriction',
  }
}
