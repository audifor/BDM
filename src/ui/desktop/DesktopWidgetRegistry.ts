export const DESKTOP_WIDGET_SNAP = 4
export const DESKTOP_WIDGET_DOCK_SAFE_AREA = 104

export type DesktopWidgetId = 'nextGame' | 'dayStatus' | 'inbox' | 'news' | 'standings' | 'training' | 'calendar' | 'squad'
export interface DesktopWidgetDefinition { readonly id: DesktopWidgetId; readonly title: string; readonly minWidth: number; readonly minHeight: number; readonly maxWidth: number; readonly maxHeight: number; readonly defaultLayout: DesktopWidgetLayout }
export interface DesktopWidgetLayout { readonly id: DesktopWidgetId; readonly visible: boolean; readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface DesktopWidgetBounds { readonly width: number; readonly height: number }
export interface WidgetRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

export const DESKTOP_WIDGETS: readonly DesktopWidgetDefinition[] = [
  { id: 'nextGame', title: 'Próximo partido', minWidth: 320, minHeight: 180, maxWidth: 620, maxHeight: 320, defaultLayout: { id: 'nextGame', visible: true, x: 48, y: 120, width: 480, height: 224 } },
  { id: 'standings', title: 'Clasificación', minWidth: 280, minHeight: 190, maxWidth: 500, maxHeight: 440, defaultLayout: { id: 'standings', visible: true, x: 1440, y: 120, width: 384, height: 280 } },
  { id: 'training', title: 'Entrenamiento', minWidth: 280, minHeight: 150, maxWidth: 480, maxHeight: 300, defaultLayout: { id: 'training', visible: true, x: 48, y: 384, width: 352, height: 184 } },
  { id: 'calendar', title: 'Calendario', minWidth: 280, minHeight: 160, maxWidth: 500, maxHeight: 380, defaultLayout: { id: 'calendar', visible: true, x: 1424, y: 432, width: 400, height: 232 } },
  { id: 'squad', title: 'Plantilla', minWidth: 280, minHeight: 150, maxWidth: 500, maxHeight: 300, defaultLayout: { id: 'squad', visible: true, x: 500, y: 648, width: 416, height: 180 } },
  { id: 'dayStatus', title: 'Estado del día', minWidth: 220, minHeight: 120, maxWidth: 400, maxHeight: 220, defaultLayout: { id: 'dayStatus', visible: true, x: 960, y: 120, width: 300, height: 144 } },
  { id: 'inbox', title: 'Inbox', minWidth: 260, minHeight: 160, maxWidth: 480, maxHeight: 360, defaultLayout: { id: 'inbox', visible: false, x: 980, y: 400, width: 340, height: 220 } },
  { id: 'news', title: 'Últimas noticias', minWidth: 260, minHeight: 160, maxWidth: 480, maxHeight: 360, defaultLayout: { id: 'news', visible: false, x: 980, y: 400, width: 340, height: 220 } },
]

export function getDesktopWidget(id: DesktopWidgetId) { return DESKTOP_WIDGETS.find((widget) => widget.id === id)! }
export function snapToGrid(value: number) { return Math.round(value / DESKTOP_WIDGET_SNAP) * DESKTOP_WIDGET_SNAP }
export function rectsIntersect(a: WidgetRect, b: WidgetRect) { return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y }
export function clampWidgetBounds(layout: DesktopWidgetLayout, bounds: DesktopWidgetBounds): DesktopWidgetLayout {
  const definition = getDesktopWidget(layout.id); const usableHeight = Math.max(0, bounds.height - DESKTOP_WIDGET_DOCK_SAFE_AREA)
  const width = Math.max(Math.min(definition.minWidth, bounds.width), Math.min(definition.maxWidth, Math.min(layout.width, bounds.width)))
  const height = Math.max(Math.min(definition.minHeight, usableHeight), Math.min(definition.maxHeight, Math.min(layout.height, usableHeight)))
  return { ...layout, x: Math.max(0, Math.min(snapToGrid(layout.x), Math.max(0, bounds.width - width))), y: Math.max(0, Math.min(snapToGrid(layout.y), Math.max(0, usableHeight - height))), width: snapToGrid(width), height: snapToGrid(height) }
}
export function isWidgetPlacementValid(candidate: DesktopWidgetLayout, widgets: readonly DesktopWidgetLayout[], bounds: DesktopWidgetBounds) {
  const clamped = clampWidgetBounds(candidate, bounds)
  if (clamped.x !== candidate.x || clamped.y !== candidate.y || clamped.width !== candidate.width || clamped.height !== candidate.height) return false
  return !widgets.some((widget) => widget.visible && widget.id !== candidate.id && rectsIntersect(candidate, widget))
}
