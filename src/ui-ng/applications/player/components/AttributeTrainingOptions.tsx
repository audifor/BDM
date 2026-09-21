import { useState } from 'react'

import type {
  AttributeTrainingOptionModel,
  RatingEvolutionModel,
} from '@/ui-ng/applications/player/data/playerWorkspaceModel'

function formatMultiplier(value: number): string {
  return value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

export function AttributeTrainingOptions({
  evolution,
  label,
  onAssign,
}: {
  readonly evolution: RatingEvolutionModel
  readonly label: string
  /** Assigns a module as the player's next individual training. Absent when nothing is schedulable. */
  readonly onAssign?: (moduleId: string) => void
}) {
  const options = evolution.trainings
  const { assignment } = evolution
  const nextSession = assignment.nextSession
  const [error, setError] = useState<string | null>(null)
  const canAssign = assignment.status === 'available' && onAssign !== undefined

  /**
   * The option already booked as the next training. Sessions created from a module record it, so
   * the match is exact; a session without a module only matches its execution definition.
   */
  const isActiveOption = (option: AttributeTrainingOptionModel): boolean =>
    nextSession !== null &&
    (nextSession.moduleId === null
      ? option.definitionId === nextSession.definitionId
      : option.id === nextSession.moduleId)

  return (
    <section className="po-attr-training">
      <header className="po-attr-training__head">
        <span className="po-attr-training__title">Trainings for {label}</span>
        {options.length > 0 && (
          <span className="po-attr-training__count ng-type-numeric">
            {options.length} {options.length === 1 ? 'option' : 'options'}
          </span>
        )}
      </header>

      <p className="po-attr-training__stimulus ng-type-numeric">
        {evolution.accumulatedStimulus === null
          ? 'Canonical 80-key training stimulus is not tracked yet.'
          : `${evolution.accumulatedStimulus.toFixed(1)} stimulus accumulated this season`}
      </p>

      {assignment.status === 'available' ? (
        <p className="po-attr-training__next">
          {nextSession === null ? (
            <>
              No individual session booked. Assigning books{' '}
              <b className="ng-type-numeric">
                {assignment.date} · {assignment.startTime}
              </b>
              .
            </>
          ) : (
            <>
              Next training: <b>{nextSession.label}</b>{' '}
              <span className="ng-type-numeric">
                {nextSession.date} · {nextSession.startTime} · {nextSession.intensity}
              </span>
            </>
          )}
        </p>
      ) : (
        <p className="po-attr-training__blocked">{assignment.reason}</p>
      )}

      {options.length === 0 ? (
        <p className="po-attr-training__empty">
          No catalog training targets this attribute, so it can only move through the base age curve.
        </p>
      ) : (
        <ul className="po-attr-training__list">
          {options.map((option) => (
            <li className="po-attr-training__option" key={option.id}>
              <span className="po-attr-training__name">
                {option.name}
                {option.isUserModule && <span className="po-attr-training__tag">Custom</span>}
              </span>
              <span className="po-attr-training__meta">
                {option.categoryLabel} · {option.scopeLabel} · {option.defaultIntensity} ·{' '}
                {option.durationMinutes} min
              </span>
              <span className="po-attr-training__load">
                <span className="po-attr-training__weight ng-type-numeric">
                  ×{formatMultiplier(option.developmentWeight)} development
                </span>
                <span className="po-attr-training__fatigue ng-type-numeric">
                  ×{formatMultiplier(option.fatigueMultiplier)} fatigue
                </span>
              </span>
              {canAssign && (
                <span className="po-attr-training__action">
                  {!option.individualAssignable ? (
                    <span className="po-attr-training__hint">
                      Team session only — schedule it from Training
                    </span>
                  ) : isActiveOption(option) ? (
                    <button
                      className="po-attr-training__assign is-active"
                      disabled
                      title="Already booked as the next training"
                      type="button"
                    >
                      Next training
                    </button>
                  ) : (
                    <button
                      className="po-attr-training__assign"
                      onClick={() => {
                        setError(null)
                        try {
                          onAssign(option.id)
                        } catch (cause) {
                          setError(
                            cause instanceof Error ? cause.message : 'Could not schedule this training.',
                          )
                        }
                      }}
                      type="button"
                    >
                      {nextSession === null ? 'Assign as next training' : 'Make it next training'}
                    </button>
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {error !== null && <p className="po-attr-training__error">{error}</p>}
    </section>
  )
}
