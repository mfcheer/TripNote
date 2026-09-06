export interface DropboxSnapshot {
  schemaVersion: 1
  updatedAt: string
  trips: unknown[]
  activeTripId: string
}

export interface DropboxRemoteSnapshot {
  snapshot: DropboxSnapshot
  revision: string
}

const TOKEN_KEY = 'tripnote-dropbox-token'
const FILE_PATH = '/tripnote-v1.json'

function redirectUrl() {
  return window.location.origin + window.location.pathname
}

function randomString() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function challenge(verifier: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function getDropboxToken() {
  return sessionStorage.getItem(TOKEN_KEY)
}

export function disconnectDropbox() {
  sessionStorage.removeItem(TOKEN_KEY)
}

export async function startDropboxAuthorization(appKey: string) {
  const verifier = randomString()
  sessionStorage.setItem('tripnote-dropbox-verifier', verifier)
  const query = new URLSearchParams({
    client_id: appKey,
    response_type: 'code',
    redirect_uri: redirectUrl(),
    code_challenge: await challenge(verifier),
    code_challenge_method: 'S256',
    token_access_type: 'online',
  })
  window.location.assign(`https://www.dropbox.com/oauth2/authorize?${query}`)
}

export async function finishDropboxAuthorization(appKey: string) {
  const query = new URLSearchParams(window.location.search)
  const code = query.get('code')
  const error = query.get('error')
  if (!code && !error) return null
  window.history.replaceState({}, document.title, redirectUrl())
  if (error) throw new Error(query.get('error_description') || 'Dropbox 授权被取消')
  const verifier = sessionStorage.getItem('tripnote-dropbox-verifier')
  sessionStorage.removeItem('tripnote-dropbox-verifier')
  if (!verifier) throw new Error('授权已过期，请重新连接 Dropbox')
  const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: code!,
      grant_type: 'authorization_code',
      client_id: appKey,
      redirect_uri: redirectUrl(),
      code_verifier: verifier,
    }),
  })
  if (!response.ok) throw new Error('无法完成 Dropbox 授权，请检查 App Key 与回调地址')
  const data = await response.json() as { access_token?: string }
  if (!data.access_token) throw new Error('Dropbox 未返回访问凭据')
  sessionStorage.setItem(TOKEN_KEY, data.access_token)
  return data.access_token
}

function headers(token: string, arg: object) {
  return { Authorization: `Bearer ${token}`, 'Dropbox-API-Arg': JSON.stringify(arg) }
}

export async function readDropboxSnapshot(token: string): Promise<DropboxRemoteSnapshot | null> {
  const response = await fetch('https://content.dropboxapi.com/2/files/download', {
    method: 'POST', headers: headers(token, { path: FILE_PATH }),
  })
  if (response.status === 409) return null
  if (response.status === 401) throw new Error('Dropbox 授权已过期，请重新连接')
  if (!response.ok) throw new Error('无法读取 Dropbox 数据')
  const result = JSON.parse(response.headers.get('Dropbox-API-Result') || '{}') as { rev?: string }
  return { snapshot: JSON.parse(await response.text()) as DropboxSnapshot, revision: result.rev ?? '' }
}

export async function writeDropboxSnapshot(token: string, snapshot: DropboxSnapshot, revision?: string) {
  const mode = revision ? { '.tag': 'update', update: revision } : { '.tag': 'add' }
  const response = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: { ...headers(token, { path: FILE_PATH, mode, autorename: false, mute: true }), 'Content-Type': 'application/octet-stream' },
    body: JSON.stringify(snapshot),
  })
  if (response.status === 409) throw new Error('Dropbox 中已有更新，请先同步后再保存')
  if (response.status === 401) throw new Error('Dropbox 授权已过期，请重新连接')
  if (!response.ok) throw new Error('无法保存到 Dropbox')
  const result = await response.json() as { rev?: string }
  return result.rev ?? ''
}
