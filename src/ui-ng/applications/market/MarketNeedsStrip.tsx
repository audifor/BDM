import { useMemo } from 'react'
import type { TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import type { ClubNeedKind } from '@/engine/clubNeeds'
import { assessGMDecisionContext } from '@/engine/gmDecisionContext'

const NEED_LABEL: Readonly<Record<ClubNeedKind, string>> = Object.freeze({
  ROSTER_SIZE: 'Plantilla corta',
  POSITIONAL_DEPTH: 'Falta de profundidad',
  STARTER_QUALITY_GAP: 'Titular de nivel bajo',
  BENCH_QUALITY_GAP: 'Suplente de nivel bajo',
  ROLE_GAP: 'Rol sin cubrir',
  CONTRACT_CONTINUITY: 'Continuidad contractual',
  CONTRACT_CLUSTER: 'Vencimientos concentrados',
  AGING_CORE: 'Núcleo veterano',
  DEVELOPMENT_OPPORTUNITY: 'Oportunidad de desarrollo',
  POSITION_SURPLUS: 'Exceso en la posición',
  TEMPORARY_COVER: 'Cobertura temporal',
  ELIGIBILITY_GAP: 'Elegibilidad',
  FINANCIAL_PRESSURE: 'Presión financiera',
})
const SEVERITY_LABEL = { CRITICAL: 'Crítica', HIGH: 'Alta', MEDIUM: 'Media', LOW: 'Baja' } as const

/**
 * F3 · the sporting need that starts a market operation. It is the same canonical assessment the GM planning uses
 * (`assessGMDecisionContext`); a need offers "buscar" only when external acquisition is a selectable response for it.
 */
export function MarketNeedsStrip({ world, teamId, onSearch }: { readonly world: GameWorld; readonly teamId: TeamId; readonly onSearch: (position: string | null) => void }) {
  const rows = useMemo(() => {
    const context = assessGMDecisionContext(world, teamId, world.currentDate, { includeAllDetectedNeeds: true })
    const acquirable = new Set(context.options.filter((option) => option.kind === 'EXTERNAL_ACQUISITION' && option.planningEligibility === 'SELECTABLE').map((option) => option.needId))
    return context.needsAssessment.needs
      .filter((need) => need.kind !== 'FINANCIAL_PRESSURE')
      .map((need) => ({ need, acquirable: acquirable.has(need.id) }))
      .sort((a, b) => Number(b.acquirable) - Number(a.acquirable) || a.need.priorityRank - b.need.priorityRank)
  }, [world, teamId])
  return <section className="market-needs" aria-label="Necesidades de plantilla" data-testid="market-needs">
    <header><strong>NECESIDADES DE PLANTILLA</strong><small>{rows.filter((row) => row.acquirable).length} con vía de fichaje</small></header>
    {rows.length === 0 ? <p className="market-needs__empty">El análisis de plantilla no detecta necesidades.</p> : <ul>
      {rows.slice(0, 6).map(({ need, acquirable }) => {
        const names = need.relatedPlayerIds.slice(0, 2).map((id) => world.players[id]).filter((player) => player !== undefined).map((player) => `${player!.firstName} ${player!.lastName}`)
        return <li key={need.id} data-need-kind={need.kind}>
          <span><b>{NEED_LABEL[need.kind]}</b>{need.targetPosition === undefined ? '' : ` · ${need.targetPosition}`}<small>{SEVERITY_LABEL[need.severity]}{names.length === 0 ? '' : ` · ${names.join(', ')}`}</small></span>
          {acquirable
            ? <button type="button" onClick={() => onSearch(need.targetPosition ?? null)}>Buscar agentes libres{need.targetPosition === undefined ? '' : ` ${need.targetPosition}`}</button>
            : <em>Sin fichaje posible para esta necesidad</em>}
        </li>
      })}
    </ul>}
  </section>
}
