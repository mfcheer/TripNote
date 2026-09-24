import { useMemo } from 'react'
import { useTripStore } from '../store'
import ModalShell, { overlayPrimaryButtonClass, overlaySecondaryButtonClass } from './OverlayShell'
import { TrashIcon } from './Icons'
import { useConfirmStore } from './confirmStore'
import { useToastStore } from './toastStore'

function deletedTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '刚刚删除'
  return date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function TripTrashDialog({ onClose }: { onClose: () => void }) {
  const { deletedTrips, restoreDeletedTrip, purgeDeletedTrip, emptyTripTrash } = useTripStore()
  const askConfirm = useConfirmStore((state) => state.ask)
  const countLabel = useMemo(() => `${deletedTrips.length} 个旅行`, [deletedTrips.length])

  function restore(tripId: string, name: string) {
    restoreDeletedTrip(tripId)
    useToastStore.getState().show(`已恢复旅行「${name}」`)
    onClose()
  }

  function purge(tripId: string, name: string) {
    askConfirm({
      title: `彻底删除「${name}」？`,
      message: '彻底删除后无法恢复，也不会出现在之后的备份中。',
      danger: true,
      onConfirm: () => {
        purgeDeletedTrip(tripId)
        useToastStore.getState().show(`已彻底删除「${name}」`)
      },
    })
  }

  function empty() {
    askConfirm({
      title: '清空回收站？',
      message: '回收站内的旅行将被永久删除，无法恢复。',
      danger: true,
      onConfirm: () => {
        emptyTripTrash()
        useToastStore.getState().show('已清空回收站')
      },
    })
  }

  return (
    <ModalShell
      title="旅行回收站"
      description={deletedTrips.length ? `已保留 ${countLabel}，可以恢复到旅行册。` : '删除的旅行会保留在这里，直到你彻底删除。'}
      onClose={onClose}
      size="sm"
      footer={deletedTrips.length ? <button onClick={empty} className={`${overlaySecondaryButtonClass} mr-auto text-red-600 hover:border-red-200 hover:text-red-600`}>清空回收站</button> : undefined}
    >
      {deletedTrips.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface/50 px-4 py-9 text-center text-[13px] text-text-muted">回收站为空</div>
      ) : (
        <div className="space-y-2">
          {deletedTrips.map(({ trip, deletedAt }) => (
            <article key={trip.id} className="flex items-center gap-3 rounded-xl border border-border/80 bg-white px-3 py-3 shadow-[0_1px_2px_rgba(20,31,43,0.03)]">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-text">{trip.name}</div>
                <div className="mt-1 text-[11.5px] text-text-faint">{trip.days.length} 天 · 删除于 {deletedTime(deletedAt)}</div>
              </div>
              <button onClick={() => restore(trip.id, trip.name)} className={`${overlayPrimaryButtonClass} min-h-8 px-3 py-1.5 text-[12px]`}>恢复</button>
              <button onClick={() => purge(trip.id, trip.name)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-faint hover:bg-red-50 hover:text-red-600" aria-label={`彻底删除「${trip.name}」`} title="彻底删除"><TrashIcon size={14} /></button>
            </article>
          ))}
        </div>
      )}
    </ModalShell>
  )
}
