import { beforeEach, describe, expect, it } from 'vitest'
import { defaultDesktopWidgetLayouts, useDesktopWidgetStore } from './desktopWidgetStore'

const bounds = { width: 1920, height: 1080 }
describe('desktop widget store', () => {
  beforeEach(() => useDesktopWidgetStore.setState({ editMode: false, selectedWidgetId: null, widgets: defaultDesktopWidgetLayouts() }))
  it('moves on the four-pixel snap without changing other widgets', () => { const before = useDesktopWidgetStore.getState().widgets.find((widget) => widget.id === 'standings')!; useDesktopWidgetStore.getState().moveWidget('nextGame', 541, 301, bounds); expect(useDesktopWidgetStore.getState().widgets.find((widget) => widget.id === 'nextGame')).toMatchObject({ x: 540, y: 300 }); expect(useDesktopWidgetStore.getState().widgets.find((widget) => widget.id === 'standings')).toEqual(before) })
  it('keeps geometry when hidden and restores it in session', () => { const before = useDesktopWidgetStore.getState().widgets.find((widget) => widget.id === 'inbox')!; useDesktopWidgetStore.getState().hideWidget('inbox'); useDesktopWidgetStore.getState().showWidget('inbox', bounds); expect(useDesktopWidgetStore.getState().widgets.find((widget) => widget.id === 'inbox')).toMatchObject({ ...before, visible: true }) })
})
