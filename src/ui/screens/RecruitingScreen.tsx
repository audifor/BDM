import { useState } from 'react'
import type { GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { resolveBasketballChampionshipDate } from '@/engine/recruiting'
import type { PlayerId } from '@/domain/ids'
import { assessCollegeContinuation } from '@/engine/eligibility'
import { basketballTransferWindow, isWithinTransferWindow } from '@/domain/eligibility'
import { availableInstitutionBenefitsRoom } from '@/domain/collegeCompensation'
import { assessCollegeEligibility } from '@/engine/eligibility/EligibilityEngine'
import { getTeamRecruitingNeeds } from '@/engine/recruiting'
import { getPlayerSeasonStats, calculatePlayerStatAverages } from '@/engine/stats/PlayerHistory'
import type { Priority } from '@/domain/recruiting'

const reasonText: Readonly<Record<string, string>> = {
  RECRUITING_NOT_OPEN: 'La ventana de recruiting no esta abierta.',
  INVALID_RECRUIT: 'Este recruit no pertenece al ciclo activo.',
  INSUFFICIENT_RECRUITING_CAPACITY: 'No queda capacidad de recruiting.',
  DUPLICATE_OFFER: 'Ya existe una oferta activa.',
  OFFER_LIMIT_REACHED: 'Se alcanzo el limite de ofertas o firmas.',
  RECRUIT_ALREADY_COMMITTED: 'El recruit ya no esta disponible.',
  NO_CONTROLLED_PROGRAM: 'No controlas un programa NCAA.',
  NOTIFICATION_WINDOW_CLOSED: 'El periodo para iniciar el aviso de transferencia esta cerrado.',
  TRANSFER_PORTAL_AUTHORIZATION_REQUIRED: 'El jugador aun no tiene autorizacion del Portal.',
  ACTIVE_SOURCE_ENROLLMENT_REQUIRED: 'Se requiere una matricula activa en la institucion de origen.',
  TRANSFER_SOURCE_OR_RULESET_INVALID: 'La plantilla de origen o las reglas de transferencia no son validas.',
  TRANSFER_DESTINATION_UNAVAILABLE: 'El destino no participa en la competicion de este ciclo.',
  SIGNED_TRANSFER_REQUIRED: 'Se requiere un compromiso firmado y una entrada autorizada del Portal.',
  TRANSFER_DESTINATION_OR_SOURCE_ENROLLMENT_INVALID: 'No se encontro una matricula valida en el origen o el destino.',
  PORTAL_REQUIREMENTS_INCOMPLETE: 'Completa el modulo educativo antes del procesamiento institucional.',
  CAP_EXCEEDED: 'La oferta de beneficios supera el espacio disponible del limite institucional.',
  STAFF_ACTIVITY_SUSPENDED: 'El miembro del Staff esta suspendido de esta actividad.',
  RECRUIT_ALREADY_SIGNED: 'El jugador ya tiene un acuerdo terminal firmado.',
  TRANSFER_DESTINATION_INELIGIBLE: 'La elegibilidad deportiva en el destino esta retrasada o bloqueada.',
}

type RecruitingScreenProps = {
  readonly world: GameWorld
  readonly onAddTarget: (cycleId: string, recruitId: string, priority: Priority) => void
  readonly onRemoveTarget: (recruitId: string) => void
  readonly onAction: (cycleId: string, recruitId: string, kind: 'contact'|'pitch'|'visit') => string | null
  readonly onOffer: (cycleId: string, recruitId: string) => string | null
  readonly onSubmitTransferNotice?: (playerId: PlayerId) => string | null
  readonly onCompleteTransferEducationModule?: (entryId: string) => string | null
  readonly onProcessTransferPortalEntry?: (entryId: string) => string | null
  readonly onWithdrawTransferPortalEntry?: (entryId: string) => string | null
  readonly onAddTransferRecruit?: (entryId: string) => string | null
  readonly onCompleteCollegeTransfer?: (recruitId: string) => string | null
}

export function RecruitingScreen(props: RecruitingScreenProps) {
  const { world, onAddTarget, onRemoveTarget, onAction, onOffer } = props
  const [feedback, setFeedback] = useState<string | null>(null)
  const team = getUserTeam(world)
  const competition = team === undefined ? undefined : Object.values(world.competitions).find((item) => item.participantTeamIds.includes(team.id) && world.ecosystems[item.ecosystemId]?.kind === 'ncaaLike')
  const controlled = competition !== undefined && team !== undefined
  const season = competition === undefined ? undefined : world.seasons[world.currentSeasonId]?.competitionId === competition.id ? world.seasons[world.currentSeasonId] : Object.values(world.seasons).find((item) => item.competitionId === competition.id)
  const cycle = Object.values(world.recruitingCyclesById).find((item) => item.status === 'open' && (competition === undefined || item.ecosystemId === competition.ecosystemId) && (season === undefined || item.sourceSeasonId === season.id))
  const finalCycle = season === undefined ? undefined : Object.values(world.recruitingCyclesById).find((item) => item.sourceSeasonId === season.id && item.ecosystemId === competition?.ecosystemId)
  const finalDate = finalCycle === undefined ? undefined : resolveBasketballChampionshipDate(world, finalCycle)
  const ruleset = competition === undefined ? undefined : Object.values(world.transferPortalRulesetsById).filter((item) => item.ecosystemId === competition.ecosystemId && item.effectiveFrom <= world.currentDate).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]
  const window = finalDate === undefined || ruleset === undefined ? undefined : basketballTransferWindow(finalDate, ruleset)
  const windowOpen = window !== undefined && isWithinTransferWindow(world.currentDate, window)
  const profiles = Object.values(world.recruitProfilesById).sort((a, b) => a.publicRank - b.publicRank)
  const portalEntries = competition === undefined ? [] : Object.values(world.transferPortalEntriesById).filter((entry) => entry.ecosystemId === competition.ecosystemId && (entry.status === 'noticePending' || entry.status === 'authorized')).sort((a, b) => a.notifiedOn.localeCompare(b.notifiedOn))
  const continuation = team === undefined || season === undefined ? [] : team.rosterPlayerIds.map((playerId) => assessCollegeContinuation(world, playerId, team.id, season.id)).filter((item) => item !== undefined)
  const cap = team === undefined ? undefined : Object.values(world.institutionBenefitsCapsById).filter((item) => item.institutionId === team.organizationId && item.status !== 'closed').sort((a, b) => b.capYear.localeCompare(a.capYear))[0]
  const capRoom = cap === undefined ? undefined : availableInstitutionBenefitsRoom(cap, Object.values(world.settlementBenefitsAgreementsById))
  const run = (callback?: () => string | null | undefined) => {
    const result = callback === undefined ? undefined : callback()
    const reason = result === undefined ? 'NO_CONTROLLED_PROGRAM' : result
    setFeedback(reason === null ? 'Accion completada.' : (reasonText[reason] ?? reason))
  }

  return <section className="screen">
    <div className="page-heading"><div><p className="eyebrow">RECRUITING</p><h1>RECRUITING CENTER</h1></div></div>
    <div className="content-panel">
      <p>{controlled ? `Capacidad restante: ${world.recruitingCapacityByProgramId[team!.id] ?? cycle?.rules.periodCapacity ?? 0}` : 'Modo consulta: no controlas un programa NCAA.'}</p>
      <p>Clase firmada: {Object.values(world.recruitSigningsById).filter((signing) => signing.programTeamId === team?.id).length} · Compromisos: {Object.values(world.recruitingCommitmentsById).filter((item) => item.programTeamId === team?.id).length}</p>
      {controlled && <p>Institutional benefits cap room: {capRoom === undefined ? 'unavailable' : `${capRoom} ${cap?.currencyCode} minor units`}. Athletics aid and third-party NIL are separate.</p>}
      {feedback !== null && <p role="status">{feedback}</p>}
    </div>

    {controlled && <div className="content-panel">
      <h2>COLLEGE CONTINUATION</h2>
      <p>{window === undefined ? 'Portal window unavailable until the championship final is completed.' : windowOpen ? `Standard notification window is open through ${window.closesOn}.` : `Standard notification window is closed${world.currentDate > window.closesOn ? ` (closed ${window.closesOn})` : ` (opens ${window.opensOn})`}. Players already authorized remain recruitable after it closes.`}</p>
      {continuation.length === 0 ? <p>No recorded season role context yet.</p> : <ul>{continuation.map((assessment) => <li key={assessment.playerId}>
        <strong>{world.players[assessment.playerId]!.firstName} {world.players[assessment.playerId]!.lastName}</strong>: {assessment.tone} · actual role {assessment.experience.gamesStarted}/{assessment.experience.gamesPlayed} starts, {assessment.experience.minutesPerGame.toFixed(1)} MPG. Stay: {assessment.stayReasons.join(' ') || 'No recorded stay reason.'} Leave: {assessment.leaveReasons.join(' ') || 'No recorded leave reason.'} Concerns: {assessment.unresolvedConcerns.join(' ') || 'none'}. Trust: {assessment.relationshipTrust ?? 'unknown'}. Coach change: {assessment.coachingChange ? 'yes' : 'no'}. Aid: {assessment.compensationContext.athleticsAidMinorUnits} minor units. Institutional benefits: {assessment.compensationContext.institutionalBenefitsMinorUnits} minor units. Portal: {windowOpen ? 'window open' : 'window unavailable'}.{assessment.academicContext ? ` Academic: ${assessment.academicContext.performance} performance, ${assessment.academicContext.progress} progress.` : ''} Third-party NIL: {assessment.activeNilDeals} active deals.
        {assessment.promiseAssessments.map((promise) => <span key={promise.promiseId}> Promise: {promise.fulfillment.toLowerCase()} — {promise.explanation}</span>)}
      </li>)}</ul>}
      {windowOpen && team !== undefined && <div><h3>Submit written transfer notice</h3><p>Notice does not remove the player from the roster. The education module and institutional processing are separate steps.</p>{team.rosterPlayerIds.filter((playerId) => !Object.values(world.transferPortalEntriesById).some((entry) => entry.playerId === playerId && entry.ecosystemId === competition!.ecosystemId && (entry.status === 'noticePending' || entry.status === 'authorized'))).map((playerId) => <button key={playerId} type="button" onClick={() => run(() => props.onSubmitTransferNotice?.(playerId) ?? 'NO_CONTROLLED_PROGRAM')}>{world.players[playerId]!.firstName} {world.players[playerId]!.lastName} · SUBMIT NOTICE</button>)}</div>}
    </div>}

    <div className="content-panel">
      <h2>TRANSFER PORTAL</h2>
      {portalEntries.length === 0 ? <p>No active Transfer Portal entries are available.</p> : <ul>{portalEntries.map((entry) => {
        const source = world.teams[entry.sourceTeamId]
        const ownEntry = entry.sourceTeamId === team?.id
        const linked = Object.values(world.recruitProfilesById).some((profile) => profile.transferPortalEntryId === entry.id)
        const production = season === undefined ? undefined : getPlayerSeasonStats(world, entry.playerId, season.id)
        const averages = production === undefined ? undefined : calculatePlayerStatAverages(production)
        const observations = team === undefined ? 0 : world.organizationKnowledge.filter((item) => item.organizationId === team.organizationId && item.subjectPlayerId === entry.playerId).length
        const aidOffer = Object.values(world.athleticsAidAgreementsById).find((item) => item.playerId === entry.playerId && item.teamId === team?.id && (item.status === 'offered' || item.status === 'signed'))
        const benefitsOffer = Object.values(world.settlementBenefitsAgreementsById).find((item) => item.playerId === entry.playerId && item.teamId === team?.id && (item.status === 'draft' || item.status === 'signed'))
        const eligibility = team === undefined || competition === undefined ? undefined : assessCollegeEligibility(world, { playerId: entry.playerId, teamId: team.id, ecosystemId: competition.ecosystemId })
        const position = world.players[entry.playerId]?.basketball.primaryPosition
        const rosterNeed = team === undefined || position === undefined ? undefined : getTeamRecruitingNeeds(world, team.id)[position]
        return <li key={entry.id}>
          <strong>{world.players[entry.playerId]?.firstName} {world.players[entry.playerId]?.lastName}</strong> · Source: {source?.name} · {position} · Portal authorization: {entry.status} · notified {entry.notifiedOn}{entry.exception ? ` · ${entry.exception}` : ''}
          <p>Public production: {production?.gamesPlayed ?? 0} games, {averages?.mpg.toFixed(1) ?? '0.0'} MPG. OrganizationKnowledge: {observations} observations. Transfer priority: {rosterNeed === undefined ? 'unknown' : rosterNeed > 0 ? 'roster need' : 'position covered'}. Aid offer: {aidOffer?.valueMinorUnits ?? 0} minor units. Institutional benefits offer: {benefitsOffer?.valueMinorUnits ?? 0} minor units. Available cap room: {capRoom ?? 'unavailable'}. Eligibility: {eligibility === undefined ? 'uncertain until destination enrollment' : eligibility.eligible ? 'eligible' : eligibility.reasons.join(', ')}.</p>
          {entry.status === 'noticePending' && entry.educationalModuleCompletedOn === undefined && <p>Education module incomplete; destination recruiting authorization is blocked.</p>}
          {entry.status !== 'authorized' && <p>Destination recruiting blocked until Portal authorization. Deliberate unauthorized aid, benefits, roster, or athletic activity triggers serious compliance sanctions.</p>}
          {ownEntry && entry.status === 'noticePending' && entry.educationalModuleCompletedOn === undefined && <button type="button" onClick={() => run(() => props.onCompleteTransferEducationModule?.(entry.id))}>COMPLETE EDUCATION MODULE</button>}
          {ownEntry && entry.status === 'noticePending' && entry.educationalModuleCompletedOn !== undefined && <button type="button" onClick={() => run(() => props.onProcessTransferPortalEntry?.(entry.id))}>PROCESS PORTAL ENTRY</button>}
          {ownEntry && entry.status === 'authorized' && <button type="button" onClick={() => run(() => props.onWithdrawTransferPortalEntry?.(entry.id))}>STAY / WITHDRAW</button>}
          {!ownEntry && entry.status === 'authorized' && !linked && <button type="button" onClick={() => run(() => props.onAddTransferRecruit?.(entry.id))}>ADD TO TRANSFER RECRUITING</button>}
        </li>
      })}</ul>}
    </div>

    <div className="content-panel table-wrap"><table><thead><tr><th>RANK</th><th>PLAYER</th><th>POS</th><th>PUBLIC TALENT</th><th>ORIGIN</th><th>INTEREST</th><th>OFFER</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>{profiles.map((profile) => {
      const player = world.players[profile.playerId]!
      const board = team !== undefined && world.recruitingBoards.find((entry) => entry.recruitId === profile.id && entry.programTeamId === team.id)
      const interest = team === undefined ? undefined : world.recruitingInterests.find((item) => item.recruitId === profile.id && item.programTeamId === team.id)?.value
      const offer = team === undefined ? undefined : Object.values(world.recruitingOffersById).find((item) => item.recruitId === profile.id && item.programTeamId === team.id && item.status === 'active')
      return <tr key={profile.id}><td>{profile.publicRank}</td><td>{player.firstName} {player.lastName}</td><td>{profile.position}</td><td>{profile.tier.toUpperCase()}</td><td>{profile.origin === 'transfer' ? 'TRANSFER PORTAL' : profile.origin}</td><td>{interest === undefined ? 'COLD' : interest >= 75 ? 'LEADER' : interest >= 55 ? 'STRONG' : interest >= 30 ? 'WARM' : 'INTERESTED'}</td><td>{offer === undefined ? '—' : 'OFFERED'}</td><td>{profile.status.toUpperCase()}</td><td>{controlled && cycle !== undefined && <div className="game-actions">
        {board === undefined ? <button type="button" onClick={() => onAddTarget(cycle.id, profile.id, 'normal')}>TARGET</button> : <button type="button" onClick={() => onRemoveTarget(profile.id)}>REMOVE</button>}
        <button type="button" onClick={() => run(() => onAction(cycle.id, profile.id, 'contact'))}>CONTACT ({cycle.rules.costs.contact})</button>
        <button type="button" onClick={() => run(() => onAction(cycle.id, profile.id, 'pitch'))}>PITCH ({cycle.rules.costs.pitch})</button>
        <button type="button" onClick={() => run(() => onAction(cycle.id, profile.id, 'visit'))}>VISIT ({cycle.rules.costs.visit})</button>
        <button type="button" onClick={() => run(() => onOffer(cycle.id, profile.id))}>OFFER</button>
        {profile.origin === 'transfer' && profile.status === 'incoming' && <button type="button" onClick={() => run(() => props.onCompleteCollegeTransfer?.(profile.id))}>COMPLETE TRANSFER</button>}
      </div>}</td></tr>
    })}</tbody></table></div>
  </section>
}
