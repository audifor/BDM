// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { getUserTeam } from '@/engine/calendar'
import { createF3Day0 } from '@/app/game/testSupport/PlayableF3Support'
import { useGameStore } from '@/stores/gameStore'
import { NgWorkspaceNavigationProvider } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
import { RosterWorkspace } from './RosterWorkspace'
import { buildRosterInspectorDossier } from './buildRosterInspectorDossier'

afterEach(cleanup)
vi.setConfig({ testTimeout: 600_000, hookTimeout: 900_000 })
it('shows roster salaries in the actual club currency on the table and inspector', async () => {
  const world = await createF3Day0()
  const team = getUserTeam(world)!
  const player = Object.values(world.players).find(p => team.rosterPlayerIds.includes(p.id) && Object.values(world.contractsById).some(contract => contract.playerId === p.id && contract.teamId === team.id))!
  const salary = buildRosterInspectorDossier(world, team.id, player).zones.find(zone => zone.id === 'contract')!.facts.find(fact => fact.label === 'Salary')!.value
  expect(salary).not.toBe('—')
  window.history.replaceState({}, '', '/?ui=ng&app=roster');window.localStorage.clear();useGameStore.getState().resetGame();useGameStore.getState().replaceWorld(world)
  const view = render(<NgWorkspaceNavigationProvider><RosterWorkspace /></NgWorkspaceNavigationProvider>)
  expect([...view.container.querySelectorAll('td')].some(cell => cell.textContent === salary)).toBe(true)
}, 900_000)
