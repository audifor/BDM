import { compareGameDates, type GameDate } from '@/domain/date'
import { CAREER_FATIGUE_DAILY_RECOVERY } from '@/domain/careerFatigue/CareerFatigue'
import {
  formatInjuryKind,
  isInjuryActive,
  type InjuryKind,
  type InjuryRecord,
  type InjurySeverity,
} from '@/domain/injury'
import type { InjuryId, PlayerId } from '@/domain/ids'
import {
  getActiveInjuryForPlayer,
  getCareerFatigueForPlayer,
  getPlayerRosterTeamId,
  isPlayerAvailable,
  type GameWorld,
} from '@/domain/world'
import { dailyScheduledLoad } from '@/engine/training'
import {
  getMedicalRiskAssessments,
  type MedicalRiskBand,
} from '@/engine/injury/MedicalRiskAssessment'
import { getPlayerGameLogs } from '@/engine/stats/PlayerHistory'

import { findTeamForPlayer, formatGameDateLabel } from './presentationHelpers'
import type { OverviewGapModel, PresentationAvailability } from './playerWorkspaceModel'

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

/** A single readiness instrument. `fill` is only set when the value really is a 0-100 share. */
export interface MedicalReadinessMeterModel {
  readonly id: string
  readonly label: string
  readonly fill: number | null
  readonly valueLabel: string
  readonly bandLabel: string
  readonly tone: 'good' | 'moderate' | 'elevated' | 'high' | 'neutral'
}

/**
 * One window of real workload. Match minutes and programme load are kept apart: they are recorded
 * in different units, so they are reported side by side instead of being summed into a fake total.
 */
export interface MedicalLoadWindowModel {
  readonly id: string
  readonly label: string
  readonly matchMinutes: number
  readonly matches: number
  readonly sessionCount: number
  readonly programmeLoad: number
  /** Per-day change against the 30-day baseline, as a signed percentage. */
  readonly changeLabel: string | null
}

export interface MedicalInjuryPatternRowModel {
  readonly id: string
  readonly kindLabel: string
  readonly occurrences: number
  readonly daysLost: number
  readonly lastLabel: string
}

export interface MedicalInjuryPatternModel {
  readonly status: PresentationAvailability
  readonly windowLabel: string
  readonly rows: readonly MedicalInjuryPatternRowModel[]
  readonly summary: string
}

/** Anatomical regions the body map draws. The right side is the player's own right. */
export type MedicalBodyRegionId =
  | 'head'
  | 'neck'
  | 'shoulder-r'
  | 'shoulder-l'
  | 'arm-r'
  | 'arm-l'
  | 'core'
  | 'hip-r'
  | 'hip-l'
  | 'knee-r'
  | 'knee-l'
  | 'ankle-r'
  | 'ankle-l'

/** One region of the body map, in the state the recorded injuries put it in. */
export interface MedicalBodyRegionModel {
  readonly id: MedicalBodyRegionId
  readonly label: string
  /** Label column the board draws it in, left being the player's right side. */
  readonly column: 'left' | 'right'
  readonly status: 'healthy' | 'attention'
  readonly statusLabel: string
  readonly detail: string
}

export interface MedicalDetailRowModel {
  readonly label: string
  readonly value: string
  readonly tone: 'positive' | 'neutral' | 'caution'
}

/** The reference's medical detail panel: one overall status plus the readings under it. */
export interface MedicalDetailModel {
  readonly statusLabel: string
  readonly statusTone: 'positive' | 'caution'
  readonly statusDetail: string
  readonly rows: readonly MedicalDetailRowModel[]
}

/** One readiness milestone of the reference's recovery timeline. */
export interface MedicalRecoveryMilestoneModel {
  readonly id: string
  readonly label: string
  readonly stateLabel: string
  readonly tone: 'positive' | 'caution' | 'neutral'
  readonly note: string | null
}

export interface PlayerMedicalModel {
  readonly availabilityBand: MedicalAvailabilityBandModel
  readonly fatigue: MedicalFatigueModel
  readonly risk: MedicalRiskModel | null
  readonly riskUnavailableLabel: string | null
  readonly activeInjury: MedicalActiveInjuryModel | null
  readonly recoveryTimeline: readonly MedicalRecoveryTimelineNodeModel[]
  readonly recoveryMilestones: readonly MedicalRecoveryMilestoneModel[]
  readonly history: readonly MedicalHistoryRowModel[]
  readonly historyEmptyMessage: string | null
  readonly defaultSelectedEventId: InjuryId | null
  /** Fatigue, risk, match minutes, programme load and the daily recovery rate. */
  readonly readiness: readonly MedicalReadinessMeterModel[]
  readonly loadWindows: readonly MedicalLoadWindowModel[]
  readonly loadNote: string
  readonly injuryPattern: MedicalInjuryPatternModel
  readonly bodyRegions: readonly MedicalBodyRegionModel[]
  readonly detail: MedicalDetailModel
  readonly gaps: readonly OverviewGapModel[]
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

/** The load windows the medical page reports, in days. */
const LOAD_WINDOWS = [7, 14, 30] as const

const LOAD_NOTE =
  'Match minutes come from the tracked game log; programme load is the canonical daily workload score of the team sessions booked in that window. They are different units, so no single total is summed.'

/**
 * Real workload for the recent windows: minutes actually played and the programme the player's team
 * has booked. Nothing here is extrapolated beyond the recorded calendar.
 */
function buildLoadWindows(
  world: GameWorld,
  playerId: PlayerId,
  onDate: GameDate,
): readonly MedicalLoadWindowModel[] {
  const teamId = getPlayerRosterTeamId(world, playerId)
  const logs = getPlayerGameLogs(world, playerId)
  const sessions =
    teamId === undefined
      ? []
      : Object.values(world.scheduledTrainingSessionsById).filter(
          (session) => session.teamId === teamId,
        )

  const within = (date: GameDate, days: number) => {
    const difference = calendarDaysBetween(date, onDate)
    return difference >= 0 && difference < days
  }

  const windows = LOAD_WINDOWS.map((days) => {
    const windowLogs = logs.filter((line) => within(line.gameDate, days))
    const windowSessions = sessions.filter((session) => within(session.date, days))
    return {
      days,
      matchMinutes: Math.round(
        windowLogs.reduce((total, line) => total + line.stats.secondsPlayed, 0) / 60,
      ),
      matches: windowLogs.length,
      sessionCount: windowSessions.length,
      programmeLoad: Math.round(
        windowSessions.reduce(
          (total, session) =>
            total + dailyScheduledLoad(world, session.teamId, session.date),
          0,
        ),
      ),
    }
  })

  // The change is expressed as minutes per day so windows of different length stay comparable.
  const longest = windows[windows.length - 1]
  return windows.map((window, index) => {
    const baseline =
      longest === undefined || longest.matchMinutes === 0
        ? null
        : longest.matchMinutes / longest.days
    const perDay = window.matchMinutes / window.days
    const isBaseline = index === windows.length - 1
    const difference = baseline === null ? null : perDay - baseline
    return {
      id: `${window.days}d`,
      label: `${window.days}D`,
      matchMinutes: window.matchMinutes,
      matches: window.matches,
      sessionCount: window.sessionCount,
      programmeLoad: window.programmeLoad,
      changeLabel: isBaseline
        ? 'Baseline'
        : difference === null
          ? null
          : `${difference > 0 ? '+' : ''}${difference.toFixed(1)} min/day`,
    }
  })
}

/**
 * Injury pattern over the two most recent seasons, from the recorded injuries only. A player with
 * no records says so rather than being credited with durability.
 */
function buildInjuryPattern(
  world: GameWorld,
  injuries: readonly InjuryRecord[],
  onDate: GameDate,
): MedicalInjuryPatternModel {
  // Only seasons that have already started count, so a pre-season date cannot push the window into
  // the future and hide the current season's injuries.
  const starts = Object.values(world.seasons)
    .map((season) => season.startDate)
    .filter((startDate) => startDate <= onDate)
    .sort((left, right) => right.localeCompare(left))
  const cutoff = starts[1] ?? starts[0]
  const windowLabel = cutoff === undefined ? 'All recorded seasons' : 'Last 2 seasons'

  const inWindow =
    cutoff === undefined ? injuries : injuries.filter((record) => record.injuredOn >= cutoff)

  if (inWindow.length === 0) {
    return {
      status: 'unavailable',
      windowLabel,
      rows: [],
      summary:
        injuries.length === 0
          ? 'No injury has been recorded for this player, so no pattern can be established.'
          : `No injury in the ${windowLabel.toLowerCase()}, so no current pattern can be established.`,
    }
  }

  const byKind = new Map<string, MedicalInjuryPatternRowModel>()
  for (const record of inWindow) {
    // Injuries are recorded without a return date, so the expected return is the only duration
    // available and the window is stated instead of being guessed.
    const daysLost = Math.max(0, calendarDaysBetween(record.injuredOn, record.expectedReturnDate))
    const current = byKind.get(record.kind)
    byKind.set(record.kind, {
      id: record.kind,
      kindLabel: formatInjuryKind(record.kind),
      occurrences: (current?.occurrences ?? 0) + 1,
      daysLost: (current?.daysLost ?? 0) + daysLost,
      lastLabel: formatGameDateLabel(record.injuredOn),
    })
  }

  const rows = [...byKind.values()].sort(
    (left, right) =>
      right.occurrences - left.occurrences || right.daysLost - left.daysLost ||
      left.kindLabel.localeCompare(right.kindLabel),
  )
  const recurring = rows.find((row) => row.occurrences > 1)

  return {
    status: 'available',
    windowLabel,
    rows,
    summary:
      recurring === undefined
        ? `${inWindow.length} recorded ${inWindow.length === 1 ? 'injury' : 'injuries'}, none repeated: no recurring pattern.`
        : `${recurring.kindLabel} repeated ${recurring.occurrences} times for ${recurring.daysLost} days lost in total.`,
  }
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
  const loadWindows = buildLoadWindows(world, playerId, onDate)
  const injuryPattern = buildInjuryPattern(world, injuries, onDate)

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
    readiness: buildReadiness(world, playerId, fatigueValue, fatiguePresentation.loadTone, riskPresentation),
    loadWindows,
    loadNote: LOAD_NOTE,
    injuryPattern,
    bodyRegions: buildBodyRegions(injuries, onDate),
    detail: buildMedicalDetail(world, playerId, injuries, riskPresentation),
    recoveryMilestones: buildRecoveryMilestones(world, playerId, injuries, injuryPattern),
    gaps: buildMedicalGaps(),
  }
}

/**
 * The five instruments the reference shows. Only two of them (fatigue and injury risk) exist as
 * shares; the workload ones report the real units, and the recovery one reports the daily rate.
 */
function buildReadiness(
  world: GameWorld,
  playerId: PlayerId,
  fatigue: number,
  fatigueTone: MedicalFatigueModel['loadTone'],
  risk: PlayerMedicalRiskPresentation,
): readonly MedicalReadinessMeterModel[] {
  const onDate = world.currentDate
  const windows = buildLoadWindows(world, playerId, onDate)
  const week = windows[0]
  const riskModel = risk.status === 'available' ? risk.model : undefined
  // Each workload bar is the window measured against the busiest of the three: the same reading,
  // in the same unit, so no two units are ever added together.
  const peakMatch = Math.max(1, ...windows.map((window) => window.matchMinutes))
  const peakProgramme = Math.max(1, ...windows.map((window) => window.programmeLoad))
  const shareOfPeak = (value: number, peak: number) => Math.round((value / peak) * 100)

  const loadTone = (value: number): MedicalReadinessMeterModel['tone'] =>
    value >= 70 ? 'high' : value >= 40 ? 'elevated' : 'good'

  const fatigueToneValue: MedicalReadinessMeterModel['tone'] =
    fatigueTone === 'low'
      ? 'good'
      : fatigueTone === 'moderate'
        ? 'moderate'
        : fatigueTone === 'elevated'
          ? 'elevated'
          : 'high'

  return [
    {
      id: 'fatigue',
      label: 'Fatigue',
      fill: fatigue,
      valueLabel: `${fatigue}%`,
      bandLabel: fatigueTone === 'low' ? 'Very fresh' : fatigueTone === 'moderate' ? 'Moderate' : 'High',
      tone: fatigueToneValue,
    },
    {
      id: 'match-load',
      label: 'Match load (7D)',
      fill: week === undefined ? null : shareOfPeak(week.matchMinutes, peakMatch),
      valueLabel: week === undefined ? '0 min' : `${week.matchMinutes} min`,
      bandLabel:
        week === undefined || week.matches === 0
          ? 'No game in the window'
          : `${week.matches} ${week.matches === 1 ? 'game' : 'games'} · ${shareOfPeak(week.matchMinutes, peakMatch)}% of the busiest window`,
      tone: 'neutral',
    },
    {
      id: 'training-load',
      label: 'Programme load (7D)',
      fill: week === undefined ? null : shareOfPeak(week.programmeLoad, peakProgramme),
      valueLabel: week === undefined ? '0' : String(week.programmeLoad),
      bandLabel:
        week === undefined
          ? 'No session booked'
          : `${week.sessionCount} ${week.sessionCount === 1 ? 'session' : 'sessions'} · ${shareOfPeak(week.programmeLoad, peakProgramme)}% of the busiest window`,
      tone: week === undefined ? 'neutral' : loadTone(week.programmeLoad),
    },
    {
      id: 'recovery',
      label: 'Daily recovery',
      fill: null,
      valueLabel: `-${CAREER_FATIGUE_DAILY_RECOVERY}`,
      bandLabel: 'Fatigue points recovered per day',
      tone: 'neutral',
    },
    {
      id: 'injury-risk',
      label: 'Injury risk',
      fill: riskModel === undefined ? null : riskModel.riskScore,
      valueLabel: riskModel === undefined ? risk.unavailableLabel ?? '—' : `${riskModel.riskScore}`,
      bandLabel: riskModel === undefined ? 'Not tracked' : riskModel.riskBandLabel,
      tone:
        riskModel === undefined
          ? 'neutral'
          : riskModel.riskBand === 'low'
            ? 'good'
            : riskModel.riskBand === 'elevated'
              ? 'elevated'
              : 'high',
    },  ]
}

/**
 * Regions of the body map, each tied to the injury kinds that can land on it. The save records the
 * kind but never the side, so a limb kind marks both sides and says so instead of guessing.
 */
const BODY_REGIONS: readonly {
  readonly id: MedicalBodyRegionId
  readonly label: string
  readonly column: 'left' | 'right'
  readonly kinds: readonly InjuryKind[]
}[] = [
  { id: 'head', label: 'Head', column: 'left', kinds: [] },
  { id: 'neck', label: 'Neck', column: 'right', kinds: [] },
  { id: 'shoulder-r', label: 'Shoulder (R)', column: 'left', kinds: ['shoulderStrain'] },
  { id: 'shoulder-l', label: 'Shoulder (L)', column: 'right', kinds: ['shoulderStrain'] },
  { id: 'arm-r', label: 'Arm (R)', column: 'left', kinds: ['handInjury'] },
  { id: 'arm-l', label: 'Arm (L)', column: 'right', kinds: ['handInjury'] },
  { id: 'core', label: 'Core', column: 'right', kinds: ['backStrain'] },
  { id: 'hip-r', label: 'Hip (R)', column: 'left', kinds: ['hamstringStrain'] },
  { id: 'hip-l', label: 'Hip (L)', column: 'right', kinds: ['hamstringStrain'] },
  { id: 'knee-r', label: 'Knee (R)', column: 'left', kinds: ['kneeSprain'] },
  { id: 'knee-l', label: 'Knee (L)', column: 'right', kinds: ['kneeSprain'] },
  { id: 'ankle-r', label: 'Ankle (R)', column: 'left', kinds: ['ankleSprain'] },
  { id: 'ankle-l', label: 'Ankle (L)', column: 'right', kinds: ['ankleSprain'] },
]

/**
 * The body map, derived from the recorded injuries by kind. A region with no matching active
 * injury is healthy; a matching one carries the injury and its return date.
 */
function buildBodyRegions(
  injuries: readonly InjuryRecord[],
  onDate: GameDate,
): readonly MedicalBodyRegionModel[] {
  const active = injuries.filter((injury) => isInjuryActive(injury, onDate))

  return BODY_REGIONS.map((region) => {
    const match = active.find((injury) => region.kinds.includes(injury.kind))
    if (match === undefined) {
      return {
        id: region.id,
        label: region.label,
        column: region.column,
        status: 'healthy',
        statusLabel: 'Healthy',
        detail: 'No active issue recorded for this region.',
      }
    }

    return {
      id: region.id,
      label: region.label,
      column: region.column,
      status: 'attention',
      statusLabel: formatInjuryKind(match.kind),
      detail: `Recorded ${formatGameDateLabel(match.injuredOn)} · expected return ${formatGameDateLabel(match.expectedReturnDate)} (${SEVERITY_LABELS[match.severity].toLowerCase()}). The save does not record the side, so both sides are marked.`,
    }
  })
}

/** The reference's detail panel: overall status plus the readings underneath it. */
function buildMedicalDetail(
  world: GameWorld,
  playerId: PlayerId,
  injuries: readonly InjuryRecord[],
  risk: PlayerMedicalRiskPresentation,
): MedicalDetailModel {
  const onDate = world.currentDate
  const active = injuries.find((injury) => isInjuryActive(injury, onDate))
  const available = isPlayerAvailable(world, playerId)
  const past = injuries
    .filter((injury) => !isInjuryActive(injury, onDate))
    .sort((left, right) => right.expectedReturnDate.localeCompare(left.expectedReturnDate))
  const last = past[0]
  const daysSinceLast =
    last === undefined ? null : calendarDaysBetween(last.expectedReturnDate, onDate)
  const injuryRisk =
    risk.status === 'available' ? (risk.displayLabel ?? '—') : (risk.unavailableLabel ?? '—')

  return {
    statusLabel: available ? 'Fully healthy' : 'Unavailable',
    statusTone: available ? 'positive' : 'caution',
    statusDetail: available
      ? 'No current issues. Player is fit and available for all team activities.'
      : active === undefined
        ? 'The player is not selectable, but no injury record explains why.'
        : `${formatInjuryKind(active.kind)} until ${formatGameDateLabel(active.expectedReturnDate)}.`,
    rows: [
      { label: 'Injury risk', value: injuryRisk, tone: 'neutral' },
      {
        label: 'Recovery status',
        value:
          active === undefined
            ? 'Not applicable'
            : `${formatDurationLabel(calendarDaysBetween(onDate, active.expectedReturnDate))} to return`,
        tone: active === undefined ? 'neutral' : 'caution',
      },
      { label: 'Last issue', value: last === undefined ? 'None' : formatInjuryKind(last.kind), tone: 'neutral' },
      {
        label: 'Days since last issue',
        value: daysSinceLast === null ? '—' : String(daysSinceLast),
        tone: 'neutral',
      },
      { label: 'Treatment', value: 'Not tracked', tone: 'neutral' },
      { label: 'Restrictions', value: available ? 'None recorded' : 'Not available for selection', tone: available ? 'neutral' : 'caution' },
      { label: 'Availability', value: available ? 'Full' : 'Out', tone: available ? 'positive' : 'caution' },
    ],
  }
}

/**
 * The reference's readiness milestones. Each one is a real state: availability, the active injury
 * and the recorded injury load of the season. Nothing is promised beyond what the save knows.
 */
function buildRecoveryMilestones(
  world: GameWorld,
  playerId: PlayerId,
  injuries: readonly InjuryRecord[],
  pattern: MedicalInjuryPatternModel,
): readonly MedicalRecoveryMilestoneModel[] {
  const onDate = world.currentDate
  const active = injuries.find((injury) => isInjuryActive(injury, onDate))
  const available = isPlayerAvailable(world, playerId)
  const returnLabel = active === undefined ? null : formatGameDateLabel(active.expectedReturnDate)
  const recurrence = pattern.rows.length > 0

  return [
    {
      id: 'training',
      label: 'Training',
      stateLabel: available ? 'Full' : 'Restricted',
      tone: available ? 'positive' : 'caution',
      note: available ? null : 'Load is managed until the medical staff clear the player.',
    },
    {
      id: 'match-play',
      label: 'Match play',
      stateLabel: available ? 'Full' : 'Unavailable',
      tone: available ? 'positive' : 'caution',
      note: null,
    },
    {
      id: 'next-game',
      label: 'Next game',
      stateLabel: available ? 'Available' : 'Out',
      tone: available ? 'positive' : 'caution',
      note: returnLabel === null ? null : `Expected return ${returnLabel}.`,
    },
    {
      id: 'season',
      label: 'Season',
      stateLabel: active === undefined ? 'On track' : 'Interrupted',
      tone: active === undefined ? 'positive' : 'caution',
      note: recurrence ? pattern.summary : null,
    },
  ]
}

/**
 * Reference elements this page cannot produce yet. The body map is built from the recorded injury
 * kinds, and the recovery readiness score does not exist in the engine.
 */
function buildMedicalGaps(): readonly OverviewGapModel[] {
  return [
    {
      id: 'recovery-readiness',
      label: 'Recovery readiness %',
      reason: 'The engine tracks a daily fatigue recovery rate, not a readiness score out of 100.',
    },
    {
      id: 'load-index',
      label: 'Total load index',
      reason: 'Match minutes and programme load use different units, so they are never summed.',
    },
    {
      id: 'treatment',
      label: 'Treatment & restrictions',
      reason: 'Treatment plans and playing restrictions are not part of the persisted world.',
    },
    {
      id: 'staff-notes',
      label: 'Medical staff notes',
      reason: 'Authored copy: no department writes free text into the save.',
    },
  ]
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
