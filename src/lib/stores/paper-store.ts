import { create } from "zustand"
import {
  type Paper,
  type Tag,
  type GetPapersParams,
  getPapers,
  toggleStarred,
  updateReadingStatus,
  getTags,
  addTag,
  removeTag,
} from "@/lib/api"

type SortKey = "importTime" | "year" | "title"

interface PaperStoreState {
  papers: Paper[]
  tags: Tag[]
  currentPaper: Paper | null
  selectedTag: string | null
  selectedReadStatus: string | null
  searchQuery: string
  sortKey: SortKey
  loading: boolean
  error: string | null
}

interface PaperStoreActions {
  loadPapers: () => Promise<void>
  search: (query: string) => Promise<void>
  setSortKey: (key: SortKey) => void
  setSelectedTag: (tag: string | null) => Promise<void>
  setSelectedReadStatus: (status: string | null) => Promise<void>
  toggleStarred: (paperId: string) => Promise<void>
  updateReadStatus: (paperId: string, status: string) => Promise<void>
  loadTags: () => Promise<void>
  addTagToPaper: (paperId: number, tagName: string, tagColor?: string) => Promise<void>
  removeTagFromPaper: (paperId: number, tagId: number) => Promise<void>
  setCurrentPaper: (paperId: string) => void
}

function sortPapers(papers: Paper[], sortKey: SortKey): Paper[] {
  const sorted = [...papers]
  switch (sortKey) {
    case "importTime":
      sorted.sort((a, b) => b.importTime.localeCompare(a.importTime))
      break
    case "year":
      sorted.sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
      break
    case "title":
      sorted.sort((a, b) => a.title.localeCompare(b.title))
      break
  }
  return sorted
}

export const usePaperStore = create<PaperStoreState & PaperStoreActions>((set, get) => ({
  papers: [],
  tags: [],
  currentPaper: null,
  selectedTag: null,
  selectedReadStatus: null,
  searchQuery: "",
  sortKey: "importTime",
  loading: false,
  error: null,

  loadPapers: async () => {
    set({ loading: true, error: null })
    try {
      const params: GetPapersParams = {}
      const state = get()
      if (state.selectedTag) params.tag = state.selectedTag
      if (state.selectedReadStatus) params.readStatus = state.selectedReadStatus
      if (state.searchQuery.trim()) params.search = state.searchQuery.trim()
      const papers = await getPapers(params)
      set({ papers: sortPapers(papers, state.sortKey), loading: false })
    } catch (e) {
      set({ error: String(e), loading: false })
    }
  },

  search: async (query: string) => {
    set({ searchQuery: query, loading: true, error: null })
    try {
      const params: GetPapersParams = {}
      const state = get()
      const trimmed = query.trim()
      if (state.selectedTag) params.tag = state.selectedTag
      if (state.selectedReadStatus) params.readStatus = state.selectedReadStatus
      if (trimmed) params.search = trimmed
      const papers = await getPapers(params)
      set({ papers: sortPapers(papers, state.sortKey), loading: false })
    } catch (e) {
      set({ error: String(e), loading: false })
    }
  },

  setSortKey: (key: SortKey) => {
    set((state) => ({ sortKey: key, papers: sortPapers(state.papers, key) }))
  },

  setSelectedTag: async (tag: string | null) => {
    set({ selectedTag: tag })
    await get().loadPapers()
  },

  setSelectedReadStatus: async (status: string | null) => {
    set({ selectedReadStatus: status })
    await get().loadPapers()
  },

  toggleStarred: async (paperId: string) => {
    try {
      const updated = await toggleStarred(paperId)
      set((state) => ({
        papers: state.papers.map((p) => (p.id === paperId ? updated : p)),
      }))
    } catch (e) {
      set({ error: String(e) })
    }
  },

  updateReadStatus: async (paperId: string, status: string) => {
    try {
      const updated = await updateReadingStatus(paperId, status)
      set((state) => ({
        papers: state.papers.map((p) => (p.id === paperId ? updated : p)),
      }))
    } catch (e) {
      set({ error: String(e) })
    }
  },

  loadTags: async () => {
    try {
      const tags = await getTags()
      set({ tags })
    } catch (e) {
      set({ error: String(e) })
    }
  },

  addTagToPaper: async (paperId: number, tagName: string, tagColor?: string) => {
    try {
      const newTag = await addTag(paperId, tagName, tagColor)
      set((state) => ({ tags: [...state.tags, newTag] }))
      await get().loadPapers()
    } catch (e) {
      set({ error: String(e) })
    }
  },

  removeTagFromPaper: async (paperId: number, tagId: number) => {
    try {
      await removeTag(paperId, tagId)
      await get().loadTags()
      await get().loadPapers()
    } catch (e) {
      set({ error: String(e) })
    }
  },

  setCurrentPaper: (paperId: string) => {
    const paper = get().papers.find((p) => p.id === paperId)
    set({ currentPaper: paper ?? null })
  },
}))
