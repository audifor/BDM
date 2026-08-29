export const DESKTOP_WIDGET_SNAP = 4
/** Shared desktop work-area boundaries; widgets and windows must remain inside them. */
export const DESKTOP_TOP_BAR_HEIGHT = 48
export const DESKTOP_BOTTOM_BAR_HEIGHT = 56
export const DESKTOP_WIDGET_DOCK_SAFE_AREA = DESKTOP_BOTTOM_BAR_HEIGHT

export type DesktopWidgetId = 'nextGame' | 'dayStatus' | 'inbox' | 'news' | 'standings' | 'training' | 'calendar' | 'squad'
export interface DesktopWidgetDefinition { readonly id: DesktopWidgetId; readonly title: string; readonly minWidth: number; readonly minHeight: number; readonly maxWidth: number; readonly maxHeight: number; readonly defaultLayout: DesktopWidgetLayout }
export interface DesktopWidgetLayout { readonly id: DesktopWidgetId; readonly visible: boolean; readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface DesktopWidgetBounds { readonly width: number; readonly height: number }
export interface WidgetRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

export const DESKTOP_WIDGETS: readonly DesktopWidgetDefinition[] = [
  { id: 'nextGame', title: 'Próximo partido', minWidth: 280, minHeight: 128, maxWidth: 400, maxHeight: 260, defaultLayout: { id: 'nextGame', visible: true, x: 25, y: 262, width: 294, height: 132 } },
  { id: 'standings', title: 'Clasificación', minWidth: 280, minHeight: 170, maxWidth: 420, maxHeight: 360, defaultLayout: { id: 'standings', visible: true, x: 25, y: 624, width: 294, height: 190 } },
  { id: 'training', title: 'Moral del equipo', minWidth: 280, minHeight: 88, maxWidth: 400, maxHeight: 200, defaultLayout: { id: 'training', visible: true, x: 25, y: 404, width: 294, height: 88 } },
  { id: 'calendar', title: 'Próximos partidos', minWidth: 280, minHeight: 140, maxWidth: 500, maxHeight: 380, defaultLayout: { id: 'calendar', visible: false, x: 796, y: 732, width: 393, height: 204 } },
  { id: 'squad', title: 'Resumen del equipo', minWidth: 280, minHeight: 160, maxWidth: 400, maxHeight: 260, defaultLayout: { id: 'squad', visible: true, x: 25, y: 76, width: 294, height: 170 } },
  { id: 'dayStatus', title: 'Finanzas', minWidth: 280, minHeight: 98, maxWidth: 400, maxHeight: 220, defaultLayout: { id: 'dayStatus', visible: true, x: 25, y: 504, width: 294, height: 104 } },
  { id: 'inbox', title: 'Inbox', minWidth: 260, minHeight: 160, maxWidth: 480, maxHeight: 360, defaultLayout: { id: 'inbox', visible: false, x: 980, y: 400, width: 340, height: 220 } },
  { id: 'news', title: 'Noticias BDM', minWidth: 280, minHeight: 100, maxWidth: 420, maxHeight: 260, defaultLayout: { id: 'news', visible: true, x: 25, y: 834, width: 294, height: 104 } },
]

export function getDesktopWidget(id: DesktopWidgetId) { return DESKTOP_WIDGETS.find((widget) => widget.id === id)! }
export function snapToGrid(value: number) { return Math.round(value / DESKTOP_WIDGET_SNAP) * DESKTOP_WIDGET_SNAP }
export function rectsIntersect(a: WidgetRect, b: WidgetRect) { return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y }
export function clampWidgetBounds(layout: DesktopWidgetLayout, bounds: DesktopWidgetBounds): DesktopWidgetLayout {
  const definition = getDesktopWidget(layout.id); const usableHeight = Math.max(0, bounds.height - DESKTOP_TOP_BAR_HEIGHT - DESKTOP_BOTTOM_BAR_HEIGHT)
  const width = Math.max(Math.min(definition.minWidth, bounds.width), Math.min(definition.maxWidth, Math.min(layout.width, bounds.width)))
  const height = Math.max(Math.min(definition.minHeight, usableHeight), Math.min(definition.maxHeight, Math.min(layout.height, usableHeight)))
  return { ...layout, x: Math.max(0, Math.min(snapToGrid(layout.x), Math.max(0, bounds.width - width))), y: Math.max(DESKTOP_TOP_BAR_HEIGHT, Math.min(snapToGrid(layout.y), Math.max(DESKTOP_TOP_BAR_HEIGHT, bounds.height - DESKTOP_BOTTOM_BAR_HEIGHT - height))), width: snapToGrid(width), height: snapToGrid(height) }
}
export function isWidgetPlacementValid(candidate: DesktopWidgetLayout, widgets: readonly DesktopWidgetLayout[], bounds: DesktopWidgetBounds) {
  const clamped = clampWidgetBounds(candidate, bounds)
  if (clamped.x !== candidate.x || clamped.y !== candidate.y || clamped.width !== candidate.width || clamped.height !== candidate.height) return false
  return !widgets.some((widget) => widget.visible && widget.id !== candidate.id && rectsIntersect(candidate, widget))
}
