import { calculateStaffWorkload, getStaffAssignment, type GameWorld } from '@/domain/world'
import {
  classifyWorkloadBand,
  createStaffHumanEvent,
  SYSTEMIC_ATTRIBUTION,
  type StaffHumanContext,
  type StaffHumanEvent,
  type StaffHumanEventKind,
  type StaffHumanEventImportance,
  type StaffWorkloadBand,
} from '@/domain/staffHumanState'
import { applyStaffHumanEventsBatch } from '@/engine/staff/StaffHumanReactionEngine'

/**
 * Wave 5A §18 — sustained workload signals require DURATION, not a single day's snapshot. Rather
 * than persisting a new "days in band" counter on `StaffHumanContext`, this module derives
 * sustained-ness from the weekly cadence itself: it only runs on the same weekly checkpoint as
 * `runWeeklyAppraisal` and looks at whether the PREVIOUS reaction record for this Staff/context
 * already reported the same band via its own event payload — i.e. two consecutive weekly
 * checkpoints in the same band is what "sustained" means here. Never Math.random(), never a
 * hidden counter field.
 *
 * §36 performance: builds every checkpoint's `StaffHumanEvent` first, then commits the whole
 * week's worth in ONE `applyStaffHumanEventsBatch` call — never one `updateGameWorld`-validating
 * write per Staff person, which is O(staff × world size) if looped naively.
 */
const WORKLOAD_EVENT_KIND_BY_BAND: Readonly<Record<StaffWorkloadBand, StaffHumanEventKind>> = {
  UNDERUTILIZED: 'sustainedUnderutilization',
  HEALTHY: 'sustainedHealthyWorkload',
  HEAVY: 'sustainedHeavyWorkload',
  OVERLOADED: 'sustainedOverload',
}

const WORKLOAD_BAND_PAYLOAD_KEY = 'band'

export function emitWorkloadTransitionEvents(world: GameWorld): GameWorld {
  if (isoWeekday(world.currentDate) !== 1) return world // same weekly checkpoint as appraisal — see module doc comment

  const events: StaffHumanEvent[] = []
  for (const context of Object.values(world.staffHumanContextsById)) {
    if (context.endedOn !== undefined) continue
    const assignment = getStaffAssignment(world, context.staffId)
    if (assignment === undefined || assignment.teamId !== context.teamId) continue

    const band = classifyWorkloadBand(calculateStaffWorkload(world, context.staffId).utilization)
    const previousBand = lastRecordedBand(world, context)

    if (previousBand === 'OVERLOADED' && band !== 'OVERLOADED') events.push(buildReliefEvent(world, context))
    // Always record this week's checkpoint (via a sustained* event whose importance reflects
    // whether the band actually repeated from last week) — this is both the signal AND the memory
    // of "what band was recorded last week" that the NEXT weekly call reads back.
    events.push(buildSustainedEvent(world, context, band, previousBand === band))
  }
  return applyStaffHumanEventsBatch(world, events)
}

/** Reads the band recorded by the most recent weekly workload checkpoint reaction for this context — never a new persisted field, purely a query over existing `StaffReactionRecord` history. */
function lastRecordedBand(world: GameWorld, context: StaffHumanContext): StaffWorkloadBand | undefined {
  const checkpoints = Object.values(world.staffReactionRecordsById)
    .filter((record) => record.contextId === context.id && record.sourceEventId.startsWith(checkpointSourceId(context)))
    .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.id.localeCompare(a.id))
  const latest = checkpoints[0]
  if (latest === undefined) return undefined
  return latest.eventKind === 'workloadRelief' ? undefined : bandFromEventKind(latest.eventKind)
}

function bandFromEventKind(kind: StaffHumanEventKind): StaffWorkloadBand | undefined {
  const entry = Object.entries(WORKLOAD_EVENT_KIND_BY_BAND).find(([, eventKind]) => eventKind === kind)
  return entry?.[0] as StaffWorkloadBand | undefined
}

/** Stable per-week checkpoint identity so re-processing the same week never double-emits. */
function checkpointSourceId(context: StaffHumanContext): string {
  return `workload-checkpoint:${context.id}`
}

/** First week in a band is ROUTINE (mere checkpoint, negligible effect); a REPEATED week in the same band is the actual "sustained" signal and scales by how demanding the band is. */
function buildSustainedEvent(world: GameWorld, context: StaffHumanContext, band: StaffWorkloadBand, isRepeat: boolean): StaffHumanEvent {
  const kind = WORKLOAD_EVENT_KIND_BY_BAND[band]
  const sourceEventId = `${checkpointSourceId(context)}:${world.currentDate}`
  const importance: StaffHumanEventImportance = !isRepeat ? 'ROUTINE' : band === 'OVERLOADED' ? 'IMPORTANT' : band === 'UNDERUTILIZED' || band === 'HEAVY' ? 'MEANINGFUL' : 'ROUTINE'
  return createStaffHumanEvent({
    id: `event:${sourceEventId}:${kind}`,
    kind,
    staffId: context.staffId,
    contextId: context.id,
    occurredOn: world.currentDate,
    importance,
    sourceEventId,
    attribution: SYSTEMIC_ATTRIBUTION,
    payload: { [WORKLOAD_BAND_PAYLOAD_KEY]: band },
  })
}

function buildReliefEvent(world: GameWorld, context: StaffHumanContext): StaffHumanEvent {
  const sourceEventId = `${checkpointSourceId(context)}:${world.currentDate}:relief`
  return createStaffHumanEvent({
    id: `event:${sourceEventId}:workloadRelief`,
    kind: 'workloadRelief',
    staffId: context.staffId,
    contextId: context.id,
    occurredOn: world.currentDate,
    importance: 'ROUTINE',
    sourceEventId,
    attribution: SYSTEMIC_ATTRIBUTION,
    payload: {},
  })
}

function isoWeekday(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  const weekday = new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay()
  return weekday === 0 ? 7 : weekday
}
