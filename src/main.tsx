import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { BootstrapApp } from '@/ui/startup/BootstrapApp'

const isLegacyUi = new URLSearchParams(window.location.search).get('ui') === 'legacy'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BootstrapApp uiMode={isLegacyUi ? 'legacy' : 'ng'} />
  </StrictMode>,
)
