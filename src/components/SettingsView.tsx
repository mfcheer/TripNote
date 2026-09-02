import { useActiveTrip, useTripStore } from '../store'
import { useConfirmStore } from './confirmStore'

// 设置视图：数据管理（自用工具，轻量）
export default function SettingsView() {
  const { importTrip, resetAll } = useTripStore()
  const askConfirm = useConfirmStore((s) => s.ask)
  const info = useConfirmStore((s) => s.info)
  const trip = useActiveTrip()

  function exportTrip() {
    const blob = new Blob([JSON.stringify(trip, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `trip-${trip.id}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function importFromFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result))
        if (!importTrip(data)) {
          info({ title: '导入失败', message: '文件格式不正确：需要包含 days 和 activities 的旅程数据。' })
        }
      } catch {
        info({ title: '导入失败', message: '文件不是有效的 JSON。' })
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="mx-auto max-w-[560px] px-8 py-7">
      <h1 className="mb-5 text-[18px] font-semibold">设置</h1>

      <div className="flex flex-col gap-4">
        {/* 数据管理 */}
        <div className="rounded-lg border border-border p-4">
          <div className="mb-1 text-[13px] font-medium">数据管理</div>
          <p className="mb-3 text-[12px] leading-relaxed text-text-muted">
            数据保存在浏览器本地（localStorage）。导出的是当前旅程 JSON；导入会作为新旅程加入列表。
          </p>
          <div className="flex gap-2">
            <button
              onClick={exportTrip}
              className="rounded-md border border-border px-3.5 py-1.5 text-[13px] text-text-muted transition-colors hover:border-accent hover:text-accent"
            >
              导出当前旅程
            </button>
            <label className="cursor-pointer rounded-md border border-border px-3.5 py-1.5 text-[13px] text-text-muted transition-colors hover:border-accent hover:text-accent">
              导入旅程
              <input
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && importFromFile(e.target.files[0])}
              />
            </label>
            <button
              onClick={() =>
                askConfirm({
                  title: '重置全部数据？',
                  message: '所有旅程将被清除，恢复为示例旅程。',
                  onConfirm: resetAll,
                })
              }
              className="rounded-md border border-border px-3.5 py-1.5 text-[13px] text-text-faint transition-colors hover:border-red-300 hover:text-red-500"
            >
              重置数据
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
