import { useMemo } from 'react'
import type { Player } from '@/domain/player'
import type { GameWorld } from '@/domain/world'
import type { MatchShotZoneId } from '@/domain/stats/MatchStatLog'
import { buildPlayerPerformanceModel } from '@/ui-ng/applications/player/data/buildPlayerPerformanceModel'
import { buildTacticalZoneEvidence, tacticalZoneTarget, tacticalSpacingWarning, type LabPosition } from './TacticalLabModel'

type CourtToken = { readonly id: number; readonly role: string; readonly x: number; readonly y: number }
export interface TacticalLabPanelProps {
  readonly world?: GameWorld
  readonly roster: readonly Player[]
  readonly tokens: readonly CourtToken[]
  readonly selectedTokenId: number
  readonly onSelectToken: (slot: number) => void
  readonly assignedPlayerId: string
  readonly onAssignPlayer: (playerId: string) => void
  readonly selectedZone: MatchShotZoneId
  readonly onSelectZone: (zone: MatchShotZoneId) => void
  readonly onApply: () => void
  readonly hasBall: boolean
}

export function TacticalLabPanel({
  world, roster, tokens, selectedTokenId, onSelectToken, assignedPlayerId,
  onAssignPlayer, selectedZone, onSelectZone, onApply, hasBall,
}: TacticalLabPanelProps) {
  const player = roster.find(item => item.id === assignedPlayerId)
  const profile = useMemo(
    () => world && player ? buildPlayerPerformanceModel(world, player.id).allSeasonSnapshot.shotProfile : undefined,
    [world, player],
  )
  const evidence = useMemo(() => buildTacticalZoneEvidence(profile), [profile])
  const current = tokens.find(p => p.id === selectedTokenId)
  const target = current ? tacticalZoneTarget(selectedZone,current) : undefined
  const spacing = target ? tacticalSpacingWarning(target,selectedTokenId,tokens) : null
  const currentDistance = current && target ? Math.hypot(current.x-target.x,current.y-target.y) : 0
  const selected = evidence.find(row => row.id === selectedZone)
  const recommendations = evidence.filter(row => row.recommended)
  const zoneNote = profile?.detailedProvenance === 'MODELLED' || profile?.detailedProvenance === 'MIXED'
    ? 'Zonas estimadas o mixtas. No se presentan como zonas calientes observadas.'
    : profile?.detailedProvenance === 'OBSERVED'
    ? 'Registro observado de esta temporada. Una recomendación requiere al menos 12 tiros en esa zona.'
    : 'Sin desglose fiable por nueve zonas. Puedes diseñar movimientos, pero no afirmar zonas calientes.'
  return <div className="ct-tactical-lab" data-testid="tactical-lab">
    <div className="ct-tactical-lab__head">
      <div>
        <strong>LABORATORIO TÁCTICO</strong>
        <span>Datos del jugador + diseño editable</span>
      </div>
      <span className="ct-tactical-lab__provenance">
        {profile?.detailedProvenance === 'OBSERVED' ? 'DATOS OBSERVADOS' :
          profile?.detailedProvenance === 'MODELLED' ? 'MODELO' :
          profile?.detailedProvenance === 'MIXED' ? 'DATOS MIXTOS' : 'SIN MAPA COMPLETO'}
      </span>
    </div>
    <div className="ct-tactical-lab__columns">
      <section className="ct-tactical-lab__section">
        <h3>1. Elige una ficha y un jugador real</h3>
        <div className="ct-tactical-lab__tokens" role="group" aria-label="Fichas del quinteto">
          {tokens.map(token => <button key={token.id} type="button"
            aria-pressed={token.id === selectedTokenId}
            onClick={() => onSelectToken(token.id)}>
            {token.id} <small>{token.role}</small>
          </button>)}
        </div>
        <label className="ct-tactical-lab__label">Jugador a analizar
          <select aria-label="Jugador del laboratorio" value={assignedPlayerId} onChange={e => onAssignPlayer(e.target.value)}>
            <option value="">Seleccionar jugador de la plantilla</option>
            {roster.map(player => <option value={player.id} key={player.id}>
              {player.basketball.primaryPosition} · {player.firstName} {player.lastName}
            </option>)}
          </select>
        </label>
        {player ? <>
          <p className="ct-tactical-lab__note">{zoneNote}</p>
          <div className="ct-tactical-lab__zones" role="group" aria-label="Zonas de lanzamiento">
            {evidence.map(zone => <button key={zone.id} type="button"
              aria-pressed={zone.id === selectedZone}
              className={zone.recommended ? 'is-recommended' : ''}
              onClick={() => onSelectZone(zone.id)}>
              <span>{zone.label}{zone.recommended ? <b> ★</b> : null}</span>
              <strong>{zone.attempts > 0 ? zone.made+'/'+zone.attempts : '—'}</strong>
              <small>{zone.attempts ? zone.percentage+'%' : 'Sin tiros'}</small>
            </button>)}
          </div>
        </> : <p className="ct-tactical-lab__note">Selecciona un jugador de tu plantilla. No se inventarán datos de tiro.</p>}
      </section>
      <section className="ct-tactical-lab__section">
        <h3>2. Diseña una oportunidad</h3>
        <p className="ct-tactical-lab__note">{recommendations.length
          ? 'Zonas destacadas por puntos por intento, con al menos 12 tiros observados.'
          : 'Todavía no hay zonas con muestra observada suficiente. Elige un objetivo manualmente.'}
        </p>
        {recommendations.length > 0 && <div className="ct-tactical-lab__recommendations">
          {recommendations.map(zone => <button type="button" key={zone.id} onClick={() => onSelectZone(zone.id)}>
            <b>{zone.label}</b>
            <span>{zone.attempts} tiros · {zone.percentage}%</span>
          </button>)}
        </div>}
        <div className="ct-tactical-lab__selection">
          <span>ZONA ELEGIDA</span>
          <strong>{selected?.label ?? 'Sin selección'}</strong>
          <small>{selected?.attempts && profile?.detailedProvenance === 'OBSERVED'
            ? `${selected.made}/${selected.attempts} tiros · ${selected.percentage}%${selected.sufficient ? ' · muestra ≥12' : ' · muestra escasa'}`
            : 'Destino táctico manual. Eficiencia no confirmada.'}</small>
        </div>
        <p className="ct-tactical-lab__note">BDM colocará un movimiento desde la ficha {selectedTokenId} hacia la zona elegida, sin cambiar otras fichas. Podrás eliminarlo o editarlo en la jugada.</p>
        {spacing && <p className="ct-tactical-lab__warning" role="status">{spacing}</p>}
        {currentDistance < 25 && <p className="ct-tactical-lab__warning" role="status">La ficha ya está cerca del destino. Selecciona otra zona.</p>}
        <button className="ct-tactical-lab__apply" type="button"
          disabled={!current || currentDistance < 25}
          onClick={onApply}>
          {hasBall ? 'AÑADIR RECORRIDO CON BOTE' : 'AÑADIR CORTE A LA JUGADA'}
        </button>
        <p className="ct-tactical-lab__disclaimer">No es una simulación ni una predicción de éxito. Los movimientos se guardan como pasos editables al pulsar Guardar.</p>
      </section>
    </div>
  </div>
}
