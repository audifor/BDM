import { useState } from 'react'

import type { PlayerId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { getMarketKnowledge } from '@/domain/market'
import { getUserTeam } from '@/engine/calendar'
import { isPlayerFreeAgent } from '@/domain/world'
import { syncWorkspaceAppQuery } from '@/ui-ng/workspace/workspaceApps'

type ApproachId = 'club' | 'agent' | 'direct' | 'network'
const APPROACHES: readonly {
  readonly id: ApproachId
  readonly index: string
  readonly icon: string
  readonly name: string
  readonly summary: string
  readonly avenue: string
  readonly consequence: string
  readonly sensitivity: string
}[] = [
  { id: 'club', index: '01', icon: '▣', name: 'CLUB CHANNEL', summary: 'Official enquiry',
    avenue: 'Open a formal conversation with the employing club before approaching a contracted player.',
    consequence: 'The club may welcome an offer, decline it or remember unwanted pressure.',
    sensitivity: 'FORMAL ROUTE' },
  { id: 'agent', index: '02', icon: '◇', name: 'AGENT CHANNEL', summary: 'Intermediary approach',
    avenue: 'Establish contact through an authorized representative, subject to player and competition rules.',
    consequence: 'Information may improve, but unauthorized approaches can harm trust or trigger complaints.',
    sensitivity: 'PERMISSION DEPENDENT' },
  { id: 'direct', index: '03', icon: '◎', name: 'DIRECT CONTACT', summary: 'Player relationship',
    avenue: 'An approach to the player personally. Permission depends on contract and competition rules.',
    consequence: 'A personal relationship may help, but a forbidden approach may create disciplinary exposure.',
    sensitivity: 'REGULATED' },
  { id: 'network', index: '04', icon: '✣', name: 'PRIVATE NETWORK', summary: 'Third-party enquiry',
    avenue: 'Seek information via a genuinely connected acquaintance. No relationship may be invented.',
    consequence: 'Indirect information may be unreliable, leak or damage professional relationships.',
    sensitivity: 'UNVERIFIED INTELLIGENCE' },
]

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
  const [selectedApproach, setSelectedApproach] = useState<ApproachId>('club')
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
  const chosen = APPROACHES.find(approach => approach.id === selectedApproach)!
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
        <span className="pc-rpg__eyebrow">CONTRACT OPPORTUNITIES</span>
        <h2>BUILD THE APPROACH</h2>
        <p>Four possible routes. One professional reputation. Each approach has different consequences.</p>
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
      <header><span>CHOOSE A CONTACT ROUTE</span><small>PREVIEW ONLY · UNDER-CONTRACT CONTACT RULES NOT YET ACTIVE</small></header>
      <div className="pc-rpg__approach-grid" role="group" aria-label="Contact route preview">
        {APPROACHES.map(approach =>
          <button key={approach.id} type="button" aria-pressed={selectedApproach === approach.id}
            aria-controls="pc-rpg-selected-route" onClick={() => setSelectedApproach(approach.id)}>
            <span className="pc-rpg__approach-top"><span className="pc-rpg__approach-icon" aria-hidden="true">{approach.icon}</span>
              <span className="pc-rpg__approach-index">{approach.index} / 04</span></span>
            <strong>{approach.name}</strong>
            <small>{approach.summary}</small>
            <span className="pc-rpg__approach-flag">{approach.sensitivity}</span>
          </button>,
        )}
      </div>
      <section id="pc-rpg-selected-route" className="pc-rpg__approach-details" aria-live="polite">
        <div className="pc-rpg__route-description">
          <span>SELECTED ROUTE</span>
          <strong>{chosen.name}</strong>
          <p>{chosen.avenue}</p>
        </div>
        <div className="pc-rpg__risk">
          <span>POTENTIAL CONSEQUENCES</span>
          <p>{chosen.consequence}</p>
        </div>
        <div className="pc-rpg__route-state">
          <span>NOT YET EXECUTABLE</span>
          <small>FUTURE RPG ACTION · No contact, relationship change or sanction is triggered here.</small>
        </div>
      </section>
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
