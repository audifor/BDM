import type { CSSProperties } from 'react'

import { getBdmIconSource, type BdmIconName } from './iconRegistry'

export function BdmIcon({ className, name, size = 20 }: { readonly className?: string; readonly name: BdmIconName; readonly size?: 20 | 28 | 64 | number }) { return <img alt="" className={className} draggable={false} src={getBdmIconSource(name, size)} style={{ '--bdm-icon-size': `${size}px` } as CSSProperties} /> }
