import { beforeAll, describe, expect, it, vi } from 'vitest'
import { getFreeAgents, getTeamRoster, type GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { initializeFreeAgentMarketTruth } from '@/engine/market'
import { createF3Day0, f3Store, f3World } from './testSupport/PlayableF3Support'
import { f3PlayDirectSigning } from './testSupport/PlayableF3TransferSupport'

/**
 * F3 adendo · las necesidades detectadas son una recomendacion, nunca un requisito. Aqui el sistema de recomendaciones del club no
 * recomienda a NADIE (devuelve siempre vacio): aun asi el manager contacta a un agente libre, le presenta su propia oferta y lo ficha.
 */
vi.mock('@/app/marketIntelligence/FreeAgentOfferIntelligenceService', () => ({ assessRoutedFreeAgentOfferIntelligence: () => [] }))
vi.setConfig({ testTimeout: 600_000, hookTimeout: 900_000 })

let day0: GameWorld
beforeAll(async () => { day0 = await createF3Day0(); f3Store().replaceWorld(day0) }, 900_000)

describe('F3 adendo · A · agente libre sin necesidad detectada', () => {
  it('con cero recomendaciones del club, un agente libre recibe contacto, oferta valida, respuesta real, autorizacion y firma', () => {
    const team = getUserTeam(day0)!
    const pool = getFreeAgents(day0).map((player) => player.id).filter((id) => initializeFreeAgentMarketTruth(day0, [id]).marketRealityByPlayerId[id]!.playerWillingness >= 50)
    expect(pool.length).toBeGreaterThan(0)
    const outcomes = pool.slice(0, 3).map((id) => { f3Store().replaceWorld(day0); return f3PlayDirectSigning(id, { salaryShare: 1.1, years: 2 }) })
    const signed = outcomes.find((outcome) => outcome.status === 'SIGNED')
    expect(signed, outcomes.map((o) => `${o.playerId}:${o.stoppedAt ?? o.status}`).join(' ; ')).toBeDefined()
    const world = signed!.worldAfter!
    expect(getTeamRoster(world, team.id).map((player) => player.id)).toContain(signed!.playerId)
    expect(Object.values(world.contractsById).filter((item) => item.playerId === signed!.playerId && item.teamId === team.id)).toHaveLength(1)
    expect(f3World().currentDate >= day0.currentDate).toBe(true)
  })
})
