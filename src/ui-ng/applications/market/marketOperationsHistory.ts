import type { PlayerId, TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { STAFF_ROLE_LABELS } from '@/ui/staffPresentation'

/**
 * F3 · one chronological record of what the manager's club actually did on the market: free-agent signings, renewals, releases and
 * staff hirings/departures. Every row is read from the canonical fact that executed it (player transaction, executed retention
 * agreement, staff career history); an offer or a negotiation in progress is NOT an operation and never appears here.
 */
export type MarketOperationKind = 'FICHAJE' | 'RENOVACION' | 'BAJA' | 'STAFF_ALTA' | 'STAFF_BAJA'
export interface MarketOperationRow {
  readonly id: string
  readonly date: string
  readonly kind: MarketOperationKind
  readonly subject: string
  readonly summary: string
  readonly playerId?: PlayerId
}

const playerName = (world: GameWorld, playerId: string): string => {
  const player = world.players[playerId as PlayerId]
  return player === undefined ? 'Jugador' : `${player.firstName} ${player.lastName}`
}
const years = (from: string, to: string): number => Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / (365.25 * 86_400_000)))

export function buildMarketOperationsHistory(world: GameWorld, teamId: TeamId): readonly MarketOperationRow[] {
  const rows: MarketOperationRow[] = []
  for (const transaction of Object.values(world.playerTransactionsById)) {
    const contract = transaction.contractId === undefined ? undefined : world.contractsById[transaction.contractId]
    if (transaction.kind === 'signedFreeAgent' && transaction.toTeamId === teamId) {
      rows.push({ id: transaction.id, date: transaction.occurredOn, kind: 'FICHAJE', playerId: transaction.playerId, subject: playerName(world, transaction.playerId),
        summary: contract === undefined ? 'Agente libre incorporado' : `Agente libre · ${contract.compensation.annualSalary.toLocaleString('es-ES')} / año · ${years(contract.term.startsOn, contract.term.expiresOn)} año(s) · hasta ${contract.term.expiresOn}` })
    } else if (transaction.kind === 'released' && transaction.fromTeamId === teamId) {
      rows.push({ id: transaction.id, date: transaction.occurredOn, kind: 'BAJA', playerId: transaction.playerId, subject: playerName(world, transaction.playerId),
        summary: contract === undefined ? 'Contrato rescindido' : `Contrato rescindido · salario ${contract.compensation.annualSalary.toLocaleString('es-ES')} / año; las obligaciones garantizadas siguen en Finance` })
    }
  }
  for (const negotiation of Object.values(world.retentionNegotiationsById)) {
    if (negotiation.teamId !== teamId || negotiation.execution?.status !== 'SIGNED') continue
    const terms = negotiation.acceptedTerms
    rows.push({ id: negotiation.id, date: negotiation.execution.signedOn, kind: 'RENOVACION', playerId: negotiation.playerId, subject: playerName(world, negotiation.playerId),
      summary: terms === undefined ? 'Renovación firmada' : `Renovación firmada · ${terms.salary.toLocaleString('es-ES')} / año · ${terms.years} año(s)` })
  }
  for (const [staffId, history] of Object.entries(world.staffCareerHistoryByStaffId)) {
    for (const entry of history) {
      if (entry.teamId !== teamId) continue
      const person = world.staffPeopleById[staffId as keyof typeof world.staffPeopleById]
      const name = person === undefined ? 'Staff' : `${person.identity.firstName} ${person.identity.lastName}`
      if (entry.kind === 'appointment' && entry.reason === 'hired') rows.push({ id: `staff-hire:${staffId}:${entry.date}`, date: entry.date, kind: 'STAFF_ALTA', subject: name, summary: `Contratado como ${STAFF_ROLE_LABELS[entry.roleId]}` })
      if (entry.kind === 'departure') rows.push({ id: `staff-exit:${staffId}:${entry.date}`, date: entry.date, kind: 'STAFF_BAJA', subject: name, summary: `Salida del club (${entry.reason})` })
    }
  }
  return Object.freeze(rows.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)))
}
