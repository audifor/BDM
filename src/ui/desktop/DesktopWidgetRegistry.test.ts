import { describe, expect, it } from 'vitest'
import { DESKTOP_WIDGETS, rectsIntersect, snapToGrid } from './DesktopWidgetRegistry'

describe('desktop widget registry', () => {
  it('contains unique real widgets with valid dimensions', () => { expect(new Set(DESKTOP_WIDGETS.map((widget) => widget.id)).size).toBe(DESKTOP_WIDGETS.length); expect(DESKTOP_WIDGETS.every((widget) => widget.minWidth > 0 && widget.minHeight > 0)).toBe(true) })
  it('snaps precisely and detects only actual overlap', () => { expect(snapToGrid(113)).toBe(112); expect(snapToGrid(117)).toBe(116); expect(snapToGrid(431)).toBe(432); expect(rectsIntersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 10, height: 10 })).toBe(false); expect(rectsIntersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 9, y: 0, width: 10, height: 10 })).toBe(true) })
})
