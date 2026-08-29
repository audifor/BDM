import React from "react";
import { Play, Pause, FastForward, SkipForward, ChevronsRight, Hand, Megaphone, Repeat2, SlidersHorizontal } from "lucide-react";

export function MatchControls({
  isPlaying,
  speed,
  onPlayPause,
  onSpeedChange,
  onSimQuarter,
  onSimMatch,
  onTimeout,
  onShout,
  onShoutChange,
  shoutOptions = [],
  selectedShout,
  playbooks = [],
  selectedPlaybookId,
  onPlaybookChange,
  onSubstitute,
  actionTeam,
  onActionTeamChange,
  timeoutOptions = [],
  timeoutKind,
  onTimeoutKindChange,
  defenseOptions = [],
  defenseType,
  onDefenseTypeChange,
  pnrDefenseOptions = [],
  pnrDefense,
  onPnrDefenseChange,
  paceOptions = [],
  pace,
  onPaceChange,
  focusOptions = [],
  focus,
  onFocusChange,
  spacingOptions = [],
  spacing,
  onSpacingChange,
  riskOptions = [],
  passingRisk,
  onPassingRiskChange,
  aggression,
  onAggressionChange,
  offRebound,
  onOffReboundChange,
  threePoint,
  onThreePointChange,
  pnrFrequency,
  onPnrFrequencyChange,
  freedomOptions = [],
  freedom,
  onFreedomChange,
  transitionOptions = [],
  transition,
  onTransitionChange,
  onApplyTactics,
}) {
  return (
    <div className="match-controls-cyber">
      <div className="match-control-row">
        <button type="button" className="btn-control-primary" onClick={onPlayPause}>
          {isPlaying ? (
            <>
              <Pause size={16} />
              Pausa
            </>
          ) : (
            <>
              <Play size={16} />
              Play
            </>
          )}
        </button>

        <button type="button" className="btn-control-secondary" onClick={onSpeedChange}>
          <FastForward size={16} />
          {speed}x
        </button>

        <button type="button" className="btn-control-ghost" onClick={() => onSimQuarter?.()}>
          <SkipForward size={16} />
          Simular Q
        </button>

        <button type="button" className="btn-control-ghost" onClick={() => onSimMatch?.()}>
          <ChevronsRight size={16} />
          Simular Partido
        </button>
      </div>

      <div className="match-control-row">
        <button type="button" className="btn-control-ghost" onClick={onTimeout}>
          <Hand size={16} />
          Tiempo muerto
        </button>
        <button type="button" className="btn-control-ghost" onClick={onSubstitute}>
          <Repeat2 size={16} />
          Sustitucion
        </button>
      </div>

      <div className="match-control-row">
        <div className="match-select">
          <span>Defensa</span>
          <select value={defenseType || ""} onChange={(e) => onDefenseTypeChange?.(e.target.value)}>
            {defenseOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="match-select">
          <span>PNR</span>
          <select value={pnrDefense || ""} onChange={(e) => onPnrDefenseChange?.(e.target.value)}>
            {pnrDefenseOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="match-select">
          <span>Ritmo</span>
          <select value={String(pace ?? 2)} onChange={(e) => onPaceChange?.(Number(e.target.value))}>
            {paceOptions.map((p) => (
              <option key={p.value} value={String(p.value)}>{p.label}</option>
            ))}
          </select>
        </div>
        <div className="match-select">
          <span>Enfoque</span>
          <select value={focus || ""} onChange={(e) => onFocusChange?.(e.target.value)}>
            {focusOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <button type="button" className="btn-control-secondary" onClick={() => onApplyTactics?.()} title="Aplicar tácticas">
          <SlidersHorizontal size={14} />
          Aplicar
        </button>
      </div>

      <div className="match-control-row">
        <div className="match-select">
          <span>Spacing</span>
          <select value={spacing || ""} onChange={(e) => onSpacingChange?.(e.target.value)}>
            {spacingOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="match-select">
          <span>Riesgo</span>
          <select value={String(passingRisk ?? 1)} onChange={(e) => onPassingRiskChange?.(Number(e.target.value))}>
            {riskOptions.map((o) => (
              <option key={o.value} value={String(o.value)}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="match-select">
          <span>Libertad</span>
          <select value={String(freedom ?? 1)} onChange={(e) => onFreedomChange?.(Number(e.target.value))}>
            {freedomOptions.map((o) => (
              <option key={o.value} value={String(o.value)}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="match-select">
          <span>Transición</span>
          <select value={String(transition ?? 1)} onChange={(e) => onTransitionChange?.(Number(e.target.value))}>
            {transitionOptions.map((o) => (
              <option key={o.value} value={String(o.value)}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="match-slider">
          <span>Agg</span>
          <input type="range" min="0" max="100" step="1" value={Number(aggression ?? 50)} onChange={(e) => onAggressionChange?.(Number(e.target.value))} />
          <span className="mono">{Number(aggression ?? 50)}</span>
        </div>
        <div className="match-slider">
          <span>REB</span>
          <input type="range" min="0" max="100" step="1" value={Number(offRebound ?? 30)} onChange={(e) => onOffReboundChange?.(Number(e.target.value))} />
          <span className="mono">{Number(offRebound ?? 30)}</span>
        </div>
        <div className="match-slider">
          <span>3PT</span>
          <input type="range" min="0" max="100" step="1" value={Number(threePoint ?? 50)} onChange={(e) => onThreePointChange?.(Number(e.target.value))} />
          <span className="mono">{Number(threePoint ?? 50)}</span>
        </div>
        <div className="match-slider">
          <span>PnR</span>
          <input type="range" min="0" max="100" step="1" value={Number(pnrFrequency ?? 50)} onChange={(e) => onPnrFrequencyChange?.(Number(e.target.value))} />
          <span className="mono">{Number(pnrFrequency ?? 50)}</span>
        </div>
      </div>

      <div className="match-control-row">
        <div className="match-select">
          <span>Equipo</span>
          <select value={actionTeam || "home"} onChange={(e) => onActionTeamChange?.(e.target.value)}>
            <option value="home">Local</option>
            <option value="away">Rival</option>
          </select>
        </div>
        <div className="match-select">
          <span>Timeout</span>
          <select value={timeoutKind || ""} onChange={(e) => onTimeoutKindChange?.(e.target.value)}>
            {timeoutOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="match-select">
          <span>Shout</span>
          <select value={selectedShout || ""} onChange={(e) => onShoutChange?.(e.target.value)}>
            {shoutOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button type="button" className="btn-control-ghost" onClick={onShout}>
            <Megaphone size={14} />
            Enviar
          </button>
        </div>
      </div>

      <div className="match-control-row">
        <div className="match-select">
          <span>Playbook</span>
          <select value={selectedPlaybookId || ""} onChange={(e) => onPlaybookChange?.(e.target.value)}>
            {playbooks.map((pb) => (
              <option key={pb.id} value={pb.id}>{pb.name}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

export default MatchControls;
