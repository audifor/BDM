import { useMemo, useState } from 'react'

import type { PlayerId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { getPlayer } from '@/domain/world'
import { calculateTeamMatchStats, type PlayerMatchStats } from '@/engine/match'
import { navigateToPlayer } from '@/ui-ng/workspace/workspaceApps'
import {
  displayJerseyNumber,
  formatMinutesCompact,
  formatPlayerShortName,
  formatPlusMinus,
  formatShooting,
  rankOnCourt,
  teamMark,
} from './matchPresentation'

function formatPct(made: number, attempted: number): string {
  if (attempted <= 0) return '—'
  return `${Math.round((made / attempted) * 100)}%`
}

type SortKey =
  | 'jersey'
  | 'player'
  | 'min'
  | 'pts'
  | 'reb'
  | 'ast'
  | 'stl'
  | 'blk'
  | 'pf'
  | 'fg'
  | 'three'
  | 'ft'
  | 'plusMinus'
  | 'court'

type SortDir = 'asc' | 'desc'

const COLUMNS: readonly { readonly key: SortKey; readonly label: string; readonly player?: boolean }[] = [
  { key: 'jersey', label: '#' },
  { key: 'player', label: 'JUGADOR', player: true },
  { key: 'min', label: 'MIN' },
  { key: 'pts', label: 'PTS' },
  { key: 'reb', label: 'REB' },
  { key: 'ast', label: 'AST' },
  { key: 'stl', label: 'STL' },
  { key: 'blk', label: 'BLK' },
  { key: 'pf', label: 'PF' },
  { key: 'fg', label: 'FG' },
  { key: 'three', label: '3PT' },
  { key: 'ft', label: 'FT' },
  { key: 'plusMinus', label: '+/−' },
]

function sortValue(stat: PlayerMatchStats, key: SortKey, world: GameWorld, activePlayerIds: readonly PlayerId[]): number | string {
  switch (key) {
    case 'jersey':
      return displayJerseyNumber(stat.playerId)
    case 'player': {
      const player = getPlayer(world, stat.playerId)
      return `${player.lastName} ${player.firstName}`.toLocaleLowerCase()
    }
    case 'min':
      return stat.secondsPlayed
    case 'pts':
      return stat.points
    case 'reb':
      return stat.rebounds
    case 'ast':
      return stat.assists
    case 'stl':
      return stat.steals
    case 'blk':
      return stat.blocks
    case 'pf':
      return stat.foulsCommitted
    case 'fg':
      return stat.fieldGoalsMade * 1000 + stat.fieldGoalsAttempted
    case 'three':
      return stat.threePointMade * 1000 + stat.threePointAttempted
    case 'ft':
      return stat.freeThrowsMade * 1000 + stat.freeThrowsAttempted
    case 'plusMinus':
      return stat.plusMinus
    case 'court':
      return rankOnCourt(activePlayerIds, stat.playerId)
  }
}

function compareRows(
  left: PlayerMatchStats,
  right: PlayerMatchStats,
  key: SortKey,
  dir: SortDir,
  world: GameWorld,
  activePlayerIds: readonly PlayerId[],
): number {
  const a = sortValue(left, key, world, activePlayerIds)
  const b = sortValue(right, key, world, activePlayerIds)
  const base =
    typeof a === 'string' && typeof b === 'string'
      ? a.localeCompare(b)
      : Number(a) - Number(b)
  return dir === 'asc' ? base : -base
}

export function TeamBoxScore({
  title,
  side,
  score,
  stats,
  world,
  activePlayerIds,
  collapsed,
  onToggleCollapsed,
  onOpenTeam,
}: {
  readonly title: string
  readonly side: 'local' | 'visitante'
  readonly score: number
  readonly stats: readonly PlayerMatchStats[]
  readonly world: GameWorld
  readonly activePlayerIds: readonly PlayerId[]
  readonly collapsed: boolean
  readonly onToggleCollapsed: () => void
  readonly onOpenTeam?: () => void
}) {
  const [sortKey, setSortKey] = useState<SortKey>('court')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const totals = calculateTeamMatchStats(
    stats,
    stats.map((stat) => stat.playerId),
  )
  const ordered = useMemo(() => {
    const rows = [...stats]
    rows.sort((left, right) => compareRows(left, right, sortKey, sortDir, world, activePlayerIds))
    return rows
  }, [activePlayerIds, sortDir, sortKey, stats, world])

  const sideLabel = side === 'local' ? 'LOCAL' : 'VISITANTE'

  const onSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir(key === 'player' || key === 'jersey' || key === 'court' ? 'asc' : 'desc')
  }

  return (
    <section className={`me-box${collapsed ? ' is-collapsed' : ''}`}>
      <button
        aria-expanded={!collapsed}
        className="me-box__head"
        onClick={onToggleCollapsed}
        type="button"
      >
        <span className="me-box__mark">{teamMark(title)}</span>
        <div className="me-box__titles">
          <em>BOX SCORE — {sideLabel}</em>
          {onOpenTeam === undefined ? (
            <strong>{title}</strong>
          ) : (
            <strong
              className="me-box__team-link"
              onClick={(event) => {
                event.stopPropagation()
                onOpenTeam()
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  event.stopPropagation()
                  onOpenTeam()
                }
              }}
              role="link"
              tabIndex={0}
            >
              {title}
            </strong>
          )}
        </div>
        <div className="me-box__summary">
          <b className="me-box__score">{score}</b>
          <div className="me-box__shooting" aria-label="Porcentajes de tiro">
            <span>
              2P <b>{formatPct(totals.twoPointMade, totals.twoPointAttempted)}</b>
            </span>
            <span>
              3P <b>{formatPct(totals.threePointMade, totals.threePointAttempted)}</b>
            </span>
            <span>
              TL <b>{formatPct(totals.freeThrowsMade, totals.freeThrowsAttempted)}</b>
            </span>
          </div>
        </div>
        <span aria-hidden className="me-box__chevron">
          {collapsed ? '▸' : '▾'}
        </span>
      </button>
      {collapsed ? null : (
        <div className="me-box__table-wrap">
          <table className="me-box__table">
            <thead>
              <tr>
                {COLUMNS.map((column) => {
                  const active = sortKey === column.key
                  return (
                    <th className={column.player ? 'is-player' : undefined} key={column.key} scope="col">
                      <button
                        aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        className={`me-box__sort${active ? ' is-active' : ''}`}
                        onClick={() => onSort(column.key)}
                        type="button"
                      >
                        {column.label}
                      </button>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {ordered.map((stat) => {
                const player = getPlayer(world, stat.playerId)
                const pmClass =
                  stat.plusMinus > 0 ? 'is-pos' : stat.plusMinus < 0 ? 'is-neg' : 'is-neu'
                return (
                  <tr className={activePlayerIds.includes(stat.playerId) ? 'is-on' : undefined} key={stat.playerId}>
                    <td>
                      <span className="me-box__jersey">{displayJerseyNumber(stat.playerId)}</span>
                    </td>
                    <td className="is-player">
                      <button
                        className="me-box__link"
                        onClick={(event) => {
                          event.stopPropagation()
                          navigateToPlayer(stat.playerId)
                        }}
                        type="button"
                      >
                        {formatPlayerShortName(player.firstName, player.lastName)}
                      </button>
                    </td>
                    <td>{formatMinutesCompact(stat.secondsPlayed)}</td>
                    <td>{stat.points}</td>
                    <td>{stat.rebounds}</td>
                    <td>{stat.assists}</td>
                    <td>{stat.steals}</td>
                    <td>{stat.blocks}</td>
                    <td>{stat.foulsCommitted}</td>
                    <td>{formatShooting(stat.fieldGoalsMade, stat.fieldGoalsAttempted)}</td>
                    <td>{formatShooting(stat.threePointMade, stat.threePointAttempted)}</td>
                    <td>{formatShooting(stat.freeThrowsMade, stat.freeThrowsAttempted)}</td>
                    <td className={pmClass}>{formatPlusMinus(stat.plusMinus)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td />
                <td className="is-player">TOTAL</td>
                <td>{formatMinutesCompact(ordered.reduce((sum, row) => sum + row.secondsPlayed, 0))}</td>
                <td>{totals.points}</td>
                <td>{totals.rebounds}</td>
                <td>{totals.assists}</td>
                <td>{totals.steals}</td>
                <td>{totals.blocks}</td>
                <td>{totals.foulsCommitted}</td>
                <td>{formatShooting(totals.fieldGoalsMade, totals.fieldGoalsAttempted)}</td>
                <td>{formatShooting(totals.threePointMade, totals.threePointAttempted)}</td>
                <td>{formatShooting(totals.freeThrowsMade, totals.freeThrowsAttempted)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  )
}
