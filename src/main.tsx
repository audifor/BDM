import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@/ui-ng/system/responsive/responsive.css'
import { ResponsiveProvider } from '@/ui-ng/system/responsive/ResponsiveProvider'
import { BootstrapApp } from '@/ui/startup/BootstrapApp'

const isLegacyUi = new URLSearchParams(window.location.search).get('ui') === 'legacy'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ResponsiveProvider>
      <BootstrapApp uiMode={isLegacyUi ? 'legacy' : 'ng'} />
    </ResponsiveProvider>
  </StrictMode>,
)
