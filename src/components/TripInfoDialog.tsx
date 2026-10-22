import { useState } from 'react'
import { useTripStore } from '../store'
import ModalShell, { overlayPrimaryButtonClass, overlaySecondaryButtonClass } from './OverlayShell'
import { useToastStore } from './toastStore'

export default function TripInfoDialog({ tripId, onClose }: { tripId: string; onClose: () => void }) {
  const trip = useTripStore((state) => state.trips.find((item) => item.id === tripId))
  const setTripSearchRegion = useTripStore((state) => state.setTripSearchRegion)
  const renameTrip = useTripStore((state) => state.renameTrip)
  const [name, setName] = useState(trip?.name ?? '')
  const [draft, setDraft] = useState(trip?.searchRegion ?? '')

  if (!trip) return null

  function save() {
    if (!name.trim()) return
    renameTrip(tripId, name.trim())
    setTripSearchRegion(tripId, draft)
    useToastStore.getState().show(`已保存「${name.trim()}」的旅行信息`)
    onClose()
  }

  return (
    <ModalShell
      title="旅行信息"
      description={trip.name}
      onClose={onClose}
      size="sm"
      footer={<>
        <span className="mr-auto text-[11.5px] text-text-muted">仅用于这趟旅行</span>
        <button type="button" onClick={onClose} className={overlaySecondaryButtonClass}>取消</button>
        <button type="button" onClick={save} disabled={!name.trim()} className={overlayPrimaryButtonClass}>保存</button>
      </>}
    >
      <label className="mb-4 block text-[12px] font-medium text-text-muted">
        旅行名称
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) save() }}
          placeholder="为这趟旅行取个名字"
          className="mt-1.5 w-full rounded-[10px] border border-border bg-white px-3 py-2.5 text-[16px] font-normal text-text outline-none focus:border-accent sm:text-[14px]"
        />
      </label>
      <label className="block text-[12px] font-medium text-text-muted">
        地点搜索范围
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) save()
          }}
          placeholder="例如：东北、济州岛、关西"
          className="mt-1.5 w-full rounded-[10px] border border-border bg-white px-3 py-2.5 text-[16px] font-normal text-text outline-none focus:border-accent sm:text-[14px]"
        />
      </label>
      <p className="mt-2 text-[12px] leading-relaxed text-text-muted">搜索地点时优先匹配这里，找不到时自动扩大范围。</p>
      <div className="mt-3 flex items-center justify-between gap-3 rounded-[10px] bg-surface px-3 py-2.5">
        <span className="text-[11.5px] leading-relaxed text-text-faint">留空后，系统会根据旅行名称和已安排地点自动判断。</span>
        {draft && <button type="button" onClick={() => setDraft('')} className="shrink-0 text-[11.5px] font-medium text-accent hover:text-accent-hover">恢复智能判断</button>}
      </div>
    </ModalShell>
  )
}
