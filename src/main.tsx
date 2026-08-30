import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { BootstrapApp } from '@/ui/startup/BootstrapApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BootstrapApp />
  </StrictMode>,
)
