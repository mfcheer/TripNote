import { useEffect, useState } from 'react'
import { useActiveTrip, useTripStore } from '../store'
import { useConfirmStore } from './confirmStore'
import { useToastStore } from './toastStore'
import { disconnectDropbox, finishDropboxAuthorization, getDropboxToken, readDropboxSnapshot, startDropboxAuthorization, writeDropboxSnapshot } from '../utils/dropboxSync'

// 设置视图：数据管理（自用工具，轻量）
export default function SettingsView({
  canInstall = false,
  onInstall,
}: {
  canInstall?: boolean
  onInstall?: () => void
}) {
  const { importTrip, resetAll, amapJsKey, amapWebServiceKey, mapRouteMode, setAmapKeys, setMapRouteMode, dropboxAppKey, setDropboxAppKey, exportSyncSnapshot, restoreSyncSnapshot } = useTripStore()
  const askConfirm = useConfirmStore((s) => s.ask)
  const info = useConfirmStore((s) => s.info)
  const trip = useActiveTrip()
  const [jsKey, setJsKey] = useState(amapJsKey)
  const [webServiceKey, setWebServiceKey] = useState(amapWebServiceKey)
  const [dropboxKey, setDropboxKey] = useState(dropboxAppKey)
  const [dropboxToken, setDropboxToken] = useState(() => getDropboxToken())
  const [syncing, setSyncing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isIos] = useState(() => /iPad|iPhone|iPod/.test(navigator.userAgent))
  const [isStandalone] = useState(() => window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone))

  useEffect(() => {
    if (!dropboxAppKey || !new URLSearchParams(window.location.search).has('code')) return
    finishDropboxAuthorization(dropboxAppKey)
      .then((token) => {
        if (!token) return
        setDropboxToken(token)
        useToastStore.getState().show('Dropbox 已连接，请点击“立即同步”完成首次备份')
      })
      .catch((error: unknown) => useToastStore.getState().show(error instanceof Error ? error.message : 'Dropbox 授权失败'))
  }, [dropboxAppKey])

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

  async function connectDropbox() {
    const key = dropboxKey.trim()
    if (!key) {
      useToastStore.getState().show('请先填写 Dropbox App Key')
      return
    }
    setDropboxAppKey(key)
    await startDropboxAuthorization(key)
  }

  async function restoreDropbox() {
    if (!dropboxToken) return
    setSyncing(true)
    try {
      const remote = await readDropboxSnapshot(dropboxToken)
      if (!remote) {
        await writeDropboxSnapshot(dropboxToken, exportSyncSnapshot())
        useToastStore.getState().show('已将本机旅行备份到 Dropbox')
        return
      }
      if (!Array.isArray(remote.snapshot.trips)) throw new Error('Dropbox 数据格式不正确')
      askConfirm({
        title: '使用 Dropbox 中的数据？',
        message: `将用 Dropbox 中的 ${remote.snapshot.trips.length} 个旅行替换当前浏览器的数据。本机现有数据不会自动上传。`,
        danger: false,
        onConfirm: () => {
          if (!restoreSyncSnapshot(remote.snapshot)) {
            useToastStore.getState().show('Dropbox 数据格式不正确')
            return
          }
          useToastStore.getState().show(`已从 Dropbox 同步 ${remote.snapshot.trips.length} 个旅行`)
        },
      })
    } catch (error) {
      useToastStore.getState().show(error instanceof Error ? error.message : 'Dropbox 同步失败')
    } finally {
      setSyncing(false)
    }
  }

  async function backupDropbox() {
    if (!dropboxToken) return
    setSyncing(true)
    try {
      const remote = await readDropboxSnapshot(dropboxToken)
      const save = async () => {
        setSyncing(true)
        try {
          await writeDropboxSnapshot(dropboxToken, exportSyncSnapshot(), remote?.revision)
          useToastStore.getState().show('已将本机旅行备份到 Dropbox')
        } catch (error) {
          useToastStore.getState().show(error instanceof Error ? error.message : 'Dropbox 备份失败')
        } finally {
          setSyncing(false)
        }
      }
      if (remote) {
        askConfirm({
          title: '覆盖 Dropbox 中的备份？',
          message: '将以当前浏览器中的旅行数据替换 Dropbox 备份。建议先从 Dropbox 恢复并确认内容。',
          danger: false,
          onConfirm: () => { void save() },
        })
        return
      }
      await save()
    } catch (error) {
      useToastStore.getState().show(error instanceof Error ? error.message : 'Dropbox 备份失败')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="mx-auto max-w-[560px] px-4 py-5 sm:px-8 sm:py-7">
      <h1 className="mb-5 text-[18px] font-semibold">设置</h1>

      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-border p-4">
          <div className="mb-1 text-[13px] font-medium">Dropbox 同步（可选）</div>
          <p className="mb-3 text-[12px] leading-relaxed text-text-muted">
            将完整旅行数据保存在你自己的 Dropbox / Apps / TripNote 中。未连接时，途记仍只保存在当前浏览器并可离线使用。
          </p>
          {!dropboxToken ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <input value={dropboxKey} onChange={(event) => setDropboxKey(event.target.value)} placeholder="Dropbox App Key" className="min-w-0 flex-1 rounded-md border border-border px-3 py-2 text-[13px] outline-none focus:border-accent" />
              <button onClick={connectDropbox} className="rounded-md bg-accent px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent-hover">连接 Dropbox</button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <button onClick={backupDropbox} disabled={syncing} className="rounded-md bg-accent px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60">{syncing ? '处理中…' : '备份到 Dropbox'}</button>
              <button onClick={restoreDropbox} disabled={syncing} className="rounded-md border border-border px-3.5 py-2 text-[13px] text-text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-60">从 Dropbox 恢复</button>
              <button onClick={() => { disconnectDropbox(); setDropboxToken(null); useToastStore.getState().show('已断开 Dropbox，本机数据不会删除') }} className="rounded-md border border-border px-3.5 py-2 text-[13px] text-text-muted transition-colors hover:border-accent hover:text-accent">断开连接</button>
            </div>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-text-faint">首次连接会跳转到 Dropbox 授权。App Key 仅标识你的 Dropbox 应用，不是密码；访问令牌只保留在当前浏览器会话中。</p>
        </div>
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
        <div className="rounded-lg border border-border p-4">
          <div className="mb-1 text-[13px] font-medium">高德地图（可选）</div>
          <p className="mb-3 text-[12px] leading-relaxed text-text-muted">
            填写后，地图展示和地点搜索会优先使用高德；留空则继续使用当前的 OSM、Nominatim 与 OSRM。行程地点始终保存为通用坐标，旧数据可直接切换。
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
            <span className="text-[11px] leading-relaxed text-text-faint">Key 仅保存在此浏览器；对外部署时建议在高德控制台限制可用域名。</span>
            <button
              onClick={() => {
                setAmapKeys({ jsKey, webServiceKey })
                const hasJsKey = !!jsKey.trim()
                const hasWebServiceKey = !!webServiceKey.trim()
                useToastStore.getState().show(
                  hasJsKey || hasWebServiceKey
                    ? `高德配置已保存${hasJsKey ? '，地图页将优先使用高德' : ''}${hasWebServiceKey ? '，地点搜索将优先使用高德' : ''}`
                    : '已清除高德配置，现已切回默认地图与搜索服务',
                )
              }}
              className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-accent-hover"
            >
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
            <p className="mt-2 text-[11px] leading-relaxed text-text-faint">步行路线会产生服务调用：高德模式使用 Web 服务 Key；未配置高德时使用原有 OSRM 服务。打开地图时才会请求，失败时自动显示直线。</p>
          </div>
        </div>
        {/* 数据管理 */}
        <div className="rounded-lg border border-border p-4">
          <div className="mb-1 text-[13px] font-medium">数据管理</div>
          <p className="mb-3 text-[12px] leading-relaxed text-text-muted">
            数据保存在浏览器本地（localStorage）。导出的是当前旅程 JSON；导入会作为新旅程加入列表。
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={exportTrip}
              className="rounded-md border border-border px-3.5 py-2 text-[13px] text-text-muted transition-colors hover:border-accent hover:text-accent"
            >
              导出当前旅程
            </button>
            <label className="cursor-pointer rounded-md border border-border px-3.5 py-2 text-center text-[13px] text-text-muted transition-colors hover:border-accent hover:text-accent">
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
              className="rounded-md border border-border px-3.5 py-2 text-[13px] text-text-faint transition-colors hover:border-red-300 hover:text-red-500"
            >
              重置数据
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
