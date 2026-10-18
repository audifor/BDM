import {describe,it,expect} from 'vitest'
import {homeStandingsWindow} from './homeStandingsDigest'

describe('HOME compact standings',()=>{
  it('preserves top, local and relegation end without mutating the true table',()=>{
    const table=Array.from({length:18},(_,i)=>({position:i+1,teamId:`team-${i+1}`}))
    expect(homeStandingsWindow(table,'team-9').map(r=>r.position)).toEqual([1,2,8,9,10,17,18])
    expect(table.map(r=>r.position)).toEqual(Array.from({length:18},(_,i)=>i+1))
  })
  it('does not hide teams from short leagues',()=>{
    const table=Array.from({length:6},(_,i)=>({position:i+1,teamId:`t${i}`}))
    expect(homeStandingsWindow(table,'t2')).toHaveLength(6)
  })
  it('keeps the manager visible at extremes and limits the preview',()=>{
    const table=Array.from({length:18},(_,i)=>({position:i+1,teamId:`team-${i+1}`}))
    expect(homeStandingsWindow(table,'team-18').some(r=>r.teamId==='team-18')).toBe(true)
    expect(homeStandingsWindow(table,'team-1').some(r=>r.teamId==='team-1')).toBe(true)
    expect(homeStandingsWindow(table,'team-9').length).toBeLessThanOrEqual(7)
  })
})
