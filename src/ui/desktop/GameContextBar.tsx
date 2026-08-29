import type { GameWorld } from '@/domain/world'
import { formatPrototypeDate } from '@/ui/formatters'
import { resolveGameContext } from '@/ui/gameContext'
import { BdmButton } from '@/ui/components/designSystem'

export function GameContextBar({ onOpenSettings, onSearch, world }: { readonly onOpenSettings?: () => void; readonly onSearch?: () => void; readonly world: GameWorld }) {
  const context = resolveGameContext(world)
  const systemTime = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date())
  return <aside aria-label="Game context" className="game-context-bar" data-testid="game-context-bar">
    <div className="game-context-bar__club" title={context.clubName ?? 'No controlled club'}><span aria-hidden="true" className="game-context-bar__crest">BDM</span><span><strong>BDM</strong><small>BASKETBALL DYNASTY MANAGER</small></span></div>
    <div className="game-context-bar__competition" title={context.competitionName ?? 'No active competition'}>
      <span>{context.competitionName ?? 'No active competition'}</span>
      <small>{[context.seasonLabel, context.phaseLabel].filter((value): value is string => value !== undefined).join(' · ') || 'Season unavailable'}</small>
    </div>
    {context.ecosystemName !== undefined && <span className="game-context-bar__ecosystem" title={context.ecosystemName}>{context.ecosystemName}</span>}
    <time dateTime={context.currentDate}>{formatPrototypeDate(context.currentDate)} <b>{systemTime}</b></time>
    <div className="game-context-bar__actions"><BdmButton onClick={onSearch} size="compact" variant="ghost">Search anything…</BdmButton><span aria-label="Notifications" className="top-chrome-icon top-chrome-icon--bell" /><span aria-label="Inbox" className="top-chrome-icon top-chrome-icon--mail" /><span aria-label="Help" className="top-chrome-icon top-chrome-icon--help" /><BdmButton aria-label="Settings" onClick={onOpenSettings} size="compact" variant="ghost">Settings</BdmButton><span aria-hidden="true" className="top-chrome-window-controls" /></div>
  </aside>
}
