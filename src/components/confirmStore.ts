import { create } from 'zustand'

// 应用内确认弹窗：替代浏览器原生 confirm/alert（原生弹窗会被 Chrome「阻止更多对话框」静默屏蔽）
interface ConfirmState {
  open: boolean
  title: string
  message: string
  danger: boolean
  mode: 'confirm' | 'alert' // alert 仅展示信息
  onConfirm: (() => void) | null
  ask: (opts: { title: string; message?: string; danger?: boolean; onConfirm?: () => void }) => void
  info: (opts: { title: string; message?: string }) => void
  close: (confirmed: boolean) => void
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: false,
  title: '',
  message: '',
  danger: false,
  mode: 'confirm',
  onConfirm: null,
  ask: ({ title, message, danger, onConfirm }) =>
    set({ open: true, title, message: message ?? '', danger: danger ?? true, mode: 'confirm', onConfirm }),
  info: ({ title, message }) =>
    set({ open: true, title, message: message ?? '', danger: false, mode: 'alert', onConfirm: null }),
  close: (confirmed) => {
    const cb = get().onConfirm
    set({ open: false, onConfirm: null })
    if (confirmed && cb) cb()
  },
}))
