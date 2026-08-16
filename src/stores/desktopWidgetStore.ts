import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { DESKTOP_WIDGETS, clampWidgetBounds, getDesktopWidget, isWidgetPlacementValid, snapToGrid, type DesktopWidgetBounds, type DesktopWidgetId, type DesktopWidgetLayout } from '@/ui/desktop/DesktopWidgetRegistry'

interface DesktopWidgetStore { readonly editMode: boolean; readonly selectedWidgetId: DesktopWidgetId | null; readonly widgets: readonly DesktopWidgetLayout[]; enterEditMode(): void; exitEditMode(): void; selectWidget(id: DesktopWidgetId | null): void; moveWidget(id: DesktopWidgetId, x: number, y: number, bounds: DesktopWidgetBounds): void; resizeWidget(id: DesktopWidgetId, width: number, height: number, bounds: DesktopWidgetBounds): void; hideWidget(id: DesktopWidgetId): void; showWidget(id: DesktopWidgetId, bounds: DesktopWidgetBounds): void; clampToBounds(bounds: DesktopWidgetBounds): void; resetLayout(): void }

/** A new desktop is intentionally empty; existing store layouts remain untouched. */
export const defaultDesktopWidgetLayouts = (): readonly DesktopWidgetLayout[] => []
export const useDesktopWidgetStore = create<DesktopWidgetStore>()(persist((set) => ({
  editMode: false, selectedWidgetId: null, widgets: defaultDesktopWidgetLayouts(),
  enterEditMode: () => set({ editMode: true }), exitEditMode: () => set({ editMode: false, selectedWidgetId: null }), selectWidget: (selectedWidgetId) => set({ selectedWidgetId }),
  moveWidget: (id, x, y, bounds) => set((state) => updateLayout(state.widgets, id, (widget) => ({ ...widget, x: snapToGrid(x), y: snapToGrid(y) }), bounds)),
  resizeWidget: (id, width, height, bounds) => set((state) => updateLayout(state.widgets, id, (widget) => ({ ...widget, width: snapToGrid(width), height: snapToGrid(height) }), bounds)),
  hideWidget: (id) => set((state) => ({ widgets: state.widgets.filter((widget) => widget.id !== id), selectedWidgetId: state.selectedWidgetId === id ? null : state.selectedWidgetId })),
  showWidget: (id, bounds) => set((state) => {
    if (state.widgets.some((widget) => widget.id === id)) return state
    const layout = { ...getDesktopWidget(id).defaultLayout, visible: true }
    const placed = isWidgetPlacementValid(layout, state.widgets, bounds) ? layout : findFreePlacement(layout, state.widgets, bounds)
    return placed === undefined ? state : { widgets: [...state.widgets, placed] }
  }),
  clampToBounds: (bounds) => set((state) => {
    const widgets: DesktopWidgetLayout[] = []
    for (const widget of state.widgets) {
      const clamped = clampWidgetBounds(widget, bounds)
      const candidate = isWidgetPlacementValid(clamped, widgets, bounds) ? clamped : findFreePlacement(clamped, widgets, bounds)
      widgets.push(candidate ?? { ...widget, visible: false })
    }
    return { widgets }
  }),
  resetLayout: () => set({ widgets: defaultDesktopWidgetLayouts(), selectedWidgetId: null }),
}), { name: 'bdm.desktop-widgets.v1', partialize: (state) => ({ widgets: state.widgets }) }))

function updateLayout(widgets: readonly DesktopWidgetLayout[], id: DesktopWidgetId, update: (widget: DesktopWidgetLayout) => DesktopWidgetLayout, bounds: DesktopWidgetBounds) {
  const current = widgets.find((widget) => widget.id === id); if (current === undefined) return { widgets }
  const candidate = clampWidgetBounds(update(current), bounds)
  return isWidgetPlacementValid(candidate, widgets, bounds) ? { widgets: widgets.map((widget) => widget.id === id ? candidate : widget) } : { widgets }
}

export function findFreePlacement(layout: DesktopWidgetLayout, widgets: readonly DesktopWidgetLayout[], bounds: DesktopWidgetBounds): DesktopWidgetLayout | undefined {
  const definition = getDesktopWidget(layout.id); const start = clampWidgetBounds({ ...layout, width: Math.max(layout.width, definition.minWidth), height: Math.max(layout.height, definition.minHeight) }, bounds)
  for (let y = 24; y <= bounds.height - start.height - 104; y += 32) for (let x = 24; x <= bounds.width - start.width; x += 32) { const candidate = { ...start, x: snapToGrid(x), y: snapToGrid(y) }; if (isWidgetPlacementValid(candidate, widgets, bounds)) return candidate }
  return undefined
}
