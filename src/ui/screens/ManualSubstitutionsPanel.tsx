import { useState } from 'react'

import type { Player } from '@/domain/player'
import type { ManualSubstitution, PlayerMatchStats } from '@/engine/match'

export interface ManualSubstitutionsPanelProps {
  readonly activeLineup: readonly Player['id'][]
  readonly squadPlayers: readonly Player[]
  readonly playerStats: readonly PlayerMatchStats[]
  readonly fatigueByPlayerId: Readonly<Record<string, number>>
  readonly onApply: (substitutions: readonly ManualSubstitution[]) => void
  readonly onCancel: () => void
}

export function ManualSubstitutionsPanel(props: ManualSubstitutionsPanelProps) {
  const [draftLineup, setDraftLineup] = useState<readonly Player['id'][]>(() => [...props.activeLineup])
  const [selectedOutId, setSelectedOutId] = useState<Player['id'] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const substitutions = createManualSubstitutionBatch(props.activeLineup, draftLineup)
  const draftBench = deriveDraftBench(props.squadPlayers, draftLineup)

  const selectBenchPlayer = (playerInId: Player['id']) => {
    if (selectedOutId === null) return
    setDraftLineup((lineup) => replaceDraftPlayer(lineup, selectedOutId, playerInId))
    setSelectedOutId(null)
  }

  const apply = () => {
    try {
      props.onApply(substitutions)
    } catch (reason) {
      setError(`Could not apply substitutions: ${reason instanceof Error ? reason.message : 'Unknown error'}`)
    }
  }

  return (
    <section className="content-panel substitutions-panel" aria-label="Manual substitutions">
      <p className="eyebrow">LIVE SUBSTITUTIONS · DRAFT LINEUP</p>
      <p className="substitutions-hint">Select a player on court, then a player from the bench.</p>
      <PlayerGroup title="ON COURT" players={playersForIds(props.squadPlayers, draftLineup)} playerStats={props.playerStats} fatigueByPlayerId={props.fatigueByPlayerId} selectedOutId={selectedOutId} onPlayerClick={(playerId) => { setSelectedOutId(playerId); setError(null) }} />
      <PlayerGroup title="BENCH" players={draftBench} playerStats={props.playerStats} fatigueByPlayerId={props.fatigueByPlayerId} onPlayerClick={selectBenchPlayer} />
      {substitutions.length > 0 && <p className="substitutions-summary">{substitutions.map((substitution) => `${playerName(props.squadPlayers, substitution.playerOutId)} → ${playerName(props.squadPlayers, substitution.playerInId)}`).join(' · ')}</p>}
      {error !== null && <p className="substitutions-error" role="alert">{error}</p>}
      <div className="game-actions">
        <button className="primary-button" disabled={substitutions.length === 0} onClick={apply} type="button">APPLY SUBSTITUTIONS</button>
        <button className="secondary-button" onClick={props.onCancel} type="button">CANCEL</button>
      </div>
    </section>
  )
}

function PlayerGroup({ title, players, playerStats, fatigueByPlayerId, selectedOutId, onPlayerClick }: { readonly title: string; readonly players: readonly Player[]; readonly playerStats: readonly PlayerMatchStats[]; readonly fatigueByPlayerId: Readonly<Record<string, number>>; readonly selectedOutId?: Player['id'] | null; readonly onPlayerClick: (playerId: Player['id']) => void }) {
  return <section className="substitution-player-group"><h2>{title}</h2><div className="substitution-player-list">{players.map((player) => {
    const stat = playerStats.find((candidate) => candidate.playerId === player.id)
    const isSelectedOut = player.id === selectedOutId
    return <button aria-pressed={isSelectedOut} className={isSelectedOut ? 'substitution-player selected-out' : 'substitution-player'} key={player.id} onClick={() => onPlayerClick(player.id)} type="button"><strong>{player.firstName} {player.lastName}</strong><span>{player.basketball.primaryPosition} · MIN {formatMinutes(stat?.secondsPlayed ?? 0)} · CON {formatCondition(fatigueByPlayerId[player.id] ?? 0)}{isSelectedOut ? ' · OUT' : ''}</span></button>
  })}</div></section>
}

function playersForIds(players: readonly Player[], ids: readonly Player['id'][]): readonly Player[] {
  return ids.map((playerId) => {
    const player = players.find((candidate) => candidate.id === playerId)
    if (player === undefined) throw new Error(`Player is not available in this MatchSquad: ${playerId}`)
    return player
  })
}

export function deriveDraftBench(players: readonly Player[], draftLineup: readonly Player['id'][]): readonly Player[] {
  return players.filter((player) => !draftLineup.includes(player.id))
}

function playerName(players: readonly Player[], playerId: Player['id']): string {
  const player = players.find((candidate) => candidate.id === playerId)
  return player === undefined ? String(playerId) : `${player.firstName} ${player.lastName}`
}

export function replaceDraftPlayer(lineup: readonly Player['id'][], playerOutId: Player['id'], playerInId: Player['id']): readonly Player['id'][] {
  return lineup.map((playerId) => playerId === playerOutId ? playerInId : playerId)
}

export function createManualSubstitutionBatch(initialLineup: readonly Player['id'][], draftLineup: readonly Player['id'][]): readonly ManualSubstitution[] {
  return initialLineup.flatMap((playerOutId, index) => {
    const playerInId = draftLineup[index]
    return playerInId === undefined || playerInId === playerOutId ? [] : [{ playerOutId, playerInId }]
  })
}

function formatMinutes(secondsPlayed: number): string {
  return `${Math.floor(secondsPlayed / 60).toString().padStart(2, '0')}:${(secondsPlayed % 60).toString().padStart(2, '0')}`
}

function formatCondition(fatigue: number): string {
  return `${Math.round(100 - Math.min(100, Math.max(0, fatigue)))}%`
}
