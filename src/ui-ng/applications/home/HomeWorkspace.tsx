import { useMemo } from 'react'

import { getContinueStopReason } from '@/app/game/ContinueFlow'
import { getInboxItemsForCoach, getNewsFeed } from '@/domain/world'
import { calculateStandings } from '@/engine/competition/standings'
import { getNextUserGame, getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { formatGameDateLabel } from '@/ui-ng/applications/player/data/presentationHelpers'
import { NgHoloShell, NgMetric } from '@/ui-ng/workspace/NgHoloShell'
import { useNgWorkspaceNavigation } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
import { syncWorkspaceAppQuery } from '@/ui-ng/workspace/workspaceApps'

export function HomeWorkspace() {
  const world = useGameStore((state) => state.world)
  const continueGame = useGameStore((state) => state.continueGame)
  const { openEntity } = useNgWorkspaceNavigation()

  const model = useMemo(() => {
    if (world === null) return null
    const team = getUserTeam(world)
    const nextGame = getNextUserGame(world)
    const stop = getContinueStopReason(world)
    const standings = team === undefined ? [] : calculateStandings(world, world.currentSeasonId)
    const userRow = team === undefined ? undefined : standings.find((row) => row.teamId === team.id)
    const news = getNewsFeed(world).slice(0, 6)
    const inbox = getInboxItemsForCoach(world, world.userCoachId).slice(0, 6)
    return {
      team,
      nextGame,
      stop,
      userRow,
      standings: standings.slice(0, 8),
      news,
      inbox,
      inboxCount: getInboxItemsForCoach(world, world.userCoachId).length,
    }
  }, [world])

  if (world === null || model === null) {
    return <NgHoloShell appLabel="Home" empty emptyTitle="Home" emptyMessage="No career loaded." region="home-workspace" />
  }

  const opponent =
    model.nextGame === undefined || model.team === undefined
      ? undefined
      : world.teams[model.nextGame.homeTeamId === model.team.id ? model.nextGame.awayTeamId : model.nextGame.homeTeamId]

  return (
    <NgHoloShell
      appLabel="Home"
      meta={
        <>
          <span className="ng-type-numeric">{model.inboxCount}</span> inbox
          {' · '}
          {model.stop?.type === 'userGame' ? 'Match day' : model.stop?.type === 'mediaOpportunity' ? 'Press waiting' : 'Ready'}
        </>
      }
      region="home-workspace"
      teamId={model.team?.id}
      title={model.team?.name ?? 'Career'}
    >
      <div className="ng-canon__overview">
        <section className="ng-canon__card ng-holo-panel">
          <p className="ng-canon__eyebrow">Continue</p>
          <h3 className="ng-canon__title">Advance career</h3>
          <p className="ng-canon__note">
            {model.stop?.type === 'userGame'
              ? 'A controlled match is scheduled today.'
              : model.stop?.type === 'mediaOpportunity'
                ? 'A press opportunity is waiting.'
                : model.stop?.type === 'seasonComplete'
                  ? 'The season is complete.'
                  : 'No blocking event. Continue advances the calendar.'}
          </p>
          <div className="ng-canon__actions">
            <button className="ng-canon__action" onClick={() => continueGame()} type="button">
              Continue
            </button>
            {model.stop?.type === 'userGame' ? (
              <button className="ng-canon__action" onClick={() => syncWorkspaceAppQuery('match')} type="button">
                Open match
              </button>
            ) : null}
            {model.stop?.type === 'mediaOpportunity' ? (
              <button className="ng-canon__action" onClick={() => syncWorkspaceAppQuery('media')} type="button">
                Open press
              </button>
            ) : null}
          </div>
        </section>
        <section className="ng-canon__card ng-holo-panel">
          <p className="ng-canon__eyebrow">Next match</p>
          <h3 className="ng-canon__title">
            {opponent === undefined ? (
              'No fixture'
            ) : (
              <button
                className="ng-canon__link"
                onClick={() => openEntity({ type: 'team', teamId: opponent.id, section: 'overview' })}
                type="button"
              >
                {opponent.name}
              </button>
            )}
          </h3>
          <dl className="ng-canon__metrics">
            <NgMetric label="Date" value={model.nextGame === undefined ? '—' : formatGameDateLabel(model.nextGame.date)} />
            <NgMetric
              label="Venue"
              value={
                model.nextGame === undefined || model.team === undefined
                  ? '—'
                  : model.nextGame.homeTeamId === model.team.id
                    ? 'Home'
                    : 'Away'
              }
            />
            <NgMetric label="Status" value={model.nextGame?.status ?? '—'} />
          </dl>
        </section>
        <section className="ng-canon__card ng-holo-panel">
          <p className="ng-canon__eyebrow">Table</p>
          <h3 className="ng-canon__title">Standings</h3>
          <dl className="ng-canon__metrics">
            <NgMetric label="Position" value={model.userRow?.position ?? '—'} />
            <NgMetric label="Record" value={model.userRow === undefined ? '—' : `${model.userRow.wins}-${model.userRow.losses}`} />
          </dl>
        </section>
      </div>
      <div className="ng-canon__split" style={{ marginTop: 'var(--ng-spacing-12)' }}>
        <div className="ng-canon__panel ng-holo-panel">
          <p className="ng-canon__eyebrow">News</p>
          {model.news.length === 0 ? (
            <p className="ng-canon__empty">No news items.</p>
          ) : (
            <ul className="ng-canon__list">
              {model.news.map((item) => (
                <li key={item.id}>
                  <strong>{item.headline}</strong>
                  <div className="ng-canon__note">{formatGameDateLabel(item.gameDate)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <aside className="ng-canon__inspector ng-holo-panel">
          <p className="ng-canon__eyebrow">Inbox</p>
          {model.inbox.length === 0 ? (
            <p className="ng-canon__empty">No inbox items.</p>
          ) : (
            <ul className="ng-canon__list">
              {model.inbox.map((item) => (
                <li key={item.id}>
                    <strong>{item.title}</strong>
                  <div className="ng-canon__note">{formatGameDateLabel(item.gameDate)}</div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </NgHoloShell>
  )
}
