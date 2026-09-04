import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { BootstrapApp } from '@/ui/startup/BootstrapApp'

const isNgUi = new URLSearchParams(window.location.search).get('ui') === 'ng'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BootstrapApp uiMode={isNgUi ? 'ng' : 'legacy'} />
  </StrictMode>,
)
