import { useEffect, useState } from 'react'
import { useTripStore } from '../store'
import { useConfirmStore } from './confirmStore'
import { useToastStore } from './toastStore'
import {
  chooseBackupFolderForRestore,
  chooseLocalBackupDirectory,
  connectLocalBackupDirectory,
  getLastPortableBackupAt,
  getBackupWriteStatus,
  getLocalBackupStatus,
  isNorthwardBackup,
  listenForBackupStatusChanges,
  reauthorizeLocalBackupDirectory,
  savePortableBackup,
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
    agentServiceUrl,
    setAgentServiceUrl,
    agentAccessToken,
    setAgentAccessToken,
  } = useTripStore()
  const askConfirm = useConfirmStore((s) => s.ask)
  const info = useConfirmStore((s) => s.info)
  const [jsKey, setJsKey] = useState(amapJsKey)
  const [webServiceKey, setWebServiceKey] = useState(amapWebServiceKey)
  const [maptilerApiKey, setMaptilerApiKey] = useState(maptilerKey)
  const [agentUrl, setAgentUrl] = useState(agentServiceUrl)
  const [agentToken, setAgentToken] = useState(agentAccessToken)
  const [copied, setCopied] = useState(false)
  const [backupStatus, setBackupStatus] = useState<LocalBackupStatus | null>(null)
  const [backupBusy, setBackupBusy] = useState(false)
  const [portableBackupAt, setPortableBackupAt] = useState(() => getLastPortableBackupAt())
  const [writeStatus, setWriteStatus] = useState(getBackupWriteStatus)
  const [isIos] = useState(() => /iPad|iPhone|iPod/.test(navigator.userAgent))
  const [isStandalone] = useState(() => window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone))

  const backupData: BackupData = { trips, deletedTrips, activeTripId, mapRouteMode, amapJsKey, amapWebServiceKey, maptilerKey, mapDisplayProvider, placeSearchProvider, agentServiceUrl, agentAccessToken }

  async function refreshBackupStatus() {
    setBackupStatus(await getLocalBackupStatus())
  }

  useEffect(() => {
    void refreshBackupStatus()
    const stopListening = listenForBackupStatusChanges(() => {
      void refreshBackupStatus()
      setPortableBackupAt(getLastPortableBackupAt())
      setWriteStatus(getBackupWriteStatus())
    })
    window.addEventListener('focus', refreshBackupStatus)
    return () => {
      stopListening()
      window.removeEventListener('focus', refreshBackupStatus)
    }
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

  async function saveBackupFile() {
    try {
      const result = await savePortableBackup(backupData)
      setPortableBackupAt(getLastPortableBackupAt())
      useToastStore.getState().show(result === 'shared' ? '请选择“存储到文件”；已有同名备份时选择“替换”' : '完整备份已开始下载')
    } catch (error) {
      if ((error as DOMException)?.name !== 'AbortError') {
        info({ title: '无法保存备份', message: error instanceof Error ? error.message : '请稍后再试。' })
      }
    }
  }

  function currentBackupData(): BackupData {
    const state = useTripStore.getState()
    return {
      trips: state.trips,
      deletedTrips: state.deletedTrips,
      activeTripId: state.activeTripId,
      mapRouteMode: state.mapRouteMode,
      amapJsKey: state.amapJsKey,
      amapWebServiceKey: state.amapWebServiceKey,
      maptilerKey: state.maptilerKey,
      mapDisplayProvider: state.mapDisplayProvider,
      placeSearchProvider: state.placeSearchProvider,
      agentServiceUrl: state.agentServiceUrl,
      agentAccessToken: state.agentAccessToken,
    }
  }

  async function restoreAndConnectBackupFolder() {
    setBackupBusy(true)
    try {
      const candidate = await chooseBackupFolderForRestore()
      const count = candidate.backup.data.trips.length
      const exportedAt = new Date(candidate.backup.exportedAt).toLocaleString('zh-CN', { hour12: false })
      askConfirm({
        title: '恢复并连接这个备份文件夹？',
        message: `找到 ${exportedAt} 的备份，共 ${count} 个旅行。恢复后将替换当前旅行、地图配置和 Agent 访问口令，并把“${candidate.directoryName}”设为自动备份文件夹；此后应用打开期间的修改会自动写入这里。`,
        onConfirm: () => {
          void (async () => {
            setBackupBusy(true)
            try {
              if (!restoreBackup(candidate.backup.data)) throw new Error('备份中的旅行数据不完整')
              await connectLocalBackupDirectory(candidate.handle)
              await writeLocalBackup(currentBackupData())
              setBackupStatus(await getLocalBackupStatus())
              useToastStore.getState().show(`已恢复 ${count} 个旅行，并连接自动备份文件夹`)
            } catch (error) {
              info({ title: '恢复失败', message: error instanceof Error ? error.message : '请重新选择备份文件夹。' })
            } finally {
              setBackupBusy(false)
            }
          })()
        },
      })
    } catch (error) {
      if ((error as DOMException)?.name !== 'AbortError') {
        info({ title: '无法从文件夹恢复', message: error instanceof Error ? error.message : '请选择此前用于 TripNote 自动备份的文件夹。' })
      }
    } finally {
      setBackupBusy(false)
    }
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
      useToastStore.getState().show(`已备份到「${result.directoryName} / TripNote备份」`)
    } catch (error) {
      info({ title: '备份未完成', message: error instanceof Error ? error.message : '请重新选择备份文件夹后再试。' })
      void refreshBackupStatus()
    } finally {
      setBackupBusy(false)
    }
  }

  async function reauthorizeBackupFolder() {
    setBackupBusy(true)
    try {
      const status = await reauthorizeLocalBackupDirectory()
      const result = await writeLocalBackup(backupData)
      setBackupStatus(await getLocalBackupStatus())
      useToastStore.getState().show(`已恢复「${status.configured ? status.directoryName : result.directoryName}」的自动备份，并完成最新备份`)
    } catch (error) {
      if ((error as DOMException)?.name !== 'AbortError') {
        info({ title: '未恢复自动备份', message: error instanceof Error ? `${error.message}。你也可以重新选择备份文件夹。` : '请重新授权或选择一个新的备份文件夹。' })
      }
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
          const exportedAt = new Date(data.exportedAt).toLocaleString('zh-CN', { hour12: false })
          askConfirm({
            title: '恢复完整备份？',
            message: `这份备份生成于 ${exportedAt}，包含 ${count} 个旅行。恢复后将替换当前全部旅行，并同步恢复 Agent 访问口令、地图服务 Key、地图来源和连线配置。恢复前建议先保存一份当前备份。`,
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
            将 TripNote 安装到桌面后，会以独立应用打开。把链接发给朋友，他们会拥有自己的本地行程，彼此不会看到或修改对方的数据。
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            {!isStandalone && canInstall && onInstall && (
              <button onClick={onInstall} className="rounded-md bg-action px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-action-hover">
                安装 TripNote
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
          {isStandalone && <div className="mt-4 text-[12px] font-medium text-accent-hover">TripNote 已安装到此设备。</div>}
        </section>

        <section className="border-b border-border/80 py-6">
          <div className="text-[15px] font-semibold">规划助手</div>
          <p className="mt-1 max-w-[620px] text-[12.5px] leading-relaxed text-text-muted">规划助手是可选服务。旅行数据仍保存在本机；模型 API Key 只写在 NAS 服务端。若服务设置了访问口令，在此设备填写相同口令。</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_auto]"><input value={agentUrl} onChange={(event) => setAgentUrl(event.target.value)} placeholder="例如：https://agent.example.ts.net" className="min-w-0 rounded-md border border-border bg-[#fcfdfd] px-3 py-2.5 text-[13px] outline-none focus:border-accent" /><input value={agentToken} type="password" onChange={(event) => setAgentToken(event.target.value)} placeholder="访问口令（可选）" className="min-w-0 rounded-md border border-border bg-[#fcfdfd] px-3 py-2.5 text-[13px] outline-none focus:border-accent" /><button onClick={() => { setAgentServiceUrl(agentUrl); setAgentAccessToken(agentToken); useToastStore.getState().show(agentUrl.trim() ? '规划助手连接已保存' : '已关闭规划助手服务') }} className="rounded-md bg-action px-4 py-2 text-[12.5px] font-medium text-white hover:bg-action-hover">保存</button></div>
          <p className="mt-2 text-[11px] text-text-faint">访问口令会随完整备份保存和恢复；DeepSeek 等模型 API Key 仍只保存在 Agent 服务端。备份文件包含敏感配置，请妥善保管。</p>
        </section>

        {/* 数据管理 */}
        <section className="border-b border-border/80 py-6">
          <div className="mb-1 text-[15px] font-semibold">数据管理</div>
          <p className="mb-4 max-w-[610px] text-[13px] leading-relaxed text-text-muted">
            数据仍保存在当前浏览器。完整备份包含全部旅行、访问口令、地图服务 Key 与地图连线方式；手机可保存到“文件”，支持文件夹访问的浏览器还可自动归档。备份含敏感密钥，请勿外发。
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={saveBackupFile}
              className="rounded-md bg-accent px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent-hover"
            >
              保存完整备份
            </button>
            <label className="cursor-pointer rounded-md bg-surface-2 px-4 py-2 text-center text-[13px] font-medium text-text-muted transition-colors hover:text-text">
              恢复备份 / 导入旅程
              <input
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) importFromFile(e.target.files[0])
                  e.target.value = ''
                }}
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
          <p className="mt-2 text-[11.5px] text-text-faint">
            {portableBackupAt
              ? `最近生成备份：${new Date(portableBackupAt).toLocaleString('zh-CN', { hour12: false })}`
              : '尚未保存过独立备份文件；建议在重要修改后保存一份。'}
            {' '}再次保存到同一文件夹时，请在系统面板中选择“替换”，即可更新原备份。
          </p>
          <div className="mt-5 rounded-lg border border-border/80 bg-surface/75 p-4 sm:p-4.5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <div className="text-[13px] font-semibold text-text">自动备份到指定文件夹</div>
                {backupStatus?.configured && <p role="status" className={`mt-1 text-[12px] ${writeStatus.state === 'error' || writeStatus.state === 'permission' ? 'text-amber-700' : 'text-accent-hover'}`}>
                  {writeStatus.state === 'writing' ? '数据已保存在浏览器，正在写入备份文件…'
                    : writeStatus.state === 'pending' ? '数据已保存在浏览器，等待自动备份。'
                    : writeStatus.state === 'error' ? `文件备份失败：${writeStatus.error}。最新修改已保留，将自动重试，也可点击“立即备份”。`
                    : writeStatus.state === 'permission' ? '最新修改已保存在浏览器；重新授权后会补写到文件夹。'
                    : writeStatus.state === 'saved' ? '最新修改已成功备份到文件夹。' : '数据已保存在当前浏览器。'}
                </p>}
                {backupStatus?.supported ? (
                  <p className="mt-1 max-w-[500px] text-[12px] leading-relaxed text-text-muted">
                    {backupStatus.configured
                      ? backupStatus.permission === 'granted'
                        ? `已连接「${backupStatus.directoryName} / TripNote备份」。修改后约 30 秒自动归档，并保留最近 10 份历史。${backupStatus.lastBackupAt ? ` 上次备份：${new Date(backupStatus.lastBackupAt).toLocaleString('zh-CN', { hour12: false })}` : ''}`
                        : `已记住「${backupStatus.directoryName}」，但浏览器暂未允许写入。重新授权后会立即完成一份最新备份，并继续自动归档。`
                      : '选择一个本机文件夹后，TripNote 会在应用打开期间自动创建完整备份（含当前高德 Key 和地图连线配置）。'}
                  </p>
                ) : (
                  <p className="mt-1 max-w-[500px] text-[12px] leading-relaxed text-text-muted">当前浏览器不支持持续写入指定文件夹。请使用上方“保存完整备份”，在系统面板中选择“存储到文件”；桌面 Chrome、Edge 及部分 Android 浏览器可开启自动归档。</p>
                )}
              </div>
              {backupStatus?.supported && (
                <div className="flex shrink-0 flex-wrap gap-2">
                  {backupStatus.configured && backupStatus.permission !== 'granted' && (
                    <button onClick={reauthorizeBackupFolder} disabled={backupBusy} className="rounded-md bg-action px-3 py-2 text-[12px] font-medium text-white transition-colors hover:bg-action-hover disabled:opacity-50">
                      {backupBusy ? '授权中…' : '重新授权'}
                    </button>
                  )}
                  <button onClick={selectBackupFolder} disabled={backupBusy} className="rounded-md bg-surface-2 px-3 py-2 text-[12px] font-medium text-text-muted transition-colors hover:text-text disabled:opacity-50">
                    {backupStatus.configured ? '更换文件夹' : '选择文件夹'}
                  </button>
                  <button onClick={restoreAndConnectBackupFolder} disabled={backupBusy} className="rounded-md bg-surface-2 px-3 py-2 text-[12px] font-medium text-text-muted transition-colors hover:text-text disabled:opacity-50">
                    从文件夹恢复
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
