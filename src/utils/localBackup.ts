import type { DeletedTrip, Trip } from '../types'

export interface BackupData {
  trips: Trip[]
  /** 回收站内的旅行，恢复备份后仍可找回。 */
  deletedTrips?: DeletedTrip[]
  activeTripId: string
  mapRouteMode: 'direct' | 'walking'
  /** Optional so complete backups created before map settings were included remain restorable. */
  amapJsKey?: string
  amapWebServiceKey?: string
  maptilerKey?: string
  mapDisplayProvider?: 'amap' | 'osm' | 'maptiler-zh'
  placeSearchProvider?: 'amap' | 'osm'
}

export interface NorthwardBackup {
  format: 'northward-backup'
  version: 1
  exportedAt: string
  data: BackupData
}

interface DirectoryHandle {
  name: string
  queryPermission?: (options?: { mode: 'readwrite' }) => Promise<PermissionState>
  requestPermission?: (options?: { mode: 'readwrite' }) => Promise<PermissionState>
  getDirectoryHandle: (name: string, options?: { create?: boolean }) => Promise<DirectoryHandle>
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<FileHandle>
  entries?: () => AsyncIterableIterator<[string, { kind: 'file' | 'directory' }]>
  removeEntry?: (name: string) => Promise<void>
}

interface FileHandle {
  createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>
}

declare global {
  interface Window {
    showDirectoryPicker?: (options?: { id?: string; mode?: 'readwrite'; startIn?: 'documents' | 'downloads' }) => Promise<DirectoryHandle>
  }
}

const DB_NAME = 'northward-local-backup'
const DB_VERSION = 1
const STORE_NAME = 'settings'
const DIRECTORY_KEY = 'directory-handle'
const LAST_BACKUP_KEY = 'northward-local-backup-last-at'
const BACKUP_FOLDER = '北向备份'
const LATEST_FILE = '北向-最新备份.json'
const MAX_HISTORY_FILES = 100

export type LocalBackupStatus =
  | { supported: false; configured: false; permission: 'unsupported' }
  | { supported: true; configured: false; permission: 'none' }
  | { supported: true; configured: true; permission: PermissionState; directoryName: string; lastBackupAt?: string }

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('无法打开本机备份设置'))
  })
}

async function readDirectoryHandle(): Promise<DirectoryHandle | null> {
  if (!('indexedDB' in window)) return null
  const db = await openDatabase()
  return new Promise<DirectoryHandle | null>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).get(DIRECTORY_KEY)
    request.onsuccess = () => resolve((request.result as DirectoryHandle | undefined) ?? null)
    request.onerror = () => reject(request.error ?? new Error('无法读取备份文件夹'))
    transaction.oncomplete = () => db.close()
  })
}

async function saveDirectoryHandle(handle: DirectoryHandle) {
  const db = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(handle, DIRECTORY_KEY)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('无法保存备份文件夹'))
  })
  db.close()
}

export function isFolderBackupSupported() {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function' && window.isSecureContext
}

export async function getLocalBackupStatus(): Promise<LocalBackupStatus> {
  if (!isFolderBackupSupported()) return { supported: false, configured: false, permission: 'unsupported' }
  try {
    const handle = await readDirectoryHandle()
    if (!handle) return { supported: true, configured: false, permission: 'none' }
    const permission = await handle.queryPermission?.({ mode: 'readwrite' }) ?? 'prompt'
    return { supported: true, configured: true, permission, directoryName: handle.name, lastBackupAt: localStorage.getItem(LAST_BACKUP_KEY) ?? undefined }
  } catch {
    return { supported: true, configured: false, permission: 'none' }
  }
}

export async function chooseLocalBackupDirectory() {
  if (!isFolderBackupSupported() || !window.showDirectoryPicker) throw new Error('当前浏览器不支持自动备份到文件夹')
  const handle = await window.showDirectoryPicker({ id: 'northward-backups', mode: 'readwrite', startIn: 'documents' })
  const permission = await handle.requestPermission?.({ mode: 'readwrite' }) ?? 'granted'
  if (permission !== 'granted') throw new Error('未获得备份文件夹的写入权限')
  await saveDirectoryHandle(handle)
  return getLocalBackupStatus()
}

export function buildBackup(data: BackupData): NorthwardBackup {
  return {
    format: 'northward-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  }
}

export function isNorthwardBackup(value: unknown): value is NorthwardBackup {
  const backup = value as Partial<NorthwardBackup>
  return backup?.format === 'northward-backup' && backup.version === 1 && !!backup.data && Array.isArray(backup.data.trips)
}

export function backupFileName(date = new Date()) {
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-') + `-${String(date.getHours()).padStart(2, '0')}-${String(date.getMinutes()).padStart(2, '0')}-${String(date.getSeconds()).padStart(2, '0')}`
  return `北向-完整备份-${stamp}.json`
}

async function writeJson(directory: DirectoryHandle, name: string, value: NorthwardBackup) {
  const file = await directory.getFileHandle(name, { create: true })
  const writer = await file.createWritable()
  await writer.write(JSON.stringify(value, null, 2))
  await writer.close()
}

async function cleanupHistory(directory: DirectoryHandle) {
  if (!directory.entries || !directory.removeEntry) return
  const names: string[] = []
  for await (const [name, handle] of directory.entries()) {
    if (handle.kind === 'file' && /^北向-完整备份-.*\.json$/.test(name)) names.push(name)
  }
  names.sort((a, b) => b.localeCompare(a))
  await Promise.all(names.slice(MAX_HISTORY_FILES).map((name) => directory.removeEntry!(name)))
}

export async function writeLocalBackup(data: BackupData) {
  const handle = await readDirectoryHandle()
  if (!handle) throw new Error('请先选择备份文件夹')
  const permission = await handle.queryPermission?.({ mode: 'readwrite' }) ?? 'prompt'
  if (permission !== 'granted') throw new Error('备份文件夹需要重新授权')
  const folder = await handle.getDirectoryHandle(BACKUP_FOLDER, { create: true })
  const backup = buildBackup(data)
  await writeJson(folder, LATEST_FILE, backup)
  await writeJson(folder, backupFileName(new Date(backup.exportedAt)), backup)
  await cleanupHistory(folder)
  localStorage.setItem(LAST_BACKUP_KEY, backup.exportedAt)
  return { directoryName: handle.name, exportedAt: backup.exportedAt }
}

let pendingData: BackupData | null = null
let pendingTimer: number | null = null
let lastFingerprint = ''

export function scheduleLocalBackup(data: BackupData) {
  const fingerprint = JSON.stringify(data)
  if (fingerprint === lastFingerprint) return
  lastFingerprint = fingerprint
  pendingData = data
  if (pendingTimer != null) window.clearTimeout(pendingTimer)
  pendingTimer = window.setTimeout(() => {
    pendingTimer = null
    void flushScheduledBackup()
  }, 30_000)
}

export async function flushScheduledBackup() {
  if (!pendingData) return false
  const data = pendingData
  pendingData = null
  try {
    const status = await getLocalBackupStatus()
    if (!status.supported || !status.configured || status.permission !== 'granted') return false
    await writeLocalBackup(data)
    return true
  } catch {
    return false
  }
}
