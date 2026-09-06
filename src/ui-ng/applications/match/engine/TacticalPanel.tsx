import type { Player } from '@/domain/player'
import type { PlayerId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { getPlayer } from '@/domain/world'
import type { ManualSubstitution, MatchEvent, MatchTacticalPlan, PlayerMatchStats, TacticalLevel } from '@/engine/match'
import { ManualSubstitutionsPanel } from '@/ui/screens/ManualSubstitutionsPanel'
import { navigateToPlayer } from '@/ui-ng/workspace/workspaceApps'
import { PlayByPlay } from '@/ui-ng/applications/match/engine/LiveStage'
import {
  displayJerseyNumber,
  energyFromFatigue,
  formatMinutesClock,
  formatPlayerShortName,
  paceToSlider,
  sliderToPace,
  teamMark,
  type LiveStageMode,
  type TacticalPanelTab,
} from './matchPresentation'

export function TacticalPanel({
  tab,
  onTabChange,
  stageMode,
  onStageModeChange,
  teamName,
  energyPercent,
  onCourt,
  bench,
  world,
  fatigueByPlayerId,
  draft,
  onDraftChange,
  onApplyTactics,
  players,
  activeLineup,
  canApplySubs,
  allStats,
  onApplySubs,
  events,
}: {
  readonly tab: TacticalPanelTab
  readonly onTabChange: (tab: TacticalPanelTab) => void
  readonly stageMode: LiveStageMode
  readonly onStageModeChange: (mode: LiveStageMode) => void
  readonly teamName: string
  readonly energyPercent: number
  readonly onCourt: readonly PlayerMatchStats[]
  readonly bench: readonly PlayerMatchStats[]
  readonly world: GameWorld
  readonly fatigueByPlayerId: Readonly<Record<string, number>>
  readonly draft: MatchTacticalPlan
  readonly onDraftChange: (plan: MatchTacticalPlan) => void
  readonly onApplyTactics: (plan: MatchTacticalPlan) => void
  readonly players: readonly Player[]
  readonly activeLineup: readonly PlayerId[]
  readonly canApplySubs: boolean
  readonly allStats: readonly PlayerMatchStats[]
  readonly onApplySubs: (substitutions: readonly ManualSubstitution[]) => void
  readonly events: readonly MatchEvent[]
}) {
  const showPlayByPlay = stageMode === 'playByPlay'

  return (
    <aside className="me-tactical" data-me-region="tactical-panel">
      <header className="me-tactical__head">
        <div className="me-tactical__title-row">
          <h2>Panel táctico</h2>
          <button
            aria-pressed={showPlayByPlay}
            className={`me-tactical__pbp${showPlayByPlay ? ' is-active' : ''}`}
            onClick={() => onStageModeChange(showPlayByPlay ? 'tracking' : 'playByPlay')}
            type="button"
          >
            Play-by-Play
          </button>
        </div>
        <TacticalTabs
          active={tab}
          onChange={(next) => {
            if (showPlayByPlay) onStageModeChange('tracking')
            onTabChange(next)
          }}
        />
      </header>

      {showPlayByPlay ? (
        <div className="me-tactical__scroll me-tactical__scroll--pbp">
          <PlayByPlay events={events} world={world} />
        </div>
      ) : tab === 'jugadores' ? (
        <div className="me-tactical__scroll">
          <ManualSubstitutionsPanel
            activeLineup={activeLineup}
            canApply={canApplySubs}
            fatigueByPlayerId={fatigueByPlayerId}
            onApply={onApplySubs}
            onCancel={() => onTabChange('general')}
            playerStats={allStats}
            squadPlayers={players}
          />
        </div>
      ) : (
        <div className="me-tactical__scroll">
          <TeamEnergy mark={teamMark(teamName)} name={teamName} percent={energyPercent} />

          {(tab === 'general' || tab === 'ataque' || tab === 'defensa') && (
            <>
              <OnCourtLineup
                fatigueByPlayerId={fatigueByPlayerId}
                label="Quinteto en pista"
                stats={onCourt}
                world={world}
              />
              <BenchLineup
                fatigueByPlayerId={fatigueByPlayerId}
                label="Banquillo"
                stats={bench.slice(0, 5)}
                world={world}
              />
            </>
          )}

          {(tab === 'general' || tab === 'ataque' || tab === 'defensa') && (
            <TacticalSettings
              draft={draft}
              mode={tab}
              onApply={() => onApplyTactics(draft)}
              onChange={onDraftChange}
            />
          )}
        </div>
      )}
    </aside>
  )
}

function TacticalTabs({
  active,
  onChange,
}: {
  readonly active: TacticalPanelTab
  readonly onChange: (tab: TacticalPanelTab) => void
}) {
  return (
    <div className="me-tabs" role="tablist" aria-label="Panel táctico">
      {(
        [
          ['general', 'General'],
          ['ataque', 'Ataque'],
          ['defensa', 'Defensa'],
          ['jugadores', 'Jugadores'],
        ] as const
      ).map(([id, label]) => (
        <button
          aria-selected={active === id}
          className={`me-tabs__btn${active === id ? ' is-active' : ''}`}
          key={id}
          onClick={() => onChange(id)}
          role="tab"
          type="button"
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function TeamEnergy({ mark, name, percent }: { readonly mark: string; readonly name: string; readonly percent: number }) {
  return (
    <div className="me-energy">
      <span className="me-energy__mark">{mark}</span>
      <div className="me-energy__copy">
        <strong>{name}</strong>
        <span>
          Energía de equipo <b>{percent}%</b>
        </span>
      </div>
      <div className="me-energy__track">
        <i style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

function OnCourtLineup(props: {
  readonly label: string
  readonly stats: readonly PlayerMatchStats[]
  readonly world: GameWorld
  readonly fatigueByPlayerId: Readonly<Record<string, number>>
}) {
  return <MiniLineupTable {...props} />
}

function BenchLineup(props: {
  readonly label: string
  readonly stats: readonly PlayerMatchStats[]
  readonly world: GameWorld
  readonly fatigueByPlayerId: Readonly<Record<string, number>>
}) {
  return <MiniLineupTable {...props} />
}

function MiniLineupTable({
  label,
  stats,
  world,
  fatigueByPlayerId,
}: {
  readonly label: string
  readonly stats: readonly PlayerMatchStats[]
  readonly world: GameWorld
  readonly fatigueByPlayerId: Readonly<Record<string, number>>
}) {
  return (
    <section className="me-lineup">
      <h3>{label}</h3>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th className="is-player">JUGADOR</th>
            <th>POS</th>
            <th>MIN</th>
            <th>PTS</th>
            <th>REB</th>
            <th>ENERGÍA</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((stat) => {
            const player = getPlayer(world, stat.playerId)
            const energy = energyFromFatigue(fatigueByPlayerId[stat.playerId])
            return (
              <tr key={stat.playerId}>
                <td>
                  <span className="me-box__jersey">{displayJerseyNumber(stat.playerId)}</span>
                </td>
                <td className="is-player">
                  <button className="me-box__link" onClick={() => navigateToPlayer(stat.playerId)} type="button">
                    {formatPlayerShortName(player.firstName, player.lastName)}
                  </button>
                </td>
                <td>{player.basketball.primaryPosition}</td>
                <td>{formatMinutesClock(stat.secondsPlayed)}</td>
                <td>{stat.points}</td>
                <td>{stat.rebounds}</td>
                <td>
                  <span className="me-mini-energy" title={`${energy}%`}>
                    <i style={{ width: `${energy}%` }} />
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function TacticalSettings({
  draft,
  onChange,
  onApply,
  mode,
}: {
  readonly draft: MatchTacticalPlan
  readonly onChange: (plan: MatchTacticalPlan) => void
  readonly onApply: () => void
  readonly mode: TacticalPanelTab
}) {
  const pace = paceToSlider(draft.pace)
  return (
    <section className="me-settings">
      <h3>Configuración táctica</h3>
      {(mode === 'general' || mode === 'ataque') && (
        <label className="me-settings__slider">
          <span>Ritmo ofensivo</span>
          <input
            max={100}
            min={0}
            onChange={(event) => onChange({ ...draft, pace: sliderToPace(Number(event.target.value)) })}
            type="range"
            value={pace}
          />
          <div className="me-settings__ends">
            <em>Lento</em>
            <em>Rápido</em>
          </div>
        </label>
      )}
      {(mode === 'general' || mode === 'defensa') && (
        <>
          <label>
            Defensa
            <select
              onChange={(event) => {
                const [interior, perimeter] = event.target.value.split('/').map(Number) as [TacticalLevel, TacticalLevel]
                onChange({ ...draft, defense: { interior, perimeter } })
              }}
              value={`${draft.defense.interior}/${draft.defense.perimeter}`}
            >
              <option value="0/0">Individual</option>
              <option value="2/-1">Proteger pintura</option>
              <option value="-1/2">Presión perimetral</option>
            </select>
          </label>
          <label>
            Presión
            <select
              onChange={(event) => {
                const perimeter = Number(event.target.value) as TacticalLevel
                onChange({ ...draft, defense: { ...draft.defense, perimeter } })
              }}
              value={draft.defense.perimeter}
            >
              <option value={0}>Sin presión</option>
              <option value={1}>Media</option>
              <option value={2}>Alta</option>
              <option value={-1}>Baja</option>
            </select>
          </label>
        </>
      )}
      {(mode === 'general' || mode === 'ataque') && (
        <label>
          Rebote
          <select
            onChange={(event) => {
              const rim = Number(event.target.value) as TacticalLevel
              onChange({ ...draft, shotProfile: { ...draft.shotProfile, rim } })
            }}
            value={draft.shotProfile.rim}
          >
            <option value={0}>Equilibrado</option>
            <option value={1}>Crash ofensivo</option>
            <option value={-1}>Balance defensivo</option>
            <option value={2}>Agresivo</option>
          </select>
        </label>
      )}
      <button className="me-settings__apply" onClick={onApply} type="button">
        Aplicar plan
      </button>
    </section>
  )
}
