import type { PlayerId, TeamId } from '@/domain/ids'
import { getCurrentPlayerContract, getPlayerRosterTeamId, isPlayerFreeAgent, type GameWorld } from '@/domain/world'
import { canRecruitTransferPlayer } from '@/engine/eligibility'
import { getUserTeam } from '@/engine/calendar'
import { resolveTradeSeasonAuthorityForTeam } from '@/engine/trade'
import { resolveClubActiveSeasons } from '@/ui/gameContext'

export type PlayerSportingOperationKind = 'direct-signing' | 'trade' | 'recruiting' | 'portal'

export interface PlayerSportingOperationAction {
  readonly kind: PlayerSportingOperationKind
  readonly label: string
  readonly detail: string
  readonly enabled: boolean
  readonly reason?: string
}

function activeEcosystemKinds(world: GameWorld, teamId: TeamId): ReadonlySet<GameWorld['ecosystems'][keyof GameWorld['ecosystems']]['kind']> {
  return new Set(
    resolveClubActiveSeasons(world)
      .filter((season) => (season.participantTeamIds ?? world.competitions[season.competitionId]?.participantTeamIds ?? []).includes(teamId))
      .map((season) => world.ecosystems[world.competitions[season.competitionId]?.ecosystemId ?? '']?.kind)
      .filter((kind): kind is NonNullable<typeof kind> => kind !== undefined),
  )
}

function targetTeamIsInTradeEcosystem(world: GameWorld, teamId: TeamId, ecosystemId: string): boolean {
  return Object.values(world.competitions).some((competition) =>
    competition.ecosystemId === ecosystemId && competition.participantTeamIds.includes(teamId),
  )
}

/**
 * Projects only real operation entry points. It never decides legality itself: the target
 * workspace reuses the canonical command and displays its validation result.
 */
export function buildPlayerSportingOperations(world: GameWorld, playerId: PlayerId): readonly PlayerSportingOperationAction[] {
  const player = world.players[playerId]
  const team = getUserTeam(world)
  if (player === undefined || team === undefined || team.rosterPlayerIds.includes(playerId)) return []

  const kinds = activeEcosystemKinds(world, team.id)
  const actions: PlayerSportingOperationAction[] = []
  const rosterTeamId = getPlayerRosterTeamId(world, playerId)
  const profiles = Object.values(world.recruitProfilesById).filter((profile) => profile.playerId === playerId)
  const portalEntries = Object.values(world.transferPortalEntriesById).filter((entry) => entry.playerId === playerId)

  if (kinds.has('fibaLike') && rosterTeamId === undefined && isPlayerFreeAgent(world, playerId)) {
    actions.push({
      kind: 'direct-signing',
      label: 'Hacer oferta',
      detail: 'Oferta profesional directa - Market conserva negociacion, Finance y Governance.',
      enabled: true,
    })
  }

  const tradeAuthority = resolveTradeSeasonAuthorityForTeam(world, team.id)
  if (kinds.has('nbaLike') && rosterTeamId !== undefined && rosterTeamId !== team.id && tradeAuthority !== undefined) {
    const targetIsEligible = targetTeamIsInTradeEcosystem(world, rosterTeamId, tradeAuthority.rules.ecosystemId)
    actions.push({
      kind: 'trade',
      label: 'Proponer traspaso',
      detail: 'Trade Machine - el constructor mostrara contrato, ventana, salary matching y activos validos.',
      enabled: targetIsEligible,
      ...(targetIsEligible ? {} : { reason: 'La franquicia del jugador no pertenece al ecosistema de Trade activo.' }),
    })
  }

  if (kinds.has('ncaaLike')) {
    const recruitProfile = profiles.find((profile) => profile.origin !== 'transfer' && ['open', 'committed'].includes(profile.status))
    if (recruitProfile !== undefined) {
      actions.push({
        kind: 'recruiting',
        label: 'Reclutar',
        detail: 'Recruiting - evaluacion, contacto, oferta y compromiso siguen el ciclo NCAA activo.',
        enabled: true,
      })
    }

    const portalEntry = portalEntries.find((entry) => ['noticePending', 'authorized'].includes(entry.status))
    if (portalEntry !== undefined) {
      const authorized = canRecruitTransferPlayer(world, playerId, team.id)
      actions.push({
        kind: 'portal',
        label: authorized ? 'Incorporar via Portal' : 'Ver Transfer Portal',
        detail: authorized
          ? 'Portal autorizado - la incorporacion requiere recruiting y elegibilidad, no un fichaje instantaneo.'
          : 'Portal - la ficha muestra el bloqueo real antes de cualquier accion de recruiting.',
        enabled: true,
      })
    }
  }

  const activeContract = getCurrentPlayerContract(world, playerId)
  if (rosterTeamId !== undefined && activeContract === undefined && actions.length === 0) {
    return [{
      kind: 'trade',
      label: 'Operacion no disponible',
      detail: 'El jugador esta en plantilla, pero no existe un contrato activo que habilite una operacion profesional.',
      enabled: false,
      reason: 'No hay contrato activo.',
    }]
  }
  return actions
}
