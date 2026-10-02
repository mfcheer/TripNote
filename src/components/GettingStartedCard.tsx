import { useState } from 'react'
import { useActiveTrip } from '../store'
import { HeartIcon, MapIcon, WalletIcon } from './Icons'

function keyForTrip(tripId: string) {
  return `tripnote-getting-started-dismissed-${tripId}`
}

export default function GettingStartedCard({ compact = false }: { compact?: boolean }) {
  const trip = useActiveTrip()
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(keyForTrip(trip.id)) === 'true')
  const isBlank = trip.activities.length === 0 && trip.wishPlaces.length === 0

  if (!isBlank || dismissed) return null

  function dismiss() {
    localStorage.setItem(keyForTrip(trip.id), 'true')
    setDismissed(true)
  }

  const steps = [
    { Icon: HeartIcon, title: '先收藏想去的地点', detail: compact ? '点底部「想去」开始搜索。' : '在左侧「想去」搜索地点，或直接在地图上选点。' },
    { Icon: MapIcon, title: '再安排到具体日期', detail: compact ? '选择地点后，指定日期与时间。' : '把地点拖到中间日程，时间之后随时可以调整。' },
    { Icon: WalletIcon, title: '最后补全交通与花费', detail: '旅行的路线和预算会自动汇总。' },
  ]

  return (
    <section className={`rounded-xl border border-accent/20 bg-action-soft/38 ${compact ? 'mb-3 px-3 py-3' : 'mb-5 px-4 py-4'}`} aria-label="开始规划引导">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="text-[13px] font-semibold text-text">从这里开始规划</h2><p className="mt-0.5 text-[11px] text-text-muted">三步完成一趟旅行的初稿。</p></div>
        <button onClick={dismiss} className="rounded-md px-1.5 py-1 text-[11px] text-text-faint hover:bg-white/70 hover:text-text" aria-label="关闭开始规划引导">暂不需要</button>
      </div>
      <div className={`mt-3 grid gap-2 ${compact ? '' : 'sm:grid-cols-3'}`}>
        {steps.map(({ Icon, title, detail }, index) => <div key={title} className="flex min-w-0 items-start gap-2 rounded-lg bg-white/65 px-2.5 py-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-accent shadow-[0_1px_2px_rgba(32,40,46,0.08)]"><Icon size={13} /></span>
          <span className="min-w-0"><span className="block text-[11.5px] font-semibold text-text">{index + 1}. {title}</span><span className="mt-0.5 block text-[10.5px] leading-relaxed text-text-faint">{detail}</span></span>
        </div>)}
      </div>
    </section>
  )
}
