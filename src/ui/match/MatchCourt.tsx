import type { GameWorld } from '@/domain/world'
import type { PlayerId } from '@/domain/ids'
import type { SportsEcosystemKind } from '@/domain/ecosystem'
import type { SportsCategory } from '@/domain/primitives'
import type { MatchEvent, MatchLineups } from '@/engine/match'
import { useMemo } from 'react'

import { attacksRight, createCourtPresentation } from './CourtPresentation'
import {
  CourtCanvas,
  resolveCourtConfiguration,
  resolveMatchKitColors,
  type CourtDynamicBall,
  type CourtDynamicFrame,
  type CourtDynamicPlayer,
} from './court'

type CourtProfile = {
  readonly kind: SportsEcosystemKind
  readonly category: SportsCategory
  readonly width: number
  readonly height: number
  readonly hoop: number
  readonly keyDepth: number
  readonly keyWidth: number
  readonly circle: number
  readonly arc: number
  readonly label: string
}

function resolveCourtProfile(
  kind: SportsEcosystemKind,
  category: SportsCategory,
): CourtProfile {
  if (kind === 'nbaLike') {
    const isWomen = category === 'women'
    return {
      kind,
      category,
      width: 9400,
      height: 5000,
      hoop: 400,
      keyDepth: 1900,
      keyWidth: 1600,
      circle: 600,
      arc: isWomen ? 2215 : 2375,
      label: isWomen ? 'WNBA' : 'NBA',
    }
  }
  if (kind === 'ncaaLike') {
    const isWomen = category === 'women'
    return {
      kind,
      category,
      width: 9400,
      height: 5000,
      hoop: 400,
      keyDepth: 1900,
      keyWidth: 1200,
      circle: 600,
      arc: 2215,
      label: isWomen ? 'NCAAW' : 'NCAA',
    }
  }
  return {
    kind: 'fibaLike',
    category,
    width: 2800,
    height: 1500,
    hoop: 132,
    keyDepth: 580,
    keyWidth: 490,
    circle: 180,
    arc: 675,
    label: 'FIBA',
  }
}

function displayJerseyFromId(playerId: string): number {
  let hash = 0
  for (let i = 0; i < playerId.length; i += 1) hash = (hash * 31 + playerId.charCodeAt(i)) >>> 0
  return (hash % 99) + 1
}

function deriveBallState(
  progress: number,
  events: readonly MatchEvent[],
): { readonly state: CourtDynamicBall['state']; readonly z: number } {
  const shot = [...events]
    .reverse()
    .find((event) => event.type === 'shotMade' || event.type === 'shotMissed')
  if (shot !== undefined && progress >= 0.75) {
    const flight = (progress - 0.75) / 0.25
    return { state: 'SHOT', z: 0.6 + Math.sin(flight * Math.PI) * 1.8 }
  }
  return { state: 'HELD', z: 0.5 }
}

export function MatchCourt({
  world,
  gameId,
  homeTeamId,
  awayTeamId,
  lineups,
  attackingTeamId,
  period,
  events,
  progress,
  detail = 'full',
  markerMode = 'name',
  onPlayerSelect,
  proceduralSkin = true,
  playbackSpeed = 1,
  isPlaying = true,
  selectedPlayerId = null,
  canvasPlayers = true,
  debugDynamic = false,
  debugCompositionBounds,
}: {
  readonly world: GameWorld
  readonly gameId: keyof GameWorld['games']
  readonly homeTeamId: keyof GameWorld['teams']
  readonly awayTeamId: keyof GameWorld['teams']
  readonly lineups: MatchLineups
  readonly attackingTeamId: keyof GameWorld['teams']
  readonly period: number
  readonly events: readonly MatchEvent[]
  readonly progress: number
  readonly detail?: 'full' | 'compressed' | 'compact'
  readonly markerMode?: 'name' | 'jersey'
  readonly onPlayerSelect?: (playerId: PlayerId) => void
  /** When true (default), render Canvas CourtConfiguration under tokens. */
  readonly proceduralSkin?: boolean
  readonly playbackSpeed?: number
  readonly isPlaying?: boolean
  readonly selectedPlayerId?: PlayerId | null
  /** CT3 canvas players (default true when procedural skin). */
  readonly canvasPlayers?: boolean
  readonly debugDynamic?: boolean
  /** Temporary CT-ARENA FIX overlay (also enabled with ?arenaDebug=1). */
  readonly debugCompositionBounds?: boolean
}) {
  const compositionDebug =
    debugCompositionBounds ??
    (typeof location !== 'undefined' &&
      new URLSearchParams(location.search).get('arenaDebug') === '1')

  const visualProgress =
    detail === 'compact' ? (progress < 0.75 ? 0 : 1) : detail === 'compressed' ? Math.round(progress * 2) / 2 : progress
  const tokens = createCourtPresentation({
    homeTeamId,
    awayTeamId,
    lineups,
    attackingTeamId,
    period,
    players: world.players,
    events,
    progress: visualProgress,
  })
  const focused = tokens.find((token) => token.focused)
  const game = world.games[gameId]
  const competition = game === undefined ? undefined : world.competitions[game.competitionId]
  const ecosystem =
    competition === undefined ? undefined : world.ecosystems[competition.ecosystemId]
  const courtKind: SportsEcosystemKind = ecosystem?.kind ?? 'fibaLike'
  const courtCategory: SportsCategory = ecosystem?.category ?? 'men'
  const profile = resolveCourtProfile(courtKind, courtCategory)
  const homeTeam = world.teams[homeTeamId]
  const awayTeam = world.teams[awayTeamId]
  const configuration = useMemo(
    () =>
      proceduralSkin && homeTeam !== undefined
        ? resolveCourtConfiguration({
            homeTeam,
            awayTeam,
            competition,
            ecosystemKind: courtKind,
            category: courtCategory,
          })
        : null,
    [proceduralSkin, homeTeam, awayTeam, competition, courtKind, courtCategory],
  )

  const kits = useMemo(
    () => resolveMatchKitColors(String(homeTeamId), String(awayTeamId)),
    [homeTeamId, awayTeamId],
  )

  const offenseRight = attacksRight(attackingTeamId, homeTeamId, period)
  const useCanvasEntities = configuration !== null && canvasPlayers

  const dynamicFrame = useMemo((): CourtDynamicFrame | null => {
    if (!useCanvasEntities) return null
    const players: CourtDynamicPlayer[] = tokens.map((token) => {
      const side = token.teamId === homeTeamId ? 'home' : 'away'
      const onOffense = token.side === 'offense'
      const facingHint = onOffense ? (offenseRight ? 0 : Math.PI) : offenseRight ? Math.PI : 0
      return {
        playerId: token.player.id,
        teamId: token.teamId,
        side,
        xPercent: token.x,
        yPercent: token.y,
        jersey: displayJerseyFromId(token.player.id),
        name: token.player.lastName,
        hasBall: token.focused,
        selected: selectedPlayerId === token.player.id,
        kit: side === 'home' ? kits.home : kits.away,
        facingHint,
      }
    })

    let ball: CourtDynamicBall | null = null
    if (focused !== undefined) {
      const derived = deriveBallState(visualProgress, events)
      ball = {
        xPercent: focused.x,
        yPercent: focused.y,
        z: derived.z,
        ownerPlayerId: focused.player.id,
        state: derived.state,
      }
    }

    return {
      players,
      ball,
      playbackSpeed,
      isPlaying,
      debug: debugDynamic,
    }
  }, [
    useCanvasEntities,
    tokens,
    homeTeamId,
    offenseRight,
    kits,
    selectedPlayerId,
    focused,
    visualProgress,
    events,
    playbackSpeed,
    isPlaying,
    debugDynamic,
  ])

  return (
    <section
      aria-label={`${profile.label} regulation basketball court presentation`}
      className={`court match-court match-court--${profile.kind}${
        profile.category === 'women' ? ' match-court--women' : ''
      }${markerMode === 'jersey' ? ' match-court--jersey' : ''}${
        configuration !== null ? ' match-court--skinned' : ''
      }${useCanvasEntities ? ' match-court--canvas-players' : ''}`}
      data-court-label={profile.label}
    >
      {configuration === null ? (
        <CourtMarkings profile={profile} />
      ) : (
        <CourtCanvas
          aria-label={`${profile.label} court surface`}
          className="match-court__skin-canvas"
          configuration={configuration}
          debug={debugDynamic}
          debugCompositionBounds={compositionDebug}
          dynamicFrame={dynamicFrame}
          onPlayerHit={onPlayerSelect}
        />
      )}

      {/* Accessibility roster — not visible; Canvas is the primary presentation */}
      {useCanvasEntities ? (
        <ul className="match-court__a11y-roster">
          {tokens.map((token) => (
            <li key={token.player.id}>
              {onPlayerSelect === undefined ? (
                <span>
                  {token.player.firstName} {token.player.lastName}, jersey{' '}
                  {displayJerseyFromId(token.player.id)}
                  {token.focused ? ', with ball' : ''}
                </span>
              ) : (
                <button
                  onClick={() => onPlayerSelect(token.player.id)}
                  type="button"
                >
                  {token.player.firstName} {token.player.lastName}, jersey{' '}
                  {displayJerseyFromId(token.player.id)}
                  {token.focused ? ', with ball' : ''}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        tokens.map((token) => {
          const className = `token ${token.teamId === homeTeamId ? 'home-token' : 'away-token'}${
            token.focused ? ' focused-token' : ''
          }`
          const content =
            markerMode === 'jersey' ? (
              <strong className="token-jersey">{displayJerseyFromId(token.player.id)}</strong>
            ) : (
              <>
                <strong>{token.player.lastName}</strong>
                <span>{token.player.basketball.primaryPosition}</span>
              </>
            )
          const style = { left: `${token.x}%`, top: `${token.y}%` }
          if (onPlayerSelect === undefined) {
            return (
              <div className={className} key={token.player.id} style={style}>
                {content}
              </div>
            )
          }
          return (
            <button
              aria-label={`Abrir ficha de ${token.player.firstName} ${token.player.lastName}`}
              className={className}
              key={token.player.id}
              onClick={() => onPlayerSelect(token.player.id)}
              style={style}
              type="button"
            >
              {content}
            </button>
          )
        })
      )}
      {!useCanvasEntities && focused !== undefined ? (
        <span
          aria-label="Ball"
          className="ball-indicator"
          style={{ left: `${focused.x}%`, top: `${focused.y}%` }}
        >
          ●
        </span>
      ) : null}
    </section>
  )
}

function CourtMarkings({ profile }: { readonly profile: CourtProfile }) {
  const centreY = profile.height / 2
  const keyTop = centreY - profile.keyWidth / 2
  const keyBottom = centreY + profile.keyWidth / 2
  const rightHoop = profile.width - profile.hoop
  const threeLineTop = centreY - profile.arc
  const threeLineBottom = centreY + profile.arc
  const restrictedRadius = Math.round(profile.circle * 0.7)

  return (
    <svg
      aria-hidden="true"
      className="court-markings"
      preserveAspectRatio="none"
      viewBox={`0 0 ${profile.width} ${profile.height}`}
    >
      <g className="court-markings__paints" fill="none">
        <rect height={profile.keyWidth} width={profile.keyDepth} x="0" y={keyTop} />
        <rect
          height={profile.keyWidth}
          width={profile.keyDepth}
          x={profile.width - profile.keyDepth}
          y={keyTop}
        />
        <circle cx={profile.width / 2} cy={centreY} r={profile.circle} />
      </g>
      <g className="court-markings__lines">
        <rect
          className="court-markings__perimeter"
          height={profile.height - 32}
          width={profile.width - 32}
          x="16"
          y="16"
        />
        <path d={`M ${profile.width / 2} 0 V ${profile.height}`} />
        <circle cx={profile.width / 2} cy={centreY} r={profile.circle} />
        <path d={`M 0 ${keyTop} H ${profile.keyDepth} V ${keyBottom} H 0`} />
        <path
          d={`M ${profile.width} ${keyTop} H ${profile.width - profile.keyDepth} V ${keyBottom} H ${profile.width}`}
        />
        <circle
          className="court-markings__free-throw"
          cx={profile.keyDepth}
          cy={centreY}
          r={profile.circle}
        />
        <circle
          className="court-markings__free-throw"
          cx={profile.width - profile.keyDepth}
          cy={centreY}
          r={profile.circle}
        />
        <path
          d={`M 0 ${threeLineTop} H ${profile.hoop} A ${profile.arc} ${profile.arc} 0 0 1 ${profile.hoop} ${threeLineBottom} H 0`}
        />
        <path
          d={`M ${profile.width} ${threeLineTop} H ${rightHoop} A ${profile.arc} ${profile.arc} 0 0 0 ${rightHoop} ${threeLineBottom} H ${profile.width}`}
        />
        <circle cx={profile.hoop} cy={centreY} r={restrictedRadius} />
        <circle cx={rightHoop} cy={centreY} r={restrictedRadius} />
        <path
          className="court-markings__backboards"
          d={`M ${profile.hoop} ${centreY - Math.round(profile.circle * 0.45)} V ${centreY + Math.round(profile.circle * 0.45)} M ${rightHoop} ${centreY - Math.round(profile.circle * 0.45)} V ${centreY + Math.round(profile.circle * 0.45)}`}
        />
      </g>
      <g className="court-markings__hoops">
        <circle cx={profile.hoop} cy={centreY} r="22" />
        <circle cx={rightHoop} cy={centreY} r="22" />
      </g>
    </svg>
  )
}
