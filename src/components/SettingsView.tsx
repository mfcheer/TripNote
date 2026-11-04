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
    mapDisplayProvider,
    mapRouteMode,
    setAmapJsKey,
    setMapDisplayProvider,
    setMapRouteMode,
    agentServiceUrl,
    setAgentServiceUrl,
    agentAccessToken,
    setAgentAccessToken,
  } = useTripStore()
  const askConfirm = useConfirmStore((s) => s.ask)
  const info = useConfirmStore((s) => s.info)
  const [jsKey, setJsKey] = useState(amapJsKey)
  const [agentUrl, setAgentUrl] = useState(agentServiceUrl)
  const [agentToken, setAgentToken] = useState(agentAccessToken)
  const [copied, setCopied] = useState(false)
  const [backupStatus, setBackupStatus] = useState<LocalBackupStatus | null>(null)
  const [backupBusy, setBackupBusy] = useState(false)
  const [portableBackupAt, setPortableBackupAt] = useState(() => getLastPortableBackupAt())
  const [writeStatus, setWriteStatus] = useState(getBackupWriteStatus)
  const [isIos] = useState(() => /iPad|iPhone|iPod/.test(navigator.userAgent))
  const [isStandalone] = useState(() => window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone))

  const backupData: BackupData = { trips, deletedTrips, activeTripId, mapRouteMode, amapJsKey, mapDisplayProvider, agentServiceUrl, agentAccessToken }

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
      mapDisplayProvider: state.mapDisplayProvider,
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
          const nextRouteMode = backup.mapSettings.mapRouteMode === 'walking' ? 'walking' : 'direct'
          const nextMapProvider = backup.mapSettings.mapDisplayProvider === 'amap' ? 'amap' : 'osm'
          setAmapJsKey(nextJsKey)
          setMapRouteMode(nextRouteMode)
          setMapDisplayProvider(nextMapProvider)
          setJsKey(nextJsKey)
          useToastStore.getState().show('已导入旅程和地图配置')
        }
      } catch {
        info({ title: '导入失败', message: '文件不是有效的 JSON。' })
      }
    }
    reader.readAsText(file)
  }

  function saveMapConfig() {
    setAmapJsKey(jsKey)
    useToastStore.getState().show(
      jsKey.trim()
        ? '高德 JS API Key 已保存'
        : '已清除高德 JS API Key，使用默认全球 OSM 开源底图',
    )
  }

  return (
    <div className={`settings-view ${embedded ? 'mx-auto max-w-[760px] px-0 py-0 pb-8' : 'mx-auto max-w-[760px] px-4 py-6 pb-12 sm:px-8 sm:py-10 sm:pb-16'}`}>
      {!embedded && <div className="mb-6">
        <h1 className="text-[20px] font-semibold tracking-[-0.025em]">设置</h1>
        <p className="mt-1 text-[12.5px] text-text-muted">管理安装、本地数据与地图配置</p>
      </div>}

      <div className={`overflow-hidden border-border/70 bg-white/90 px-5 pb-5 sm:px-7 sm:pb-6 ${embedded ? '' : 'rounded-xl border shadow-[0_10px_34px_rgba(32,40,46,0.05)]'}`}>
        <section className="border-b border-border/80 py-4.5 sm:py-5">
          <div className="mb-1 text-[14.5px] font-semibold">安装与分享</div>
          <p className="mb-3 max-w-[610px] text-[12px] leading-relaxed text-text-muted">
            支持安装为桌面独立应用。数据均保存在本地，链接分享给他人后各自独立，互不影响
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            {!isStandalone && canInstall && onInstall && (
              <button onClick={onInstall} className="rounded-md bg-action px-4 py-2 text-[12.5px] font-medium text-white transition-colors hover:bg-action-hover">
                安装 TripNote
              </button>
            )}
            <button onClick={copyAccessLink} className="rounded-md bg-surface-2 px-4 py-2 text-[12.5px] font-medium text-text-muted transition-colors hover:text-text">
              {copied ? '链接已复制' : '复制访问链接'}
            </button>
          </div>
          {!isStandalone && isIos && (
            <div className="mt-3 border-l-2 border-action/50 pl-2.5 text-[11.5px] text-text-muted">
              iOS：在 Safari 中点击“分享” → “添加到主屏幕”
            </div>
          )}
          {!isStandalone && !isIos && !canInstall && (
            <div className="mt-3 border-l-2 border-border pl-2.5 text-[11.5px] text-text-muted">
              可在 Chrome、Edge 地址栏或菜单中选择“安装应用”
            </div>
          )}
          {isStandalone && <div className="mt-3 text-[11.5px] font-medium text-accent-hover">✓ 已作为独立应用安装运行</div>}
        </section>

        <section className="border-b border-border/80 py-4.5 sm:py-5">
          <div className="text-[14.5px] font-semibold">规划助手</div>
          <p className="mt-1 max-w-[620px] text-[12px] leading-relaxed text-text-muted">可选自建 AI 助手服务。行程保留在本机，模型 API 密钥保存在服务端</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_auto]"><input value={agentUrl} onChange={(event) => setAgentUrl(event.target.value)} placeholder="例如：https://agent.example.ts.net" className="min-w-0 rounded-md border border-border bg-[#fcfdfd] px-3 py-2 text-[12.5px] outline-none focus:border-accent" /><input value={agentToken} type="password" onChange={(event) => setAgentToken(event.target.value)} placeholder="访问口令（可选）" className="min-w-0 rounded-md border border-border bg-[#fcfdfd] px-3 py-2 text-[12.5px] outline-none focus:border-accent" /><button onClick={() => { setAgentServiceUrl(agentUrl); setAgentAccessToken(agentToken); useToastStore.getState().show(agentUrl.trim() ? '规划助手连接已保存' : '已关闭规划助手服务') }} className="rounded-md bg-action px-4 py-2 text-[12px] font-medium text-white hover:bg-action-hover">保存</button></div>
          <p className="mt-2 text-[11px] text-text-faint">若服务端设置了访问口令请在此填入，口令保存在本机</p>
        </section>

        {/* 数据管理 */}
        <section className="border-b border-border/80 py-4.5 sm:py-5">
          <div className="mb-1 text-[14.5px] font-semibold">数据管理</div>
          <p className="mb-3 max-w-[610px] text-[12px] leading-relaxed text-text-muted">
            数据保存在本地浏览器中，备份包含全部行程与个性化配置
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={saveBackupFile}
              className="rounded-md bg-accent px-4 py-2 text-[12.5px] font-medium text-white transition-colors hover:bg-accent-hover"
            >
              保存完整备份
            </button>
            <label className="cursor-pointer rounded-md bg-surface-2 px-4 py-2 text-center text-[12.5px] font-medium text-text-muted transition-colors hover:text-text">
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
                  message: '所有旅程将被清除，恢复为示例旅程',
                  onConfirm: resetAll,
                })
              }
              className="rounded-md px-3 py-2 text-[12.5px] text-text-faint transition-colors hover:bg-red-50 hover:text-red-500"
            >
              重置数据
            </button>
          </div>
          <p className="mt-2 text-[11px] text-text-faint">
            {portableBackupAt
              ? `最近备份：${new Date(portableBackupAt).toLocaleString('zh-CN', { hour12: false })}`
              : '建议在重要修改后保存备份文件以防丢失'}
          </p>
          <div className="mt-4 rounded-lg border border-border/80 bg-surface/75 p-3.5 sm:p-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <div className="text-[12.5px] font-semibold text-text">自动备份到指定文件夹</div>
                {backupStatus?.configured && <p role="status" className={`mt-1 text-[11.5px] ${writeStatus.state === 'error' || writeStatus.state === 'permission' ? 'text-amber-700' : 'text-accent-hover'}`}>
                  {writeStatus.state === 'writing' ? '正在写入备份文件…'
                    : writeStatus.state === 'pending' ? '等待自动同步…'
                    : writeStatus.state === 'error' ? `同步失败：${writeStatus.error}，将自动重试`
                    : writeStatus.state === 'permission' ? '需重新授权写入文件夹以恢复同步'
                    : writeStatus.state === 'saved' ? '最新修改已同步至文件夹' : '数据已保存在当前浏览器'}
                </p>}
                {backupStatus?.supported ? (
                  <p className="mt-1 max-w-[500px] text-[11.5px] leading-relaxed text-text-muted">
                    {backupStatus.configured
                      ? backupStatus.permission === 'granted'
                        ? `已关联「${backupStatus.directoryName}」，数据变动自动同步（保留近 10 份历史）${backupStatus.lastBackupAt ? ` · 最近同步：${new Date(backupStatus.lastBackupAt).toLocaleString('zh-CN', { hour12: false })}` : ''}`
                        : `已关联「${backupStatus.directoryName}」，需重新授权即可恢复自动同步`
                      : '关联本机文件夹后，数据变动将在打开应用时自动备份归档'}
                  </p>
                ) : (
                  <p className="mt-1 max-w-[500px] text-[11.5px] leading-relaxed text-text-muted">当前浏览器不支持文件夹自动归档，请使用上方“保存完整备份”手动导出</p>
                )}
              </div>
              {backupStatus?.supported && (
                <div className="flex shrink-0 flex-wrap gap-2">
                  {backupStatus.configured && backupStatus.permission !== 'granted' && (
                    <button onClick={reauthorizeBackupFolder} disabled={backupBusy} className="rounded-md bg-action px-3 py-1.5 text-[11.5px] font-medium text-white transition-colors hover:bg-action-hover disabled:opacity-50">
                      {backupBusy ? '授权中…' : '重新授权'}
                    </button>
                  )}
                  <button onClick={selectBackupFolder} disabled={backupBusy} className="rounded-md bg-surface-2 px-3 py-1.5 text-[11.5px] font-medium text-text-muted transition-colors hover:text-text disabled:opacity-50">
                    {backupStatus.configured ? '更换文件夹' : '选择文件夹'}
                  </button>
                  <button onClick={restoreAndConnectBackupFolder} disabled={backupBusy} className="rounded-md bg-surface-2 px-3 py-1.5 text-[11.5px] font-medium text-text-muted transition-colors hover:text-text disabled:opacity-50">
                    从文件夹恢复
                  </button>
                  {backupStatus.configured && (
                    <button onClick={backupToFolderNow} disabled={backupBusy || backupStatus.permission !== 'granted'} className="rounded-md bg-action px-3 py-1.5 text-[11.5px] font-medium text-white transition-colors hover:bg-action-hover disabled:opacity-50">
                      {backupBusy ? '备份中…' : '立即备份'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 地图设置 */}
        <section className="py-4.5 sm:py-5">
          <div className="mb-1 text-[14.5px] font-semibold">地图设置</div>
          <p className="mb-3 max-w-[620px] text-[12px] leading-relaxed text-text-muted">
            默认使用全球 OSM 开源底图与免 Key 地理搜索；国内出行如需高德底图可在此配置
          </p>

          <div className="space-y-4">
            <div>
              <label className="text-[12px] font-medium text-text-muted">
                JS API Key（高德地图展示，选填）
              </label>
              <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  value={jsKey}
                  onChange={(event) => setJsKey(event.target.value)}
                  placeholder="留空则使用默认全球 OSM 开源地图"
                  className="min-w-0 flex-1 rounded-md border border-border bg-[#fcfdfd] px-3 py-2 text-[12.5px] font-normal text-text outline-none focus:border-accent"
                />
                <button
                  type="button"
                  onClick={saveMapConfig}
                  className="shrink-0 rounded-md bg-action px-4 py-2 text-[12px] font-medium text-white transition-colors hover:bg-action-hover"
                >
                  保存配置
                </button>
              </div>
              <p className="mt-1 text-[11px] text-text-faint">
                密钥仅保存在本地浏览器，不上传云端
              </p>
            </div>

            <div className="border-t border-border/80 pt-3.5">
              <div className="text-[12px] font-semibold text-text">底图展示</div>
              <div className="mt-1.5 inline-flex rounded-lg bg-surface-2/70 p-0.5">
                <button
                  type="button"
                  onClick={() => setMapDisplayProvider('osm')}
                  className={`rounded-md px-3 py-1.5 text-[11.5px] font-medium transition-colors ${
                    mapDisplayProvider === 'osm'
                      ? 'bg-white text-text shadow-sm'
                      : 'text-text-muted hover:text-text'
                  }`}
                >
                  OSM 开源底图（默认）
                </button>
                <button
                  type="button"
                  onClick={() => setMapDisplayProvider('amap')}
                  className={`rounded-md px-3 py-1.5 text-[11.5px] font-medium transition-colors ${
                    mapDisplayProvider === 'amap'
                      ? 'bg-white text-text shadow-sm'
                      : 'text-text-muted hover:text-text'
                  }`}
                >
                  高德地图
                </button>
              </div>
              <p className="mt-1 text-[11px] text-text-faint">
                使用高德需填入 JS API Key，未配置时自动回退至 OSM
              </p>
            </div>

            <div className="border-t border-border/80 pt-3.5">
              <div className="text-[12px] font-semibold text-text">地图连线</div>
              <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setMapRouteMode('direct')}
                  className={`flex-1 rounded-lg border-l-2 px-3 py-2 text-left text-[12px] transition-colors ${
                    mapRouteMode === 'direct'
                      ? 'border-action bg-action-soft text-text'
                      : 'border-transparent bg-surface-2/60 text-text-muted hover:bg-surface-2'
                  }`}
                >
                  <span className="font-medium">直线连接</span>
                  <span className="ml-1.5 text-text-faint">推荐，轻量直观</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMapRouteMode('walking')}
                  className={`flex-1 rounded-lg border-l-2 px-3 py-2 text-left text-[12px] transition-colors ${
                    mapRouteMode === 'walking'
                      ? 'border-action bg-action-soft text-text'
                      : 'border-transparent bg-surface-2/60 text-text-muted hover:bg-surface-2'
                  }`}
                >
                  <span className="font-medium">智能路线</span>
                  <span className="ml-1.5 text-text-faint">近距离步行，远距离驾车</span>
                </button>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-text-faint">
                智能路线由 OSRM 实时规划；大交通或规划失败时自动使用直线连接
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
