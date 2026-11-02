import { getContinueStopReason } from '@/app/game/ContinueFlow'
import { getGamePlan } from '@/app/game/TacticalPlanning'
import { getUserHumanSituations } from '@/app/hrpg/HumanSimulationService'
import { getTeamResponsibilities } from '@/domain/world'
import type { GameWorld } from '@/domain/world'
import type { PlayerId, TeamId } from '@/domain/ids'
import { getTeamRoster } from '@/domain/world'
import { injuryLifecycleStatus } from '@/domain/injury'
import { getNextUserGame, getUserTeam } from '@/engine/calendar'
import { getStaffRecommendationsForTeam, type StaffRecommendationPresentationItem } from '@/ui/staffRecommendationPresentation'
import type { WorkspaceAppId } from '@/ui-ng/workspace/workspaceApps'

export type DirectorHubTier = 'A' | 'B' | 'C' | 'D'

export type DirectorHubAction =
  | { readonly type: 'navigate'; readonly app: WorkspaceAppId }
  | { readonly type: 'navigate-tactics-rotations' }
  | { readonly type: 'navigate-player'; readonly playerId: PlayerId }
  | { readonly type: 'resolve-human-situation'; readonly situationId: string; readonly actionId: string }
  | { readonly type: 'accept-staff-recommendation'; readonly outcomeId: string }
  | { readonly type: 'dismiss-staff-recommendation'; readonly outcomeId: string }
  | { readonly type: 'accept-opposition-report'; readonly reportId: string }
  | { readonly type: 'continue' }

export interface DirectorHubItem {
  readonly id: string
  readonly tier: DirectorHubTier
  readonly title: string
  readonly summary: string
  readonly detail?: string
  readonly action?: DirectorHubAction
  readonly actionLabel?: string
  readonly secondaryAction?: DirectorHubAction
  readonly secondaryActionLabel?: string
  readonly choices?: readonly { readonly label: string; readonly action: DirectorHubAction }[]
  readonly links?: readonly { readonly label: string; readonly action: DirectorHubAction }[]
}

export interface DirectorHubModel {
  readonly nextMatch: { readonly date: string; readonly opponentName: string; readonly competitionName: string | undefined } | undefined
  readonly staffActivity: { readonly delegated: number; readonly pending: number; readonly completedTraining: number } | undefined
  readonly items: readonly DirectorHubItem[]
}

const BREAKPOINT_APP: Readonly<Record<string, WorkspaceAppId>> = {
  match: 'match', medical: 'medical', market: 'market', contracts: 'contracts', draft: 'draft',
  media: 'media', coach: 'coach', trades: 'trades', board: 'board', competition: 'competition',
}

function breakpointApp(route: string | undefined): WorkspaceAppId {
  return (route === undefined ? undefined : BREAKPOINT_APP[route]) ?? 'home'
}

function recommendationApp(item: StaffRecommendationPresentationItem): WorkspaceAppId {
  if (item.domain === 'medical') return 'medical'
  if (item.domain === 'scouting') return 'scouting'
  if (item.domain === 'tactics') return 'tactics'
  if (item.domain === 'training') return 'training'
  if (item.domain === 'recruiting') return 'recruiting'
  return 'roster'
}

function tierLabel(tier: DirectorHubTier): string {
  return tier === 'A' ? 'DECISIÓN' : tier === 'B' ? 'RECOMENDACIÓN' : tier === 'C' ? 'TRABAJO EJECUTADO' : 'CONTEXTO'
}

function averageFatigue(world: GameWorld, teamId: TeamId): number {
  const roster = getTeamRoster(world, teamId)
  if (roster.length === 0) return 0
  return Math.round(roster.reduce((total, player) => total + (world.careerFatigueByPlayerId[player.id] ?? 0), 0) / roster.length)
}

/**
 * Home-only projection of existing state. It deliberately owns no persistence, queue or simulation
 * rule: breakpoints, recommendations, reports and completed work remain authoritative elsewhere.
 */
export function buildDirectorHubModel(world: GameWorld): DirectorHubModel {
  const team = getUserTeam(world)
  if (team === undefined) return { nextMatch: undefined, staffActivity: undefined, items: [{ id: 'director-no-team', tier: 'D', title: 'Centro de dirección', summary: 'No hay un equipo asignado al entrenador.', action: { type: 'navigate', app: 'coach' }, actionLabel: 'Abrir carrera' }] }

  const nextGame = getNextUserGame(world)
  const nextMatch = nextGame === undefined ? undefined : {
    date: nextGame.date,
    opponentName: world.teams[nextGame.homeTeamId === team.id ? nextGame.awayTeamId : nextGame.homeTeamId]?.name ?? 'Rival no disponible',
    competitionName: world.competitions[nextGame.competitionId]?.name,
  }
  const items: DirectorHubItem[] = []
  const stop = getContinueStopReason(world)
  if (stop !== undefined && 'breakpoint' in stop) {
    items.push({
      id: `breakpoint:${stop.breakpoint.sourceKind}:${stop.breakpoint.sourceId}`,
      tier: 'A',
      title: stop.type === 'userGame' ? 'Partido listo para jugar' : 'Hay una decisión que detiene Continue',
      summary: stop.breakpoint.diagnostic,
      action: { type: 'navigate', app: stop.type === 'userGame' ? 'match' : breakpointApp(stop.breakpoint.route) },
      actionLabel: stop.type === 'userGame' ? 'Abrir partido' : 'Resolver',
    })
  }

  // HRPG remains the authority for human situations. The Hub only projects the
  // user's currently available choices; it does not create a second inbox or
  // persist a presentation-level decision.
  for (const situation of getUserHumanSituations(world).filter((item) => item.status === 'open' && item.choices.length > 0)) {
    const participantNames = situation.participants.map((participant) => participant.name).join(' · ')
    const roleReview = situation.source.kind === 'memory' ? world.memoriesById[situation.source.id] : undefined
    const isRoleConcern = roleReview !== undefined && roleReview.tags.includes('rolePromiseReview') && roleReview.context.reviewStatus === 'SUSTAINED_BREACH'
    items.push({
      id: `human-situation:${situation.id}`,
      tier: 'A',
      title: 'Situación profesional pendiente',
      summary: situation.narration.description,
      detail: isRoleConcern ? `${participantNames} · No consta una petición directa del jugador; las opciones disponibles proceden de HRPG.` : participantNames,
      ...(roleReview !== undefined && roleReview.tags.includes('rolePromiseReview') && roleReview.context.reviewStatus === 'SUSTAINED_BREACH' && typeof roleReview.context.playerId === 'string' ? { links: [
        { label: 'Abrir Rotations', action: { type: 'navigate-tactics-rotations' as const } },
        { label: 'Abrir Player', action: { type: 'navigate-player' as const, playerId: roleReview.context.playerId as PlayerId } },
      ] } : {}),
      choices: situation.choices.map((choice) => ({
        label: choice.label,
        action: { type: 'resolve-human-situation' as const, situationId: situation.id, actionId: choice.id },
      })),
    })
  }

  const recommendations = getStaffRecommendationsForTeam(world, team.id)
  const pendingRecommendations = recommendations.filter((item) => item.status === 'PENDING' || item.status === 'INFORMATIONAL')
  for (const recommendation of pendingRecommendations.slice(0, 3)) {
    const actionable = recommendation.actionability === 'ACCEPTABLE'
    items.push({
      id: `recommendation:${recommendation.outcomeId}`,
      tier: 'B',
      title: recommendation.title,
      summary: recommendation.summary,
      detail: `${recommendation.staffName} · ${tierLabel('B')}`,
      ...(actionable
        ? { action: { type: 'accept-staff-recommendation' as const, outcomeId: recommendation.outcomeId }, actionLabel: 'Aceptar' }
        : { action: { type: 'navigate' as const, app: recommendationApp(recommendation) }, actionLabel: 'Ver detalle' }),
      secondaryAction: { type: 'dismiss-staff-recommendation', outcomeId: recommendation.outcomeId },
      secondaryActionLabel: 'Ignorar',
    })
  }

  const report = nextGame === undefined ? undefined : Object.values(world.oppositionScoutingReportsById)
    .find((candidate) => candidate.teamId === team.id && candidate.gameId === nextGame.id)
  if (report !== undefined) {
    const plan = getGamePlan(world, report.gameId, team.id)
    const hasExistingOverride = plan?.tacticalOverride !== undefined
    items.push({
      id: `opposition-report:${report.id}`,
      tier: 'B',
      title: 'Informe del próximo rival',
      summary: hasExistingOverride ? 'El plan del partido ya tiene ajustes tácticos aplicados.' : 'El scouting propone ajustes de ritmo y defensa para el próximo partido.',
      detail: `Calidad ${report.qualityScore} · ${report.flaggedPlayerIds.length} jugadores señalados`,
      ...(hasExistingOverride
        ? { action: { type: 'navigate' as const, app: 'tactics' }, actionLabel: 'Revisar plan' }
        : { action: { type: 'accept-opposition-report' as const, reportId: report.id }, actionLabel: 'Aplicar al plan' }),
    })
  }

  const completedTraining = Object.values(world.scheduledTrainingSessionsById)
    .filter((session) => session.teamId === team.id && session.status === 'completed')
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
  const completedStaffWork = Object.values(world.delegationOutcomesById)
    .filter((outcome) => outcome.responsibilityId.startsWith(`responsibility:${team.id}:`) && outcome.applied)
    .sort((a, b) => b.decidedOn.localeCompare(a.decidedOn) || b.id.localeCompare(a.id))
  if (completedTraining[0] !== undefined) items.push({ id: `training:${completedTraining[0].id}`, tier: 'C', title: 'Entrenamiento ejecutado', summary: `Sesión ${completedTraining[0].execution?.moduleName ?? completedTraining[0].definitionId} completada el ${completedTraining[0].date}.`, action: { type: 'navigate', app: 'training' }, actionLabel: 'Ver entrenamiento' })
  if (completedStaffWork[0] !== undefined) items.push({ id: `staff-work:${completedStaffWork[0].id}`, tier: 'C', title: 'Trabajo del staff registrado', summary: `${completedStaffWork[0].kind} aplicado por el staff el ${completedStaffWork[0].decidedOn}.`, action: { type: 'navigate', app: 'staff' }, actionLabel: 'Ver staff' })

  const activeInjuries = Object.values(world.injuriesById).filter((injury) => team.rosterPlayerIds.includes(injury.playerId) && injuryLifecycleStatus(injury, world.currentDate) !== 'CLEARED').length
  const delegated = getTeamResponsibilities(world, team.id).filter((item) => item.mode === 'delegated' || item.mode === 'advisory').length
  const cohesion = Math.round(world.teamCohesionByTeamId[team.id] ?? 50)
  items.push({
    id: 'director-context',
    tier: 'D',
    title: nextMatch === undefined ? 'Sin próximo partido programado' : `Próximo partido: ${nextMatch.opponentName}`,
    summary: nextMatch === undefined ? 'La agenda no contiene un partido futuro para este equipo.' : `${nextMatch.date} · ${nextMatch.competitionName ?? 'Competición no disponible'}`,
    detail: `Cohesión ${cohesion} · fatiga media ${averageFatigue(world, team.id)} · lesiones activas ${activeInjuries}`,
    action: { type: 'continue' },
    actionLabel: 'Continuar',
  })

  return {
    nextMatch,
    staffActivity: { delegated, pending: pendingRecommendations.length, completedTraining: completedTraining.length },
    items,
  }
}
