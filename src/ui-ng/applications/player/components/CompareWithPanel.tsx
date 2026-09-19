import { useEffect, useMemo, useState } from 'react'

import { useGameStore } from '@/stores/gameStore'
import { usePlayerWorkspace } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'
import {
  buildPlayerComparisonSnapshot,
  comparablePlayerOptions,
  type PlayerComparisonSnapshot,
} from '@/ui-ng/applications/player/data/buildPlayerComparisonSnapshot'

const MAX_RESULTS = 40

/**
 * Contextual comparison slide-over, opened from a page's own button.
 *
 * The body belongs to the page that opened it: each page decides what comparing means for its own
 * data, so there is never a generic "compare everything" screen.
 */
export function CompareWithPanel() {
  const { model, session } = usePlayerWorkspace()
  const world = useGameStore((state) => state.world)
  const { compare } = session
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!compare.isOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') compare.close()
    }
    globalThis.addEventListener?.('keydown', onKeyDown)
    return () => globalThis.removeEventListener?.('keydown', onKeyDown)
  }, [compare])

  const options = useMemo(
    () => (world === null || model === null ? [] : comparablePlayerOptions(world, model.identity.playerId)),
    [model, world],
  )

  if (!compare.isOpen || model === null) return null

  const needle = query.trim().toLowerCase()
  const results =
    needle === ''
      ? options.slice(0, MAX_RESULTS)
      : options
          .filter(
            (option) =>
              option.name.toLowerCase().includes(needle) ||
              option.teamName.toLowerCase().includes(needle),
          )
          .slice(0, MAX_RESULTS)
  const snapshot =
    world === null || compare.playerId === null
      ? undefined
      : buildPlayerComparisonSnapshot(world, compare.playerId)

  return (
    <div className="po-compare">
      <div
        aria-hidden
        className="po-compare__scrim"
        onClick={compare.close}
      />
      <aside aria-label="Compare with" className="po-compare__panel" role="dialog">
        <header className="po-compare__head">
          <span className="po-compare__title">Compare with…</span>
          <button className="po-compare__close" onClick={compare.close} type="button">
            Close
          </button>
        </header>

        <label className="po-compare__search">
          <span className="po-compare__search-label">Search player</span>
          <input
            className="po-compare__input"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name or club"
            type="search"
            value={query}
          />
        </label>

        {snapshot === undefined ? (
          <ul className="po-compare__results">
            {results.length === 0 ? (
              <li className="po-compare__empty">No player matches that search.</li>
            ) : (
              results.map((option) => (
                <li key={option.id}>
                  <button
                    className="po-compare__result"
                    onClick={() => compare.setPlayerId(option.id)}
                    type="button"
                  >
                    <span className="po-compare__result-name">{option.name}</span>
                    <span className="po-compare__result-meta">
                      {option.teamName} · {option.position}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : (
          <div className="po-compare__body">
            <div className="po-compare__subject">
              <div>
                <span className="po-compare__subject-name">{snapshot.name}</span>
                <span className="po-compare__subject-meta">
                  {snapshot.teamName} · {snapshot.position} · {snapshot.age} years
                </span>
              </div>
              <button
                className="po-compare__change"
                onClick={() => compare.setPlayerId(null)}
                type="button"
              >
                Change
              </button>
            </div>

            <CompareBody
              currentName={`${model.identity.firstName} ${model.identity.lastName}`}
              currentRatingId={session.selectedRatingId}
              currentRatings={model.ratings}
              snapshot={snapshot}
              view={session.activeView}
            />
          </div>
        )}
      </aside>
    </div>
  )
}

/**
 * Per-page comparison. A page that has no comparison of its own yet says so instead of showing a
 * generic table that means nothing.
 */
export function CompareBody({
  currentName,
  currentRatingId,
  currentRatings,
  snapshot,
  view,
}: {
  readonly currentName: string
  readonly currentRatingId: string | null
  readonly currentRatings: readonly { readonly id: string; readonly label: string; readonly value: number }[]
  readonly snapshot: PlayerComparisonSnapshot
  readonly view: string
}) {
  if (view !== 'attributes') {
    return (
      <p className="po-compare__note">
        Comparing {view} arrives with that page's own milestone.
      </p>
    )
  }

  const rows = currentRatings.map((rating) => ({
    id: rating.id,
    label: rating.label,
    current: rating.value,
    rival: snapshot.ratings[rating.id as keyof typeof snapshot.ratings] ?? null,
  }))
  const selected = rows.find((row) => row.id === currentRatingId)

  return (
    <div className="po-compare__attributes">
      {selected !== undefined && selected.rival !== null && (
        <div className="po-compare__headline">
          <span className="po-compare__headline-label">{selected.label}</span>
          <span className="po-compare__headline-values ng-type-numeric">
            {currentName} {selected.current} · {snapshot.name} {selected.rival}
          </span>
          <span className={`po-compare__delta ng-type-numeric${selected.current - selected.rival < 0 ? ' is-negative' : ''}`}>
            {selected.current - selected.rival > 0 ? '+' : ''}
            {selected.current - selected.rival}
          </span>
        </div>
      )}

      <ul className="po-compare__rows">
        {rows.map((row) => {
          const delta = row.rival === null ? null : row.current - row.rival
          return (
            <li className={`po-compare__row${row.id === currentRatingId ? ' is-selected' : ''}`} key={row.id}>
              <span className="po-compare__row-label">{row.label}</span>
              <span className="po-compare__row-value ng-type-numeric">{row.current}</span>
              <span className="po-compare__row-value ng-type-numeric">{row.rival ?? '—'}</span>
              <span className={`po-compare__delta ng-type-numeric${delta !== null && delta < 0 ? ' is-negative' : ''}`}>
                {delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta}`}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
