// @vitest-environment jsdom
/*
 * MX0.4 — NG runtime truth.
 *
 * These tests certify registry *authority*: which component an available BDM OS workspace app mounts, that no
 * launcher/taskbar/breakpoint surface can name an app outside that registry, and that every canonical area is
 * wired to its canonical workspace. They deliberately assert component identity instead of scanning file names.
 */
import { describe, expect, it } from 'vitest'

import { BoardWorkspace } from '@/ui-ng/applications/board/BoardWorkspace'
import { BoostersWorkspace } from '@/ui-ng/applications/boosters/BoostersWorkspace'
import { ClubWorkspace } from '@/ui-ng/applications/club/ClubWorkspace'
import { CoachWorkspace } from '@/ui-ng/applications/coach/CoachWorkspace'
import { CoachFinancesWorkspace } from '@/ui-ng/applications/coachFinances/CoachFinancesWorkspace'
import { CompetitionWorkspace } from '@/ui-ng/applications/competition/CompetitionWorkspace'
import { ContractsWorkspace } from '@/ui-ng/applications/contracts/ContractsWorkspace'
import { DraftWorkspace } from '@/ui-ng/applications/draft/DraftWorkspace'
import { EnforcementWorkspace } from '@/ui-ng/applications/enforcement/EnforcementWorkspace'
import { FacilitiesWorkspace } from '@/ui-ng/applications/facilities/FacilitiesWorkspace'
import { FinancesWorkspace } from '@/ui-ng/applications/finances/FinancesWorkspace'
import { HomeWorkspace } from '@/ui-ng/applications/home/HomeWorkspace'
import { MarketWorkspace } from '@/ui-ng/applications/market/MarketWorkspace'
import { MatchWorkspace } from '@/ui-ng/applications/match/MatchWorkspace'
import { MediaWorkspace } from '@/ui-ng/applications/media/MediaWorkspace'
import { MedicalWorkspace } from '@/ui-ng/applications/medical/MedicalWorkspace'
import { MemoriesWorkspace } from '@/ui-ng/applications/memories/MemoriesWorkspace'
import { MentoringWorkspace } from '@/ui-ng/applications/mentoring/MentoringWorkspace'
import { NarrativesWorkspace } from '@/ui-ng/applications/narratives/NarrativesWorkspace'
import { NilWorkspace } from '@/ui-ng/applications/nil/NilWorkspace'
import { PlayerWorkspace } from '@/ui-ng/applications/player/PlayerWorkspace'
import { RecruitingWorkspace } from '@/ui-ng/applications/recruiting/RecruitingWorkspace'
import { RosterWorkspace } from '@/ui-ng/applications/roster/RosterWorkspace'
import { ScheduleWorkspace } from '@/ui-ng/applications/schedule/ScheduleWorkspace'
import { ScoutingWorkspace } from '@/ui-ng/applications/scouting/ScoutingWorkspace'
import { StaffWorkspace } from '@/ui-ng/applications/staff/StaffWorkspace'
import { TacticsWorkspace } from '@/ui-ng/applications/tactics/TacticsWorkspace'
import { TradesWorkspace } from '@/ui-ng/applications/trades/TradesWorkspace'
import { TrainingWorkspace } from '@/ui-ng/applications/training/TrainingWorkspace'
import { resolveBreakpointDestination } from '@/ui-ng/system/breakpointRouting'
import { allStartMenuApps } from '@/ui-ng/system/startMenuCatalog'
import { WORKSPACE_COMPONENTS } from '@/ui-ng/workspace/WorkspaceHost'
import { WORKSPACE_APP_IDS, WORKSPACE_TASKBAR_APPS, type WorkspaceAppId } from '@/ui-ng/workspace/workspaceApps'

/** The canonical workspace each audited area must mount. A mismatch is a rewire, never a test tweak. */
const CANONICAL_WORKSPACE: Readonly<Record<WorkspaceAppId, unknown>> = {
  home: HomeWorkspace,
  roster: RosterWorkspace,
  player: PlayerWorkspace,
  staff: StaffWorkspace,
  scouting: ScoutingWorkspace,
  tactics: TacticsWorkspace,
  training: TrainingWorkspace,
  mentoring: MentoringWorkspace,
  medical: MedicalWorkspace,
  schedule: ScheduleWorkspace,
  competition: CompetitionWorkspace,
  match: MatchWorkspace,
  market: MarketWorkspace,
  draft: DraftWorkspace,
  trades: TradesWorkspace,
  club: ClubWorkspace,
  contracts: ContractsWorkspace,
  board: BoardWorkspace,
  finances: FinancesWorkspace,
  enforcement: EnforcementWorkspace,
  facilities: FacilitiesWorkspace,
  coach: CoachWorkspace,
  'coach-finances': CoachFinancesWorkspace,
  memories: MemoriesWorkspace,
  narratives: NarrativesWorkspace,
  media: MediaWorkspace,
  recruiting: RecruitingWorkspace,
  nil: NilWorkspace,
  boosters: BoostersWorkspace,
}

/** Every canonical `SimulationBreakpoint.route` with a resolver, and the app it must open. */
const BREAKPOINT_ROUTE_APP: Readonly<Record<string, WorkspaceAppId>> = {
  match: 'match',
  medical: 'medical',
  market: 'market',
  draft: 'draft',
  media: 'media',
  coach: 'coach',
  trades: 'trades',
  competition: 'competition',
  contracts: 'contracts',
  schedule: 'schedule',
  governance: 'board',
}

describe('MX0.4 NG workspace registry truth', () => {
  it('resolves every declared workspace app id to exactly one real component', () => {
    for (const id of WORKSPACE_APP_IDS) {
      expect(typeof WORKSPACE_COMPONENTS[id], `no component registered for "${id}"`).toBe('function')
    }
  })

  it('registers exactly the declared app ids, with no duplicates or unregistered extras', () => {
    expect(new Set(WORKSPACE_APP_IDS).size).toBe(WORKSPACE_APP_IDS.length)
    expect(Object.keys(WORKSPACE_COMPONENTS).sort()).toEqual([...WORKSPACE_APP_IDS].sort())
  })

  it('mounts the canonical workspace for every audited area', () => {
    for (const id of WORKSPACE_APP_IDS) {
      expect(WORKSPACE_COMPONENTS[id], `workspace "${id}" is not the canonical component`).toBe(CANONICAL_WORKSPACE[id])
    }
  })

  it('keeps the taskbar and the start menu inside the registry', () => {
    for (const entry of WORKSPACE_TASKBAR_APPS) {
      expect(WORKSPACE_APP_IDS).toContain(entry.id)
    }
    for (const id of allStartMenuApps()) {
      expect(WORKSPACE_APP_IDS).toContain(id)
    }
  })

  it('resolves every actionable breakpoint route to a registered workspace', () => {
    for (const [route, appId] of Object.entries(BREAKPOINT_ROUTE_APP)) {
      const destination = resolveBreakpointDestination(route)
      expect(destination.actionable, `breakpoint route "${route}" is not actionable`).toBe(true)
      expect(destination.appId).toBe(appId)
      expect(WORKSPACE_APP_IDS).toContain(destination.appId)
      expect(typeof WORKSPACE_COMPONENTS[appId]).toBe('function')
    }
  })
})
