import { describe, expect, it } from 'vitest'

import {
  closeOpenedTaskbarApp,
  isClosableTaskbarApp,
  rememberOpenedTaskbarApp,
  taskbarAppLabel,
  visibleTaskbarAppIds,
} from '@/ui-ng/workspace/taskbarOpenApps'

describe('taskbarOpenApps', () => {
  it('keeps Home pinned and never closable', () => {
    expect(isClosableTaskbarApp('home')).toBe(false)
    expect(isClosableTaskbarApp('roster')).toBe(true)
    expect(rememberOpenedTaskbarApp([], 'home')).toEqual([])
    expect(closeOpenedTaskbarApp(['roster'], 'home')).toEqual(['roster'])
    expect(visibleTaskbarAppIds([])).toEqual(['home'])
  })

  it('remembers opened sections in open order', () => {
    const opened = rememberOpenedTaskbarApp(rememberOpenedTaskbarApp([], 'roster'), 'training')
    expect(opened).toEqual(['roster', 'training'])
    expect(rememberOpenedTaskbarApp(opened, 'roster')).toEqual(['roster', 'training'])
    expect(visibleTaskbarAppIds(opened)).toEqual(['home', 'roster', 'training'])
  })

  it('closes an opened section without touching the others', () => {
    expect(closeOpenedTaskbarApp(['roster', 'training'], 'roster')).toEqual(['training'])
    expect(taskbarAppLabel('mentoring')).toBe('Mentoring')
    expect(taskbarAppLabel('staff')).toBe('Staff')
  })
})
