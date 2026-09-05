import { getMemoriesForEntity } from '@/domain/world'
import { useGameStore } from '@/stores/gameStore'
import { formatGameDateLabel } from '@/ui-ng/applications/player/data/presentationHelpers'
import { NgHoloShell } from '@/ui-ng/workspace/NgHoloShell'

export function MemoriesWorkspace() {
  const world = useGameStore((state) => state.world)
  if (world === null) {
    return <NgHoloShell appLabel="Memories" empty emptyMessage="No career loaded." region="memories-workspace" />
  }

  const memories = getMemoriesForEntity(world, world.userCoachId, { minimumImportance: 'notable', limit: 20 })

  return (
    <NgHoloShell appLabel="Memories" meta={`${memories.length} notable`} region="memories-workspace" title="Personal history">
      {memories.length === 0 ? (
        <p className="ng-canon__empty">No notable memories yet.</p>
      ) : (
        <div className="ng-canon__panel ng-holo-panel">
          <ul className="ng-canon__list">
            {memories.map((memory) => (
              <li key={memory.id}>
                <strong>{memory.type}</strong> · {memory.importance} ·{' '}
                {memory.valence > 0 ? 'positive' : memory.valence < 0 ? 'negative' : 'neutral'} · intensity {memory.intensity}
                <div className="ng-canon__note">
                  {formatGameDateLabel(memory.occurredOn)} · {memory.tags.join(', ')}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </NgHoloShell>
  )
}
