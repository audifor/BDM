import { it } from 'vitest'
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import { preparedSetup } from '../bt2/economy'

/** BT5 debug: find a stalled game (no event for 600 ticks while the clock is stopped or the score frozen) and dump the state. */
it.skipIf(process.env.BT2_AUDIT === undefined)('stall', () => {
  const seed = Number(process.env.BT5_SEED ?? 424242)
  const live = createMatchEnginePort('match-next').createLiveSession(preparedSetup(seed))
  let lastEventT = 0
  let lastCount = 0
  while (!live.matchState.isComplete && live.matchState.t < 60000) {
    live.advanceOneStep()
    const s = live.matchState
    if (s.events.length !== lastCount) { lastCount = s.events.length; lastEventT = s.t }
    if (s.t - lastEventT > 600) {
      const p = s.possessions.find((x) => x.id === s.activePossessionId)
      console.log('STALL at', s.t, 'clock', s.gameClockTenths, s.shotClockTenths, JSON.stringify(s.clock), 'score', JSON.stringify(s.score))
      console.log('ball', JSON.stringify(s.ball).slice(0, 400))
      console.log('possession', JSON.stringify(p), 'playState', JSON.stringify(s.playState))
      console.log('flow', JSON.stringify(s.offenseFlow).slice(0, 1200))
      console.log('screen', JSON.stringify(s.screen))
      console.log('transition', JSON.stringify(s.transition)?.slice(0, 400))
      console.log('active actions', JSON.stringify(s.actions.filter((a) => a.status === 'ACTIVE')))
      console.log('last events', JSON.stringify(s.events.slice(-12).map((e) => [e.t, e.type, e.playerId, e.ballReason ?? e.actionKind ?? e.playFamily ?? ''])))
      console.log('players', JSON.stringify(s.players.filter((x) => x.active).map((x) => [x.playerId.slice(-4), x.position.x.toFixed(1), x.position.y.toFixed(1), Math.hypot(x.velocity.x, x.velocity.y).toFixed(2)])))
      console.log('intents', JSON.stringify(s.movementIntents.map((i) => [i.playerId.slice(-4), i.target.x.toFixed(1), i.target.y.toFixed(1), i.provenance.owner])))
      return
    }
  }
  console.log('no stall; complete', live.matchState.isComplete, JSON.stringify(live.matchState.score))
}, 6_000_000)
