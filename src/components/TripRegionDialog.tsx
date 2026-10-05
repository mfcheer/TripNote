import { useState } from 'react'
import { useActiveTrip, useTripStore } from '../store'
import ModalShell, { overlayPrimaryButtonClass, overlaySecondaryButtonClass } from './OverlayShell'
import { useToastStore } from './toastStore'

export function tripRegionLabel(searchRegion?: string) {
  return searchRegion?.trim() || '智能判断区域'
}

export default function TripRegionDialog({ onClose }: { onClose: () => void }) {
  const trip = useActiveTrip()
  const setTripSearchRegion = useTripStore((state) => state.setTripSearchRegion)
  const [draft, setDraft] = useState(trip.searchRegion ?? '')

  function save() {
    setTripSearchRegion(trip.id, draft)
    useToastStore.getState().show(draft.trim() ? `已将旅行区域设为「${draft.trim()}」` : '已改为智能判断旅行区域')
    onClose()
  }

  return (
    <ModalShell
      title="旅行区域"
      description="地点搜索会优先匹配该区域，搜不到时自动扩大范围。"
      onClose={onClose}
      size="sm"
      footer={<>
        <button type="button" onClick={onClose} className={overlaySecondaryButtonClass}>取消</button>
        <button type="button" onClick={save} className={overlayPrimaryButtonClass}>保存</button>
      </>}
    >
      <label className="block text-[12px] font-medium text-text-muted">
        主要区域
        <input
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') save()
            if (event.key === 'Escape') onClose()
          }}
          placeholder="例如：东北、济州岛、关西"
          className="mt-1.5 w-full rounded-[10px] border border-border bg-white px-3 py-2.5 text-[14px] font-normal text-text outline-none focus:border-accent"
        />
      </label>
      <div className="mt-3 flex items-center justify-between gap-3 rounded-[10px] bg-surface px-3 py-2.5">
        <span className="text-[11.5px] leading-relaxed text-text-faint">留空后，系统会根据旅行名称和已安排地点自动判断。</span>
        {draft && <button type="button" onClick={() => setDraft('')} className="shrink-0 text-[11.5px] font-medium text-accent hover:text-accent-hover">清空</button>}
      </div>
    </ModalShell>
  )
}
