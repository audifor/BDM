import { getCurrentSeason } from '@/app/game'
import type { Game } from '@/domain/game'
import { getUserCoach } from '@/domain/world'
import { getGamesToday, getNextUserGame, getUserTeam, inspectCurrentDate } from '@/engine/calendar'
import { getSeasonHistoryRecord } from '@/engine/season'

import { formatPrototypeDate } from '../formatters'

interface HomeScreenProps {
  readonly world: Parameters<typeof getUserTeam>[0]
  readonly onPlayGame: () => void
  readonly onInstantResult: () => void
}

export function HomeScreen({ world, onPlayGame, onInstantResult }: HomeScreenProps) {
  const userTeam = getUserTeam(world)
  const userCoach = getUserCoach(world)
  const todayGame = userTeam === undefined ? undefined : findTeamGame(getGamesToday(world), userTeam.id)
  const nextGame = getNextUserGame(world)
  const status = inspectCurrentDate(world)

  if (userTeam === undefined) {
    return <section className="content-panel">The user coach is not assigned to a team.</section>
  }

  const seasonHistory = getSeasonHistoryRecord(world, getCurrentSeason(world).id)
  if (seasonHistory !== undefined) {
    const champion = world.teams[seasonHistory.championTeamId]!
    const record = seasonHistory.finalStandings.find((line) => line.teamId === champion.id)!
    return <section className="screen home-screen"><div className="page-heading"><div><p className="eyebrow">SEASON COMPLETE</p><h1>{champion.name} are champions</h1><p>{getCurrentSeason(world).label} · Final record {record.wins}-{record.losses}</p></div></div><article className="content-panel"><p>Offseason progression will be added in the next development milestone.</p></article></section>
  }

  return (
    <section className="screen home-screen">
      <div className="page-heading">
        <div>
          <p className="eyebrow">CAREER OVERVIEW</p>
          <h1>{userTeam.name}</h1>
          <p>{userCoach.firstName} {userCoach.lastName} · {getCurrentSeason(world).label}</p>
        </div>
        <div className="date-card">
          <span>CURRENT DATE</span>
          <strong>{formatPrototypeDate(world.currentDate)}</strong>
        </div>
      </div>

      {todayGame === undefined ? (
        <NextGameCard world={world} game={nextGame} userTeamId={userTeam.id} />
      ) : (
        <article className="game-card game-day-card">
          <p className="eyebrow">GAME DAY</p>
          <GameMatchup world={world} game={todayGame} />
          {todayGame.status === 'scheduled' ? (
            <div className="game-actions">
              <button className="primary-button" onClick={onPlayGame} type="button">PLAY GAME</button>
              <button className="secondary-button" onClick={onInstantResult} type="button">INSTANT RESULT</button>
            </div>
          ) : (
            <p className="final-score">FINAL · {todayGame.result!.homeScore} – {todayGame.result!.awayScore}</p>
          )}
        </article>
      )}

      <article className="content-panel day-status">
        <span>DAY STATUS</span>
        <strong>{status.scheduledGames.length === 0 ? 'All games resolved' : `${status.scheduledGames.length} game${status.scheduledGames.length === 1 ? '' : 's'} scheduled`}</strong>
      </article>
    </section>
  )
}

function NextGameCard({ world, game, userTeamId }: { readonly world: Parameters<typeof getUserTeam>[0]; readonly game: Game | undefined; readonly userTeamId: NonNullable<ReturnType<typeof getUserTeam>>['id'] }) {
  if (game === undefined) {
    return <article className="content-panel"><p className="eyebrow">NEXT GAME</p><strong>No scheduled game</strong></article>
  }

  const opponentId = game.homeTeamId === userTeamId ? game.awayTeamId : game.homeTeamId
  const venue = game.homeTeamId === userTeamId ? 'HOME' : 'AWAY'
  return (
    <article className="game-card">
      <p className="eyebrow">NEXT GAME · {venue}</p>
      <h2>vs {world.teams[opponentId]!.name}</h2>
      <p>{formatPrototypeDate(game.date)}</p>
    </article>
  )
}

function GameMatchup({ world, game }: { readonly world: Parameters<typeof getUserTeam>[0]; readonly game: Game }) {
  return <h2>{world.teams[game.homeTeamId]!.name} <span>vs</span> {world.teams[game.awayTeamId]!.name}</h2>
}

function findTeamGame(games: readonly Game[], teamId: NonNullable<ReturnType<typeof getUserTeam>>['id']): Game | undefined {
  return games.find((game) => game.homeTeamId === teamId || game.awayTeamId === teamId)
}
