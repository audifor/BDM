import { it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import type { MatchNextEvent, MatchState } from '@/engine/match-next'
import { runFingerprintGame } from '../bt5/fingerprint'
import { withStyle } from '../../dev/tacticalStyles'

/**
 * BT6.43 scene finder for the Phaser microscope: with the same seed and styles the viewer uses (?homeStyle=..&awayStyle=..), the ticks
 * at which each scenario happens (the HOME team defends in the defensive scenarios). Read-only.
 * BT2_AUDIT=1 BT6_SCENE_STYLES=press,sag,... npx vitest run .../bt6/scenes.test.ts -> docs/match-next-bt6/audit/scenes.json
 */
it.skipIf(process.env.BT2_AUDIT === undefined)('BT6 scenes', () => {
  const seed = Number(process.env.BT6_SCENE_SEED ?? 31337)
  const styles = (process.env.BT6_SCENE_STYLES ?? 'press,sag,dropD,switchD,blitzD,helpHigh,helpLow').split(',')
  const maxTicks = Number(process.env.BT6_SCENE_TICKS ?? 3600)
  const out: Record<string, Record<string, number[]>> = {}
  for (const style of styles) {
    const scenes: Record<string, number[]> = {}
    const add = (key: string, t: number): void => { const list = scenes[key] ?? []; if (list.length < 4 && (list.length === 0 || t - list[list.length - 1]! > 60)) list.push(t); scenes[key] = list }
    let helpSource: string | null = null
    let possessionStart = new Map<string, { t: number; passes: number; team: string }>()
    runFingerprintGame(seed, (setup) => ({ ...setup, tacticalPlans: { ...setup.tacticalPlans, home: withStyle(setup.tacticalPlans.home, style) } }), { maxTicks, observe: (s: MatchState, events: readonly MatchNextEvent[]) => {
      const homeDefends = s.defensiveStructure?.teamId === s.homeTeamId
      const help = s.defensiveStructure?.helpDecision
      if (homeDefends && help?.status === 'TRIGGERED' && help.sourceActionId !== helpSource) { helpSource = help.sourceActionId ?? null; add('helpTriggered', s.t) }
      for (const e of events) {
        const defenseIsHome = e.teamId !== undefined && e.teamId !== s.homeTeamId
        if (e.type === 'screenSet' && defenseIsHome) add(`screen:${e.screenCoverage}`, e.t)
        if (e.type === 'actionStarted' && e.actionKind === 'KICK_OUT' && defenseIsHome) add('kickOut', e.t)
        if (e.type === 'actionStarted' && e.actionKind === 'DRIVE' && defenseIsHome) add('drive', e.t)
        if (e.type === 'dribblePickedUp' && defenseIsHome) add('pickup', e.t)
        // BT6.1 drive ecology scenes (the away team attacks the home defense).
        if (e.type === 'actionResolved' && e.actionKind === 'DRIVE' && defenseIsHome) add(`drive:${e.actionOutcome}`, e.t)
        if (e.type === 'offenseReset' && defenseIsHome) add('reset', e.t)
        if (e.type === 'foul' && e.foulType === 'SHOOTING') { const victim = s.players.find((p) => p.playerId === e.victimPlayerId); if (victim !== undefined && victim.teamId !== s.homeTeamId) add('shootingFoul', e.t) }
        if (e.type === 'passReleased' && defenseIsHome) {
          const receiver = s.players.find((p) => p.playerId === e.receiverPlayerId)
          const basket = s.defensiveStructure?.defendedBasket
          if (receiver !== undefined && basket !== undefined && Math.hypot(receiver.position.x - basket.x, receiver.position.y - basket.y) < 5) add(s.screen !== null && s.screen.screenerId === receiver.playerId ? 'shortRollPass' : 'interiorEntry', e.t)
        }
        if (e.type === 'stealAttempt' && !defenseIsHome) add('reachAttempt', e.t)
        if (e.type === 'offBallMove' && defenseIsHome && (e.ballReason === 'COME_OFF' || e.ballReason === 'BASKET_CUT' || e.ballReason === 'BACKDOOR_CUT')) add(`offBall:${e.ballReason}`, e.t)
        if (e.type === 'shotReleased' && e.shotCreation === 'TRANSITION') add(`transitionShot:${defenseIsHome ? 'awayAttacks' : 'homeAttacks'}`, e.t)
        if (e.type === 'possessionStart' && e.possessionId !== undefined) possessionStart.set(e.possessionId, { t: e.t, passes: 0, team: String(e.teamId) })
        if (e.type === 'passReleased' && e.possessionId !== undefined) { const p = possessionStart.get(e.possessionId); if (p) p.passes += 1 }
        if (e.type === 'possessionEnd' && e.possessionId !== undefined) { const p = possessionStart.get(e.possessionId); if (p && p.passes >= 4 && e.t - p.t >= 140 && p.team !== String(s.homeTeamId)) add('halfCourtPossessionStart', p.t); possessionStart.delete(e.possessionId) }
      }
    } })
    possessionStart = new Map()
    out[style] = scenes
  }
  mkdirSync('docs/match-next-bt6/audit', { recursive: true })
  writeFileSync(`docs/match-next-bt6/audit/scenes-${seed}.json`, JSON.stringify(out, null, 1))
}, 60_000_000)
