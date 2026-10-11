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
  readonly icon: string
  readonly name: string
  readonly summary: string
  readonly avenue: string
  readonly consequence: string
}[] = [
  { id: 'club', icon: '▣', name: 'CLUB CHANNEL', summary: 'Official enquiry',
    avenue: 'Open a formal conversation with the employing club before approaching a contracted player.',
    consequence: 'The club may welcome an offer, decline it or remember unwanted pressure.' },
  { id: 'agent', icon: '◇', name: 'AGENT CHANNEL', summary: 'Intermediary approach',
    avenue: 'Establish contact through an authorized representative, subject to player and competition rules.',
    consequence: 'Information may improve, but unauthorized approaches can harm trust or trigger complaints.' },
  { id: 'direct', icon: '◎', name: 'DIRECT CONTACT', summary: 'Player relationship',
    avenue: 'An approach to the player personally. Permission depends on contract and competition rules.',
    consequence: 'A personal relationship may help, but a forbidden approach may create disciplinary exposure.' },
  { id: 'network', icon: '✣', name: 'PRIVATE NETWORK', summary: 'Third-party enquiry',
    avenue: 'Seek information via a genuinely connected acquaintance. No relationship may be invented.',
    consequence: 'Indirect information may be unreliable, leak or damage professional relationships.' },
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

/** Rival profile only reads the viewer's market knowledge, never hidden marketReality,
 * rival negotiations, agents, representations or private club relationships. */
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

  return <section className="pc-rpg" data-ng-region="player-contract-opportunities">
    <header className="pc-rpg__hero">
      <div>
        <span className="pc-rpg__eyebrow">RECRUITMENT INTELLIGENCE</span>
        <h2>{playerName}</h2>
        <p>Build a relationship before an offer. Private contract terms are not available without authorized evidence.</p>
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

    <div className="pc-rpg__intelligence" aria-label="Authorized market intelligence">
      <div><span>SOURCE</span><strong>{knowledge === undefined ? 'NOT RECORDED' : SIGNAL_SOURCE[knowledge.source] ?? knowledge.source}</strong></div>
      <div><span>PLAYER INTEREST</span><strong>{interest}</strong></div>
      <div><span>ASSESSED</span><strong>{knowledge?.assessedAt ?? 'UNKNOWN'}</strong></div>
      <div><span>RELIABILITY OF REPORT</span>
        <strong>{knowledge === undefined ? 'UNKNOWN' : `${knowledge.confidence}%`}</strong>
        <small>Source confidence, not signing probability</small>
      </div>
    </div>

    <div className="pc-rpg__flow">
      <section className="pc-rpg__approaches">
        <header><span>CHOOSE A CONTACT ROUTE</span><small>Strategic preview · not yet executable for contracted rivals</small></header>
        <div className="pc-rpg__approach-grid" role="group" aria-label="Contact route preview">
          {APPROACHES.map(approach =>
            <button key={approach.id} type="button" aria-pressed={selectedApproach === approach.id}
              onClick={() => setSelectedApproach(approach.id)}>
              <span className="pc-rpg__approach-icon" aria-hidden="true">{approach.icon}</span>
              <strong>{approach.name}</strong>
              <small>{approach.summary}</small>
            </button>,
          )}
        </div>
        <section className="pc-rpg__approach-details" aria-live="polite">
          <div><span>SELECTED STRATEGY</span><strong>{chosen.name}</strong></div>
          <p>{chosen.avenue}</p>
          <div className="pc-rpg__risk"><span>WHAT MAY HAPPEN</span><p>{chosen.consequence}</p></div>
          <div className="pc-rpg__not-live">FUTURE RPG ACTION · No contact, relationship change or sanction is triggered here.</div>
        </section>
      </section>
      <aside className="pc-rpg__signals">
        <header><strong>CLUB INTELLIGENCE</strong><small>{sourceSignals.length} source events</small></header>
        {sourceSignals.length === 0 ?
          <div className="pc-rpg__empty">
            <strong>NO CONTACT HISTORY</strong>
            <span>Scouting can build an authorized picture of the opportunity.</span>
          </div>
          : <ol>{sourceSignals.slice(0, 5).map(signal => <li key={signal.id}>
            <time>{signal.occurredOn}</time><strong>{SIGNAL_SOURCE[signal.source] ?? signal.source}</strong>
            <span>{signal.availability === undefined ? 'Signal recorded' : signal.availability.replaceAll('_', ' ')}</span>
          </li>)}</ol>}
        <div className="pc-rpg__next-action">
          {isFreeAgent ?
            <button type="button" onClick={() => syncWorkspaceAppQuery('market','push')}>
              EXPLORE FREE-AGENT MARKET ↗
            </button>
            : <span>Formal contact with contracted players requires a supported market pathway.</span>}
        </div>
      </aside>
    </div>
  </section>
}
