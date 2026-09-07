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
  { key: 'map', label: '地图', Icon: MapIcon },
]

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function App() {
  const { view, planTab, setPlanTab, setView } = useTripStore()
  const trip = useActiveTrip()
  const [exportingImage, setExportingImage] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)

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

  // 兼容已保存的旧状态：预算已并入行程页，曾停留在预算标签时回到行程。
  useEffect(() => {
    if (planTab === 'budget') setPlanTab('timeline')
  }, [planTab, setPlanTab])

  async function downloadImage() {
    setExportingImage(true)
    try {
      await exportTripImage(trip)
      useToastStore.getState().show('行程图片已开始下载')
    } catch {
      useToastStore.getState().show('图片导出失败，请稍后重试')
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
    <div className="flex h-full w-full overflow-hidden bg-bg">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <MobileHeader onExport={downloadImage} exporting={exportingImage} />
        {view === 'plan' && (
          <>
            {/* 行程规划子标签 */}
            <div className="hidden shrink-0 items-center justify-between border-b border-border bg-surface px-5 pt-2.5 md:flex">
              <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
                {PLAN_TABS.map(({ key, label, Icon }) => {
                  const active = planTab === key
                  return (
                    <button
                      key={key}
                      onClick={() => setPlanTab(key)}
                      className={`relative flex shrink-0 items-center gap-1.5 px-3 pb-2.5 pt-1 text-[13px] transition-colors ${
                        active ? 'font-medium text-accent-hover' : 'text-text-muted hover:text-text'
                      }`}
                    >
                      <Icon size={14} /> {label}
                      {active && <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-accent" />}
                    </button>
                  )
                })}
              </div>
              <div className="flex items-center gap-1.5 pb-2">
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
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-white px-2.5 py-1.5 text-[12px] font-medium text-text-muted shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-accent hover:text-accent disabled:cursor-wait disabled:opacity-60"
                >
                  <DownloadIcon size={13} /> {exportingImage ? '生成中…' : '导出行程卡片'}
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1">
              {planTab === 'timeline' && (
                <div className="h-full overflow-y-auto">
                  <TimelineView />
                </div>
              )}
              {planTab === 'places' && <WishlistView />}
              {planTab === 'map' && <MapView />}
            </div>
          </>
        )}
        {view === 'settings' && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <SettingsView canInstall={!!installPrompt} onInstall={installApp} />
          </div>
        )}
        <nav className="mobile-safe-bottom flex shrink-0 border-t border-border bg-white/95 px-1 pt-1 shadow-[0_-3px_12px_rgba(45,55,65,0.06)] backdrop-blur md:hidden" aria-label="主要导航">
          {PLAN_TABS.map(({ key, label, Icon }) => {
            const active = view === 'plan' && planTab === key
            return (
              <button
                key={key}
                onClick={() => {
                  setView('plan')
                  setPlanTab(key)
                }}
                className={`relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[10.5px] transition-colors ${
                  active ? 'bg-accent-soft font-medium text-accent-hover' : 'text-text-faint active:bg-surface-2'
                }`}
              >
                <Icon size={19} />
                <span>{label}</span>
              </button>
            )
          })}
        </nav>
      </main>
      <ConfirmDialog />
      <Toast />
    </div>
  )
}
