import { useCallback, useEffect, useState, useRef } from "react"
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Connection,
  addEdge,
  useNodesState,
  useEdgesState,
  OnNodesChange,
  OnEdgesChange,
  NodeMouseHandler,
  BackgroundVariant,
  MarkerType,
  Node,
  Edge,
  Handle,
  Position,
  BaseEdge,
  EdgeProps,
  getBezierPath,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { toPng } from "html-to-image"
import { toast } from "sonner"
import { Plus, Trash2, RotateCcw, Save, Download, FileText, Sparkles, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { saveMindmap, getMindmap, generateMindmap } from "@/lib/api"

export interface MindMapNodeData {
  label: string
  color?: string
  [key: string]: unknown
}

export interface MindMapNode extends Node<MindMapNodeData> {}

interface MindMapCanvasProps {
  paperId?: string | number
  initialNodes?: MindMapNode[]
  initialEdges?: Edge[]
}

const NODE_COLORS = [
  "#2563eb", // blue
  "#059669", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#7c3aed", // violet
  "#0891b2", // cyan
]

function nodeColor(index: number): string {
  return NODE_COLORS[index % NODE_COLORS.length]
}

function normalizeMindmapEdges(rawEdges: Edge[]): Edge[] {
  return rawEdges.map((edge) => ({
    ...edge,
    type: "xmind",
    animated: false,
    style: { stroke: "#94a3b8", strokeWidth: 2.4, ...(edge.style || {}) },
    markerEnd: undefined,
  }))
}

function XMindEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.28,
  })

  return (
    <BaseEdge
      path={edgePath}
      style={{
        stroke: "#94a3b8",
        strokeWidth: 2.4,
        strokeLinecap: "round",
        fill: "none",
        ...style,
      }}
    />
  )
}


function layoutXMind(rawNodes: MindMapNode[], rawEdges: Edge[]): MindMapNode[] {
  if (rawNodes.length === 0) return []

  const nodesById = new Map(rawNodes.map((node) => [node.id, node]))
  const childIds = new Set(rawEdges.map((edge) => edge.target))
  const root = rawNodes.find((node) => !childIds.has(node.id)) || rawNodes[0]
  const childrenByParent = new Map<string, string[]>()

  for (const edge of rawEdges) {
    if (!childrenByParent.has(edge.source)) childrenByParent.set(edge.source, [])
    childrenByParent.get(edge.source)!.push(edge.target)
  }

  const positioned = new Map<string, { x: number; y: number }>()
  positioned.set(root.id, { x: 0, y: 0 })

  const directChildren = (childrenByParent.get(root.id) || []).filter((id) => nodesById.has(id))
  const leftCount = Math.ceil(directChildren.length / 2)
  const leftChildren = directChildren.slice(0, leftCount)
  const rightChildren = directChildren.slice(leftCount)
  const branchGapY = 128
  const levelGapX = 430
  const childGapY = 96

  const placeDescendants = (parentId: string, side: 1 | -1, depth: number, parentY: number) => {
    const children = (childrenByParent.get(parentId) || []).filter((id) => nodesById.has(id))
    const totalHeight = Math.max(0, (children.length - 1) * childGapY)
    children.forEach((childId, index) => {
      const y = parentY + index * childGapY - totalHeight / 2
      positioned.set(childId, { x: side * levelGapX * depth, y })
      placeDescendants(childId, side, depth + 1, y)
    })
  }

  const placeBranch = (ids: string[], side: 1 | -1) => {
    const totalHeight = Math.max(0, (ids.length - 1) * branchGapY)
    ids.forEach((id, index) => {
      const y = index * branchGapY - totalHeight / 2
      positioned.set(id, { x: side * levelGapX, y })
      placeDescendants(id, side, 2, y)
    })
  }

  placeBranch(rightChildren, 1)
  placeBranch(leftChildren, -1)

  let orphanIndex = 0
  return rawNodes.map((node) => ({
    ...node,
    position: positioned.get(node.id) || { x: 0, y: (orphanIndex++ + 1) * branchGapY },
  }))
}

function attachNearestHandles(rawEdges: Edge[], rawNodes: MindMapNode[]): Edge[] {
  const nodesById = new Map(rawNodes.map((node) => [node.id, node]))
  return rawEdges.map((edge) => {
    const source = nodesById.get(edge.source)
    const target = nodesById.get(edge.target)
    if (!source || !target) return edge

    const targetIsLeft = target.position.x < source.position.x
    return {
      ...edge,
      sourceHandle: targetIsLeft ? "left-source" : "right-source",
      targetHandle: targetIsLeft ? "right-target" : "left-target",
    }
  })
}

function normalizeMindmapNodes(rawNodes: MindMapNode[]): MindMapNode[] {
  return rawNodes.map((node, index) => {
    const data = node.data || {}
    const topLevel = node as any
    const label = String(data.label || data.text || topLevel.label || topLevel.text || node.id || "Untitled")
    return {
      ...node,
      type: "mindmap",
      data: {
        ...data,
        label,
        color: data.color || topLevel.color || nodeColor(index),
      },
    }
  })
}

// Custom Mindmap Node component with inline edit support
function MindmapNode({
  data,
  id,
  selected,
}: {
  data: MindMapNodeData
  id: string
  selected?: boolean
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(data.label)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setEditValue(data.label)
  }, [data.label])

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsEditing(true)
    setEditValue(data.label)
  }

  const commitEdit = () => {
    setIsEditing(false)
    if (editValue.trim() && editValue !== data.label) {
      // Dispatch custom event so parent can handle save
      window.dispatchEvent(
        new CustomEvent("mindmap:node-update", {
          detail: { nodeId: id, label: editValue.trim() },
        })
      )
    }
  }

  const isRoot = id === "root"
  const [heading, ...bodyParts] = data.label.split(/[：:]/)
  const body = bodyParts.join("：").trim()

  return (
    <div style={{ position: "relative" }}>
      {[Position.Left, Position.Right].map((position) => (
        <div key={position}>
          <Handle
            type="target"
            position={position}
            id={`${position}-target`}
            style={{ width: 8, height: 8, opacity: 0, background: data.color ?? "#2563eb" }}
          />
          <Handle
            type="source"
            position={position}
            id={`${position}-source`}
            style={{ width: 8, height: 8, opacity: 0, background: data.color ?? "#2563eb" }}
          />
        </div>
      ))}
      <div
        onDoubleClick={handleDoubleClick}
        className="mindmap-node-card"
        style={{
          position: "relative",
          padding: isRoot ? "12px 26px" : "13px 16px 13px 18px",
          borderRadius: isRoot ? 999 : 18,
          border: selected ? "2px solid #2563eb" : "1px solid rgba(148, 163, 184, 0.28)",
          background: isRoot
            ? "linear-gradient(135deg, #1d4ed8 0%, #2563eb 48%, #0891b2 100%)"
            : "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.96))",
          color: isRoot ? "#ffffff" : "#0f172a",
          fontSize: isRoot ? 14 : 12.5,
          lineHeight: 1.38,
          fontWeight: isRoot ? 700 : 500,
          minWidth: isRoot ? 170 : 245,
          maxWidth: isRoot ? 220 : 285,
          whiteSpace: "normal",
          textAlign: isRoot ? "center" : "left",
          boxShadow: selected
            ? "0 0 0 5px rgba(37, 99, 235, 0.16), 0 18px 35px rgba(15,23,42,0.18)"
            : isRoot
              ? "0 18px 36px rgba(37, 99, 235, 0.24)"
              : "0 14px 30px rgba(15,23,42,0.10), inset 0 1px 0 rgba(255,255,255,0.8)",
          cursor: "text",
        }}
      >
        {!isRoot && (
          <span
            style={{
              position: "absolute",
              left: 0,
              top: 14,
              bottom: 14,
              width: 5,
              borderRadius: "0 999px 999px 0",
              background: data.color ?? "#2563eb",
            }}
          />
        )}
        {isEditing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === "Enter") {
                commitEdit()
              } else if (e.key === "Escape") {
                setIsEditing(false)
                setEditValue(data.label)
              }
            }}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "transparent",
              border: "none",
              outline: "none",
              color: isRoot ? "#ffffff" : "#0f172a",
              fontSize: 14,
              fontWeight: 600,
              width: "100%",
              textAlign: isRoot ? "center" : "left",
            }}
          />
        ) : isRoot || !body ? (
          data.label
        ) : (
          <div>
            <div style={{ color: data.color ?? "#2563eb", fontSize: 12, fontWeight: 800, marginBottom: 3 }}>
              {heading}
            </div>
            <div style={{ color: "#334155" }}>{body}</div>
          </div>
        )}
      </div>
    </div>
  )
}

const nodeTypes = {
  mindmap: MindmapNode,
}

const edgeTypes = {
  xmind: XMindEdge,
}

// Build markdown from nodes/edges structure
function buildMarkdown(nodes: Node[], edges: Edge[]): string {
  if (nodes.length === 0) return ""
  const childIds = new Set(edges.map((e) => e.target))
  const root = nodes.find((n) => !childIds.has(n.id))
  if (!root) return ""
  const lines: string[] = [`# ${root.data.label || root.data.text || "Mind Map"}\n`]
  const childrenMap = new Map<string, Node[]>()
  for (const edge of edges) {
    if (!childrenMap.has(edge.source)) childrenMap.set(edge.source, [])
    childrenMap.get(edge.source)!.push(nodes.find((n) => n.id === edge.target)!)
  }
  function traverse(node: Node, depth: number): void {
    const children = childrenMap.get(node.id) ?? []
    for (const child of children) {
      lines.push(`${"  ".repeat(depth)}- ${child.data.label || child.data.text || child.id}`)
      traverse(child, depth + 1)
    }
  }
  traverse(root, 0)
  return lines.join("\n")
}

export function MindMapCanvas({
  paperId,
  initialNodes,
  initialEdges,
}: MindMapCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<MindMapNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isInitialized = useRef(false)

  // Load existing mindmap or use initial data
  useEffect(() => {
    isInitialized.current = false
    setSelectedNodeId(null)
    setNodes([])
    setEdges([])

    const load = async () => {
      if (paperId != null) {
        try {
          const json = await getMindmap(paperId)
          if (json && json !== "null" && json !== "{}") {
            const parsed = JSON.parse(json)
            if (parsed.nodes?.length) {
              const normalizedEdges = normalizeMindmapEdges(parsed.edges || [])
              setNodes(layoutXMind(normalizeMindmapNodes(parsed.nodes), normalizedEdges))
              setEdges(normalizedEdges)
              isInitialized.current = true
              return
            }
          }
        } catch {
          // fall through to initial
        }
      }
      if (initialNodes?.length) {
        const normalizedEdges = normalizeMindmapEdges(initialEdges || [])
        setNodes(layoutXMind(normalizeMindmapNodes(initialNodes), normalizedEdges))
        setEdges(normalizedEdges)
      }
      isInitialized.current = true
    }
    load()
  }, [paperId, initialNodes, initialEdges, setNodes, setEdges])

  // Handle custom node update events from inline edit
  useEffect(() => {
    const handleNodeUpdate = (e: Event) => {
      const { nodeId, label } = (e as CustomEvent).detail
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, label } } : n
        )
      )
      debouncedSave()
    }
    window.addEventListener("mindmap:node-update", handleNodeUpdate)
    return () => window.removeEventListener("mindmap:node-update", handleNodeUpdate)
  }, [setNodes])

  const debouncedSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => doSave(), 800)
  }, [])

  async function doSave() {
    if (isSaving || !isInitialized.current || paperId == null) return
    setIsSaving(true)
    try {
      const content = JSON.stringify({ nodes, edges })
      await saveMindmap(paperId, content)
    } catch {
      toast.error("Failed to save mindmap")
    } finally {
      setIsSaving(false)
    }
  }

  const handleNodesChange: OnNodesChange<MindMapNode> = useCallback(
    (changes) => {
      onNodesChange(changes)
      const positionChanges = changes.filter(
        (c) => c.type === "position" && "position" in c
      )
      if (positionChanges.length > 0) {
        debouncedSave()
      }
    },
    [onNodesChange, debouncedSave]
  )

  const handleEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      onEdgesChange(changes)
    },
    [onEdgesChange]
  )

  const handleConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            type: "xmind",
            style: { stroke: "#94a3b8", strokeWidth: 2.4 },
            markerEnd: undefined,
          },
          eds
        )
      )
      debouncedSave()
    },
    [setEdges, debouncedSave]
  )

  const handleNodeClick: NodeMouseHandler<MindMapNode> = useCallback(
    (_event, node) => {
      setSelectedNodeId(node.id)
    },
    []
  )

  const addChildNode = useCallback(() => {
    const parentId = selectedNodeId ?? (nodes[0]?.id ?? null)
    if (!parentId) {
      toast.error("No parent node selected")
      return
    }
    const parentNode = nodes.find((n) => n.id === parentId)
    if (!parentNode) return

    const childId = `node-${Date.now()}`
    const childCount = edges.filter((e) => e.source === parentId).length

    const newNode: MindMapNode = {
      id: childId,
      position: {
        x: parentNode.position.x + (childCount - 1) * 260,
        y: parentNode.position.y + 180,
      },
      data: {
        label: "New Node",
        color: parentNode.data.color || nodeColor(nodes.length),
      },
      type: "mindmap",
    }

    const newEdge: Edge = {
      id: `edge-${Date.now()}`,
      source: parentId,
      target: childId,
      type: "smoothstep",
      style: { stroke: "#94a3b8", strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed },
    }

    setNodes((nds) => [...nds, newNode])
    setEdges((eds) => [...eds, newEdge])
    setSelectedNodeId(childId)
    toast.success("Child node added")
    debouncedSave()
  }, [selectedNodeId, nodes, edges, setNodes, setEdges])

  const deleteSelected = useCallback(() => {
    if (!selectedNodeId) return
    if (nodes[0]?.id === selectedNodeId) {
      toast.error("Cannot delete root node")
      return
    }
    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId))
    setEdges((eds) =>
      eds.filter(
        (e) => e.source !== selectedNodeId && e.target !== selectedNodeId
      )
    )
    setSelectedNodeId(null)
    toast.success("Node deleted")
    debouncedSave()
  }, [selectedNodeId, nodes, setNodes, setEdges, debouncedSave])

  const resetLayout = useCallback(() => {
    if (!nodes.length) return
    const updated = layoutXMind(nodes, edges)
    setNodes(updated)
    toast.success("Layout reset")
    debouncedSave()
  }, [nodes, edges, setNodes, debouncedSave])


  const handleGenerateMindmap = useCallback(async () => {
    if (paperId == null || isGenerating) return
    setIsGenerating(true)
    try {
      const result = await generateMindmap(paperId, nodes.length > 0)
      const parsed = JSON.parse(result)
      const nextEdges = normalizeMindmapEdges(parsed.edges || [])
      const nextNodes = layoutXMind(normalizeMindmapNodes(parsed.nodes || []), nextEdges)
      setNodes(nextNodes)
      setEdges(nextEdges)
      setSelectedNodeId(nextNodes[0]?.id ?? null)
      await saveMindmap(paperId, JSON.stringify({ nodes: nextNodes, edges: nextEdges }))
      toast.success("思维导图已生成")
    } catch (e) {
      toast.error("生成思维导图失败: " + String(e))
    } finally {
      setIsGenerating(false)
    }
  }, [paperId, isGenerating, nodes.length, setNodes, setEdges])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedNodeId && !(e.target instanceof HTMLInputElement)) {
          deleteSelected()
        }
      }
    },
    [selectedNodeId, deleteSelected]
  )

  return (
    <div
      className="flex h-full w-full flex-col"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      style={{ outline: "none" }}
    >
      <div className="shrink-0 border-b border-border bg-card px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Mind Map
          </div>

          <Button
            variant="default"
            size="sm"
            className="h-7 text-xs"
            onClick={handleGenerateMindmap}
            disabled={isGenerating || paperId == null}
          >
            {isGenerating ? <Loader2 className="h-3 w-3 mr-1 shrink-0 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1 shrink-0" />}
            {nodes.length === 0 ? "AI Generate" : "Regenerate"}
          </Button>

          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addChildNode}>
            <Plus className="h-3 w-3 mr-1 shrink-0" />
            Add Child
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={deleteSelected}
            disabled={!selectedNodeId || nodes[0]?.id === selectedNodeId}
          >
            <Trash2 className="h-3 w-3 mr-1 shrink-0" />
            Delete
          </Button>

          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={resetLayout}>
            <RotateCcw className="h-3 w-3 mr-1 shrink-0" />
            Reset
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              doSave()
              toast.success("Mindmap saved")
            }}
            disabled={isSaving}
          >
            <Save className="h-3 w-3 mr-1 shrink-0" />
            {isSaving ? "Saving..." : "Save"}
          </Button>

          <Separator orientation="vertical" className="h-5" />

          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={async () => {
              const wrapper = document.querySelector(".react-flow") as HTMLElement
              if (!wrapper) return
              try {
                const dataUrl = await toPng(wrapper, {
                  backgroundColor: "#ffffff",
                  pixelRatio: 2,
                })
                const link = document.createElement("a")
                link.download = `mindmap-${paperId}.png`
                link.href = dataUrl
                link.click()
              } catch {
                toast.error("Failed to export PNG")
              }
            }}
          >
            <Download className="h-3 w-3 mr-1 shrink-0" />
            PNG
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              const allNodes = nodes as Node[]
              const md = buildMarkdown(allNodes, edges)
              const blob = new Blob([md], { type: "text/markdown" })
              const url = URL.createObjectURL(blob)
              const link = document.createElement("a")
              link.download = `mindmap-${paperId}.md`
              link.href = url
              link.click()
              URL.revokeObjectURL(url)
              toast.success("Markdown exported")
            }}
          >
            <FileText className="h-3 w-3 mr-1 shrink-0" />
            Markdown
          </Button>

          <div className="ml-auto hidden text-[11px] text-muted-foreground lg:block">
            Double-click edit · Drag nodes · Delete removes selected
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 relative bg-[radial-gradient(circle_at_50%_20%,rgba(219,234,254,0.75),transparent_32%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]">
        {nodes.length === 0 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <div className="pointer-events-auto w-72 rounded-lg border border-border bg-card/95 p-4 text-center shadow-lg">
              <Sparkles className="mx-auto mb-2 h-6 w-6 text-primary" />
              <p className="text-sm font-medium text-foreground">尚未生成思维导图</p>
              <p className="mt-1 text-xs text-muted-foreground">点击按钮用 AI 根据论文内容生成，之后可继续手动编辑。</p>
              <Button size="sm" className="mt-3 h-8 text-xs" onClick={handleGenerateMindmap} disabled={isGenerating || paperId == null}>
                {isGenerating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                AI 生成思维导图
              </Button>
            </div>
          </div>
        )}
        <ReactFlow
          nodes={nodes.map((n) => ({
            ...n,
            type: "mindmap",
            selected: n.id === selectedNodeId,
          }))}
          edges={attachNearestHandles(normalizeMindmapEdges(edges), nodes)}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={handleConnect}
          onNodeClick={handleNodeClick}
          connectionLineStyle={{ stroke: "#94a3b8", strokeWidth: 2.4 }}
          connectOnClick={false}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.2}
          maxZoom={2}
          defaultEdgeOptions={{
            type: "xmind",
            style: { stroke: "#94a3b8", strokeWidth: 2.4 },
            markerEnd: undefined,
          }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1}
            color="#cbd5e1"
          />
          <Controls
            style={{ borderRadius: 8, border: "1px solid #e2e8f0" }}
          />
          <MiniMap
            nodeColor={(n) => (n.data as MindMapNodeData).color ?? "#6366f1"}
            maskColor="rgba(226, 232, 240, 0.8)"
            style={{ backgroundColor: "#f8fafc", border: "1px solid #e2e8f0" }}
          />
        </ReactFlow>
      </div>
    </div>
  )
}
