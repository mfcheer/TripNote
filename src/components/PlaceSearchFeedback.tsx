export default function PlaceSearchFeedback({ status, error, query, onRetry, onManual, onMap }: {
  status: string; error: string; query: string; onRetry: () => void; onManual?: () => void; onMap?: () => void
}) {
  if (status !== 'empty' && status !== 'error') return null
  const isErr = status === 'error'
  return (
    <div role="status" className="mt-2 rounded-lg border border-border/70 bg-surface/80 px-2.5 py-2 text-[11px] leading-relaxed">
      <p className={isErr ? 'text-amber-700' : 'text-text-muted'}>
        {isErr ? error : `未找到「${query.trim()}」的在线定位，但可直接添加为想去，或在地图上手动标点。`}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-medium">
        {onManual && (
          <button
            type="button"
            onClick={onManual}
            className="rounded bg-action px-2 py-0.5 text-[11px] font-medium text-white transition-colors hover:bg-action-hover"
          >
            直接保存为想去 ↵
          </button>
        )}
        {onMap && (
          <button type="button" onClick={onMap} className="py-0.5 text-accent-hover hover:underline">
            地图选点
          </button>
        )}
        {isErr && (
          <button type="button" onClick={onRetry} className="py-0.5 text-text-faint hover:text-text">
            重新搜索
          </button>
        )}
      </div>
    </div>
  )
}
