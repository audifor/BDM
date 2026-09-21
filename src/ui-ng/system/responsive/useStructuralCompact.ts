import { useContainerSize } from './useContainerSize'

export function isStructuralCompact(width: number, minimumWidth: number): boolean {
  return Number.isFinite(width) && width > 0 && width < minimumWidth
}

export function useStructuralCompact<T extends HTMLElement = HTMLElement>(minimumWidth: number) {
  const size = useContainerSize<T>()
  return {
    ...size,
    isStructuralCompact: isStructuralCompact(size.width, minimumWidth),
  }
}
