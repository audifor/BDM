import { getMemoriesForEntity } from '@/domain/world'
import type { GameWorld } from '@/domain/world'

export function MemoryScreen({ world }: { readonly world: GameWorld }) {
  const memories = getMemoriesForEntity(world, world.userCoachId, { minimumImportance: 'notable', limit: 20 })
  return <section className="screen"><div className="page-heading"><div><p className="eyebrow">Historia personal</p><h1>Recuerdos</h1><p>Acontecimientos que tu entrenador considera significativos.</p></div></div><section className="content-panel">{memories.length === 0 ? <p>Aún no hay recuerdos relevantes.</p> : <ul>{memories.map((memory) => <li key={memory.id}><strong>{memory.type}</strong> · {memory.importance} · {memory.valence > 0 ? 'positivo' : memory.valence < 0 ? 'negativo' : 'neutral'} · intensidad {memory.intensity}<br /><small>{memory.occurredOn} · {memory.tags.join(', ')}</small></li>)}</ul>}</section></section>
}
