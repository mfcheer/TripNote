import { useEffect, useState } from 'react'
import { useTripStore } from '../store'
import { useConfirmStore } from './confirmStore'
import { useToastStore } from './toastStore'
import {
  backupFileName,
  buildBackup,
  chooseLocalBackupDirectory,
  getLocalBackupStatus,
  isNorthwardBackup,
  type BackupData,
  type LocalBackupStatus,
  writeLocalBackup,
} from '../utils/localBackup'

// 设置视图：数据管理（自用工具，轻量）
export default function SettingsView({
  canInstall = false,
  onInstall,
  embedded = false,
}: {
  canInstall?: boolean
  onInstall?: () => void
  embedded?: boolean
}) {
  const {
    trips,
    deletedTrips,
    activeTripId,
    importTrip,
    restoreBackup,
    resetAll,
    amapJsKey,
    amapWebServiceKey,
    maptilerKey,
    mapDisplayProvider,
    placeSearchProvider,
    mapRouteMode,
    setAmapKeys,
    setMaptilerKey,
    setMapDisplayProvider,
    setPlaceSearchProvider,
    setMapRouteMode,
  } = useTripStore()
  const askConfirm = useConfirmStore((s) => s.ask)
  const info = useConfirmStore((s) => s.info)
  const [jsKey, setJsKey] = useState(amapJsKey)
  const [webServiceKey, setWebServiceKey] = useState(amapWebServiceKey)
  const [maptilerApiKey, setMaptilerApiKey] = useState(maptilerKey)
  const [copied, setCopied] = useState(false)
  const [backupStatus, setBackupStatus] = useState<LocalBackupStatus | null>(null)
  const [backupBusy, setBackupBusy] = useState(false)
  const [isIos] = useState(() => /iPad|iPhone|iPod/.test(navigator.userAgent))
  const [isStandalone] = useState(() => window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone))

  const backupData: BackupData = { trips, deletedTrips, activeTripId, mapRouteMode, amapJsKey, amapWebServiceKey, maptilerKey, mapDisplayProvider, placeSearchProvider }

  async function refreshBackupStatus() {
    setBackupStatus(await getLocalBackupStatus())
  }

  useEffect(() => {
    void refreshBackupStatus()
    window.addEventListener('focus', refreshBackupStatus)
    return () => window.removeEventListener('focus', refreshBackupStatus)
  }, [])

  async function copyAccessLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      window.prompt('复制这个访问链接发送给朋友：', window.location.href)
    }
  }

  function downloadBackup() {
    const backup = buildBackup(backupData)
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = backupFileName(new Date(backup.exportedAt))
    a.click()
    URL.revokeObjectURL(url)
  }

  async function selectBackupFolder() {
    setBackupBusy(true)
    try {
      const status = await chooseLocalBackupDirectory()
      await writeLocalBackup(backupData)
      setBackupStatus(await getLocalBackupStatus())
      useToastStore.getState().show(`已连接「${status.configured ? status.directoryName : '备份文件夹'}」，并完成首份完整备份`)
    } catch (error) {
      if ((error as DOMException)?.name !== 'AbortError') info({ title: '无法启用自动备份', message: error instanceof Error ? error.message : '请选择一个可写入的本机文件夹。' })
    } finally {
      setBackupBusy(false)
    }
  }

  async function backupToFolderNow() {
    setBackupBusy(true)
    try {
      const result = await writeLocalBackup(backupData)
      setBackupStatus(await getLocalBackupStatus())
      useToastStore.getState().show(`已备份到「${result.directoryName} / 北向备份」`)
    } catch (error) {
      info({ title: '备份未完成', message: error instanceof Error ? error.message : '请重新选择备份文件夹后再试。' })
      void refreshBackupStatus()
    } finally {
      setBackupBusy(false)
    }
  }

  function importFromFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result))
        if (isNorthwardBackup(data)) {
          const count = data.data.trips.length
          askConfirm({
            title: '恢复完整备份？',
            message: `将用这份备份中的 ${count} 个旅行替换当前全部旅行，并同步恢复高德 Key 和地图连线配置。恢复前建议先下载一份当前完整备份。`,
            onConfirm: () => {
              if (!restoreBackup(data.data)) {
                info({ title: '恢复失败', message: '备份中的旅行数据不完整。' })
                return
              }
              useToastStore.getState().show(`已恢复 ${count} 个旅行`)
            },
          })
          return
        }
        const backup = data as {
          trip?: unknown
          mapSettings?: { amapJsKey?: unknown; amapWebServiceKey?: unknown; maptilerKey?: unknown; mapRouteMode?: unknown; mapDisplayProvider?: unknown; placeSearchProvider?: unknown }
        }
        const tripData = backup.trip ?? data
        if (!importTrip(tripData)) {
          info({ title: '导入失败', message: '文件格式不正确：需要包含 days 和 activities 的旅程数据。' })
          return
        }
        if (backup.mapSettings) {
          const nextJsKey = typeof backup.mapSettings.amapJsKey === 'string' ? backup.mapSettings.amapJsKey : ''
          const nextWebServiceKey = typeof backup.mapSettings.amapWebServiceKey === 'string' ? backup.mapSettings.amapWebServiceKey : ''
          const nextMaptilerKey = typeof backup.mapSettings.maptilerKey === 'string' ? backup.mapSettings.maptilerKey : ''
          const nextRouteMode = backup.mapSettings.mapRouteMode === 'walking' ? 'walking' : 'direct'
          const nextMapProvider = backup.mapSettings.mapDisplayProvider === 'osm' || backup.mapSettings.mapDisplayProvider === 'maptiler-zh' ? backup.mapSettings.mapDisplayProvider : 'amap'
          const nextSearchProvider = backup.mapSettings.placeSearchProvider === 'osm' ? 'osm' : 'amap'
          setAmapKeys({ jsKey: nextJsKey, webServiceKey: nextWebServiceKey })
          setMaptilerKey(nextMaptilerKey)
          setMapRouteMode(nextRouteMode)
          setMapDisplayProvider(nextMapProvider)
          setPlaceSearchProvider(nextSearchProvider)
          setJsKey(nextJsKey)
          setWebServiceKey(nextWebServiceKey)
          setMaptilerApiKey(nextMaptilerKey)
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
    setMaptilerKey(maptilerApiKey)
    const hasJsKey = !!jsKey.trim()
    const hasWebServiceKey = !!webServiceKey.trim()
    const hasMaptilerKey = !!maptilerApiKey.trim()
    useToastStore.getState().show(
      hasJsKey || hasWebServiceKey || hasMaptilerKey
        ? '地图服务 Key 已保存；展示与搜索将按下方来源选择执行'
        : '已清除地图服务 Key；需要时会自动回退默认地图与搜索服务',
    )
  }

  return (
    <div className={`settings-view ${embedded ? 'mx-auto max-w-[760px] px-0 py-0' : 'mx-auto max-w-[760px] px-4 py-6 sm:px-8 sm:py-10'}`}>
      {!embedded && <div className="mb-7">
        <h1 className="text-[22px] font-semibold tracking-[-0.025em]">设置</h1>
        <p className="mt-1 text-[13px] text-text-muted">管理安装方式、本地数据与地图服务。</p>
      </div>}

      <div className={`overflow-hidden border-border/70 bg-white/90 px-5 sm:px-7 ${embedded ? '' : 'rounded-xl border shadow-[0_10px_34px_rgba(32,40,46,0.05)]'}`}>
        <section className="border-b border-border/80 py-6">
          <div className="mb-1 text-[15px] font-semibold">安装与分享</div>
          <p className="mb-4 max-w-[610px] text-[13px] leading-relaxed text-text-muted">
            将北向安装到桌面后，会以独立应用打开。把链接发给朋友，他们会拥有自己的本地行程，彼此不会看到或修改对方的数据。
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            {!isStandalone && canInstall && onInstall && (
              <button onClick={onInstall} className="rounded-md bg-action px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-action-hover">
                安装北向
              </button>
            )}
            <button onClick={copyAccessLink} className="rounded-md bg-surface-2 px-4 py-2 text-[13px] font-medium text-text-muted transition-colors hover:text-text">
              {copied ? '链接已复制' : '复制访问链接'}
            </button>
          </div>
          {!isStandalone && isIos && (
            <div className="mt-4 border-l-2 border-action/50 pl-3 text-[12px] leading-relaxed text-text-muted">
              iPhone / iPad：请使用 Safari 打开此链接，点底部“分享”，再选择“添加到主屏幕”。
            </div>
          )}
          {!isStandalone && !isIos && !canInstall && (
            <div className="mt-4 border-l-2 border-border pl-3 text-[12px] leading-relaxed text-text-muted">
              部署到 HTTPS 域名后，可在 Chrome、Edge 的浏览器菜单或地址栏中选择“安装应用”。
            </div>
          )}
          {isStandalone && <div className="mt-4 text-[12px] font-medium text-accent-hover">北向已安装到此设备。</div>}
        </section>

        {/* 数据管理 */}
        <section className="border-b border-border/80 py-6">
          <div className="mb-1 text-[15px] font-semibold">数据管理</div>
          <p className="mb-4 max-w-[610px] text-[13px] leading-relaxed text-text-muted">
            数据仍保存在当前浏览器。完整备份包含全部旅行、当前旅行、地图服务 Key 与地图连线方式；可下载保存，也可在桌面 Chrome / Edge 自动归档到电脑文件夹。备份含密钥，请勿外发。
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={downloadBackup}
              className="rounded-md bg-accent px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent-hover"
            >
              下载完整备份
            </button>
            <label className="cursor-pointer rounded-md bg-surface-2 px-4 py-2 text-center text-[13px] font-medium text-text-muted transition-colors hover:text-text">
              恢复备份 / 导入旅程
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
              className="rounded-md px-3 py-2 text-[13px] text-text-faint transition-colors hover:bg-red-50 hover:text-red-500"
            >
              重置数据
            </button>
          </div>
          <div className="mt-5 rounded-lg border border-border/80 bg-surface/75 p-4 sm:p-4.5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <div className="text-[13px] font-semibold text-text">自动备份到电脑文件夹</div>
                {backupStatus?.supported ? (
                  <p className="mt-1 max-w-[500px] text-[12px] leading-relaxed text-text-muted">
                    {backupStatus.configured
                      ? backupStatus.permission === 'granted'
                        ? `已连接「${backupStatus.directoryName} / 北向备份」。修改后约 30 秒自动归档，并保留最近 100 份历史。${backupStatus.lastBackupAt ? ` 上次备份：${new Date(backupStatus.lastBackupAt).toLocaleString('zh-CN', { hour12: false })}` : ''}`
                        : `已记住「${backupStatus.directoryName}」，但浏览器需要重新授权后才能继续自动写入。`
                      : '选择一个本机文件夹后，北向会在应用打开期间自动创建完整备份（含当前高德 Key 和地图连线配置）。'}
                  </p>
                ) : (
                  <p className="mt-1 max-w-[500px] text-[12px] leading-relaxed text-text-muted">当前浏览器不支持直接写入指定文件夹。可继续使用上方“下载完整备份”；桌面 Chrome、Edge 在 HTTPS 页面中可开启自动归档。</p>
                )}
              </div>
              {backupStatus?.supported && (
                <div className="flex shrink-0 gap-2">
                  <button onClick={selectBackupFolder} disabled={backupBusy} className="rounded-md bg-surface-2 px-3 py-2 text-[12px] font-medium text-text-muted transition-colors hover:text-text disabled:opacity-50">
                    {backupStatus.configured ? '更换文件夹' : '选择文件夹'}
                  </button>
                  {backupStatus.configured && (
                    <button onClick={backupToFolderNow} disabled={backupBusy || backupStatus.permission !== 'granted'} className="rounded-md bg-action px-3 py-2 text-[12px] font-medium text-white transition-colors hover:bg-action-hover disabled:opacity-50">
                      {backupBusy ? '备份中…' : '立即备份'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        <details className="group py-6">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-4 [&::-webkit-details-marker]:hidden">
            <div>
              <div className="text-[15px] font-semibold">高级地图设置</div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">地图服务 Key、中文标注、地点搜索与地图连线方式</p>
            </div>
            <span className="mt-1 text-[12px] text-text-faint transition-transform group-open:rotate-180">⌄</span>
          </summary>
          <div className="mt-5 border-t border-border/80 pt-5">
            <p className="mb-4 max-w-[620px] text-[12.5px] leading-relaxed text-text-muted">
              可分别选择地图展示与地点搜索的服务来源。中文标注地图使用 MapTiler 矢量底图，优先显示中文地名，缺失时回退本地名称；高德或 MapTiler 缺少对应 Key 时，会自动回退至 OSM、Nominatim；智能路线仍由 OSRM 提供。
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-[12.5px] font-medium text-text-muted">
                JS API Key（地图展示）
                <input value={jsKey} onChange={(event) => setJsKey(event.target.value)} placeholder="留空则使用 OSM 地图" className="mt-1.5 w-full rounded-md border border-border bg-[#fcfdfd] px-3 py-2.5 text-[13px] font-normal text-text outline-none focus:border-accent" />
              </label>
              <label className="text-[12.5px] font-medium text-text-muted">
                Web 服务 Key（地点搜索）
                <input value={webServiceKey} onChange={(event) => setWebServiceKey(event.target.value)} placeholder="留空则使用原地点搜索" className="mt-1.5 w-full rounded-md border border-border bg-[#fcfdfd] px-3 py-2.5 text-[13px] font-normal text-text outline-none focus:border-accent" />
              </label>
              <label className="text-[12.5px] font-medium text-text-muted sm:col-span-2">
                MapTiler API Key（中文标注地图）
                <input value={maptilerApiKey} onChange={(event) => setMaptilerApiKey(event.target.value)} placeholder="留空则无法启用中文标注地图" className="mt-1.5 w-full rounded-md border border-border bg-[#fcfdfd] px-3 py-2.5 text-[13px] font-normal text-text outline-none focus:border-accent" />
              </label>
            </div>
            <div className="mt-4 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <span className="text-[11.5px] leading-relaxed text-text-faint">高德 Key 会明文写入下载备份和文件夹自动备份；恢复完整备份时也会同步恢复。请勿外发，建议在高德控制台限制可用域名。</span>
              <button onClick={saveMapConfig} className="shrink-0 rounded-md bg-action px-4 py-2 text-[12.5px] font-medium text-white transition-colors hover:bg-action-hover">
                保存配置
              </button>
            </div>
            <div className="mt-5 grid gap-4 border-t border-border/80 pt-4 sm:grid-cols-2">
              <div>
                <div className="text-[12.5px] font-semibold text-text">地图展示</div>
                <div className="mt-2 grid grid-cols-3 rounded-md bg-surface-2/70 p-1">
                  <button onClick={() => setMapDisplayProvider('amap')} className={`rounded px-2 py-1.5 text-[12px] font-medium transition-colors ${mapDisplayProvider === 'amap' ? 'bg-white text-text shadow-sm' : 'text-text-muted hover:text-text'}`}>高德地图</button>
                  <button onClick={() => setMapDisplayProvider('osm')} className={`rounded px-2 py-1.5 text-[12px] font-medium transition-colors ${mapDisplayProvider === 'osm' ? 'bg-white text-text shadow-sm' : 'text-text-muted hover:text-text'}`}>OSM 本地</button>
                  <button onClick={() => setMapDisplayProvider('maptiler-zh')} className={`rounded px-2 py-1.5 text-[12px] font-medium transition-colors ${mapDisplayProvider === 'maptiler-zh' ? 'bg-white text-text shadow-sm' : 'text-text-muted hover:text-text'}`}>中文标注</button>
                </div>
                <p className="mt-1.5 text-[11px] text-text-faint">{mapDisplayProvider === 'maptiler-zh' && !maptilerApiKey.trim() ? '尚未填写 MapTiler Key，当前地图会继续使用 OSM。' : '高德需 JS API Key；中文标注需 MapTiler Key，缺失时自动使用 OSM。'}</p>
              </div>
              <div>
                <div className="text-[12.5px] font-semibold text-text">地点搜索</div>
                <div className="mt-2 flex rounded-md bg-surface-2/70 p-1">
                  <button onClick={() => setPlaceSearchProvider('amap')} className={`flex-1 rounded px-2 py-1.5 text-[12px] font-medium transition-colors ${placeSearchProvider === 'amap' ? 'bg-white text-text shadow-sm' : 'text-text-muted hover:text-text'}`}>高德搜索</button>
                  <button onClick={() => setPlaceSearchProvider('osm')} className={`flex-1 rounded px-2 py-1.5 text-[12px] font-medium transition-colors ${placeSearchProvider === 'osm' ? 'bg-white text-text shadow-sm' : 'text-text-muted hover:text-text'}`}>OpenStreetMap</button>
                </div>
                <p className="mt-1.5 text-[11px] text-text-faint">高德需 Web 服务 Key；缺失时自动使用 Nominatim。</p>
              </div>
            </div>
            <div className="mt-5 border-t border-border/80 pt-4">
              <div className="text-[12.5px] font-semibold text-text">地图连线</div>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <button onClick={() => setMapRouteMode('direct')} className={`flex-1 rounded-md border-l-2 px-3 py-2.5 text-left text-[12.5px] transition-colors ${mapRouteMode === 'direct' ? 'border-action bg-action-soft text-text' : 'border-transparent bg-surface-2/60 text-text-muted hover:bg-surface-2'}`}>
                  <span className="font-medium">直线连接</span><span className="ml-1.5 text-text-faint">推荐，不调用路线服务</span>
                </button>
                <button onClick={() => setMapRouteMode('walking')} className={`flex-1 rounded-md border-l-2 px-3 py-2.5 text-left text-[12.5px] transition-colors ${mapRouteMode === 'walking' ? 'border-action bg-action-soft text-text' : 'border-transparent bg-surface-2/60 text-text-muted hover:bg-surface-2'}`}>
                  <span className="font-medium">智能路线</span><span className="ml-1.5 text-text-faint">近距离步行，远距离驾车</span>
                </button>
              </div>
              <p className="mt-2 text-[11.5px] leading-relaxed text-text-faint">智能路线使用 OSRM 服务，打开地图时才会请求；火车、飞机、包车保留直线。请求失败时显示直线，并在地图图例处提示。</p>
            </div>
          </div>
        </details>
      </div>
    </div>
  )
}
