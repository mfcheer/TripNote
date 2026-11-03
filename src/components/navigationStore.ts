import { create } from 'zustand'
import type { NavigationTarget } from '../utils/navigation'

interface NavigationState {
  target: NavigationTarget | null
  open: (target: NavigationTarget) => void
  close: () => void
}

export const useNavigationStore = create<NavigationState>((set) => ({
  target: null,
  open: (target) => set({ target }),
  close: () => set({ target: null }),
}))

export const openNavigation = (target: NavigationTarget) =>
  useNavigationStore.getState().open(target)
