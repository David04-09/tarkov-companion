import { create } from 'zustand'

interface LookupState {
  open: boolean
  setOpen: (open: boolean) => void
}

/** Global item lookup dialog state (Ctrl+K or the sidebar search button). */
export const useLookupStore = create<LookupState>()((set) => ({ open: false, setOpen: (open) => set({ open }) }))
