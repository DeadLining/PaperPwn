import { create } from 'zustand'

interface OutlineItem {
  title: string
  page?: number
  dest?: string | number | null
  items?: OutlineItem[]
  children?: OutlineItem[]
}

interface PdfViewerStoreState {
  currentPage: number
  totalPages: number
  zoom: number
  scaleMode: 'fixed' | 'fit-width'
  outline: OutlineItem[]
  outlineSource: 'pdf' | 'ai' | null
}

interface PdfViewerStoreActions {
  setCurrentPage: (page: number) => void
  setTotalPages: (total: number) => void
  setZoom: (zoom: number) => void
  setOutline: (outline: OutlineItem[], source?: 'pdf' | 'ai' | null) => void
  nextPage: () => void
  prevPage: () => void
  zoomIn: () => void
  zoomOut: () => void
  setFitWidth: () => void
}

export const usePdfViewerStore = create<PdfViewerStoreState & PdfViewerStoreActions>((set, get) => ({
  currentPage: 1,
  totalPages: 0,
  zoom: 1,
  scaleMode: 'fixed',
  outline: [],
  outlineSource: null,

  setCurrentPage: (page) => set({ currentPage: page }),
  setTotalPages: (total) => set({ totalPages: total }),
  setZoom: (zoom) => set({ zoom }),
  setOutline: (outline, source = null) => set({ outline, outlineSource: source }),

  nextPage: () => {
    const { currentPage, totalPages } = get()
    if (currentPage < totalPages) set({ currentPage: currentPage + 1 })
  },

  prevPage: () => {
    const { currentPage } = get()
    if (currentPage > 1) set({ currentPage: currentPage - 1 })
  },

  zoomIn: () => set((s) => ({ zoom: s.zoom + 0.25, scaleMode: 'fixed' })),
  zoomOut: () => set((s) => ({ zoom: Math.max(0.25, s.zoom - 0.25), scaleMode: 'fixed' })),
  setFitWidth: () => set({ scaleMode: 'fit-width' }),
}))