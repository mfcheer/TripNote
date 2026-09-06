import { useState } from 'react'
import { useActiveTrip, useTripStore } from '../store'
import { useConfirmStore } from './confirmStore'
import { useToastStore } from './toastStore'

// 设置视图：数据管理（自用工具，轻量）
export default function SettingsView({
  canInstall = false,
  onInstall,
}: {
  canInstall?: boolean
  onInstall?: () => void
}) {
  const { importTrip, resetAll, amapJsKey, amapWebServiceKey, mapRouteMode, setAmapKeys, setMapRouteMode } = useTripStore()
  const askConfirm = useConfirmStore((s) => s.ask)
  const info = useConfirmStore((s) => s.info)
  const trip = useActiveTrip()
  const [jsKey, setJsKey] = useState(amapJsKey)
  const [webServiceKey, setWebServiceKey] = useState(amapWebServiceKey)
  const [copied, setCopied] = useState(false)
  const [isIos] = useState(() => /iPad|iPhone|iPod/.test(navigator.userAgent))
  const [isStandalone] = useState(() => window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone))

  async function copyAccessLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      window.prompt('复制这个访问链接发送给朋友：', window.location.href)
    }
  }

  function exportTrip() {
    const backup = {
      version: 2,
      exportedAt: new Date().toISOString(),
      trip,
      mapSettings: {
        amapJsKey,
        amapWebServiceKey,
        mapRouteMode,
      },
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tripnote-backup-${trip.id}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function importFromFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result))
        const backup = data as {
          trip?: unknown
          mapSettings?: { amapJsKey?: unknown; amapWebServiceKey?: unknown; mapRouteMode?: unknown }
        }
        const tripData = backup.trip ?? data
        if (!importTrip(tripData)) {
          info({ title: '导入失败', message: '文件格式不正确：需要包含 days 和 activities 的旅程数据。' })
          return
        }
        if (backup.mapSettings) {
          const nextJsKey = typeof backup.mapSettings.amapJsKey === 'string' ? backup.mapSettings.amapJsKey : ''
          const nextWebServiceKey = typeof backup.mapSettings.amapWebServiceKey === 'string' ? backup.mapSettings.amapWebServiceKey : ''
          const nextRouteMode = backup.mapSettings.mapRouteMode === 'walking' ? 'walking' : 'direct'
          setAmapKeys({ jsKey: nextJsKey, webServiceKey: nextWebServiceKey })
          setMapRouteMode(nextRouteMode)
          setJsKey(nextJsKey)
          setWebServiceKey(nextWebServiceKey)
          useToastStore.getState().show('已导入旅程和地图配置')
        }
      } catch {
        info({ title: '导入失败', message: '文件不是有效的 JSON。' })
      }
    }
    reader.readAsText(file)
  }

  function saveMapConfig() {
    setAmapKeys({ jsKey, webServiceKey })
    const hasJsKey = !!jsKey.trim()
    const hasWebServiceKey = !!webServiceKey.trim()
    useToastStore.getState().show(
      hasJsKey || hasWebServiceKey
        ? `高德配置已保存${hasJsKey ? '，地图页将优先使用高德' : ''}${hasWebServiceKey ? '，地点搜索将优先使用高德' : ''}`
        : '已清除高德配置，现已切回默认地图与搜索服务',
    )
  }

  return (
    <div className="mx-auto max-w-[560px] px-4 py-5 sm:px-8 sm:py-7">
      <h1 className="mb-5 text-[18px] font-semibold">设置</h1>

      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-border p-4">
          <div className="mb-1 text-[13px] font-medium">安装与分享</div>
          <p className="mb-3 text-[12px] leading-relaxed text-text-muted">
            将途记安装到桌面后，会以独立应用打开。把链接发给朋友，他们会拥有自己的本地行程，彼此不会看到或修改对方的数据。
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            {!isStandalone && canInstall && onInstall && (
              <button onClick={onInstall} className="rounded-md bg-accent px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent-hover">
                安装途记
              </button>
            )}
            <button onClick={copyAccessLink} className="rounded-md border border-border px-3.5 py-2 text-[13px] text-text-muted transition-colors hover:border-accent hover:text-accent">
              {copied ? '链接已复制' : '复制访问链接'}
            </button>
          </div>
          {!isStandalone && isIos && (
            <div className="mt-3 rounded-md bg-surface px-3 py-2 text-[11.5px] leading-relaxed text-text-muted">
              iPhone / iPad：请使用 Safari 打开此链接，点底部“分享”，再选择“添加到主屏幕”。
            </div>
          )}
          {!isStandalone && !isIos && !canInstall && (
            <div className="mt-3 rounded-md bg-surface px-3 py-2 text-[11.5px] leading-relaxed text-text-muted">
              部署到 HTTPS 域名后，可在 Chrome、Edge 的浏览器菜单或地址栏中选择“安装应用”。
            </div>
          )}
          {isStandalone && <div className="mt-3 text-[11.5px] text-accent-hover">途记已安装到此设备。</div>}
        </div>
        {/* 数据管理 */}
        <div className="rounded-lg border border-border p-4">
          <div className="mb-1 text-[13px] font-medium">数据管理</div>
          <p className="mb-3 text-[12px] leading-relaxed text-text-muted">
            数据保存在浏览器本地（localStorage）。备份包含当前旅程、高德地图配置和地图连线方式；导入会作为新旅程加入列表并恢复配置。
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={exportTrip}
              className="rounded-md border border-border px-3.5 py-2 text-[13px] text-text-muted transition-colors hover:border-accent hover:text-accent"
            >
              导出备份
            </button>
            <label className="cursor-pointer rounded-md border border-border px-3.5 py-2 text-center text-[13px] text-text-muted transition-colors hover:border-accent hover:text-accent">
              导入备份 / 旅程
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
              className="rounded-md border border-border px-3.5 py-2 text-[13px] text-text-faint transition-colors hover:border-red-300 hover:text-red-500"
            >
              重置数据
            </button>
          </div>
          <div className="mt-5 border-t border-border pt-4">
            <div className="mb-1 text-[13px] font-medium">地图配置（随备份导入导出）</div>
            <p className="mb-3 text-[12px] leading-relaxed text-text-muted">
              填写后，地图展示和地点搜索会优先使用高德；留空则继续使用 OSM、Nominatim。步行路线始终使用 OSRM，已有行程地点可直接切换地图。
            </p>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <label className="text-[12px] text-text-muted">
                JS API Key（地图展示）
                <input value={jsKey} onChange={(event) => setJsKey(event.target.value)} placeholder="留空则使用 OSM 地图" className="mt-1.5 w-full rounded-md border border-border px-3 py-2 text-[13px] text-text outline-none focus:border-accent" />
              </label>
              <label className="text-[12px] text-text-muted">
                Web 服务 Key（地点搜索）
                <input value={webServiceKey} onChange={(event) => setWebServiceKey(event.target.value)} placeholder="留空则使用原地点搜索" className="mt-1.5 w-full rounded-md border border-border px-3 py-2 text-[13px] text-text outline-none focus:border-accent" />
              </label>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-[11px] leading-relaxed text-text-faint">Key 会明文写入导出文件，请勿把备份发送给不可信的人；建议在高德控制台限制可用域名。</span>
              <button onClick={saveMapConfig} className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-accent-hover">
                保存配置
              </button>
            </div>
            <div className="mt-4 border-t border-border pt-3">
              <div className="text-[12px] font-medium text-text-muted">地图连线</div>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <button onClick={() => setMapRouteMode('direct')} className={`flex-1 rounded-md border px-3 py-2 text-left text-[12px] transition-colors ${mapRouteMode === 'direct' ? 'border-accent bg-accent-soft text-accent-hover' : 'border-border text-text-muted hover:border-accent/50'}`}>
                  <span className="font-medium">直线连接</span><span className="ml-1.5 text-text-faint">推荐，不调用路线服务</span>
                </button>
                <button onClick={() => setMapRouteMode('walking')} className={`flex-1 rounded-md border px-3 py-2 text-left text-[12px] transition-colors ${mapRouteMode === 'walking' ? 'border-accent bg-accent-soft text-accent-hover' : 'border-border text-text-muted hover:border-accent/50'}`}>
                  <span className="font-medium">步行路线</span><span className="ml-1.5 text-text-faint">按相邻地点请求路线</span>
                </button>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-text-faint">步行路线始终使用 OSRM 服务，打开地图时才会请求；失败时会显示直线，并在地图图例处提示。</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
