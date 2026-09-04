import type { PlayerId } from '@/domain/ids'
import { rosterPlayerOptions } from '@/ui-ng/applications/player/data/buildPlayerWorkspaceModel'

import { usePlayerWorkspace } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'

import { useGameStore } from '@/stores/gameStore'



export function PlayerWorkspaceHeader() {

  const world = useGameStore((state) => state.world)

  const { model, playerId, setPlayerId } = usePlayerWorkspace()

  if (model === null || world === null) return null



  const rosterOptions = rosterPlayerOptions(world)



  return (

    <header className="po-workspace-header" data-ng-region="workspace-header">

      <div className="po-workspace-header__context">

        <span className="po-workspace-header__app">Player</span>

        <span className="po-workspace-header__sep" />

        <span className="po-workspace-header__team">

          {model.identity.teamName.status === 'available' ? model.identity.teamName.value : '—'}

        </span>

        <span className="po-workspace-header__comp">

          {model.identity.competitionLabel.status === 'available' ? model.identity.competitionLabel.value : '—'}

          {' · '}

          {model.identity.seasonLabel.status === 'available' ? model.identity.seasonLabel.value : '—'}

        </span>

        {rosterOptions.length > 1 && (

          <label className="po-workspace-header__player-select">

            <span className="visually-hidden">Switch player</span>

            <select

              onChange={(event) => setPlayerId(event.target.value as PlayerId)}

              value={playerId ?? undefined}

            >

              {rosterOptions.map((option) => (

                <option key={option.id} value={option.id}>{option.label}</option>

              ))}

            </select>

          </label>

        )}

      </div>

      <div className="po-workspace-header__actions">

        <button className="ng-btn ng-btn--ghost" type="button">Compare</button>

        <button className="ng-btn ng-btn--ghost" type="button">Scouting Report</button>

        <button className="ng-btn" type="button">Contract</button>

      </div>

    </header>

  )

}


