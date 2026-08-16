import { beforeEach, describe, expect, it } from 'vitest'
import { defaultDesktopWidgetLayouts, useDesktopWidgetStore } from './desktopWidgetStore'

const bounds = { width: 1920, height: 1080 }
describe('desktop widget store', () => {
  beforeEach(() => useDesktopWidgetStore.setState({ editMode: false, selectedWidgetId: null, widgets: defaultDesktopWidgetLayouts() }))
  it('starts a new desktop without default widgets', () => { expect(useDesktopWidgetStore.getState().widgets).toEqual([]) })
  it('adds, moves and preserves existing widget layouts', () => { useDesktopWidgetStore.getState().showWidget('nextGame', bounds); useDesktopWidgetStore.getState().showWidget('standings', bounds); const before = useDesktopWidgetStore.getState().widgets.find((widget) => widget.id === 'standings')!; useDesktopWidgetStore.getState().moveWidget('nextGame', 541, 301, bounds); expect(useDesktopWidgetStore.getState().widgets.find((widget) => widget.id === 'nextGame')).toMatchObject({ x: 540, y: 300 }); expect(useDesktopWidgetStore.getState().widgets.find((widget) => widget.id === 'standings')).toEqual(before) })
  it('removes a widget and can add its stable registry layout again', () => { useDesktopWidgetStore.getState().showWidget('inbox', bounds); useDesktopWidgetStore.getState().hideWidget('inbox'); expect(useDesktopWidgetStore.getState().widgets).toEqual([]); useDesktopWidgetStore.getState().showWidget('inbox', bounds); expect(useDesktopWidgetStore.getState().widgets).toHaveLength(1); expect(useDesktopWidgetStore.getState().widgets[0]).toMatchObject({ id: 'inbox', visible: true }) })
})
