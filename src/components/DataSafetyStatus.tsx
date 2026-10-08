import { useEffect, useState } from 'react'
import { getBackupWriteStatus, getLastPortableBackupAt, getLocalBackupStatus, listenForBackupStatusChanges, type LocalBackupStatus } from '../utils/localBackup'

function backupCopy(status: LocalBackupStatus | null, portableBackupAt?: string) {
  if (!status) return '正在检查备份状态…'
  if (status.configured && status.permission === 'granted') {
    return status.lastBackupAt
      ? `已自动备份 · ${new Date(status.lastBackupAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}`
      : '已连接自动备份文件夹'
  }
  if (status.configured) return '自动备份需要重新授权'
  if (portableBackupAt) {
    return `已生成备份 · ${new Date(portableBackupAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}`
  }
  return '仅保存于此设备 · 建议备份'
}

export default function DataSafetyStatus({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [status, setStatus] = useState<LocalBackupStatus | null>(null)
  const [portableBackupAt, setPortableBackupAt] = useState(() => getLastPortableBackupAt())
  const [writeStatus, setWriteStatus] = useState(getBackupWriteStatus)

  useEffect(() => {
    const refresh = () => {
      void getLocalBackupStatus().then(setStatus)
      setPortableBackupAt(getLastPortableBackupAt())
      setWriteStatus(getBackupWriteStatus())
    }
    refresh()
    return listenForBackupStatusChanges(refresh)
  }, [])

  const pendingCopy = status?.configured ? ({ pending: '已保存到浏览器 · 等待文件备份', writing: '已保存到浏览器 · 正在写入文件', permission: '已保存到浏览器 · 备份需要授权', error: '已保存到浏览器 · 文件备份失败' } as Record<string, string>)[writeStatus.state] : undefined
  const protectedData = !pendingCopy && ((!!status?.configured && status.permission === 'granted') || !!portableBackupAt)
  return (
    <button onClick={onOpenSettings} className="flex w-full items-center justify-between gap-3 border-t border-border/70 px-3 py-2.5 text-left hover:bg-surface">
      <span className="min-w-0">
        <span className="block text-[11.5px] font-medium text-text-muted">数据与备份</span>
        <span className={`mt-0.5 block truncate text-[10.5px] ${protectedData ? 'text-accent-hover' : 'text-text-faint'}`}>{pendingCopy || backupCopy(status, portableBackupAt)}</span>
      </span>
      <span className="shrink-0 text-[12px] text-text-faint">›</span>
    </button>
  )
}
