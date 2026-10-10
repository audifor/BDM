import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { SCOUTING_MISSIONS, type ScoutingMission, type ScoutingPriority } from '@/domain/scouting'
import type { GameId, PlayerId, TeamId, StaffPersonId } from '@/domain/ids'
import { PLAYER_RATING_FAMILY_KEYS } from '@/domain/player'
import { getPlayerKnowledgeSummary } from '@/engine/scouting'
import { getAvailableScoutingEvaluators, type RequestScoutingInput } from '@/app/scouting'
import { calculateStaffWorkload, type GameWorld } from '@/domain/world'
import { STAFF_ROLE_LABELS, staffQualityBand } from '@/ui/staffPresentation'
import { scoutingMissionLabel } from '@/ui-ng/applications/scouting/scoutingWorkspaceModel'

const MISSION_DESCRIPTIONS: Readonly<Record<ScoutingMission, string>> = {
  QUICK_LOOK: 'Fast broad evaluation with limited detail.',
  FULL_REPORT: 'Detailed estimates across all current Player ratings. Slower and heavier workload.',
  SKILL_EVALUATION: 'Detailed estimates for one selected skill family.',
  POTENTIAL_EVALUATION: 'Scouting estimates of future upside. No true ceilings are shown.',
  TACTICAL_FIT: 'A contextual assessment of fit with your team.',
  LIVE_GAME: 'A broad observation report from one scheduled game.',
}
const PRIORITIES: readonly ScoutingPriority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT']

export function ScoutingModalFrame({ title, onClose, children, footer }: { readonly title: string; readonly onClose: () => void; readonly children: ReactNode; readonly footer?: ReactNode }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])
  return (
    <div className="scouting-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section aria-labelledby="scouting-modal-title" aria-modal="true" className="scouting-modal ng-holo-panel" onMouseDown={(event) => event.stopPropagation()} role="dialog">
        <header className="scouting-modal__header"><h2 id="scouting-modal-title">{title}</h2><button aria-label="Close" className="ng-btn ng-btn--ghost" onClick={onClose} type="button">×</button></header>
        <div className="scouting-modal__body">{children}</div>
        {footer === undefined ? null : <footer className="scouting-modal__footer">{footer}</footer>}
      </section>
    </div>
  )
}

export function RequestScoutingModal({ world, teamId, playerId, initialMission, initialSkillFamily, initialGameId, onClose, onSubmit }: {
  readonly world: GameWorld
  readonly teamId: TeamId
  readonly playerId: PlayerId
  readonly initialMission?: ScoutingMission
  readonly initialSkillFamily?: keyof typeof PLAYER_RATING_FAMILY_KEYS
  readonly initialGameId?: string
  readonly onClose: () => void
  readonly onSubmit: (input: RequestScoutingInput) => string | null
}) {
  const team = world.teams[teamId]
  const player = world.players[playerId]
  const organizationId = team?.organizationId
  const knowledge = organizationId === undefined ? undefined : world.organizationKnowledge.find((item) => item.organizationId === organizationId && item.subjectPlayerId === playerId)
  const ratingCount = Object.keys(knowledge?.dimensions ?? {}).filter((dimension) => dimension.startsWith('rating:')).length
  const suggestedMission: ScoutingMission = initialMission ?? (ratingCount === 0 && Object.keys(knowledge?.dimensions ?? {}).length > 0 ? 'FULL_REPORT' : 'QUICK_LOOK')
  const [mission, setMission] = useState<ScoutingMission>(suggestedMission)
  const [selectedScout, setSelectedScout] = useState<string>('AUTO')
  const [priority, setPriority] = useState<ScoutingPriority>('NORMAL')
  const [skillFamily, setSkillFamily] = useState<keyof typeof PLAYER_RATING_FAMILY_KEYS>(initialSkillFamily ?? 'shooting')
  const playerTeam = Object.values(world.teams).find((candidate) => candidate.rosterPlayerIds.includes(playerId))
  const games = useMemo(() => playerTeam === undefined ? [] : Object.values(world.games).filter((game) => game.status === 'scheduled' && game.date > world.currentDate && (game.homeTeamId === playerTeam.id || game.awayTeamId === playerTeam.id)).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)), [playerId, playerTeam?.id, world])
  const suggestedGameId = initialGameId !== undefined && games.some((game) => game.id === initialGameId) ? initialGameId : games[0]?.id
  const [selectedGameId, setSelectedGameId] = useState<string | undefined>(suggestedGameId)
  const eligible = team === undefined ? [] : getAvailableScoutingEvaluators(world, team.id, mission)
  const selectedScoutInvalid = selectedScout !== 'AUTO' && !eligible.includes(selectedScout as StaffPersonId)
  const [error, setError] = useState<string | null>(null)
  const validGame = mission !== 'LIVE_GAME' || selectedGameId !== undefined
  const hasStaff = eligible.length > 0

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (team === undefined || player === undefined || !hasStaff || !validGame || selectedScoutInvalid) return
    const message = onSubmit({ teamId: team.id, playerId, missionType: mission, evaluatorStaffId: selectedScout === 'AUTO' ? undefined : selectedScout as StaffPersonId, priority, ...(mission === 'SKILL_EVALUATION' ? { targetDimension: skillFamily } : {}), ...(mission === 'LIVE_GAME' && selectedGameId !== undefined ? { gameId: selectedGameId } : {}) })
    if (message === null) onClose()
    else setError(message)
  }

  return (
    <ScoutingModalFrame title="Request scouting" onClose={onClose} footer={<><span className="scouting-modal__error" role="alert">{error ?? ''}</span><button className="ng-btn ng-btn--ghost" onClick={onClose} type="button">Cancel</button><button className="ng-btn ng-btn--primary" disabled={!hasStaff || !validGame || selectedScoutInvalid} form="request-scouting-form" type="submit">Confirm assignment</button></>}>
      <form className="scouting-request-form" id="request-scouting-form" onSubmit={submit}>
        <label>Player<input readOnly value={player === undefined ? 'Player unavailable' : `${player.firstName} ${player.lastName}`} /></label>
        <label>Mission<select onChange={(event) => { setMission(event.target.value as ScoutingMission); setError(null) }} value={mission}>{SCOUTING_MISSIONS.map((item) => <option key={item} value={item}>{scoutingMissionLabel(item)}</option>)}</select><small>{MISSION_DESCRIPTIONS[mission]}</small></label>
        {mission === 'SKILL_EVALUATION' ? <label>Skill family<select onChange={(event) => setSkillFamily(event.target.value as keyof typeof PLAYER_RATING_FAMILY_KEYS)} value={skillFamily}>{Object.keys(PLAYER_RATING_FAMILY_KEYS).map((family) => <option key={family} value={family}>{family.replace(/([a-z])([A-Z])/g, '$1 $2')}</option>)}</select></label> : null}
        {mission === 'LIVE_GAME' ? <label>Game<select disabled={games.length === 0} value={selectedGameId ?? ''} onChange={(event) => setSelectedGameId(event.target.value as GameId)}>{games.map((game) => { const opponentId = game.homeTeamId === playerTeam?.id ? game.awayTeamId : game.homeTeamId; return <option key={game.id} value={game.id}>{game.date} · {world.teams[opponentId]?.name ?? 'Opponent'}</option> })}</select>{games.length === 0 ? <small>No future scheduled game for this Player.</small> : null}</label> : null}
        <label>Scout<select onChange={(event) => { setSelectedScout(event.target.value); setError(null) }} value={selectedScout}><option disabled={!hasStaff} value="AUTO">Auto {hasStaff ? '(recommended)' : '(no eligible Scout)'}</option>{eligible.map((staffId) => { const staff = world.staffPeopleById[staffId]!; const assignment = Object.values(world.teamStaffAssignmentsById).find((item) => item.teamId === teamId && item.staffPersonId === staffId)!; const workload = calculateStaffWorkload(world, staffId); const knowledge = staff.professional.attributes; const descriptor = staffQualityBand(Math.round((knowledge.talentEvaluation + knowledge.analysis) / 2)); return <option key={staffId} value={staffId}>{staff.identity.firstName} {staff.identity.lastName} · {STAFF_ROLE_LABELS[assignment.role]} · {descriptor} · {workload.totalCapacityUsed}/{workload.capacityLimit}</option> })}</select><small>{hasStaff ? 'Auto uses the deterministic, capacity-aware evaluator selection.' : 'No eligible employed Scout has capacity for this mission.'}</small></label>
        <label>Priority<select onChange={(event) => setPriority(event.target.value as ScoutingPriority)} value={priority}>{PRIORITIES.map((item) => <option key={item} value={item}>{item[0]}{item.slice(1).toLowerCase()}</option>)}</select></label>
        {mission === 'LIVE_GAME' && !validGame ? <p className="scouting-modal__warning">Live Game needs a valid upcoming game involving this Player.</p> : null}
        <p className="scouting-modal__workload">Current Player knowledge: {organizationId === undefined ? 'Unavailable' : getPlayerKnowledgeSummary(world, organizationId, playerId).knownDomains.length === 0 ? 'Not scouted' : `${ratingCount} individual ratings and existing broad findings`}.</p>
      </form>
    </ScoutingModalFrame>
  )
}
