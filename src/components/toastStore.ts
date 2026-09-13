import { create } from 'zustand'

// 轻提示 + 撤销：替代原生 alert 的反馈层
interface ToastState {
  open: boolean
  message: string
  tone: 'success' | 'error' | 'neutral'
  undoFn: (() => void) | null
  timer: ReturnType<typeof setTimeout> | null
  show: (message: string, opts?: { undo?: () => void; duration?: number; tone?: 'success' | 'error' | 'neutral' }) => void
  dismiss: () => void
  undo: () => void
}

export const useToastStore = create<ToastState>((set, get) => ({
  open: false,
  message: '',
  tone: 'success',
  undoFn: null,
  timer: null,
  show: (message, opts) => {
    const { timer } = get()
    if (timer) clearTimeout(timer)
    // 带撤销的操作多留几秒，避免用户刚看清结果按钮就消失。
    const t = setTimeout(() => get().dismiss(), opts?.duration ?? (opts?.undo ? 8000 : 5000))
    set({ open: true, message, tone: opts?.tone ?? 'success', undoFn: opts?.undo ?? null, timer: t })
  },
  dismiss: () => {
    const { timer } = get()
    if (timer) clearTimeout(timer)
    set({ open: false, undoFn: null, timer: null })
  },
  undo: () => {
    const { undoFn } = get()
    get().dismiss()
    undoFn?.()
  },
}))
