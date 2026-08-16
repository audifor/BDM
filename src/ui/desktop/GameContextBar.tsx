import type { GameWorld } from '@/domain/world'
import { formatPrototypeDate } from '@/ui/formatters'
import { resolveGameContext } from '@/ui/gameContext'

export function GameContextBar({ world }: { readonly world: GameWorld }) {
  const context = resolveGameContext(world)
  return <aside aria-label="Game context" className="game-context-bar" data-testid="game-context-bar">
    <div className="game-context-bar__club" title={context.clubName ?? 'No controlled club'}>
      <span aria-hidden="true" className="game-context-bar__crest">BDM</span>
      <strong>{context.clubName ?? 'No controlled club'}</strong>
    </div>
    <div className="game-context-bar__competition" title={context.competitionName ?? 'No active competition'}>
      <span>{context.competitionName ?? 'No active competition'}</span>
      <small>{[context.seasonLabel, context.phaseLabel].filter((value): value is string => value !== undefined).join(' · ') || 'Season unavailable'}</small>
    </div>
    {context.ecosystemName !== undefined && <span className="game-context-bar__ecosystem" title={context.ecosystemName}>{context.ecosystemName}</span>}
    <time dateTime={context.currentDate}>{formatPrototypeDate(context.currentDate)}</time>
  </aside>
}
