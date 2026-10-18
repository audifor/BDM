import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import playerPortraitPlaceholder from '@/ui-ng/assets/images/player-portrait-placeholder.png'
import './scouting-courtside-modal.css'
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

export function ScoutingModalFrame({ title, subtitle, variant, onClose, children, footer }: {
  readonly title: string
  readonly subtitle?: string
  readonly variant?: 'courtside-request'
  readonly onClose: () => void
  readonly children: ReactNode
  readonly footer?: ReactNode
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])
  const courtside = variant === 'courtside-request'
  return (
    <div className={'scouting-modal-backdrop' + (courtside ? ' scouting-modal-backdrop--courtside' : '')}
      role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section aria-labelledby="scouting-modal-title"
        aria-describedby={subtitle === undefined ? undefined : 'scouting-modal-subtitle'} aria-modal="true"
        className={'scouting-modal ng-holo-panel' + (courtside ? ' scouting-modal--courtside-request' : '')}
        onMouseDown={(event) => event.stopPropagation()} role="dialog">
        <header className="scouting-modal__header">
          <div className="scouting-modal__heading">
            <h2 id="scouting-modal-title">{title}</h2>
            {subtitle !== undefined && <p id="scouting-modal-subtitle">{subtitle}</p>}
          </div>
          <button aria-label="Close" className="ng-btn ng-btn--ghost scouting-modal__close"
            onClick={onClose} type="button">×</button>
        </header>
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
  const playerName = player === undefined ? "Player unavailable" : [player.firstName, player.lastName].join(" ")
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
  const playerKnowledgeDomains = organizationId === undefined ? [] : getPlayerKnowledgeSummary(world, organizationId, playerId).knownDomains
  const knowledgeLabel = organizationId === undefined ? 'Unavailable'
    : ratingCount > 0 ? ratingCount + ' estimated ratings'
    : playerKnowledgeDomains.length > 0 ? 'Partially scouted' : 'Not scouted'
  const knowledgeDescription = ratingCount > 0
    ? 'Your club has ' + ratingCount + ' individual rating evaluations. Further observations can improve coverage.'
    : playerKnowledgeDomains.length > 0
      ? 'Your club has broad scouting findings, but individual skill estimates are still missing.'
      : 'Your club does not yet have individual skill estimates for this player.'
  const skillFamilyLabel = (family: string) => family.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (char) => char.toUpperCase())
  const targetLabel = mission === 'SKILL_EVALUATION' ? skillFamilyLabel(skillFamily) + ' family'
    : mission === 'LIVE_GAME' ? 'Scheduled game' : 'Player profile'
  const selectedScoutPerson = selectedScout === 'AUTO' ? undefined : world.staffPeopleById[selectedScout as StaffPersonId]
  const scoutLabel = selectedScout === 'AUTO' ? 'Auto (recommended)'
    : selectedScoutPerson === undefined ? 'Scout unavailable'
      : [selectedScoutPerson.identity.firstName, selectedScoutPerson.identity.lastName].join(' ')
  const selectedGame = games.find((game) => game.id === selectedGameId)
  const selectedOpponentId = selectedGame === undefined ? null
    : selectedGame.homeTeamId === playerTeam?.id ? selectedGame.awayTeamId : selectedGame.homeTeamId
  const selectedGameLabel = selectedGame === undefined ? 'No upcoming game'
    : selectedGame.date + ' · ' + (selectedOpponentId === null ? 'Opponent' : world.teams[selectedOpponentId]?.name ?? 'Opponent')
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
    <ScoutingModalFrame title="REQUEST SCOUTING" subtitle="Configure a scouting assignment for this player."
      variant="courtside-request" onClose={onClose} footer={
        <>
          <span className="scouting-modal__error" role="alert">{error ?? ''}</span>
          <button className="ng-btn ng-btn--ghost scouting-request__cancel" onClick={onClose} type="button">CANCEL</button>
          <button className="ng-btn ng-btn--primary scouting-request__confirm"
            disabled={!hasStaff || !validGame || selectedScoutInvalid || player === undefined}
            form="request-scouting-form" type="submit">CONFIRM ASSIGNMENT <span aria-hidden="true">›</span></button>
        </>
      }>
      <form className="scouting-request-form scouting-request" id="request-scouting-form" onSubmit={submit}>
        <div className="scouting-request__identity" aria-label="Scouting assignment target">
          <div className="scouting-request__target-player">
            <img className="scouting-request__portrait" src={playerPortraitPlaceholder} alt="" />
            <div><span className="scouting-request__eyebrow">PLAYER</span><strong>{playerName}</strong></div>
          </div>
          <div className="scouting-request__target-knowledge">
            <span className="scouting-request__knowledge-icon" aria-hidden="true">?</span>
            <div><span className="scouting-request__eyebrow">CURRENT KNOWLEDGE</span><strong>{knowledgeLabel}</strong></div>
          </div>
          <div className="scouting-request__target-focus">
            <span className="scouting-request__focus-icon" aria-hidden="true">◎</span>
            <div><span className="scouting-request__eyebrow">TARGET</span><strong>{targetLabel}</strong></div>
          </div>
        </div>
        <div className="scouting-request__columns">
          <section className="scouting-request__card scouting-request__setup" aria-labelledby="scouting-request-setup-title">
            <h3 id="scouting-request-setup-title">ASSIGNMENT SETUP</h3>
            <div className="scouting-request__fields">
              <label className="scouting-request__field">MISSION
                <span className="scouting-request__select-wrap">
                  <select onChange={(event) => {
                    setMission(event.target.value as ScoutingMission)
                    setSelectedScout('AUTO')
                    setError(null)
                  }} value={mission}>{SCOUTING_MISSIONS.map((item) => <option key={item} value={item}>{scoutingMissionLabel(item)}</option>)}</select>
                </span>
                <small>{MISSION_DESCRIPTIONS[mission]}</small>
              </label>
              {mission === 'SKILL_EVALUATION' && <label className="scouting-request__field">SKILL FAMILY
                <span className="scouting-request__select-wrap"><select onChange={(event) => setSkillFamily(event.target.value as keyof typeof PLAYER_RATING_FAMILY_KEYS)}
                  value={skillFamily}>{Object.keys(PLAYER_RATING_FAMILY_KEYS).map((family) => <option key={family} value={family}>{skillFamilyLabel(family)}</option>)}</select></span>
              </label>}
              {mission === 'LIVE_GAME' && <label className="scouting-request__field">GAME
                <span className="scouting-request__select-wrap"><select disabled={games.length === 0} value={selectedGameId ?? ''}
                  onChange={(event) => setSelectedGameId(event.target.value as GameId)}>{games.map((game) => {
                    const opponentId = game.homeTeamId === playerTeam?.id ? game.awayTeamId : game.homeTeamId
                    return <option key={game.id} value={game.id}>{game.date} · {world.teams[opponentId]?.name ?? 'Opponent'}</option>
                  })}</select></span>
                {games.length === 0 && <small>No future scheduled game for this Player.</small>}
              </label>}
              <label className="scouting-request__field">SCOUT
                <span className="scouting-request__select-wrap"><select onChange={(event) => { setSelectedScout(event.target.value); setError(null) }}
                  value={selectedScout}><option disabled={!hasStaff} value="AUTO">Auto {hasStaff ? '(recommended)' : '(no eligible Scout)'}</option>{eligible.map((staffId) => {
                    const staff = world.staffPeopleById[staffId]!
                    const assignment = Object.values(world.teamStaffAssignmentsById).find((item) => item.teamId === teamId && item.staffPersonId === staffId)!
                    const workload = calculateStaffWorkload(world, staffId)
                    const knowledge = staff.professional.attributes
                    const descriptor = staffQualityBand(Math.round((knowledge.talentEvaluation + knowledge.analysis) / 2))
                    return <option key={staffId} value={staffId}>{staff.identity.firstName} {staff.identity.lastName} · {STAFF_ROLE_LABELS[assignment.role]} · {descriptor} · {workload.totalCapacityUsed}/{workload.capacityLimit}</option>
                  })}</select></span>
                <small>{hasStaff ? 'Auto selects an eligible evaluator with available capacity.' : 'No eligible employed Scout has capacity for this mission.'}</small>
              </label>
              <label className="scouting-request__field">PRIORITY
                <span className="scouting-request__select-wrap"><select onChange={(event) => setPriority(event.target.value as ScoutingPriority)}
                  value={priority}>{PRIORITIES.map((item) => <option key={item} value={item}>{item[0]}{item.slice(1).toLowerCase()}</option>)}</select></span>
              </label>
              {mission === 'LIVE_GAME' && !validGame && <p className="scouting-modal__warning">Live Game needs a valid upcoming game involving this Player.</p>}
            </div>
          </section>
          <aside className="scouting-request__aside">
            <section className="scouting-request__card scouting-request__summary" aria-labelledby="scouting-request-summary-title">
              <h3 id="scouting-request-summary-title">ASSIGNMENT SUMMARY</h3>
              <dl className="scouting-request__summary-grid">
                <div><dt>Player</dt><dd>{playerName}</dd></div>
                <div><dt>Mission</dt><dd>{scoutingMissionLabel(mission)}</dd></div>
                {mission === 'SKILL_EVALUATION' && <div><dt>Family</dt><dd>{skillFamilyLabel(skillFamily)}</dd></div>}
                {mission === 'LIVE_GAME' && <div><dt>Game</dt><dd>{selectedGameLabel}</dd></div>}
                <div><dt>Scout</dt><dd>{scoutLabel}</dd></div>
                <div><dt>Priority</dt><dd>{priority[0]}{priority.slice(1).toLowerCase()}</dd></div>
              </dl>
            </section>
            <section className="scouting-request__card scouting-request__knowledge" aria-labelledby="scouting-request-knowledge-title">
              <h3 id="scouting-request-knowledge-title">KNOWLEDGE STATUS</h3>
              <div className="scouting-request__knowledge-value">
                <span className="scouting-request__knowledge-icon" aria-hidden="true">?</span>
                <strong>{knowledgeLabel}</strong>
              </div>
              <p>{knowledgeDescription}</p>
              <p className="scouting-request__knowledge-next">The assignment will gather authorized scouting information as game time advances. Results depend on the mission and evaluator.</p>
            </section>
          </aside>
        </div>
      </form>
    </ScoutingModalFrame>
  )
}
