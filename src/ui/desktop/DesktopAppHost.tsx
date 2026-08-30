import type { GameWorld } from '@/domain/world'
import type { CoachPerkId, CoachSkillId, PlayerId, TeamId } from '@/domain/ids'
import type { MatchTacticalPlan } from '@/engine/match'
import type { ScheduledTrainingSession, TrainingFocus, TrainingIntensity, UserTrainingModule } from '@/domain/training'
import type { Priority } from '@/domain/recruiting'
import type { Lifestyle } from '@/domain/coachFinances'
import type { MediaStance } from '@/domain/media'
import { getGamesToday, getNextUserGame, getUserTeam } from '@/engine/calendar'
import { getCareerFatigueForPlayer, getTeamRoster, isPlayerAvailable } from '@/domain/world'
import { BoardScreen, BoostersScreen, CoachFinancesScreen, CoachScreen, DraftScreen, EnforcementScreen, MarketScreen, MediaScreen, MemoryScreen, NarrativesScreen, NilScreen, RecruitingScreen, SalaryScreen, ScheduleScreen, SquadScreen, TacticsScreen, TradeCenterScreen, TrainingScreen } from '@/ui/screens'
import { getDesktopApp } from './DesktopAppRegistry'
import { EntityPageApp } from '@/ui/navigation/EntityPageApp'
import type { EntityDestination } from '@/ui/navigation/entityNavigation'
import { DesktopSettingsScreen } from './DesktopSettingsScreen'
import { MentoringPcbPage, PlantillaPcbPage } from '@/ui/pcb-migrated/plantilla/PlantillaPcbPage'
import { TrainingPcbPage } from '@/ui/pcb-migrated/training/TrainingPcbPage'
import { TacticsPcbPage } from '@/ui/pcb-migrated/tactics/TacticsPcbPage'
import { ClubPcbPage } from '@/ui/pcb-migrated/club/ClubPcbPage'
import { MedicalPcbPage } from '@/ui/pcb-migrated/medical/MedicalPcbPage'
import { CompetitionPcbPage } from '@/ui/pcb-migrated/competition/CompetitionPcbPage'
import { TeamWorkspacePage } from '@/ui/pcb-migrated/team/TeamWorkspacePage'

export function DesktopAppHost({ appId, entityDestination, world, actions }: { readonly appId: string; readonly entityDestination?: EntityDestination; readonly world: GameWorld; readonly actions: DesktopAppActions }) {
  const key = getDesktopApp(appId)?.renderKey
  if (appId === 'analysis') return <TeamWorkspacePage appName="Análisis" sections={['Depth Chart', 'Plan de futuro', 'Informes']} />
  if (appId === 'locker-room') return <TeamWorkspacePage appName="Vestuario" sections={['Overview', 'Estructura del equipo', 'Grupos', 'Felicidad', 'Código de conducta', 'Reunión con el equipo', 'Reacción']} />
  if (appId === 'mentoring') return <MentoringPcbPage />
  if (appId === 'squad') return <PlantillaPcbPage onLineupSlotChange={actions.setLineupSlot} onLineupSlotClear={actions.clearLineupSlot} onOpenEntity={actions.openEntity} world={world} />
  if (appId === 'training') return <TrainingPcbPage world={world} onIntensity={actions.setTrainingIntensity} onFocus={actions.setTrainingFocus} onScheduleSession={actions.scheduleTrainingSession} onScheduleTeamModule={actions.scheduleTeamModuleSession} onCancelSession={actions.cancelTrainingSession} onSaveModule={actions.saveUserTrainingModule} onDeleteModule={actions.deleteUserTrainingModule} onAssignModule={actions.assignTrainingModuleToPlayer} />
  if (appId === 'tactics') return <TacticsPcbPage onLineupSlotChange={actions.setLineupSlot} onLineupSlotClear={actions.clearLineupSlot} onChange={actions.setTacticalPlan} onReset={actions.resetTacticalPlan} onUpdateRotationMinutes={actions.updateRotationMinutes} onUpdateMatchups={actions.updateGamePlanMatchups} plan={actions.tacticalPlan} world={world} />
  if (appId === 'club') return <ClubPcbPage />
  if (appId === 'staff') return <ClubPcbPage initialTab="staff" />
  if (appId === 'medical') return <MedicalPcbPage />
  if (appId === 'competition') return <CompetitionPcbPage />
  if (key === 'entity') return <EntityPageApp destination={entityDestination} onOpenEntity={actions.openEntity ?? (() => undefined)} world={world} />
  if (key === 'board') return <BoardScreen world={world} />
  if (key === 'squad') return <SquadScreen onOpenEntity={actions.openEntity} onOpenSection={actions.openApp} world={world} />
  if (key === 'schedule') return <ScheduleScreen onOpenMatchCenter={() => actions.openApp('match')} world={world} />
  if (key === 'training') return <TrainingScreen world={world} onFocus={actions.setTrainingFocus} onIntensity={actions.setTrainingIntensity} />
  if (key === 'coach') return <CoachScreen world={world} onApply={actions.applyForJob} onAcceptOffer={actions.acceptOffer} onDeclineOffer={actions.declineOffer} onPerk={actions.purchasePerk} onSkill={actions.purchaseSkill} />
  if (key === 'tactics') { const team = getUserTeam(world); return <TacticsScreen onChange={actions.setTacticalPlan} onReset={actions.resetTacticalPlan} plan={actions.tacticalPlan} players={team === undefined ? [] : team.rosterPlayerIds.map((id) => world.players[id]!)} /> }
  if (key === 'market') return <MarketScreen world={world} onSign={(playerId) => { const team = getUserTeam(world); if (team !== undefined) actions.signFreeAgent(team.id, playerId) }} />
  if (key === 'draft') return <DraftScreen world={world} onSelectProspect={actions.selectDraftProspect} />
  if (key === 'finances') return <SalaryScreen world={world} />
  if (key === 'coach-finances') return <CoachFinancesScreen world={world} onLifestyle={actions.setCoachLifestyle ?? (() => undefined)} />
  if (key === 'memories') return <MemoryScreen world={world} />
  if (key === 'narratives') return <NarrativesScreen world={world} />
  if (key === 'media') return <MediaScreen world={world} onRespond={actions.respondToMedia ?? (() => undefined)} onSkip={actions.skipMedia ?? (() => undefined)} />
  if (key === 'trades') return <TradeCenterScreen world={world} onExecute={(proposal) => actions.executeTrade?.(proposal)} />
  if (key === 'recruiting') return <RecruitingScreen world={world} onAddTarget={actions.addRecruitingTarget ?? (() => undefined)} onRemoveTarget={actions.removeRecruitingTarget ?? (() => undefined)} onAction={actions.performRecruitingAction ?? (() => 'NO_CONTROLLED_PROGRAM')} onOffer={actions.makeRecruitingOffer ?? (() => 'NO_CONTROLLED_PROGRAM')} />
  if (key === 'nil') return <NilScreen world={world} onAccept={actions.acceptNilOpportunity ?? (() => undefined)} />
  if (key === 'boosters') return <BoostersScreen world={world} onSupport={actions.requestBoosterSupport ?? (() => undefined)} />
  if (key === 'enforcement') return <EnforcementScreen world={world} />
  if (key === 'match') return <MatchCenterApp world={world} onAdvanceDay={actions.advanceDay} onInstantResult={actions.instantResult} onOpenApp={actions.openApp} onPlayGame={actions.playGame} onSimulateRemaining={actions.simulateRemainingGamesToday} />
  if (key === 'settings') return <DesktopSettingsScreen />
  return <section className="content-panel">Esta aplicación no está disponible.</section>
}
export interface DesktopAppActions { readonly tacticalPlan: MatchTacticalPlan; readonly openApp: (id: string) => void; readonly openEntity?: (destination: EntityDestination) => void; readonly playGame: () => void; readonly instantResult: () => void; readonly simulateRemainingGamesToday: () => void; readonly advanceDay: () => void; readonly startNextSeason: () => void; readonly releasePlayer: (teamId: TeamId, playerId: PlayerId) => void; readonly signFreeAgent: (teamId: TeamId, playerId: PlayerId) => void; readonly selectDraftProspect: (draftId: string, playerId: PlayerId) => void; readonly executeTrade?: (proposal: import('@/domain/trade').TradeProposal) => void; readonly purchaseSkill: (id: CoachSkillId) => void; readonly purchasePerk: (id: CoachPerkId) => void; readonly acceptOffer: (id: string) => void; readonly declineOffer: (id: string) => void; readonly applyForJob: (id: string) => void; readonly setTacticalPlan: (plan: MatchTacticalPlan) => void; readonly resetTacticalPlan: () => void; readonly setTrainingIntensity: (value: TrainingIntensity) => void; readonly setTrainingFocus: (value: TrainingFocus) => void; readonly scheduleTrainingSession: (session: ScheduledTrainingSession) => void; readonly scheduleTeamModuleSession: (input: { readonly moduleId: string; readonly date: GameWorld['currentDate']; readonly startTime: string; readonly durationMinutes: number; readonly sessionId: string }) => void; readonly cancelTrainingSession: (sessionId: string) => void; readonly saveUserTrainingModule: (module: UserTrainingModule) => void; readonly deleteUserTrainingModule: (moduleId: string) => void; readonly assignTrainingModuleToPlayer: (input: { readonly playerId: PlayerId; readonly moduleId: string; readonly date: GameWorld['currentDate']; readonly startTime: string; readonly sessionId: string }) => void; readonly setLineupSlot: (slot: import('@/domain/tactics').LineupSlot, playerId: PlayerId) => void; readonly clearLineupSlot: (slot: import('@/domain/tactics').LineupSlot) => void; readonly updateRotationMinutes: (minutesByPeriod: Readonly<Record<PlayerId, readonly number[]>>) => void; readonly updateGamePlanMatchups: (matchups: readonly import('@/domain/tactics').DefensiveMatchupAssignment[]) => void; readonly setCoachLifestyle?: (value: Lifestyle) => void; readonly addRecruitingTarget?: (cycleId: string, recruitId: string, priority: Priority) => void; readonly removeRecruitingTarget?: (recruitId: string) => void; readonly performRecruitingAction?: (cycleId: string, recruitId: string, kind: 'contact'|'pitch'|'visit') => string | null; readonly makeRecruitingOffer?: (cycleId: string, recruitId: string) => string | null; readonly acceptNilOpportunity?: (id: string) => void; readonly requestBoosterSupport?: (id: string) => void; readonly respondToMedia?: (id: string, stance: MediaStance) => void; readonly skipMedia?: (id: string) => void }

function MatchCenterApp({ world, onAdvanceDay, onInstantResult, onOpenApp, onPlayGame, onSimulateRemaining }: { readonly world: GameWorld; readonly onAdvanceDay: () => void; readonly onInstantResult: () => void; readonly onOpenApp: (id: string) => void; readonly onPlayGame: () => void; readonly onSimulateRemaining: () => void }) {
  const team = getUserTeam(world); const next = getNextUserGame(world); const today = team === undefined ? undefined : getGamesToday(world).find((game) => game.homeTeamId === team.id || game.awayTeamId === team.id)
  if (team === undefined) return <section className="content-panel">El entrenador de usuario no tiene equipo asignado.</section>
  const game = today ?? next
  if (game === undefined) return <section className="screen"><div className="page-heading"><div><p className="eyebrow">Centro de partido</p><h1>No hay partido programado</h1></div></div><button className="primary-button" onClick={onAdvanceDay} type="button">Avanzar día</button></section>
  const opponent = world.teams[game.homeTeamId === team.id ? game.awayTeamId : game.homeTeamId]!
  const isToday = game.date === world.currentDate && game.status === 'scheduled'
  const venue = game.homeTeamId === team.id ? 'Local' : 'Visitante'
  return <section className="match-center-app"><header className="match-center-app__hero"><p className="eyebrow">Centro de partido</p><div><strong>{team.name}</strong><span>VS</span><strong>{opponent.name}</strong></div><p>{game.date} · {venue}</p></header><article className="match-center-app__actions"><p>{isToday ? 'Día de partido. El entrenamiento no se ejecuta hoy.' : 'Tu próximo partido programado.'}</p>{isToday && <div className="game-actions"><button className="primary-button" onClick={onPlayGame} type="button">Jugar partido</button><button className="secondary-button" onClick={onInstantResult} type="button">Resultado instantáneo</button><button className="secondary-button" onClick={onSimulateRemaining} type="button">Simular otros partidos</button></div>}<button className="text-button" onClick={onAdvanceDay} type="button">Avanzar día</button></article><nav aria-label="Accesos de partido" className="match-center-app__links"><button onClick={() => onOpenApp('squad')} type="button">Abrir plantilla</button><button onClick={() => onOpenApp('training')} type="button">Abrir entrenamiento</button><button onClick={() => onOpenApp('standings')} type="button">Abrir liga</button></nav><section className="match-center-app__readiness table-wrap"><p className="eyebrow">Disponibilidad de plantilla</p><table><thead><tr><th>JUGADOR</th><th>POS</th><th>FATIGA DE CARRERA</th><th>DISPONIBLE</th></tr></thead><tbody>{getTeamRoster(world, team.id).map((player) => <tr key={player.id}><td>{player.firstName} {player.lastName}</td><td>{player.basketball.primaryPosition}</td><td>{getCareerFatigueForPlayer(world, player.id)}</td><td>{isPlayerAvailable(world, player.id) ? 'Disponible' : 'No disponible'}</td></tr>)}</tbody></table></section></section>
}
