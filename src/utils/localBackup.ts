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
  /** Agent 服务地址与访问口令；服务端模型 API Key 仍只存在 agent-server/.env。 */
  agentServiceUrl?: string
  agentAccessToken?: string
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
  entries?: () => AsyncIterableIterator<[string, FileHandle | DirectoryHandleWithKind]>
  removeEntry?: (name: string) => Promise<void>
}

interface FileHandle {
  kind?: 'file'
  name?: string
  getFile: () => Promise<File>
  createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>
}

interface DirectoryHandleWithKind extends DirectoryHandle {
  kind: 'directory'
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
const LAST_PORTABLE_BACKUP_KEY = 'northward-portable-backup-last-at'
const BACKUP_STATUS_EVENT = 'tripnote-backup-status-changed'
const BACKUP_FOLDER = 'TripNote备份'
const LATEST_FILE = 'TripNote-最新备份.json'
const PORTABLE_FILE = 'TripNote-完整备份.json'
const MAX_HISTORY_FILES = 100

export type BackupWriteState = 'idle' | 'pending' | 'writing' | 'saved' | 'permission' | 'error'
let writeState: BackupWriteState = 'idle'
let writeError = ''

export function getBackupWriteStatus() {
  return { state: writeState, error: writeError }
}

function setWriteState(state: BackupWriteState, error = '') {
  writeState = state
  writeError = error
  notifyBackupStatusChanged()
}

export type LocalBackupStatus =
  | { supported: false; configured: false; permission: 'unsupported' }
  | { supported: true; configured: false; permission: 'none' }
  | { supported: true; configured: true; permission: PermissionState; directoryName: string; lastBackupAt?: string }

export interface BackupFolderCandidate {
  handle: DirectoryHandle
  directoryName: string
  fileName: string
  backup: NorthwardBackup
}

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

function notifyBackupStatusChanged() {
  window.dispatchEvent(new Event(BACKUP_STATUS_EVENT))
}

export function listenForBackupStatusChanges(listener: () => void) {
  window.addEventListener(BACKUP_STATUS_EVENT, listener)
  return () => window.removeEventListener(BACKUP_STATUS_EVENT, listener)
}

export function getLastPortableBackupAt() {
  return localStorage.getItem(LAST_PORTABLE_BACKUP_KEY) ?? undefined
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
  notifyBackupStatusChanged()
  return getLocalBackupStatus()
}

// 目录句柄仍被浏览器记住、但写权限暂时回到 prompt 时，可在明确的用户点击中直接恢复授权。
export async function reauthorizeLocalBackupDirectory() {
  const handle = await readDirectoryHandle()
  if (!handle) throw new Error('未找到已记住的备份文件夹，请重新选择文件夹')
  const permission = await handle.requestPermission?.({ mode: 'readwrite' }) ?? 'denied'
  if (permission !== 'granted') throw new Error('浏览器未允许写入该备份文件夹')
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
  return `TripNote-完整备份-${stamp}.json`
}

function backupJsonFile(data: BackupData) {
  const backup = buildBackup(data)
  return { backup, file: new File([JSON.stringify(backup, null, 2)], PORTABLE_FILE, { type: 'application/json' }) }
}

/**
 * 手机优先唤起系统分享面板，用户可选择“存储到文件”；不支持文件分享时回退浏览器下载。
 * 必须由用户点击直接触发，避免浏览器拦截分享面板。
 */
export async function savePortableBackup(data: BackupData): Promise<'shared' | 'downloaded'> {
  const { backup, file } = backupJsonFile(data)
  const shareNavigator = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean
    share?: (data?: ShareData) => Promise<void>
  }
  if (shareNavigator.share && shareNavigator.canShare?.({ files: [file] })) {
    await shareNavigator.share({ files: [file], title: 'TripNote 完整备份', text: '保存 TripNote 完整备份文件' })
    localStorage.setItem(LAST_PORTABLE_BACKUP_KEY, backup.exportedAt)
    notifyBackupStatusChanged()
    return 'shared'
  }

  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = file.name
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
  localStorage.setItem(LAST_PORTABLE_BACKUP_KEY, backup.exportedAt)
  notifyBackupStatusChanged()
  return 'downloaded'
}

async function resolveBackupFolder(handle: DirectoryHandle, create = false) {
  if (handle.name === BACKUP_FOLDER) return handle
  return handle.getDirectoryHandle(BACKUP_FOLDER, { create })
}

async function readBackupFile(handle: FileHandle) {
  const file = await handle.getFile()
  const parsed = JSON.parse(await file.text()) as unknown
  if (!isNorthwardBackup(parsed)) throw new Error('文件夹中的备份格式不正确')
  return parsed
}

/** 选择一个已有备份文件夹并读取最新备份；确认恢复前不会改变当前自动备份目标。 */
export async function chooseBackupFolderForRestore(): Promise<BackupFolderCandidate> {
  if (!isFolderBackupSupported() || !window.showDirectoryPicker) throw new Error('当前浏览器不支持从文件夹恢复并自动同步')
  const handle = await window.showDirectoryPicker({ id: 'northward-backups', mode: 'readwrite', startIn: 'documents' })
  const permission = await handle.requestPermission?.({ mode: 'readwrite' }) ?? 'granted'
  if (permission !== 'granted') throw new Error('未获得备份文件夹的读写权限')

  let folder: DirectoryHandle
  try {
    folder = await resolveBackupFolder(handle)
  } catch {
    throw new Error(`未找到“${BACKUP_FOLDER}”目录，请选择此前用于 TripNote 自动备份的文件夹`)
  }

  let fileName = LATEST_FILE
  let fileHandle: FileHandle | null = null
  try {
    fileHandle = await folder.getFileHandle(LATEST_FILE)
  } catch {
    if (folder.entries) {
      const names: string[] = []
      for await (const [name, entry] of folder.entries()) {
        if (entry.kind === 'file' && /^(?:TripNote|北向)-完整备份-.*\.json$/.test(name)) names.push(name)
      }
      names.sort((a, b) => b.localeCompare(a))
      if (names[0]) {
        fileName = names[0]
        fileHandle = await folder.getFileHandle(fileName)
      }
    }
  }
  if (!fileHandle) throw new Error('这个文件夹里没有找到 TripNote 完整备份')

  return { handle, directoryName: handle.name, fileName, backup: await readBackupFile(fileHandle) }
}

/** 用户确认恢复后，将刚选择的目录正式设为后续自动备份目标。 */
export async function connectLocalBackupDirectory(handle: DirectoryHandle) {
  const permission = await handle.requestPermission?.({ mode: 'readwrite' }) ?? 'granted'
  if (permission !== 'granted') throw new Error('未获得备份文件夹的写入权限')
  await saveDirectoryHandle(handle)
  notifyBackupStatusChanged()
  return getLocalBackupStatus()
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
    if (handle.kind === 'file' && /^(?:TripNote|北向)-完整备份-.*\.json$/.test(name)) names.push(name)
  }
  names.sort((a, b) => b.localeCompare(a))
  await Promise.all(names.slice(MAX_HISTORY_FILES).map((name) => directory.removeEntry!(name)))
}

async function performLocalBackup(data: BackupData) {
  const handle = await readDirectoryHandle()
  if (!handle) throw new Error('请先选择备份文件夹')
  const permission = await handle.queryPermission?.({ mode: 'readwrite' }) ?? 'prompt'
  if (permission !== 'granted') throw new Error('备份文件夹需要重新授权')
  const folder = await resolveBackupFolder(handle, true)
  const backup = buildBackup(data)
  // 先写历史版本，再替换最新文件；最新文件写入失败时仍有完整恢复来源。
  await writeJson(folder, backupFileName(new Date(backup.exportedAt)), backup)
  await writeJson(folder, LATEST_FILE, backup)
  await cleanupHistory(folder).catch(() => undefined)
  localStorage.setItem(LAST_BACKUP_KEY, backup.exportedAt)
  return { directoryName: handle.name, exportedAt: backup.exportedAt }
}

let pendingData: BackupData | null = null
let pendingTimer: number | null = null
let lastFingerprint = ''
let writeQueue: Promise<unknown> = Promise.resolve()

/** 手动和自动写入串行执行，防止旧版本在新版本之后覆盖最新文件。 */
export function writeLocalBackup(data: BackupData) {
  const snapshot = structuredClone(data)
  const task = writeQueue.catch(() => undefined).then(async () => {
    setWriteState('writing')
    try {
      const result = await performLocalBackup(snapshot)
      if (pendingData && JSON.stringify(pendingData) === JSON.stringify(snapshot)) pendingData = null
      setWriteState(pendingData ? 'pending' : 'saved')
      return result
    } catch (error) {
      // 最新修改优先；只有尚无更晚的待备份数据时才保留本次写入内容。
      if (!pendingData) pendingData = snapshot
      const message = error instanceof Error ? error.message : '文件夹写入失败'
      const needsPermission = message.includes('授权') || (error as DOMException)?.name === 'NotAllowedError'
      setWriteState(needsPermission ? 'permission' : 'error', message)
      if (!needsPermission) armBackupTimer(60_000)
      throw error
    }
  })
  writeQueue = task
  return task
}

function armBackupTimer(delay = 30_000) {
  if (pendingTimer != null) window.clearTimeout(pendingTimer)
  pendingTimer = window.setTimeout(() => {
    pendingTimer = null
    void flushScheduledBackup()
  }, delay)
}

export function scheduleLocalBackup(data: BackupData) {
  const fingerprint = JSON.stringify(data)
  if (fingerprint === lastFingerprint) return
  lastFingerprint = fingerprint
  pendingData = structuredClone(data)
  if (writeState !== 'writing' && writeState !== 'error' && writeState !== 'permission') setWriteState('pending')
  armBackupTimer()
}

let flushing: Promise<boolean> | null = null

export async function flushScheduledBackup() {
  if (flushing) return flushing
  if (!pendingData) return false
  flushing = (async () => {
    try {
      const status = await getLocalBackupStatus()
      if (!status.supported || !status.configured) return false
      if (status.permission !== 'granted') {
        setWriteState('permission', '文件夹需要重新授权；最新修改仍保存在浏览器')
        return false
      }
      if (!pendingData) return true
      await writeLocalBackup(pendingData)
      return true
    } catch {
      // 临时写入失败时保留内容并稍后重试；权限问题等待用户明确授权。
      if (writeState === 'error') armBackupTimer(60_000)
      return false
    } finally {
      flushing = null
    }
  })()
  return flushing
}
