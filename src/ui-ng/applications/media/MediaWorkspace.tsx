import { getCoachMediaProfileDescriptor, getPendingMediaOpportunities } from '@/domain/world'
import { useGameStore } from '@/stores/gameStore'
import { NgHoloShell } from '@/ui-ng/workspace/NgHoloShell'

export function MediaWorkspace() {
  const world = useGameStore((state) => state.world)
  const respondToMedia = useGameStore((state) => state.respondToMedia)
  const skipMedia = useGameStore((state) => state.skipMedia)

  if (world === null) {
    return <NgHoloShell appLabel="Press" empty emptyMessage="No career loaded." region="media-workspace" />
  }

  const pending = getPendingMediaOpportunities(world, world.userCoachId)
  const descriptor = getCoachMediaProfileDescriptor(world, world.userCoachId)

  return (
    <NgHoloShell appLabel="Press" meta={descriptor ?? 'No profile'} region="media-workspace" title="Press room">
      {pending.length === 0 ? (
        <p className="ng-canon__empty">No pending press interactions.</p>
      ) : (
        <div className="ng-canon__cards">
          {pending.map((item) => {
            const question = item.questions[0]
            return (
              <article className="ng-canon__card ng-holo-panel" key={item.id}>
                <p className="ng-canon__eyebrow">{item.type === 'preMatch' ? 'Pre-match' : 'Post-match'}</p>
                <h3 className="ng-canon__title">{question?.text ?? item.id}</h3>
                <p className="ng-canon__note">Topic: {question?.topic ?? '—'}</p>
                <div className="ng-canon__actions">
                  {item.answers.map((answer) => (
                    <button className="ng-canon__action" key={answer.stance} onClick={() => respondToMedia(item.id, answer.stance)} type="button">
                      {answer.text}
                    </button>
                  ))}
                  <button className="ng-canon__action" onClick={() => skipMedia(item.id)} type="button">
                    Delegate answer
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </NgHoloShell>
  )
}
