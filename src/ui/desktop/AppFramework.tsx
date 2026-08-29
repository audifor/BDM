import type { ReactNode } from 'react'
export { BDMDataGrid, BDMDataGrid as DataTable, dataTableGridTemplate, type DataColumn } from '@/ui/dataGrid'

export function AppFrame({ children, header, navigation, toolbar }: { readonly children: ReactNode; readonly header?: ReactNode; readonly navigation?: ReactNode; readonly toolbar?: ReactNode }) {
  return <section className="bdm-app-frame">{header !== undefined && <header className="bdm-app-frame__header">{header}</header>}{navigation !== undefined && <nav className="bdm-app-frame__navigation">{navigation}</nav>}{toolbar !== undefined && <div className="bdm-app-frame__toolbar">{toolbar}</div>}<div className="bdm-app-frame__workspace">{children}</div></section>
}
export function AppHeader({ eyebrow, meta, title }: { readonly eyebrow?: string; readonly meta?: ReactNode; readonly title: ReactNode }) { return <div className="bdm-app-header"><div>{eyebrow !== undefined && eyebrow !== '' && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1></div>{meta !== undefined && <div className="bdm-app-header__meta">{meta}</div>}</div> }
export function SplitWorkspace({ children, inspector }: { readonly children: ReactNode; readonly inspector?: ReactNode }) { return <div className={`bdm-split-workspace${inspector === undefined ? ' bdm-split-workspace--single' : ''}`}><div className="bdm-split-workspace__main">{children}</div>{inspector !== undefined && <aside className="bdm-split-workspace__inspector">{inspector}</aside>}</div> }
export function DetailGroup({ children, title }: { readonly children: ReactNode; readonly title: string }) { return <section className="bdm-detail-group"><h2>{title}</h2>{children}</section> }
