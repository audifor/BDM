import { useDesktopPreferencesStore, DESKTOP_WALLPAPERS, DENSITY_PRESETS } from '@/stores/desktopPreferencesStore'
import { BdmButton, Select } from '@/ui/components/designSystem'
import { DESKTOP_WIDGETS } from './DesktopWidgetRegistry'
import { useDesktopWidgetStore } from '@/stores/desktopWidgetStore'

const wallpaperLabels = { arena: 'Night arena', office: 'Front office', court: 'Empty court', abstract: 'BDM abstract' } as const
const densityLabels = { comfortable: 'Comfortable', standard: 'Standard', compact: 'Compact' } as const

export function DesktopSettingsScreen() {
  const wallpaper = useDesktopPreferencesStore((state) => state.wallpaper)
  const density = useDesktopPreferencesStore((state) => state.density)
  const dockAutoHide = useDesktopPreferencesStore((state) => state.dockAutoHide)
  const visualQaFixture = useDesktopPreferencesStore((state) => state.visualQaFixture)
  const setWallpaper = useDesktopPreferencesStore((state) => state.setWallpaper)
  const setDensity = useDesktopPreferencesStore((state) => state.setDensity)
  const setDockAutoHide = useDesktopPreferencesStore((state) => state.setDockAutoHide)
  const setVisualQaFixture = useDesktopPreferencesStore((state) => state.setVisualQaFixture)
  const widgets = useDesktopWidgetStore((state) => state.widgets)
  const hideWidget = useDesktopWidgetStore((state) => state.hideWidget)
  const showWidget = useDesktopWidgetStore((state) => state.showWidget)
  const resetLayout = useDesktopWidgetStore((state) => state.resetLayout)
  return <section className="desktop-settings"><header><p className="eyebrow">WORKSTATION</p><h1>Desktop appearance</h1><p>These preferences stay on this computer and never alter a career save.</p></header><div className="desktop-settings__grid"><section><h2>Wallpaper</h2><Select ariaLabel="Wallpaper" onChange={(value) => setWallpaper(value as typeof wallpaper)} options={DESKTOP_WALLPAPERS.map((value) => ({ value, label: wallpaperLabels[value] }))} value={wallpaper} /></section><section><h2>Information density</h2><Select ariaLabel="Information density" onChange={(value) => setDensity(value as typeof density)} options={DENSITY_PRESETS.map((value) => ({ value, label: densityLabels[value] }))} value={density} /><p>Changes row height, spacing and supporting controls without shrinking the reading type.</p></section><section><h2>Dock</h2><p>{dockAutoHide ? 'The dock stays hidden until the pointer reaches the bottom edge.' : 'The dock remains available at the bottom of the workspace.'}</p><BdmButton onClick={() => setDockAutoHide(!dockAutoHide)} variant="secondary">{dockAutoHide ? 'Keep dock visible' : 'Auto-hide dock'}</BdmButton></section><section><h2>Visual QA</h2><p>Loads the populated desktop fixture without changing career data.</p><BdmButton onClick={() => setVisualQaFixture(!visualQaFixture)} variant="secondary">{visualQaFixture ? 'Hide visual fixture' : 'Show visual fixture'}</BdmButton></section></div><section className="desktop-settings__widgets"><div><h2>Desktop widgets</h2><p>Choose the real information instruments available on this workstation.</p></div><BdmButton onClick={resetLayout} variant="ghost">Clear widget layout</BdmButton>{DESKTOP_WIDGETS.map((widget) => { const visible = widgets.some((item) => item.id === widget.id); return <div className="desktop-settings__widget" key={widget.id}><span>{widget.title}</span><BdmButton onClick={() => visible ? hideWidget(widget.id) : showWidget(widget.id, { width: 1920, height: 1080 })} variant="secondary">{visible ? 'Hide' : 'Show'}</BdmButton></div> })}</section></section>
}
