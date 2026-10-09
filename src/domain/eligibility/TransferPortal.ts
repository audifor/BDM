import { addDays, compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import type { EcosystemId, PlayerId, TeamId } from '@/domain/ids'

export type TransferRulesProvenance = 'OFFICIAL_SOURCE' | 'SIMULATED_CARRY_FORWARD'
export type TransferPortalException = 'HEAD_COACH_CHANGE' | 'NO_NEW_HEAD_COACH_AFTER_30_DAYS' | 'ATHLETICS_AID_CHANGE' | 'POSTGRADUATE'

/** Effective-dated transfer rules. Simulated seasons retain their authority and source explicitly. */
export interface TransferPortalRuleset {
  readonly id: string
  readonly version: string
  readonly ecosystemId: EcosystemId
  readonly effectiveFrom: GameDate
  readonly effectiveTo?: GameDate
  readonly provenance: TransferRulesProvenance
  readonly basedOnRulesetId?: string
  readonly sourceUrl?: string
  readonly basketballNotificationDays: 15
  readonly institutionProcessingBusinessDays: 2
  readonly headCoachDelayDays: 5
  readonly aidChangeNotificationDays: 30
}

export interface TransferPortalEntry {
  readonly id: string
  readonly playerId: PlayerId
  readonly sourceTeamId: TeamId
  readonly ecosystemId: EcosystemId
  readonly rulesetId: string
  readonly notifiedOn: GameDate
  readonly educationalModuleCompletedOn?: GameDate
  readonly processedOn?: GameDate
  readonly processingDueOn?: GameDate
  readonly exception?: TransferPortalException
  readonly status: 'noticePending' | 'authorized' | 'withdrawn' | 'completed'
  readonly destinationTeamId?: TeamId
  /** The completed Portal entry is also the canonical, save-backed movement event. */
  readonly movement?: {
    readonly playerId: PlayerId
    readonly sourceTeamId: TeamId
    readonly destinationTeamId: TeamId
    readonly sourceEnrollmentId: string
    readonly destinationEnrollmentId: string
    readonly formalSigningId: string
    readonly transferredOn: GameDate
    readonly eligibilityAssessmentId: string
    readonly authority: 'AUTHORIZED_PORTAL_ENTRY'
    readonly rulesetId: string
    readonly rulesetProvenance: TransferRulesProvenance
  }
}

export interface TransferPortalWindow { readonly opensOn: GameDate; readonly closesOn: GameDate }

export function createTransferPortalRuleset(value: TransferPortalRuleset): TransferPortalRuleset {
  if (!value.id.trim() || !value.version.trim() || !value.ecosystemId || !value.provenance) throw new TypeError('Transfer ruleset identity and provenance are required')
  parseGameDate(value.effectiveFrom)
  if (value.effectiveTo !== undefined && compareGameDates(value.effectiveTo, value.effectiveFrom) < 0) throw new RangeError('Transfer ruleset effective interval is invalid')
  if (value.basketballNotificationDays !== 15 || value.institutionProcessingBusinessDays !== 2 || value.headCoachDelayDays !== 5 || value.aidChangeNotificationDays !== 30) throw new RangeError('Basketball transfer timing does not match the ruleset')
  if (value.provenance === 'SIMULATED_CARRY_FORWARD' && !value.basedOnRulesetId) throw new TypeError('Simulated carry-forward must cite a base ruleset')
  if (value.provenance === 'OFFICIAL_SOURCE' && !value.sourceUrl) throw new TypeError('Official transfer rules require a source URL')
  return Object.freeze({ ...value })
}

export function createTransferPortalEntry(value: TransferPortalEntry): TransferPortalEntry {
  if (!value.id.trim() || !value.playerId || !value.sourceTeamId || !value.ecosystemId || !value.rulesetId.trim()) throw new TypeError('Transfer Portal entry identity is invalid')
  for (const date of [value.notifiedOn, value.educationalModuleCompletedOn, value.processedOn, value.processingDueOn]) if (date !== undefined) parseGameDate(date)
  if (value.processedOn !== undefined && value.educationalModuleCompletedOn === undefined) throw new TypeError('Portal processing requires the educational module')
  if (value.status === 'authorized' && (value.processedOn === undefined || value.educationalModuleCompletedOn === undefined)) throw new TypeError('Authorized Portal entry requires processing and module completion')
  if (value.status === 'completed' && value.destinationTeamId === undefined) throw new TypeError('Completed transfer requires a destination')
  if (value.movement !== undefined && (value.status !== 'completed' || value.movement.playerId !== value.playerId || value.movement.sourceTeamId !== value.sourceTeamId || value.movement.destinationTeamId !== value.destinationTeamId || value.movement.authority !== 'AUTHORIZED_PORTAL_ENTRY')) throw new TypeError('Transfer movement does not match its Portal entry')
  return Object.freeze({ ...value })
}

/** The ordinary undergraduate basketball period starts the day after the actual championship final. */
export function basketballTransferWindow(championshipFinalDate: GameDate, ruleset: TransferPortalRuleset): TransferPortalWindow {
  const opensOn = addDays(championshipFinalDate, 1)
  return Object.freeze({ opensOn, closesOn: addDays(opensOn, ruleset.basketballNotificationDays - 1) })
}

export function isWithinTransferWindow(date: GameDate, window: TransferPortalWindow): boolean {
  return compareGameDates(date, window.opensOn) >= 0 && compareGameDates(date, window.closesOn) <= 0
}

/** Head-coach exception: announcement after the final through Dec. 27, starts five days later, capped Jan. 2. */
export function headCoachChangeTransferWindow(championshipFinalDate: GameDate, announcedOn: GameDate, ruleset: TransferPortalRuleset): TransferPortalWindow | undefined {
  const firstAllowed = addDays(championshipFinalDate, 1)
  const announcementCutoff = `${championshipFinalDate.slice(0, 4)}-12-27` as GameDate
  if (compareGameDates(announcedOn, firstAllowed) < 0 || compareGameDates(announcedOn, announcementCutoff) > 0) return undefined
  const opensOn = addDays(announcedOn, ruleset.headCoachDelayDays)
  const jan2 = `${Number(championshipFinalDate.slice(0, 4)) + 1}-01-02` as GameDate
  const ordinaryClose = addDays(opensOn, ruleset.basketballNotificationDays - 1)
  const closesOn = compareGameDates(ordinaryClose, jan2) > 0 ? jan2 : ordinaryClose
  return compareGameDates(opensOn, closesOn) > 0 ? undefined : Object.freeze({ opensOn, closesOn })
}

/** The no-replacement exception begins on day 31 after departure and must open before Jan. 2. */
export function noNewHeadCoachTransferWindow(championshipFinalDate: GameDate, departedOn: GameDate, ruleset: TransferPortalRuleset, newHeadCoachOn?: GameDate): TransferPortalWindow | undefined {
  const day31 = addDays(departedOn, 31)
  const firstAllowed = addDays(championshipFinalDate, 1)
  const jan2 = `${Number(championshipFinalDate.slice(0, 4)) + 1}-01-02` as GameDate
  if (newHeadCoachOn !== undefined && compareGameDates(newHeadCoachOn, addDays(departedOn, 30)) <= 0) return undefined
  if (compareGameDates(day31, firstAllowed) < 0 || compareGameDates(day31, jan2) >= 0) return undefined
  const ordinaryClose = addDays(day31, ruleset.basketballNotificationDays - 1)
  const closesOn = compareGameDates(ordinaryClose, jan2) > 0 ? jan2 : ordinaryClose
  return Object.freeze({ opensOn: day31, closesOn })
}

/** Qualifying post-award aid changes open their own 30-day initiation window. */
export function athleticsAidChangeTransferWindow(changedOn: GameDate, ruleset: TransferPortalRuleset): TransferPortalWindow {
  const opensOn = addDays(changedOn, 1)
  return Object.freeze({ opensOn, closesOn: addDays(opensOn, ruleset.aidChangeNotificationDays - 1) })
}

/** Postgraduate basketball notification begins Oct. 1 and runs through the final sport period. */
export function postgraduateTransferWindow(seasonYear: number, finalPeriod: TransferPortalWindow): TransferPortalWindow {
  const oct1 = `${seasonYear}-10-01` as GameDate
  return Object.freeze({ opensOn: oct1, closesOn: compareGameDates(finalPeriod.closesOn, oct1) < 0 ? oct1 : finalPeriod.closesOn })
}

/** Counts Monday-Friday processing days; NCAA's two-business-day clock excludes weekends. */
export function addBusinessDays(date: GameDate, count: number): GameDate {
  if (!Number.isInteger(count) || count < 0) throw new RangeError('Business-day count must be a non-negative integer')
  let result = date
  let remaining = count
  while (remaining > 0) {
    result = addDays(result, 1)
    const day = new Date(`${result}T00:00:00Z`).getUTCDay()
    if (day !== 0 && day !== 6) remaining -= 1
  }
  return result
}
