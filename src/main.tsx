import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@/ui-ng/system/responsive/responsive.css'
import { ResponsiveProvider } from '@/ui-ng/system/responsive/ResponsiveProvider'
import { BootstrapApp } from '@/ui/startup/BootstrapApp'
import { MatchNextDebugApp } from '@/ui-ng/applications/matchNextDebug/MatchNextDebugApp'

const isLegacyUi = new URLSearchParams(window.location.search).get('ui') === 'legacy'
const isMatchNextDebug = import.meta.env.DEV && new URLSearchParams(window.location.search).get('matchNextDebug') === '1'

createRoot(document.getElementById('root')!).render(
  isMatchNextDebug
    ? <MatchNextDebugApp />
    : <StrictMode>
        <ResponsiveProvider>
          <BootstrapApp uiMode={isLegacyUi ? 'legacy' : 'ng'} />
        </ResponsiveProvider>
      </StrictMode>,
)
