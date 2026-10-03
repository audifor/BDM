import { it } from 'vitest'
import { createNextDemoSession } from '../../dev/nextDemoBootstrap'

/**
 * BT5.36 companion of the Phaser captures: the canonical possessions of the filmed window (same session as the viewer), so each
 * screenshot can be read against what the engine did. BT2_AUDIT=1 BT5_HOME=fast BT5_AWAY=controlled npx vitest run .../visualWindow.test.ts
 */
it.skipIf(process.env.BT2_AUDIT === undefined)('visual window', () => {
  const session = createNextDemoSession(Number(process.env.BT5_SEED ?? 31337), { homeStyle: process.env.BT5_HOME, awayStyle: process.env.BT5_AWAY })
  const c = session.controller
  while (c.matchState.t < Number(process.env.BT5_TO ?? 2400)) c.advanceOneStep()
  const s = c.matchState
  const from = Number(process.env.BT5_FROM ?? 1200)
  const side = (team: unknown) => (team === s.homeTeamId ? 'HOME' : 'AWAY')
  for (const e of s.events) {
    if (e.t < from) continue
    if (e.type === 'possessionStart') console.log(`t${e.t} ${side(e.teamId)} possession (${e.startReason})`)
    if (e.type === 'playCalled') console.log(`t${e.t}   ${side(e.teamId)} call ${e.playFamily} @${e.playLocation} ${e.spacing}`)
    if (e.type === 'screenSet') console.log(`t${e.t}   ${side(e.teamId)} screen set, coverage ${e.screenCoverage}`)
    if (e.type === 'offBallMove') console.log(`t${e.t}   ${side(e.teamId)} off-ball ${e.ballReason}`)
    if (e.type === 'actionStarted' && e.actionKind !== 'CLOSEOUT') console.log(`t${e.t}   ${side(e.teamId)} ${e.actionKind}`)
    if (e.type === 'shotReleased') console.log(`t${e.t}   ${side(e.teamId)} SHOT ${e.points}pt ${e.shotZone} ${e.shotCreation}`)
    if (e.type === 'turnover') console.log(`t${e.t}   ${side(e.teamId)} TURNOVER ${e.turnoverType}`)
    if (e.type === 'possessionEnd') console.log(`t${e.t}   end ${e.endReason} (${((e.t - (s.possessions.find((p) => p.id === e.possessionId)?.startedT ?? e.t)) / 10).toFixed(1)} s)`)
  }
})
