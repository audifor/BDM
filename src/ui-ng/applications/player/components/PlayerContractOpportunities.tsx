import type { PlayerId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { getMarketKnowledge } from '@/domain/market'
import { getUserTeam } from '@/engine/calendar'
import { isPlayerFreeAgent } from '@/domain/world'
import { navigateToMarketTab, syncWorkspaceAppQuery } from '@/ui-ng/workspace/workspaceApps'
import { TransferApproachPanel } from '@/ui-ng/applications/market/TransferApproachPanel'

const SIGNAL_SOURCE: Record<string, string> = {
  AGENT: 'AGENT SOURCE',
  CLUB_CONTACT: 'CLUB CONTACT',
  MEDIA: 'MEDIA SOURCE',
}

interface Props {
  readonly world: GameWorld | null
  readonly playerId: PlayerId
  readonly playerName: string
  readonly onScouting: () => void
}

/** Rival information is exclusively the viewing club's authorized knowledge.
 * Contact routes below are decision previews, never a world mutation. */
export function PlayerContractOpportunities({ world, playerId, playerName, onScouting }: Props) {
  const team = world === null ? undefined : getUserTeam(world)
  const knowledge = world !== null && team !== undefined
    ? getMarketKnowledge(world.marketKnowledge, team.organizationId, playerId)
    : undefined
  const sourceSignals = world !== null && team !== undefined
    ? Object.values(world.marketSignalsById)
      .filter(signal => signal.organizationId === team.organizationId && signal.playerId === playerId)
      .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.id.localeCompare(a.id))
    : []
  const isFreeAgent = world !== null && isPlayerFreeAgent(world, playerId)
  const status = knowledge?.availability === 'OPEN' ? 'OPEN TO OFFERS'
    : knowledge?.availability === 'LISTENING' ? 'MAY LISTEN'
    : knowledge?.availability === 'NOT_FOR_SALE' ? 'NOT FOR SALE'
    : 'NOT VERIFIED'
  const interest = knowledge?.playerInterest === undefined ? 'UNKNOWN'
    : knowledge.playerInterest >= 70 ? 'FAVOURABLE SIGNAL'
    : knowledge.playerInterest >= 40 ? 'MIXED SIGNAL'
    : 'UNFAVOURABLE SIGNAL'

  return <section className="pc-rpg pc-rpg--v31" data-ng-region="player-contract-opportunities" aria-label={'Contract opportunities: ' + playerName}>
    <header className="pc-rpg__hero">
      <div className="pc-rpg__headline">
        <span className="pc-rpg__eyebrow">CONTRACT · {isFreeAgent ? 'FREE AGENT' : 'UNDER CONTRACT WITH ANOTHER CLUB'}</span>
        <h2>{isFreeAgent ? 'SIGN THIS FREE AGENT' : 'BUY FROM HIS CLUB'}</h2>
        <p>{isFreeAgent ? 'He has no club: you negotiate with him and his agent.' : 'He has a contract: the only door is the club that holds it. Then you negotiate with him, and your Board must authorize it.'}</p>
      </div>
      <div className="pc-rpg__hero-status">
        <small>MARKET POSITION</small>
        <strong>{status}</strong>
        <span>{knowledge === undefined ? 'NO VERIFIED MARKET REPORT' : 'YOUR CLUB’S OBSERVATION'}</span>
      </div>
      <button type="button" onClick={onScouting} className="pc-rpg__primary">
        OPEN SCOUTING REPORT <span aria-hidden="true">↗</span>
      </button>
    </header>

    <div className={'pc-rpg__intel-strip' + (knowledge === undefined ? ' is-unknown' : '')}
      role="region" aria-label="Authorized market intelligence">
      {knowledge === undefined
        ? <><span className="pc-rpg__intel-icon" aria-hidden="true">◇</span>
            <strong>NO VERIFIED MARKET INTELLIGENCE</strong>
            <span className="pc-rpg__intel-explanation">Interest, agent source and terms remain unknown until your club obtains evidence.</span>
          </>
        : <>
          <div><span>SOURCE</span><strong>{SIGNAL_SOURCE[knowledge.source] ?? knowledge.source}</strong></div>
          <div><span>PLAYER INTEREST</span><strong>{interest}</strong></div>
          <div><span>ASSESSED</span><strong>{knowledge.assessedAt}</strong></div>
          <div><span>REPORT CONFIDENCE</span><strong>{knowledge.confidence}%</strong><small>Not signing probability</small></div>
        </>}
    </div>

    <section className="pc-rpg__approaches" data-ng-region="contract-contact-routes">
      {team === undefined || world === null
        ? null
        : isFreeAgent
          ? <div className="market-transfer__note"><p>Es agente libre. Su contacto, tu oferta (salario, años, rol) y su respuesta están en Mercado.</p>
            <button type="button" onClick={() => navigateToMarketTab('free-agents')}>ABRIR MERCADO DE AGENTES LIBRES ↗</button></div>
          : <TransferApproachPanel world={world} teamId={team.id} playerId={playerId} onProposed={() => navigateToMarketTab('operations')} />}
    </section>

    <section className="pc-rpg__history" data-ng-region="contract-intelligence-history">
      <div className="pc-rpg__history-title">
        <strong>CLUB INTELLIGENCE</strong>
        <span>{sourceSignals.length} source events</span>
        {isFreeAgent && <button type="button" onClick={() => syncWorkspaceAppQuery('market', 'push')}>
          OPEN FREE-AGENT MARKET ↗
        </button>}
      </div>
      {sourceSignals.length === 0
        ? <span className="pc-rpg__history-empty">NO CONTACT HISTORY · Scouting can create an authorized information trail.</span>
        : <ol>{sourceSignals.slice(0, 6).map(signal => <li key={signal.id}>
          <time>{signal.occurredOn}</time>
          <strong>{SIGNAL_SOURCE[signal.source] ?? signal.source}</strong>
          <span>{signal.availability === undefined ? 'Signal recorded' : signal.availability.replaceAll('_', ' ')}</span>
        </li>)}</ol>}
    </section>
  </section>
}
