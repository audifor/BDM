import { playerIdFromString, teamIdFromString } from '@/domain/ids'
import type { Team } from '@/domain/team'
import type { CountryId, TeamId } from '@/domain/ids'
import { CourtRenderer } from '../CourtRenderer'
import { CourtDynamicRenderer } from '../CourtDynamicRenderer'
import { resolveCourtConfiguration } from '../core/CourtConfigurationResolver'
import { resolveMatchKitColors } from '../CourtMatchKit'
import type { CourtDynamicFrame, CourtDynamicPlayer } from '../CourtEntityTypes'
import type { CourtConfiguration } from '../core/CourtConfiguration'
import type { ArenaCourtArchetype } from '../arena/ArenaCourtProfile'
import type { CourtRulesetId } from '../rules'
import { createFictionalClubCrest, crestStyleForScenario } from './fictionalClubCrests'

type PreviewScenario = {
  readonly id: string
  readonly title: string
  readonly homeName: string
  readonly awayName: string
  readonly rulesetId: CourtRulesetId
  readonly arenaArchetype: ArenaCourtArchetype
  readonly nickname?: string
  readonly city?: string
  readonly eventKind?: 'PLAYOFFS' | 'NCAA_TOURNAMENT' | 'NONE'
}

const SCENARIOS: readonly PreviewScenario[] = [
  {
    id: 'boston-celtics',
    title: 'A · NBA PREMIUM',
    homeName: 'Boston Celtics',
    awayName: 'New York Knicks',
    rulesetId: 'NBA',
    arenaArchetype: 'NBA_PREMIUM',
    nickname: 'Celtics',
    city: 'Boston',
    eventKind: 'PLAYOFFS',
  },
  {
    id: 'duke-blue-devils',
    title: 'B · NCAA MAJOR',
    homeName: 'Duke Blue Devils',
    awayName: 'North Carolina',
    rulesetId: 'NCAA_M',
    arenaArchetype: 'NCAA_MAJOR',
    nickname: 'Blue Devils',
    city: 'Durham',
    eventKind: 'NCAA_TOURNAMENT',
  },
  {
    id: 'casademont-zaragoza',
    title: 'C · EURO PREMIUM',
    homeName: 'Casademont Zaragoza',
    awayName: 'MoraBanc Andorra',
    rulesetId: 'FIBA',
    arenaArchetype: 'EURO_PREMIUM',
    nickname: 'Casademont',
    city: 'Zaragoza',
  },
  {
    id: 'small-college-gym',
    title: 'D · SMALL GYM',
    homeName: 'Riverdale Hawks',
    awayName: 'Oak Ridge',
    rulesetId: 'HIGH_SCHOOL',
    arenaArchetype: 'NCAA_SMALL_GYM',
    nickname: 'Hawks',
    city: 'Riverdale',
  },
]

function asTeam(id: string, name: string): Team {
  return {
    id: id as TeamId,
    name,
    gender: 'male',
    countryId: 'XX' as CountryId,
    rosterPlayerIds: [],
  }
}

function buildConfiguration(scenario: PreviewScenario): CourtConfiguration {
  const home = asTeam(scenario.id, scenario.homeName)
  const away = asTeam(`${scenario.id}-away`, scenario.awayName)
  const crest = createFictionalClubCrest(crestStyleForScenario(scenario.id), 512)
  const configuration = resolveCourtConfiguration({
    homeTeam: home,
    awayTeam: away,
    rulesetId: scenario.rulesetId,
    arenaArchetype: scenario.arenaArchetype,
    nickname: scenario.nickname,
    city: scenario.city,
    eventKind: scenario.eventKind === 'NONE' ? undefined : scenario.eventKind,
    centerMark: crest,
  })
  // Preview: push crest visibility a bit for acceptance shots
  return {
    ...configuration,
    branding: {
      ...configuration.branding,
      centerLogoScale: Math.max(configuration.branding.centerLogoScale, 1.05),
      centerLogoOpacity: Math.max(configuration.branding.centerLogoOpacity, 0.88),
      centerMonogram: null,
      centerMark: crest,
    },
  }
}

function buildTokens(homeId: string, awayId: string): CourtDynamicFrame {
  const kits = resolveMatchKitColors(homeId, awayId)
  const homeTid = teamIdFromString(homeId)
  const awayTid = teamIdFromString(awayId)
  const homeSpots: Array<[number, number]> = [
    [20, 30],
    [32, 45],
    [38, 58],
    [24, 70],
    [14, 52],
  ]
  const awaySpots: Array<[number, number]> = [
    [78, 28],
    [68, 42],
    [60, 55],
    [74, 68],
    [84, 50],
  ]
  const players: CourtDynamicPlayer[] = []
  homeSpots.forEach(([x, y], i) => {
    players.push({
      playerId: playerIdFromString(`${homeId}-h${i}`),
      teamId: homeTid,
      side: 'home',
      xPercent: x,
      yPercent: y,
      jersey: [4, 7, 11, 15, 23][i]!,
      name: ['Tatum', 'Brown', 'Holiday', 'White', 'Porzingis'][i]!,
      hasBall: i === 2,
      selected: false,
      kit: kits.home,
      facingHint: 0,
    })
  })
  awaySpots.forEach(([x, y], i) => {
    players.push({
      playerId: playerIdFromString(`${homeId}-a${i}`),
      teamId: awayTid,
      side: 'away',
      xPercent: x,
      yPercent: y,
      jersey: [3, 9, 12, 21, 33][i]!,
      name: ['Brunson', 'Bridges', 'Anunoby', 'Towns', 'Hart'][i]!,
      hasBall: false,
      selected: i === 1,
      kit: kits.away,
      facingHint: Math.PI,
    })
  })
  const owner = players.find((p) => p.hasBall)!
  return {
    players,
    ball: {
      xPercent: owner.xPercent,
      yPercent: owner.yPercent,
      z: 0.5,
      ownerPlayerId: owner.playerId,
      state: 'HELD',
    },
    playbackSpeed: 1,
    isPlaying: true,
  }
}

/**
 * CT-CANON / CT-ARENA visual acceptance: 4 archetypes side-by-side.
 * Open /court-preview.html
 * ?perimeter=1 → SHOW_COURT=false (arena only)
 * ?arenaDebug=1 → composition bounds overlay
 * ?capture=<id> → 1920 fullscreen single scene
 * ?capture=<id>&perimeter=1 → perimeter-only capture
 */
export function mountCourtVisualPreview(root: HTMLElement): void {
  const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '')
  const showCourt = params.get('perimeter') !== '1' && params.get('showCourt') !== '0'
  const debugCompositionBounds = params.get('arenaDebug') === '1'

  root.innerHTML = ''
  root.style.cssText =
    'margin:0;padding:0;width:100vw;height:100vh;background:#03060c;overflow:hidden;display:grid;grid-template-rows:auto 1fr;font-family:ui-sans-serif,system-ui,sans-serif'

  const header = document.createElement('div')
  header.style.cssText =
    'display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:10px 14px;color:#c5d4e4;font:600 12px/1.3 ui-sans-serif;background:#0a1018;border-bottom:1px solid rgba(80,120,160,0.25)'
  header.innerHTML = showCourt
    ? `<span style="letter-spacing:0.08em">CT-ARENA FIX · EDGE COMPOSITION</span><span style="opacity:0.65">thin runoff · camera crop · fill 88–94%${debugCompositionBounds ? ' · DEBUG BOUNDS' : ''}</span>`
    : '<span style="letter-spacing:0.08em">CT-ARENA · SHOW_COURT=false</span><span style="opacity:0.65">Perimeter only — evaluate venue without court distraction</span>'
  root.appendChild(header)

  const grid = document.createElement('div')
  grid.style.cssText =
    'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));gap:8px;padding:8px;min-height:0'
  root.appendChild(grid)

  const panels = SCENARIOS.map((scenario) => {
    const panel = document.createElement('div')
    panel.style.cssText =
      'position:relative;min-height:0;display:grid;grid-template-rows:auto 1fr;background:#050910;border:1px solid rgba(70,110,150,0.3);border-radius:4px;overflow:hidden'
    const title = document.createElement('div')
    title.style.cssText =
      'padding:8px 10px;color:#e8f0f8;font:700 11px/1.2 ui-sans-serif;letter-spacing:0.04em'
    const configuration = buildConfiguration(scenario)
    title.textContent = `${scenario.title}  ·  ${configuration.arena.archetype}  ·  runoff×${configuration.arena.runoffScale.toFixed(2)}  ·  fill ${configuration.arena.courtWidthFill}`
    const stage = document.createElement('div')
    stage.style.cssText = 'position:relative;min-height:0;width:100%;height:100%'
    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'display:block;width:100%;height:100%'
    stage.appendChild(canvas)
    panel.appendChild(title)
    panel.appendChild(stage)
    grid.appendChild(panel)
    return { scenario, configuration, stage, canvas, title }
  })

  const renderers = panels.map(() => ({
    static: new CourtRenderer({
      projectionMode: 'ORTHOGRAPHIC',
      perspectiveStrength: 0,
      showCourt,
      debugCompositionBounds,
    }),
    dynamic: new CourtDynamicRenderer({ debug: false }),
  }))

  const paintPanel = (index: number, configuration: CourtConfiguration, frame: CourtDynamicFrame | null) => {
    const { stage, canvas } = panels[index]!
    const { static: renderer, dynamic } = renderers[index]!
    const cssW = Math.max(1, Math.floor(stage.clientWidth))
    const cssH = Math.max(1, Math.floor(stage.clientHeight))
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const pw = Math.floor(cssW * dpr)
    const ph = Math.floor(cssH * dpr)
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw
      canvas.height = ph
      renderer.invalidate()
    }
    const projection = renderer.render(canvas, configuration)
    if (showCourt && frame !== null) {
      const ctx = canvas.getContext('2d')
      if (ctx !== null) dynamic.render(ctx, projection, frame, performance.now())
    }
  }

  const tick = () => {
    panels.forEach((panel, i) => {
      const frame = showCourt ? buildTokens(panel.scenario.id, `${panel.scenario.id}-away`) : null
      paintPanel(i, panel.configuration, frame)
    })
    requestAnimationFrame(tick)
  }

  console.info('[ct-arena-fix-preview]', {
    showCourt,
    debugCompositionBounds,
    archetypes: panels.map((p) => p.configuration.arena.archetype),
    fills: panels.map((p) => p.configuration.arena.courtWidthFill),
  })

  requestAnimationFrame(tick)
  window.addEventListener('resize', () => {
    renderers.forEach((r) => r.static.invalidate())
  })
}

/** Single-scenario fullscreen capture helper (1920×1080). */
export function mountCourtCanonCapture(
  root: HTMLElement,
  scenarioId: PreviewScenario['id'],
  options: { readonly showCourt?: boolean; readonly debugCompositionBounds?: boolean } = {},
): void {
  const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '')
  const showCourt = options.showCourt ?? true
  const debugCompositionBounds =
    options.debugCompositionBounds ?? params.get('arenaDebug') === '1'
  const scenario = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0]!
  root.innerHTML = ''
  root.style.cssText = 'margin:0;width:100vw;height:100vh;background:#03060c;overflow:hidden'
  const canvas = document.createElement('canvas')
  canvas.width = 1920
  canvas.height = 1080
  canvas.style.cssText = 'display:block;width:100%;height:100%;object-fit:contain'
  root.appendChild(canvas)

  const configuration = buildConfiguration(scenario)
  const renderer = new CourtRenderer({
    projectionMode: 'ORTHOGRAPHIC',
    perspectiveStrength: 0,
    showCourt,
    debugCompositionBounds,
  })
  const dynamic = new CourtDynamicRenderer({ debug: false })
  const projection = renderer.render(canvas, configuration)
  if (showCourt) {
    const ctx = canvas.getContext('2d')
    if (ctx !== null) dynamic.render(ctx, projection, buildTokens(scenario.id, `${scenario.id}-away`), performance.now())
  }
}

export const CT_CANON_PREVIEW_SCENARIOS = SCENARIOS
