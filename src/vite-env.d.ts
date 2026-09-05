/// <reference types="vite/client" />

declare module '*.png' {
  const source: string
  export default source
}

declare module '*.jpg' {
  const source: string
  export default source
}

interface BdmDesignerViewportBridge {
  readonly toStageAnchor: (clientX: number, clientY: number) => { readonly x: number; readonly y: number }
  readonly stageViewport: () => { readonly width: number; readonly height: number }
}

interface Window {
  __bdmDesignerViewportBridge?: BdmDesignerViewportBridge
}
