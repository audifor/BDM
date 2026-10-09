import { describe, expect, it } from 'vitest'
import { addBusinessDays, athleticsAidChangeTransferWindow, basketballTransferWindow, createTransferPortalRuleset, headCoachChangeTransferWindow, isWithinTransferWindow, noNewHeadCoachTransferWindow } from './TransferPortal'
import { ecosystemIdFromString } from '@/domain/ids'
import { parseGameDate } from '@/domain/date'

const rules = createTransferPortalRuleset({
  id: 'transfer:ncaa-men:2026-27', version: '2026-27.1', ecosystemId: ecosystemIdFromString('ncaa-men'),
  effectiveFrom: parseGameDate('2026-07-01'), provenance: 'OFFICIAL_SOURCE', sourceUrl: 'https://web3.ncaa.org/lsdbi/reports/getReport/90008',
  basketballNotificationDays: 15, institutionProcessingBusinessDays: 2, headCoachDelayDays: 5, aidChangeNotificationDays: 30,
})

describe('basketball Transfer Portal calendar', () => {
  it('opens the 15 consecutive-day window the day after the supplied championship final', () => {
    const window = basketballTransferWindow(parseGameDate('2027-04-05'), rules)
    expect(window).toEqual({ opensOn: parseGameDate('2027-04-06'), closesOn: parseGameDate('2027-04-20') })
    expect(isWithinTransferWindow(window.opensOn, window)).toBe(true)
    expect(isWithinTransferWindow(parseGameDate('2027-04-21'), window)).toBe(false)
  })

  it('applies the coach announcement delay and Jan. 2 cap', () => {
    expect(headCoachChangeTransferWindow(parseGameDate('2027-04-05'), parseGameDate('2027-12-27'), rules)).toEqual({ opensOn: parseGameDate('2028-01-01'), closesOn: parseGameDate('2028-01-02') })
    expect(headCoachChangeTransferWindow(parseGameDate('2027-04-05'), parseGameDate('2027-12-28'), rules)).toBeUndefined()
  })

  it('opens the no-replacement exception on day 31 only inside the permitted championship period', () => {
    expect(noNewHeadCoachTransferWindow(parseGameDate('2027-03-20'), parseGameDate('2027-03-01'), rules)).toEqual({ opensOn: parseGameDate('2027-04-01'), closesOn: parseGameDate('2027-04-15') })
    expect(noNewHeadCoachTransferWindow(parseGameDate('2027-03-20'), parseGameDate('2026-12-01'), rules)).toBeUndefined()
    expect(noNewHeadCoachTransferWindow(parseGameDate('2027-03-20'), parseGameDate('2027-03-01'), rules, parseGameDate('2027-03-25'))).toBeUndefined()
  })

  it('keeps aid-change notification separate and counts two processing business days', () => {
    expect(athleticsAidChangeTransferWindow(parseGameDate('2027-05-07'), rules)).toEqual({ opensOn: parseGameDate('2027-05-08'), closesOn: parseGameDate('2027-06-06') })
    expect(addBusinessDays(parseGameDate('2027-05-07'), 2)).toBe(parseGameDate('2027-05-11'))
  })
})
