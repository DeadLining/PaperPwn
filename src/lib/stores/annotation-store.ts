import { create } from 'zustand'
import { toast } from 'sonner'
import {
  type Annotation,
  type HighlightRect,
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
  getAnnotationsForPaper,
} from '@/lib/api'

interface AnnotationStoreState {
  annotations: Annotation[]
  currentPaperId: string | number | null
  loading: boolean
  error: string | null
}

interface AnnotationStoreActions {
  loadAnnotations: (paperId: string | number) => Promise<void>
  setCurrentPaperId: (paperId: string | number) => void
  addAnnotation: (paperId: string | number, page: number, highlightedText: string, comment: string, color?: string, rects?: HighlightRect[]) => Promise<void>
  editAnnotation: (paperId: string | number, annotationId: string, comment?: string, color?: string) => Promise<void>
  removeAnnotation: (paperId: string | number, annotationId: string) => Promise<void>
  exportMarkdown: () => string
}

export const useAnnotationStore = create<AnnotationStoreState & AnnotationStoreActions>((set, get) => ({
  annotations: [],
  currentPaperId: null,
  loading: false,
  error: null,

  loadAnnotations: async (paperId: string | number) => {
    set({ loading: true, error: null })
    try {
      const annotations = await getAnnotationsForPaper(paperId)
      set({ annotations, loading: false })
    } catch (e) {
      toast.error('Failed to load annotations')
      set({ error: String(e), loading: false })
    }
  },

  setCurrentPaperId: (paperId: string | number) => {
    set({ currentPaperId: paperId })
    get().loadAnnotations(paperId)
  },

  addAnnotation: async (paperId, page, highlightedText, comment, color, rects) => {
    try {
      const newAnnotation = await createAnnotation(paperId, page, highlightedText, comment, color, rects)
      set((state) => ({ annotations: [...state.annotations, newAnnotation] }))
    } catch (e) {
      toast.error('Failed to create annotation')
      set({ error: String(e) })
    }
  },

  editAnnotation: async (paperId, annotationId, comment, color) => {
    try {
      const updated = await updateAnnotation(paperId, annotationId, comment, color)
      set((state) => ({
        annotations: state.annotations.map((a) => (a.id === annotationId ? updated : a)),
      }))
    } catch (e) {
      toast.error('Failed to update annotation')
      set({ error: String(e) })
    }
  },

  removeAnnotation: async (paperId, annotationId) => {
    try {
      await deleteAnnotation(paperId, annotationId)
      set((state) => ({
        annotations: state.annotations.filter((a) => a.id !== annotationId),
      }))
    } catch (e) {
      toast.error('Failed to delete annotation')
      set({ error: String(e) })
    }
  },

  exportMarkdown: () => {
    const { annotations } = get()
    const grouped: Record<number, Annotation[]> = {}
    for (const a of annotations) {
      if (!grouped[a.page]) grouped[a.page] = []
      grouped[a.page].push(a)
    }
    const pages = Object.keys(grouped).map(Number).sort((a, b) => a - b)
    let md = '## Annotations\n'
    for (const page of pages) {
      md += `\n### Page ${page}\n`
      for (const a of grouped[page]) {
        md += `\n> ${a.highlightedText}\n\n${a.comment}\n`
      }
    }
    return md
  },
}))