export default function PlaceSearchFeedback({ status, error, query, onRetry, onManual, onMap }: {
  status: string; error: string; query: string; onRetry: () => void; onManual?: () => void; onMap?: () => void
}) {
  if (status !== 'empty' && status !== 'error') return null
  return <div role="status" className="mt-2 rounded-lg border border-border/70 bg-surface/65 px-2.5 py-2 text-[11px] leading-relaxed">
    <p className={status === 'error' ? 'text-amber-700' : 'text-text-muted'}>{status === 'error' ? error : `没有找到「${query.trim()}」，试试加上城市名或使用当地名称。`}</p>
    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 font-medium text-accent-hover">
      {status === 'error' && <button type="button" onClick={onRetry} className="py-1">重新搜索</button>}
      {onManual && <button type="button" onClick={onManual} className="py-1">仅收藏名称</button>}
      {onMap && <button type="button" onClick={onMap} className="py-1">地图选点</button>}
    </div>
    {onManual && <p className="mt-1 text-[10px] text-text-faint">仅收藏名称不会定位到地图，可稍后补充位置。</p>}
  </div>
}
