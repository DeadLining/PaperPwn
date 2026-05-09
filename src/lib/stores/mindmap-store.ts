import { create } from "zustand"
import { toast } from "sonner"
import {
  saveMindmap as apiSaveMindmap,
  getMindmap as apiGetMindmap,
  generateMindmap as apiGenerateMindmap,
} from "@/lib/api"

export interface MindMapNode {
  id: string
  type?: string
  data: { label: string; color?: string; [key: string]: unknown }
  position: { x: number; y: number }
}

export interface MindMapEdge {
  id: string
  source: string
  target: string
  type?: string
}

export interface MindMapState {
  nodes: MindMapNode[]
  edges: MindMapEdge[]
  paperId: number | null
  loading: boolean
  generating: boolean
  error: string | null
}

interface MindMapActions {
  loadMindmap: (paperId: number) => Promise<void>
  saveMindmap: (paperId: number) => Promise<void>
  generateMindmap: (paperId: number) => Promise<void>
  updateNode: (nodeId: string, label: string) => void
  addChildNode: (parentId: string, label?: string) => void
  deleteNode: (nodeId: string) => void
  setNodes: (nodes: MindMapNode[]) => void
  setEdges: (edges: MindMapEdge[]) => void
  resetLayout: () => void
}

export const useMindMapStore = create<MindMapState & MindMapActions>((set, get) => ({
  nodes: [],
  edges: [],
  paperId: null,
  loading: false,
  generating: false,
  error: null,

  loadMindmap: async (paperId: number) => {
    set({ loading: true, error: null, paperId })
    try {
      const contentJson = await apiGetMindmap(paperId)
      if (contentJson && contentJson !== "") {
        const parsed = JSON.parse(contentJson)
        set({ nodes: parsed.nodes || [], edges: parsed.edges || [], loading: false })
      } else {
        set({ nodes: [], edges: [], loading: false })
      }
    } catch (e) {
      set({ error: String(e), loading: false, nodes: [], edges: [] })
    }
  },

  saveMindmap: async (paperId: number) => {
    const { nodes, edges } = get()
    try {
      await apiSaveMindmap(paperId, JSON.stringify({ nodes, edges }))
    } catch (e) {
      set({ error: String(e) })
      toast.error("保存思维导图失败")
    }
  },

  generateMindmap: async (paperId: number) => {
    set({ generating: true, error: null })
    try {
      const result = await apiGenerateMindmap(paperId)
      const parsed = JSON.parse(result)
      set({
        nodes: parsed.nodes || [],
        edges: parsed.edges || [],
        generating: false,
        paperId,
      })
      await get().saveMindmap(paperId)
      toast.success("思维导图已生成")
    } catch (e) {
      set({ error: String(e), generating: false })
      toast.error("生成思维导图失败: " + String(e))
    }
  },

  updateNode: (nodeId: string, label: string) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, label } } : n
      ),
    }))
  },

  addChildNode: (parentId: string, label?: string) => {
    const { nodes, edges, paperId } = get()
    const parent = nodes.find((n) => n.id === parentId)
    if (!parent) return
    const newId = parentId + "-child-" + Date.now()
    const childCount = edges.filter((e) => e.source === parentId).length
    const offsetX = childCount % 2 === 0 ? 80 : -80
    const offsetY = 80
    const newNode: MindMapNode = {
      id: newId,
      type: "mindmap",
      data: { label: label || "新节点", color: "#6366f1" },
      position: {
        x: parent.position.x + offsetX + (childCount * 20),
        y: parent.position.y + offsetY,
      },
    }
    const newEdge: MindMapEdge = {
      id: "e-" + parentId + "-" + newId,
      source: parentId,
      target: newId,
      type: "smoothstep",
    }
    set({ nodes: [...nodes, newNode], edges: [...edges, newEdge] })
    if (paperId) get().saveMindmap(paperId)
  },

  deleteNode: (nodeId: string) => {
    if (nodeId === "root") return
    const { nodes, edges, paperId } = get()
    set({
      nodes: nodes.filter((n) => n.id !== nodeId),
      edges: edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
    })
    if (paperId) get().saveMindmap(paperId)
  },

  setNodes: (nodes: MindMapNode[]) => set({ nodes }),
  setEdges: (edges: MindMapEdge[]) => set({ edges }),

  resetLayout: () => {
    const { nodes, paperId } = get()
    const root = nodes.find((n) => n.id === "root")
    if (!root) return
    const layoutNodes = nodes.map((n) => {
      if (n.id === "root") return n
      const edge = get().edges.find((e) => e.target === n.id)
      const parent = edge ? nodes.find((p) => p.id === edge?.source) : root
      const siblings = nodes.filter((nn) => {
        const e = get().edges.find((ee) => ee.target === nn.id)
        return e?.source === parent?.id
      })
      const idx = siblings.indexOf(n)
      const side = idx % 2 === 0 ? 1 : -1
      return {
        ...n,
        position: {
          x: parent!.position.x + side * 280,
          y: parent!.position.y + 80 + idx * 70,
        },
      }
    })
    set({ nodes: layoutNodes })
    if (paperId) get().saveMindmap(paperId)
  },
}))
