// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { deserializeGameWorldSaveV4 } from '@/save/GameWorldSaveV4'
import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { NgWorkspaceNavigationProvider } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
import { RosterWorkspace } from './RosterWorkspace'
import { buildRosterInspectorDossier } from './buildRosterInspectorDossier'

afterEach(cleanup)
it('shows roster salaries in the actual club currency on the table and inspector', () => {
  const world = deserializeGameWorldSaveV4(JSON.parse(gunzipSync(readFileSync('docs/playable/evidence/final-01/counter-fee-refused.save.json.gz')).toString('utf8')))
  const team = getUserTeam(world)!, player = Object.values(world.players).find(p => p.firstName === 'Joaquin' && p.lastName === 'Rodriguez')!
  expect(buildRosterInspectorDossier(world, team.id, player).zones.find(zone => zone.id === 'contract')!.facts.find(fact => fact.label === 'Salary')!.value).toBe('€210K')
  window.history.replaceState({}, '', '/?ui=ng&app=roster');window.localStorage.clear();useGameStore.getState().resetGame();useGameStore.getState().replaceWorld(world)
  const view = render(<NgWorkspaceNavigationProvider><RosterWorkspace /></NgWorkspaceNavigationProvider>)
  expect([...view.container.querySelectorAll('td')].some(cell => cell.textContent === '€210K')).toBe(true)
}, 60_000)
