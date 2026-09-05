import { BoardWorkspace } from '@/ui-ng/applications/board/BoardWorkspace'
import { BoostersWorkspace } from '@/ui-ng/applications/boosters/BoostersWorkspace'
import { ClubWorkspace } from '@/ui-ng/applications/club/ClubWorkspace'
import { CoachWorkspace } from '@/ui-ng/applications/coach/CoachWorkspace'
import { CoachFinancesWorkspace } from '@/ui-ng/applications/coachFinances/CoachFinancesWorkspace'
import { CompetitionWorkspace } from '@/ui-ng/applications/competition/CompetitionWorkspace'
import { DraftWorkspace } from '@/ui-ng/applications/draft/DraftWorkspace'
import { EnforcementWorkspace } from '@/ui-ng/applications/enforcement/EnforcementWorkspace'
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
import { useGameStore } from '@/stores/gameStore'
import { resolveGameCapabilities } from '@/ui/gameContext'
import { isWorkspaceApplicable } from '@/ui-ng/system/startMenuCatalog'
import { NgSectionUnavailable } from '@/ui-ng/workspace/NgSectionUnavailable'
import { useNgWorkspaceNavigation } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'

import './workspace.css'

const WORKSPACES = {
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
  board: BoardWorkspace,
  finances: FinancesWorkspace,
  enforcement: EnforcementWorkspace,
  coach: CoachWorkspace,
  'coach-finances': CoachFinancesWorkspace,
  memories: MemoriesWorkspace,
  narratives: NarrativesWorkspace,
  media: MediaWorkspace,
  recruiting: RecruitingWorkspace,
  nil: NilWorkspace,
  boosters: BoostersWorkspace,
} as const

export function WorkspaceHost() {
  const { app } = useNgWorkspaceNavigation()
  const world = useGameStore((state) => state.world)
  const Workspace = WORKSPACES[app]
  const unavailable =
    world !== null && !isWorkspaceApplicable(app, resolveGameCapabilities(world))

  return (
    <main className="ng-workspace-host" data-ng-region="workspace-host">
      {unavailable ? <NgSectionUnavailable app={app} /> : <Workspace />}
    </main>
  )
}
