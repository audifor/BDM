export const DESIGNER_CANONICAL_WIDTH = 1920
export const DESIGNER_CANONICAL_HEIGHT = 1080

export function isDesignerMode(
  search = window.location.search,
  dev = import.meta.env.DEV,
): boolean {
  if (!dev) {
    return false
  }
  return new URLSearchParams(search).get('designer') === '1'
}

export function readDesignerAvailableSize(
  viewport: HTMLElement | null,
): { readonly width: number; readonly height: number } {
  const visualViewport = window.visualViewport
  const elementWidth = viewport?.clientWidth ?? 0
  const elementHeight = viewport?.clientHeight ?? 0
  const width =
    elementWidth > 0 ? elementWidth : (visualViewport?.width ?? window.innerWidth)
  const height =
    elementHeight > 0 ? elementHeight : (visualViewport?.height ?? window.innerHeight)
  return { width, height }
}

/** FIT-TO-VIEW for Cursor Designer: scale to fill the available preview area, up or down. */
export function computeDesignerScale(
  viewportWidth: number,
  viewportHeight: number,
  canonicalWidth = DESIGNER_CANONICAL_WIDTH,
  canonicalHeight = DESIGNER_CANONICAL_HEIGHT,
): number {
  if (viewportWidth <= 0 || viewportHeight <= 0) {
    return 1
  }
  return Math.min(
    viewportWidth / canonicalWidth,
    viewportHeight / canonicalHeight,
  )
}

export function formatDesignerScale(scale: number): string {
  return scale.toFixed(4)
}

export function toDesignerStageAnchor(clientX: number, clientY: number): { x: number; y: number } {
  const stage = document.querySelector('.designer-stage')
  const viewport = document.querySelector('.designer-viewport')
  if (stage === null || viewport === null) {
    return { x: clientX, y: clientY }
  }
  const scale = Number.parseFloat(viewport.getAttribute('data-designer-scale') ?? '1')
  const rect = stage.getBoundingClientRect()
  return {
    x: (clientX - rect.left) / scale,
    y: (clientY - rect.top) / scale,
  }
}

export function installDesignerViewportBridge(): () => void {
  window.__bdmDesignerViewportBridge = {
    toStageAnchor: toDesignerStageAnchor,
    stageViewport: () => ({
      width: DESIGNER_CANONICAL_WIDTH,
      height: DESIGNER_CANONICAL_HEIGHT,
    }),
  }
  return () => {
    delete window.__bdmDesignerViewportBridge
  }
}
