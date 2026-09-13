import { useEffect, useState } from 'react'
import Sidebar, { MobileHeader } from './components/Sidebar'
import TimelineView from './components/TimelineView'
import MapView from './components/MapView'
import WishlistView from './components/WishlistView'
import SettingsView from './components/SettingsView'
import ConfirmDialog from './components/ConfirmDialog'
import Toast from './components/Toast'
import { useActiveTrip, useTripStore } from './store'
import type { PlanTab } from './types'
import { exportTripImage } from './utils/exportTripImage'
import { useToastStore } from './components/toastStore'
import { CalendarIcon, DownloadIcon, HeartIcon, MapIcon } from './components/Icons'

const PLAN_TABS: { key: PlanTab; label: string; Icon: typeof CalendarIcon }[] = [
  { key: 'timeline', label: '行程', Icon: CalendarIcon },
  { key: 'places', label: '想去', Icon: HeartIcon },
]

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function App() {
  const { view, planTab, setPlanTab, setView } = useTripStore()
  const trip = useActiveTrip()
  const visiblePlanTab = planTab === 'map' || planTab === 'budget' ? 'timeline' : planTab
  const [exportingImage, setExportingImage] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [fullScreenMapDayId, setFullScreenMapDayId] = useState<string | null>(() => planTab === 'map' ? 'all' : null)

  useEffect(() => {
    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }
    function onInstalled() {
      setInstallPrompt(null)
      useToastStore.getState().show('途记已添加到设备')
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  function closeFullScreenMap() {
    setFullScreenMapDayId(null)
    if (planTab === 'map' || planTab === 'budget') setPlanTab('timeline')
  }

  useEffect(() => {
    if (!fullScreenMapDayId) return
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setFullScreenMapDayId(null)
      if (planTab === 'map' || planTab === 'budget') setPlanTab('timeline')
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [fullScreenMapDayId, planTab, setPlanTab])

  async function downloadImage() {
    setExportingImage(true)
    try {
      await exportTripImage(trip)
      useToastStore.getState().show('行程图片已开始下载')
    } catch {
      useToastStore.getState().show('图片导出失败，请稍后重试', { tone: 'error' })
    } finally {
      setExportingImage(false)
    }
  }

  async function installApp() {
    if (!installPrompt) return
    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    if (choice.outcome === 'dismissed') setInstallPrompt(null)
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-bg">
      <div className="flex h-full w-full overflow-hidden" aria-hidden={fullScreenMapDayId ? true : undefined} inert={fullScreenMapDayId ? true : undefined}>
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <MobileHeader onExport={downloadImage} exporting={exportingImage} />
        {view === 'plan' && (
          <>
            {/* 行程规划子标签 */}
            <div className="trip-topbar hidden h-[52px] shrink-0 items-end justify-between border-b border-border/80 px-7 md:flex">
              <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
                {PLAN_TABS.map(({ key, label, Icon }) => {
                  const active = visiblePlanTab === key
                  return (
                    <button
                      key={key}
                      onClick={() => setPlanTab(key)}
                      className={`relative flex shrink-0 items-center gap-1.5 px-3 pb-3 pt-2 text-[13px] transition-colors ${
                        active ? 'font-semibold text-text' : 'text-text-muted hover:text-text'
                      }`}
                    >
                      <Icon size={14} /> {label}
                      {active && <span className="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-action" />}
                    </button>
                  )
                })}
              </div>
              <div className="flex items-center gap-1.5 pb-2.5">
                {installPrompt && (
                  <button
                    onClick={installApp}
                    className="rounded-md px-2.5 py-1 text-[12px] font-medium text-accent transition-colors hover:bg-accent-soft"
                    title="将途记添加到设备"
                  >
                    安装应用
                  </button>
                )}
                <button
                  onClick={downloadImage}
                  disabled={exportingImage}
                  className="flex items-center gap-1.5 rounded-md border border-border/80 bg-white/80 px-2.5 py-1.5 text-[12px] font-medium text-text-muted shadow-[0_1px_2px_rgba(32,40,46,0.04)] backdrop-blur-sm transition-colors hover:border-accent/50 hover:text-text disabled:cursor-wait disabled:opacity-60"
                >
                  <DownloadIcon size={13} /> {exportingImage ? '生成中…' : '导出行程卡片'}
                </button>
              </div>
            </div>
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
              {visiblePlanTab === 'timeline' && (
                <div className="h-full overflow-y-auto">
                  <TimelineView onOpenFullMap={(dayId) => setFullScreenMapDayId(dayId)} />
                </div>
              )}
              {visiblePlanTab === 'places' && <WishlistView />}
            </div>
          </>
        )}
        {view === 'settings' && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <SettingsView canInstall={!!installPrompt} onInstall={installApp} />
          </div>
        )}
        {view === 'plan' && <nav className="mobile-safe-bottom flex shrink-0 border-t border-border/80 bg-white/96 px-1 pt-1 shadow-[0_-2px_10px_rgba(32,40,46,0.05)] backdrop-blur md:hidden" aria-label="主要导航">
          {PLAN_TABS.map(({ key, label, Icon }) => {
            const active = view === 'plan' && visiblePlanTab === key
            return (
              <button
                key={key}
                onClick={() => {
                  setView('plan')
                  setPlanTab(key)
                }}
                className={`relative flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-1.5 text-[10.5px] transition-colors ${
                  active ? 'rounded-lg bg-surface-2/55 font-semibold text-text' : 'text-text-faint active:bg-surface-2'
                }`}
              >
                {active && <span className="absolute top-0 h-0.5 w-5 rounded-full bg-action" />}
                <Icon size={19} />
                <span>{label}</span>
              </button>
            )
          })}
        </nav>}
      </main>
      </div>
      {fullScreenMapDayId && (
        <section role="dialog" aria-modal="true" className="fixed inset-0 z-[1000] flex flex-col bg-bg" aria-label="完整行程地图">
          <header className="trip-topbar mobile-safe-top flex min-h-[58px] shrink-0 items-center gap-3 border-b border-border/80 px-3 sm:px-5">
            <button
              onClick={closeFullScreenMap}
              className="shrink-0 rounded-md border border-border/80 bg-white/80 px-3 py-2 text-[12.5px] font-medium text-text-muted transition-colors hover:border-accent/50 hover:text-text"
            >
              返回行程
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-semibold text-text">{trip.name}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-text-faint"><MapIcon size={12} /> 完整行程地图</div>
            </div>
            <span className="hidden shrink-0 text-[11.5px] text-text-faint sm:inline">Esc 关闭</span>
          </header>
          <div className="min-h-0 flex-1">
            <MapView
              initialDayId={fullScreenMapDayId}
              onOpenActivity={closeFullScreenMap}
            />
          </div>
        </section>
      )}
      <ConfirmDialog />
      <Toast />
    </div>
  )
}
