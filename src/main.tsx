import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { BdmOsNg } from '@/ui-ng/BdmOsNg'
import { BootstrapApp } from '@/ui/startup/BootstrapApp'

const isNgUi = new URLSearchParams(window.location.search).get('ui') === 'ng'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isNgUi ? <BdmOsNg /> : <BootstrapApp />}
  </StrictMode>,
)
