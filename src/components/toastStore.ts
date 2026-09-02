import { create } from 'zustand'

// 轻提示 + 撤销：替代原生 alert 的反馈层
interface ToastState {
  open: boolean
  message: string
  undoFn: (() => void) | null
  timer: ReturnType<typeof setTimeout> | null
  show: (message: string, opts?: { undo?: () => void; duration?: number }) => void
  dismiss: () => void
  undo: () => void
}

export const useToastStore = create<ToastState>((set, get) => ({
  open: false,
  message: '',
  undoFn: null,
  timer: null,
  show: (message, opts) => {
    const { timer } = get()
    if (timer) clearTimeout(timer)
    const t = setTimeout(() => get().dismiss(), opts?.duration ?? 5000)
    set({ open: true, message, undoFn: opts?.undo ?? null, timer: t })
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
