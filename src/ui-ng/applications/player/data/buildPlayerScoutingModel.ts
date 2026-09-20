import { organizationIdForTeam, type PlayerId, type StaffPersonId } from '@/domain/ids'
import {
  formatRatingEvaluation,
  getOrganizationRatingEvaluation,
  type RatingEvaluation,
} from '@/domain/intelligence/OrganizationPlayerEvaluation'
import { getPlayerGameLogs } from '@/engine/stats/PlayerHistory'
import { getPlayerKnowledgeSummary } from '@/engine/scouting'
import { getPlayerRosterTeamId, type GameWorld } from '@/domain/world'

import { formatGameDateLabel, findTeamForPlayer, opponentShortCode } from './presentationHelpers'
import { ratingLabel } from './ratingCatalog'
import { knowledgeDimensionLabel } from '@/ui-ng/applications/scouting/scoutingWorkspaceModel'
import type { AttributeHighlightModel, OverviewGapModel, PresentationAvailability } from './playerWorkspaceModel'

/**
 * The six knowledge areas the reference shows. `dimensions` lists the real knowledge dimensions that
 * back each one: an area with none of them is reported as not scouted rather than drawn as zero.
 */
export const SCOUTING_KNOWLEDGE_AREAS: readonly {
  readonly id: string
  readonly label: string
  readonly dimensions: readonly string[]
}[] = [
  {
    id: 'attributes',
    label: 'Attributes',
    dimensions: ['shooting', 'finishing', 'creation', 'perimeterDefense', 'interiorDefense', 'rebounding'],
  },
  { id: 'physical', label: 'Physical', dimensions: ['physical'] },
  { id: 'mental', label: 'Mental', dimensions: [] },
  { id: 'personality', label: 'Personality', dimensions: [] },
  { id: 'medical', label: 'Medical', dimensions: [] },
  { id: 'potential', label: 'Potential', dimensions: ['potential:shooting', 'potential:finishing', 'potential:creation', 'potential:passing', 'potential:defense', 'potential:rebounding', 'potential:physical', 'potential:mental'] },
]

/** How well something is known. A knowledge state, never a quality score. */
export type ScoutingKnowledgeState = 'known' | 'estimated' | 'low' | 'unknown'

export interface ScoutingKnowledgeAreaModel {
  readonly id: string
  readonly label: string
  readonly status: PresentationAvailability
  readonly coverage: number
  readonly coverageLabel: string
  readonly knowledgeState: ScoutingKnowledgeState
  readonly note: string
}

export interface ScoutingStatusModel {
  readonly knowledgeLabel: string
  readonly knowledgeCoverage: number
  /** Dimensions that have actually crossed the organization's own knowledge threshold. */
  readonly knownDimensionCount: number
  readonly confidenceLabel: string
  readonly confidenceNote: string
  readonly lastScoutedLabel: string | null
  readonly observerLabel: string
  readonly disagreementLabel: string
}

/** One scouted dimension, as a range with the confidence the organization actually has in it. */
export interface ScoutingAttributeRowModel {
  /** Organization knowledge dimension: the scouting system evaluates these, not raw rating keys. */
  readonly id: string
  readonly label: string
  readonly rangeLabel: string
  readonly estimateLabel: string
  readonly certaintyNote: string
  /** Bounds of the estimate, 0-100, or null when nothing has been evaluated. */
  readonly low: number | null
  readonly high: number | null
  readonly estimate: number | null
  /** The evaluator's own confidence, 0-1. */
  readonly confidence: number | null
  readonly knowledgeState: ScoutingKnowledgeState
}

export interface ScoutingConsensusRowModel {
  readonly id: string
  readonly scoutLabel: string
  readonly knowledgeLabel: string
  readonly knowledgeCoverage: number
  readonly opinionLabel: string
  readonly rangeLabel: string
  readonly tacticalFitLabel: string | null
  readonly dateLabel: string
  readonly knowledgeState: ScoutingKnowledgeState
}

/** A reading the scouts reported, kept as a range with its knowledge state. */
export interface ScoutingHighlightModel {
  readonly id: string
  readonly label: string
  readonly rangeLabel: string
  readonly knowledgeState: ScoutingKnowledgeState
}

/** One of the three outcome bands the reference draws, from the scouted ranges only. */
export interface ScoutingPotentialOutcomeModel {
  readonly id: 'low' | 'expected' | 'high'
  readonly label: string
  readonly rangeLabel: string
  readonly stateLabel: string
  readonly knowledgeState: ScoutingKnowledgeState
}

/** A character trait: the assessment is the honest state, 'unknown' included. */
export interface ScoutingTraitRowModel {
  readonly id: string
  readonly label: string
  readonly knowledgeState: ScoutingKnowledgeState
  readonly assessmentLabel: string
}

/** One fit reading, or the honest absence of the model that would compute it. */
export interface ScoutingFitRowModel {
  readonly id: string
  readonly label: string
  readonly statusLabel: string
  readonly knowledgeState: ScoutingKnowledgeState
}

/** One entry of the report timeline: a real filing, never authored prose. */
export interface ScoutingNoteModel {
  readonly id: string
  readonly dateLabel: string
  readonly title: string
  readonly detail: string
  readonly knowledgeState: ScoutingKnowledgeState
}

export interface ScoutingObservedGameModel {
  readonly id: string
  readonly dateLabel: string
  readonly competitionLabel: string
  readonly opponent: string
  readonly minutes: number
  readonly points: number
  readonly rebounds: number
  readonly assists: number
  readonly steals: number
  readonly blocks: number
  /** Per-game scouting note. The save holds box scores only, so this is null. */
  readonly notes: string | null
}

export interface PlayerScoutingModel {
  readonly status: PresentationAvailability
  readonly unavailableLabel: string | null
  readonly statusPanel: ScoutingStatusModel | null
  readonly knowledgeAreas: readonly ScoutingKnowledgeAreaModel[]
  readonly attributes: readonly ScoutingAttributeRowModel[]
  readonly consensus: readonly ScoutingConsensusRowModel[]
  readonly consensusSummary: string
  readonly consensusNote: string
  readonly observedGames: readonly ScoutingObservedGameModel[]
  readonly archetypeTitle: string
  readonly archetypeRoleTitle: string
  readonly archetypeTags: readonly string[]
  readonly strengths: readonly ScoutingHighlightModel[]
  readonly weaknesses: readonly ScoutingHighlightModel[]
  readonly potentialOutcomes: readonly ScoutingPotentialOutcomeModel[]
  readonly potentialNote: string
  readonly projectedRoles: readonly ScoutingFitRowModel[]
  readonly projectedRolesNote: string
  readonly personalityTraits: readonly ScoutingTraitRowModel[]
  readonly personalityNote: string
  readonly teamFit: readonly ScoutingFitRowModel[]
  readonly overallFitLabel: string
  readonly teamFitNote: string
  readonly noteTimeline: readonly ScoutingNoteModel[]
  readonly actionsNote: string
  readonly gaps: readonly OverviewGapModel[]
}

/** The attribute dimensions the scouting system evaluates, in the order the profile lists them. */
export const SCOUTED_ATTRIBUTE_DIMENSIONS: readonly string[] = [
  'shooting',
  'finishing',
  'creation',
  'perimeterDefense',
  'interiorDefense',
  'rebounding',
  'physical',
]

/** Certainty wording for a scouted value, from the evaluation mode the engine returned. */
function certaintyNote(evaluation: RatingEvaluation): string {
  if (evaluation.mode === 'UNKNOWN') return 'Not scouted'
  if (evaluation.mode === 'EXACT') return 'Reported as a single value'
  if (evaluation.mode === 'RANGE') return 'Scouting range'
  return 'Mixed reports'
}

const ESTIMATE_FLOOR = 1
const ESTIMATE_CEILING = 100

/**
 * The knowledge state behind a reading. It is a statement about how well the dimension is known,
 * never about how good the player is: an exact report with real confidence is `known`, a range is
 * `estimated`, a descriptor or mixed reports are `low`, and nothing evaluated is `unknown`.
 */
function knowledgeStateOf(evaluation: RatingEvaluation): ScoutingKnowledgeState {
  if (evaluation.mode === 'UNKNOWN') return 'unknown'
  if (evaluation.mode === 'EXACT') return evaluation.confidence >= 0.5 ? 'known' : 'estimated'
  if (evaluation.mode === 'RANGE') return evaluation.confidence >= 0.5 ? 'estimated' : 'low'
  return 'low'
}

/** A share the scouts hold, as a knowledge state rather than a quality score. */
function knowledgeStateOfCoverage(coverage: number, hasDimension: boolean): ScoutingKnowledgeState {
  if (!hasDimension) return 'unknown'
  if (coverage <= 0) return 'unknown'
  if (coverage >= 0.75) return 'known'
  if (coverage >= 0.4) return 'estimated'
  return 'low'
}

/** Bounds of a scouted estimate, or nulls when the engine returned no estimate. */
function estimateBounds(evaluation: RatingEvaluation): {
  readonly low: number | null
  readonly high: number | null
  readonly estimate: number | null
} {
  if (evaluation.estimate === undefined || evaluation.mode === 'UNKNOWN') {
    return { low: null, high: null, estimate: null }
  }
  const uncertainty = evaluation.uncertainty ?? 0
  return {
    low: Math.max(ESTIMATE_FLOOR, Math.round(evaluation.estimate - uncertainty)),
    high: Math.min(ESTIMATE_CEILING, Math.round(evaluation.estimate + uncertainty)),
    estimate: Math.round(evaluation.estimate),
  }
}
export function buildPlayerScoutingModel(
  world: GameWorld,
  playerId: PlayerId,
): PlayerScoutingModel {
  const player = world.players[playerId]
  const team = findTeamForPlayer(world, playerId)
  const gaps = buildScoutingGaps()

  if (player === undefined || team === undefined) {
    return {
      status: 'unavailable',
      unavailableLabel: team === undefined ? 'Requires a club context to read scouting knowledge.' : 'Player not found.',
      statusPanel: null,
      knowledgeAreas: [],
      attributes: [],
      consensus: [],
      consensusSummary: '',
      consensusNote: '',
      observedGames: [],
      archetypeTitle: '—',
      archetypeRoleTitle: '—',
      archetypeTags: [],
      strengths: [],
      weaknesses: [],
      potentialOutcomes: [],
      potentialNote: '',
      projectedRoles: [],
      projectedRolesNote: '',
      personalityTraits: [],
      personalityNote: '',
      teamFit: [],
      overallFitLabel: '—',
      teamFitNote: '',
      noteTimeline: [],
      actionsNote: '',
      gaps,
    }
  }

  const organizationId = organizationIdForTeam(team.id)
  const summary = getPlayerKnowledgeSummary(world, organizationId, playerId)
  const knowledge = world.organizationKnowledge.find(
    (entry) => entry.organizationId === organizationId && entry.subjectPlayerId === playerId,
  )

  const reports = Object.values(world.evaluatorReportsById)
    .filter((report) => report.organizationId === organizationId && report.subjectPlayerId === playerId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id))

  const observerIds = [...new Set(reports.map((report) => report.evaluatorStaffId))]
  const observerLabel =
    observerIds
      .map((id) => world.staffPeopleById[id])
      .filter((staff) => staff !== undefined)
      .map((staff) => `${staff.identity.firstName.charAt(0)}. ${staff.identity.lastName}`)
      .join(', ') || 'No scout assigned'

  const statusPanel: ScoutingStatusModel = {
    // A coverage share with no evaluated dimension would read as knowledge the club does not have.
    knowledgeLabel:
      summary.knownDomains.length === 0
        ? 'Not scouted'
        : `${Math.round(summary.overallCoverage * 100)}%`,
    knowledgeCoverage: summary.knownDomains.length === 0 ? 0 : summary.overallCoverage,
    knownDimensionCount: summary.knownDomains.length,
    confidenceLabel:
      summary.overallConfidence >= 0.75 ? 'High' : summary.overallConfidence >= 0.45 ? 'Medium' : 'Low',
    confidenceNote: `Combined coverage across ${summary.knownDomains.length} scouted ${summary.knownDomains.length === 1 ? 'dimension' : 'dimensions'}.`,
    lastScoutedLabel: summary.lastAssessedAt === undefined ? null : formatGameDateLabel(summary.lastAssessedAt),
    observerLabel,
    disagreementLabel: summary.disagreement,
  }

  const knowledgeAreas: ScoutingKnowledgeAreaModel[] = SCOUTING_KNOWLEDGE_AREAS.map((area) => {
    const known = area.dimensions.filter((dimension) => summary.knownDomains.includes(dimension))
    if (area.dimensions.length === 0) {
      return {
        id: area.id,
        label: area.label,
        status: 'unavailable',
        coverage: 0,
        coverageLabel: '—',
        knowledgeState: 'unknown',
        note: 'The knowledge model has no dimension for this area.',
      }
    }
    if (known.length === 0) {
      return {
        id: area.id,
        label: area.label,
        status: 'unavailable',
        coverage: 0,
        coverageLabel: 'Not scouted',
        knowledgeState: 'unknown',
        note: `${area.dimensions.map(knowledgeDimensionLabel).join(', ')} have not been evaluated yet.`,
      }
    }
    const coverage =
      known.reduce((sum, dimension) => sum + (knowledge?.dimensions[dimension]?.coverage ?? 0), 0) /
      known.length
    return {
      id: area.id,
      label: area.label,
      status: 'available',
      coverage,
      coverageLabel: `${Math.round(coverage * 100)}%`,
      knowledgeState: knowledgeStateOfCoverage(coverage, true),
      note: `${known.length} of ${area.dimensions.length} dimensions evaluated.`,
    }
  })

  const attributes: ScoutingAttributeRowModel[] = SCOUTED_ATTRIBUTE_DIMENSIONS.map((dimension) => {
    const evaluation = getOrganizationRatingEvaluation({
      organizationId,
      playerId,
      dimension,
      knowledge: world.organizationKnowledge,
      currentDate: world.currentDate,
      publicPosition: player.basketball.primaryPosition,
    })
    const bounds = estimateBounds(evaluation)
    return {
      id: dimension,
      label: knowledgeDimensionLabel(dimension),
      rangeLabel: formatRatingEvaluation(evaluation),
      estimateLabel: bounds.estimate === null ? '—' : `≈ ${bounds.estimate}`,
      certaintyNote: certaintyNote(evaluation),
      low: bounds.low,
      high: bounds.high,
      estimate: bounds.estimate,
      confidence: evaluation.mode === 'UNKNOWN' ? null : evaluation.confidence,
      knowledgeState: knowledgeStateOf(evaluation),
    }
  }).filter((row) => row.knowledgeState !== 'unknown')

  const byScout = new Map<string, { reports: number; knowledge: number; domains: Set<string>; last: string }>()
  for (const report of reports) {
    const entry = byScout.get(report.evaluatorStaffId) ?? {
      reports: 0,
      knowledge: 0,
      domains: new Set<string>(),
      last: report.createdAt,
    }
    entry.reports += 1
    entry.knowledge += report.findings.reduce((sum, finding) => sum + finding.confidence, 0) / Math.max(1, report.findings.length)
    for (const finding of report.findings) entry.domains.add(finding.dimension)
    if (report.createdAt > entry.last) entry.last = report.createdAt
    byScout.set(report.evaluatorStaffId, entry)
  }

  const consensus: ScoutingConsensusRowModel[] = [...byScout.entries()]
    .map(([staffId, entry]) => {
      const staff = world.staffPeopleById[staffId as StaffPersonId]
      const scoutReports = reports.filter((report) => report.evaluatorStaffId === staffId)
      const findings = scoutReports.flatMap((report) => report.findings)
      const tactical = scoutReports
        .map((report) => report.tacticalFit)
        .filter((value): value is number => value !== undefined)
      // The scout's own reading: their findings' span and their mean confidence, never a global score.
      const low = Math.max(ESTIMATE_FLOOR, Math.round(Math.min(...findings.map((f) => f.estimate - f.uncertainty))))
      const high = Math.min(ESTIMATE_CEILING, Math.round(Math.max(...findings.map((f) => f.estimate + f.uncertainty))))
      const confidence = findings.reduce((sum, finding) => sum + finding.confidence, 0) / Math.max(1, findings.length)
      const coverage = entry.knowledge / entry.reports
      return {
        id: staffId,
        scoutLabel:
          staff === undefined
            ? 'Unknown scout'
            : `${staff.identity.firstName.charAt(0)}. ${staff.identity.lastName}`,
        knowledgeLabel: `${Math.round(coverage * 100)}%`,
        knowledgeCoverage: coverage,
        opinionLabel: `${entry.reports} ${entry.reports === 1 ? 'report' : 'reports'} · ${entry.domains.size} domains`,
        rangeLabel: `${low}-${high} estimated`,
        tacticalFitLabel:
          tactical.length === 0
            ? null
            : `Tactical fit ${Math.round(tactical.reduce((sum, value) => sum + value, 0) / tactical.length)}`,
        dateLabel: formatGameDateLabel(entry.last as never),
        knowledgeState: knowledgeStateOfCoverage(coverage, true),
      }
    })
    .sort((left, right) => left.scoutLabel.localeCompare(right.scoutLabel))

  const observedGames: ScoutingObservedGameModel[] = getPlayerGameLogs(world, playerId)
    .slice(0, 10)
    .map((line) => {
      const game = world.games[line.gameId]
      const opponentTeamId =
        game === undefined
          ? undefined
          : game.homeTeamId === getPlayerRosterTeamId(world, playerId)
            ? game.awayTeamId
            : game.homeTeamId
      const opponent = opponentTeamId === undefined ? undefined : world.teams[opponentTeamId]
      return {
        id: line.gameId,
        dateLabel: formatGameDateLabel(line.gameDate),
        competitionLabel: world.competitions[line.competitionId]?.name ?? line.competitionId,
        opponent: opponent === undefined ? '—' : opponentShortCode(opponent.name),
        minutes: Math.round(line.stats.secondsPlayed / 60),
        points: line.stats.points,
        rebounds: line.stats.rebounds,
        assists: line.stats.assists,
        steals: line.stats.steals,
        blocks: line.stats.blocks,
        // Game records hold box scores only: the column stays empty rather than invented.
        notes: null,
      }
    })

  const ranked = [...attributes].sort(
    (left, right) => (right.estimate ?? 0) - (left.estimate ?? 0) || left.label.localeCompare(right.label),
  )
  const toHighlight = (row: ScoutingAttributeRowModel): ScoutingHighlightModel => ({
    id: row.id,
    label: row.label,
    rangeLabel: row.rangeLabel,
    knowledgeState: row.knowledgeState,
  })
  const strengths = ranked.slice(0, 5).map(toHighlight)
  const weaknesses = [...ranked]
    .reverse()
    .slice(0, 5)
    .map(toHighlight)

  // Archetype from the scouts' own reading: the strongest scouted dimensions, never the true profile.
  const archetypeDescriptors = ranked.slice(0, 3).map((row) => row.label)
  const archetypeTitle =
    archetypeDescriptors.length === 0
      ? 'Not scouted'
      : `${archetypeDescriptors[0]}-first ${player.basketball.primaryPosition === 'PG' ? 'lead guard' : 'player'}`
  const archetypeRoleTitle =
    archetypeDescriptors.length <= 1 ? 'Insufficient reports' : `${archetypeDescriptors[1]} · ${archetypeDescriptors[2]}`
  const archetypeTags = ranked.slice(0, 5).map((row) => row.label)

  // Potential outcomes come from the persisted scouting ranges of the potential domains only.
  const potentialEvaluations = SCOUTING_KNOWLEDGE_AREAS.find((area) => area.id === 'potential')!.dimensions.map(
    (dimension) =>
      getOrganizationRatingEvaluation({
        organizationId,
        playerId,
        dimension,
        knowledge: world.organizationKnowledge,
        currentDate: world.currentDate,
        publicPosition: player.basketball.primaryPosition,
      }),
  )
  const potentialBounds = potentialEvaluations
    .map(estimateBounds)
    .filter((bounds): bounds is { low: number; high: number; estimate: number } =>
      bounds.low !== null && bounds.high !== null && bounds.estimate !== null,
    )
  const potentialState = potentialEvaluations.length === 0 ? 'unknown' : knowledgeStateOf(potentialEvaluations[0]!)
  const potentialOutcomes: ScoutingPotentialOutcomeModel[] =
    potentialBounds.length === 0
      ? (['low', 'expected', 'high'] as const).map((id) => ({
          id,
          label: id === 'low' ? 'Low outcome' : id === 'expected' ? 'Expected' : 'High outcome',
          rangeLabel: '?',
          stateLabel: 'Unknown',
          knowledgeState: 'unknown' as const,
        }))
      : [
          {
            id: 'low',
            label: 'Low outcome',
            rangeLabel: `${Math.min(...potentialBounds.map((bounds) => bounds.low))}-${Math.round(
              potentialBounds.reduce((sum, bounds) => sum + bounds.estimate, 0) / potentialBounds.length,
            )}`,
            stateLabel: 'Lower reported bound',
            knowledgeState: potentialState,
          },
          {
            id: 'expected',
            label: 'Expected',
            rangeLabel: `${Math.round(
              potentialBounds.reduce((sum, bounds) => sum + bounds.estimate, 0) / potentialBounds.length,
            )}`,
            stateLabel: 'Mean reported estimate',
            knowledgeState: potentialState,
          },
          {
            id: 'high',
            label: 'High outcome',
            rangeLabel: `${Math.round(
              potentialBounds.reduce((sum, bounds) => sum + bounds.estimate, 0) / potentialBounds.length,
            )}-${Math.max(...potentialBounds.map((bounds) => bounds.high))}`,
            stateLabel: 'Upper reported bound',
            knowledgeState: potentialState,
          },
        ]

  const personalityTraits: ScoutingTraitRowModel[] = [
    'Competitiveness',
    'Work ethic',
    'Coachability',
    'Leadership',
    'Professionalism',
    'Temperament',
  ].map((label) => ({
    id: label.toLowerCase().replace(/\s+/g, '-'),
    label,
    knowledgeState: 'unknown' as const,
    assessmentLabel: '?',
  }))

  const teamFit: ScoutingFitRowModel[] = [
    'Tactical fit',
    'Role fit',
    'Locker room fit',
    'Culture fit',
    'Timeline fit',
  ].map((label) => ({
    id: label.toLowerCase().replace(/\s+/g, '-'),
    label,
    statusLabel: 'Unknown',
    knowledgeState: 'unknown' as const,
  }))

  // The timeline is the filing history: one entry per report, with what that report covered.
  const noteTimeline: ScoutingNoteModel[] = reports.map((report) => {
    const staff = world.staffPeopleById[report.evaluatorStaffId]
    const confidence =
      report.findings.reduce((sum, finding) => sum + finding.confidence, 0) / Math.max(1, report.findings.length)
    return {
      id: report.id,
      dateLabel: formatGameDateLabel(report.createdAt),
      title: `${staff === undefined ? 'Scout' : `${staff.identity.firstName.charAt(0)}. ${staff.identity.lastName}`} · ${report.missionType}`,
      detail: `${report.findings.length} ${report.findings.length === 1 ? 'finding' : 'findings'} across ${new Set(report.findings.map((finding) => finding.dimension)).size} dimensions · mean confidence ${Math.round(confidence * 100)}%${report.evidenceIds.length === 0 ? '' : ` · ${report.evidenceIds.length} evidence`}`,
      knowledgeState: confidence >= 0.7 ? 'known' : confidence >= 0.4 ? 'estimated' : 'low',
    }
  })

  return {
    status: attributes.length === 0 ? 'unavailable' : 'available',
    unavailableLabel:
      attributes.length === 0
        ? 'No scouting evaluation exists for this player yet, so nothing can be reported without inventing it.'
        : null,
    statusPanel,
    knowledgeAreas,
    attributes,
    consensus,
    consensusSummary:
      consensus.length === 0
        ? 'No report has been filed for this player.'
        : `${consensus.length} ${consensus.length === 1 ? 'scout has' : 'scouts have'} filed ${reports.length} ${reports.length === 1 ? 'report' : 'reports'}; disagreement is ${summary.disagreement.toLowerCase()}.`,
    consensusNote: 'Readings come from the evaluator reports on file, never from a single averaged opinion.',
    observedGames,
    archetypeTitle,
    archetypeRoleTitle,
    archetypeTags,
    strengths,
    weaknesses,
    potentialOutcomes,
    potentialNote:
      potentialBounds.length === 0
        ? 'No potential evaluation exists yet, so no outcome band can be reported.'
        : `Bands come from the reported ranges of ${potentialBounds.length} scouted potential ${potentialBounds.length === 1 ? 'domain' : 'domains'}. Hidden ceilings are never shown.`,
    projectedRoles: [],
    projectedRolesNote:
      'No role projection model exists, so no role fit can be computed from the scouted profile.',
    personalityTraits,
    personalityNote: 'Personality is not part of the player or knowledge model, so every trait is unknown.',
    teamFit,
    overallFitLabel: 'Unknown',
    teamFitNote: 'No tactical or locker-room fit model exists for a player.',
    noteTimeline,
    actionsNote:
      'Assigning a scout, changing priority or requesting a report are not actions this workspace can perform.',
    gaps,
  }
}

/** Reference blocks the knowledge model cannot support. */
function buildScoutingGaps(): readonly OverviewGapModel[] {
  return [
    {
      id: 'scout-notes',
      label: 'Scout notes',
      reason: 'Reports store findings and evidence, never free text, so no note can be shown.',
    },
    {
      id: 'projected-roles',
      label: 'Projected roles',
      reason: 'No role projection model exists, so no role fit percentage can be computed.',
    },
    {
      id: 'potential-outcomes',
      label: 'Potential outcome ranges',
      reason: 'Only per-domain scouting ranges exist; no low/expected/high outcome model is persisted.',
    },
    {
      id: 'personality',
      label: 'Personality & character',
      reason: 'Personality is not part of the player or knowledge model.',
    },
    {
      id: 'team-fit',
      label: 'Fit with our team',
      reason: 'No tactical or locker-room fit model exists for a player.',
    },
    {
      id: 'actions',
      label: 'Scouting actions',
      reason: 'Assigning a scout, changing priority or requesting a report are not actions this workspace can perform.',
    },
    {
      id: 'game-notes',
      label: 'Notes on observed games',
      reason: 'Game records hold box scores only; no per-game scouting note is stored.',
    },
  ]
}
