import { useMemo } from 'react'
import type { PlayerId } from '@/domain/ids'
import { useGameStore } from '@/stores/gameStore'
import { buildTalentPlayerViewModel } from './TalentPlayerViewModel'
import './talent-operations.css'

export function TalentPlayerPathwayBand({ playerId }: { readonly playerId: PlayerId }) {
  const world = useGameStore((state) => state.world)
  const model = useMemo(() => world === null ? null : buildTalentPlayerViewModel(world, playerId), [playerId, world])
  if (model === null) return null
  const facts = [
    ['Pathway', model.pathway],
    ['Organization knowledge', model.organizationKnowledge],
    ['Recruiting', model.recruiting],
    ['Portal', model.portal],
    ['Draft', model.draft],
    ['Eligibility', model.eligibility],
  ]
  return <section aria-label="Player talent pathway status" className="talent-player-pathway-band">{facts.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</section>
}
