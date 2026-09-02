import { useState } from 'react'
import Sidebar from './components/Sidebar'
import TimelineView from './components/TimelineView'
import MapView from './components/MapView'
import BudgetView from './components/BudgetView'
import WishlistView from './components/WishlistView'
import SettingsView from './components/SettingsView'
import ConfirmDialog from './components/ConfirmDialog'
import Toast from './components/Toast'
import { useActiveTrip, useTripStore } from './store'
import type { PlanTab } from './types'
import { exportTripImage } from './utils/exportTripImage'
import { useToastStore } from './components/toastStore'

const PLAN_TABS: { key: PlanTab; label: string }[] = [
  { key: 'timeline', label: '行程' },
  { key: 'places', label: '想去' },
  { key: 'map', label: '地图' },
  { key: 'budget', label: '预算' },
]

export default function App() {
  const { view, planTab, setPlanTab } = useTripStore()
  const trip = useActiveTrip()
  const [exportingImage, setExportingImage] = useState(false)

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

  return (
    <div className="flex h-full w-full overflow-hidden bg-bg">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {view === 'plan' && (
          <>
            {/* 行程规划子标签 */}
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-6 pt-2.5">
              <div className="flex items-center gap-1">
                {PLAN_TABS.map(({ key, label }) => {
                  const active = planTab === key
                  return (
                    <button
                      key={key}
                      onClick={() => setPlanTab(key)}
                      className={`relative px-3 pb-2.5 pt-1 text-[13.5px] transition-colors ${
                        active ? 'font-medium text-accent-hover' : 'text-text-muted hover:text-text'
                      }`}
                    >
                      {label}
                      {active && <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-accent" />}
                    </button>
                  )
                })}
              </div>
              <div className="flex items-center gap-1.5 pb-2">
                <button
                  onClick={downloadImage}
                  disabled={exportingImage}
                  className="rounded-md border border-border bg-white px-2.5 py-1 text-[12px] font-medium text-text-muted shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-accent hover:text-accent disabled:cursor-wait disabled:opacity-60"
                >
                  {exportingImage ? '生成中…' : '导出图片'}
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
              {planTab === 'budget' && (
                <div className="h-full overflow-y-auto">
                  <BudgetView />
                </div>
              )}
            </div>
          </>
        )}
        {view === 'settings' && <SettingsView />}
      </main>
      <ConfirmDialog />
      <Toast />
    </div>
  )
}
