// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, expect, it } from 'vitest'
import { createGameWorld, updateGameWorld } from '@/domain/world'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { createFiscalPeriod, createRevenueRecognition } from '@/domain/finance'
import { createGeneratedProfessionalSalaryRulesV1 } from '@/app/game/GeneratedProfessionalSalaryRules'
import { HomeDashboardSlot } from './HomeDashboardSlot'

afterEach(cleanup)
it('uses the current fiscal exercise and does not display a salary cap where none applies', () => {
  const base = createGameWorld(createValidGameWorldInput()), team = Object.values(base.teams)[0]!, organizationId = team.organizationId
  const revenue = (id: string, recognizedOn: string, amount: number) => createRevenueRecognition({ id, organizationId, recognizedOn, amount: { currencyCode: 'EUR', minorUnits: amount }, category: 'MEDIA', provenance: { kind: 'TEST', id } })
  const world = updateGameWorld(base, {
    fiscalPeriods: [createFiscalPeriod({ id: 'final01:current-fiscal', organizationId, label: '2032/33', startsOn: '2032-09-01', endsOn: '2033-08-31' })],
    revenueRecognitions: [revenue('old-revenue', '2032-03-01', 10_000), revenue('current-revenue', '2032-09-15', 20_000)],
    salaryRulesBySeasonId: { ...base.salaryRulesBySeasonId, [base.currentSeasonId]: createGeneratedProfessionalSalaryRulesV1(base.currentSeasonId) },
  })
  render(<HomeDashboardSlot moduleId="finances" context={{ world, teamId: team.id, competition: null, homeDynamics: undefined, awayDynamics: undefined, upcoming: [] }} />)
  const panel = document.querySelector('.home-finances')!
  expect(within(panel).getAllByText('No aplica')).toHaveLength(2)
  expect(within(panel).getByText(/200\.00/)).toBeInTheDocument()
  expect(within(panel).queryByText(/300\.00/)).not.toBeInTheDocument()
})
