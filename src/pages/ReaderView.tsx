import { useEffect, useRef, useState } from "react"
import { useParams } from "react-router-dom"
import { ChevronLeft, ChevronRight, Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { PdfViewer } from "@/components/PdfViewer"
import { ReactPdfViewerPoc } from "@/components/ReactPdfViewerPoc"
import { AnnotationSidebar } from "@/components/AnnotationSidebar"
import { HighlightPopup } from "@/components/HighlightPopup"
import { NoteEditor } from "@/components/NoteEditor"
import { AiChatPanel } from "@/components/AiChatPanel"
import { TranslationPanel } from "@/components/TranslationPanel"
import { MindMapCanvas } from "@/components/MindMapCanvas"
import { usePaperStore } from "@/lib/stores/paper-store"
import { usePdfViewerStore } from "@/lib/stores/pdf-viewer-store"
import { useAnnotationStore } from "@/lib/stores/annotation-store"
import { generateOutline, getGeneratedOutline } from "@/lib/api"
import { toast } from "sonner"

interface TranslationRequest {
  paperId: string
  text: string
  page: number
  nonce: number
}

function clampRightPanelWidth(width: number, viewportWidth = window.innerWidth): number {
  const minWidth = viewportWidth < 900 ? 280 : 360
  const maxWidth = Math.max(minWidth, Math.min(720, Math.floor(viewportWidth * 0.42)))
  return Math.max(minWidth, Math.min(maxWidth, width))
}

function getDefaultRightPanelWidth(): number {
  if (typeof window === "undefined") return 520
  return clampRightPanelWidth(Math.floor(window.innerWidth * 0.32))
}

function formatAuthors(authors: string): string {
  const names = authors
    .split(/[,;，；]/)
    .map((name) => name.trim())
    .filter(Boolean)
  if (names.length <= 2) return authors
  return `${names.slice(0, 2).join(', ')}...`
}

export function ReaderView() {
  const { id } = useParams<{ id: string }>()
  const { currentPaper, setCurrentPaper, loadPapers } = usePaperStore()
  const { outline, outlineSource, setOutline, setCurrentPage } = usePdfViewerStore()
  const { setCurrentPaperId } = useAnnotationStore()


  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [rightTab, setRightTab] = useState('annotations')
  const [rightPanelWidth, setRightPanelWidth] = useState(getDefaultRightPanelWidth)
  const [isResizing, setIsResizing] = useState(false)
  const hasManuallyResizedRightPanel = useRef(false)
  const [aiTab, setAiTab] = useState('chat')
  const [translationRequest, setTranslationRequest] = useState<TranslationRequest | null>(null)
  const [outlineGenerating, setOutlineGenerating] = useState(false)
  const [pdfViewerMode, setPdfViewerMode] = useState<"legacy" | "react">(() =>
    localStorage.getItem("paperpwn-pdf-viewer") === "react" ? "react" : "legacy"
  )
  const routePaperId = id!


  // Load paper data on mount
  useEffect(() => {
    const paperId = id!
    const loadPaper = async () => {
      if (!currentPaper || currentPaper.id !== paperId) {
        setCurrentPaper(paperId)
        if (!usePaperStore.getState().currentPaper) {
          await loadPapers()
          setCurrentPaper(paperId)
        }
      }
      setCurrentPaperId(paperId)
    }
    loadPaper()
  }, [id, currentPaper, setCurrentPaper, setCurrentPaperId, loadPapers])

  // Restore reading progress
  useEffect(() => {
    if (currentPaper) {
      setCurrentPage((currentPaper as any).lastPage ?? 1)
    }
  }, [currentPaper, setCurrentPage])

  // Opening a paper means the user has started reading it.
  useEffect(() => {
    if (!currentPaper || currentPaper.id !== routePaperId || currentPaper.readStatus !== "unread") return
    usePaperStore.getState().updateReadStatus(currentPaper.id, "reading").catch(() => {})
  }, [currentPaper, routePaperId])

  // Load cached AI outline if the PDF has no embedded outline.
  useEffect(() => {
    if (!currentPaper || outline.length > 0) return
    let cancelled = false
    getGeneratedOutline(currentPaper.id)
      .then((cached) => {
        if (cancelled || !cached) return
        const parsed = JSON.parse(cached)
        if (Array.isArray(parsed)) setOutline(parsed, "ai")
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [currentPaper, outline.length, setOutline])

  if (!currentPaper || currentPaper.id !== routePaperId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading paper...</p>
      </div>
    )
  }

  const handleOutlineClick = (dest: string | number | null, page?: number) => {
    if (page && typeof page === "number") {
      window.dispatchEvent(new CustomEvent("outline-jump", { detail: { page } }))
      return
    }
    if (dest === null) return
    window.dispatchEvent(new CustomEvent("outline-jump", { detail: { dest } }))
  }

  const handleGenerateOutline = async (force = false) => {
    if (!currentPaper || outlineGenerating) return
    setOutlineGenerating(true)
    toast.info(force ? "AI 正在重新生成目录..." : "AI 正在生成目录...")
    try {
      const result = await generateOutline(currentPaper.id, force)
      const parsed = JSON.parse(result)
      setOutline(Array.isArray(parsed) ? parsed : [], "ai")
      toast.success("AI 目录已生成")
    } catch (e) {
      toast.error("AI 生成目录失败: " + String(e))
    } finally {
      setOutlineGenerating(false)
    }
  }

  const togglePdfViewerMode = () => {
    const next = pdfViewerMode === "legacy" ? "react" : "legacy"
    setPdfViewerMode(next)
    localStorage.setItem("paperpwn-pdf-viewer", next)
    toast.info(next === "react" ? "已切换到 React PDF Viewer POC" : "已切换到原 PDF Viewer")
  }

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    hasManuallyResizedRightPanel.current = true
    setIsResizing(true)
  }

  useEffect(() => {
    const handleWindowResize = () => {
      setRightPanelWidth((current) => (
        hasManuallyResizedRightPanel.current
          ? clampRightPanelWidth(current)
          : getDefaultRightPanelWidth()
      ))
    }

    window.addEventListener('resize', handleWindowResize)
    return () => window.removeEventListener('resize', handleWindowResize)
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return
      const newWidth = window.innerWidth - e.clientX
      setRightPanelWidth(clampRightPanelWidth(newWidth))
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing])

  const handleTranslateRequest = (payload: { paperId: string; text: string; page: number }) => {
    setRightCollapsed(false)
    setRightTab('ai')
    setAiTab('translate')
    setTranslationRequest({
      ...payload,
      nonce: Date.now(),
    })
  }

  return (
    <div className="flex h-full relative">
      {/* Left Panel */}
      <div
        className={`${leftCollapsed ? "w-0" : "w-52"} shrink-0 border-r border-border bg-card transition-all duration-200 overflow-hidden`}
      >
        {!leftCollapsed && (
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Navigation</span>
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setLeftCollapsed(true)}>
                <ChevronLeft className="h-3 w-3" />
              </Button>
            </div>
            <div className="flex-1 overflow-auto p-3 space-y-4">
              <div>
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Paper Info</h4>
                <h3 className="text-sm font-medium text-foreground line-clamp-2">{currentPaper.title}</h3>
                <p className="text-xs text-muted-foreground mt-1" title={currentPaper.authors}>{formatAuthors(currentPaper.authors)}</p>
                {currentPaper.year && <p className="text-xs text-muted-foreground">Year: {currentPaper.year}</p>}
                {currentPaper.doi && <p className="text-xs text-muted-foreground">DOI: {currentPaper.doi}</p>}
              </div>
              <Separator />
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Outline</h4>
                  {outlineSource !== "pdf" && (
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => handleGenerateOutline(outlineSource === "ai")} disabled={outlineGenerating}>
                      {outlineGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      {outlineSource === "ai" ? "Regen" : "AI"}
                    </Button>
                  )}
                </div>
                {outline.length === 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground italic">No outline available</p>
                    <Button variant="outline" size="sm" className="h-7 w-full text-xs" onClick={() => handleGenerateOutline(false)} disabled={outlineGenerating}>
                      {outlineGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      {outlineGenerating ? "Generating..." : "AI Generate Outline"}
                    </Button>
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {outline.map((item, i) => (
                      <li key={i}>
                        <button className="text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded px-1 py-0.5 w-full text-left" onClick={() => handleOutlineClick(item.dest ?? null, item.page)}>{item.title}</button>
                        {(item.items?.length ?? 0) > 0 && (
                          <ul className="ml-3 space-y-0.5 mt-0.5">
                            {item.items!.map((sub, j) => (
                              <li key={j}><button className="text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded px-1 py-0.5 w-full text-left" onClick={() => handleOutlineClick(sub.dest ?? null, sub.page)}>{sub.title}</button></li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </div>


      {leftCollapsed && (
        <Button variant="ghost" size="icon" className="absolute left-1 top-1/2 -translate-y-1/2 h-8 w-8 z-10" onClick={() => setLeftCollapsed(false)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      )}

      {/* Center - PDF Viewer */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="absolute left-1/2 top-2 z-20 -translate-x-1/2">
          <Button variant="outline" size="sm" className="h-7 bg-background/90 text-xs shadow-sm" onClick={togglePdfViewerMode}>
            Viewer: {pdfViewerMode === "react" ? "React POC" : "Legacy"}
          </Button>
        </div>
        {pdfViewerMode === "react" ? (
          <ReactPdfViewerPoc paperId={currentPaper.id} filePath={currentPaper.filePath} />
        ) : (
          <PdfViewer paperId={currentPaper.id} filePath={currentPaper.filePath} />
        )}
        <HighlightPopup onTranslateRequest={handleTranslateRequest} />
      </div>


      {/* Right Panel */}
      {!rightCollapsed && (
        <div
          className="w-1 border-l border-border bg-border cursor-col-resize hover:bg-accent transition-colors"
          onMouseDown={handleResizeStart}
        />
      )}
      <div
        className={`${rightCollapsed ? "w-0" : ""} shrink-0 border-l border-border bg-card transition-all duration-200 overflow-hidden`}
        style={{ width: rightCollapsed ? 0 : rightPanelWidth }}
      >
        {!rightCollapsed && (
          <Tabs value={rightTab} onValueChange={setRightTab} className="h-full flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <TabsList className="h-7">
                <TabsTrigger value="annotations" className="text-xs h-6 px-2">Annotations</TabsTrigger>
                <TabsTrigger value="notes" className="text-xs h-6 px-2">Notes</TabsTrigger>
                <TabsTrigger value="ai" className="text-xs h-6 px-2">AI</TabsTrigger>
                <TabsTrigger value="mindmap" className="text-xs h-6 px-2">MindMap</TabsTrigger>
              </TabsList>
              <Button variant="ghost" size="icon" className="h-5 w-5 ml-1" onClick={() => setRightCollapsed(true)}>
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <TabsContent value="annotations" className="h-full overflow-hidden mt-0">
                <AnnotationSidebar key={currentPaper.id} />
              </TabsContent>
              <TabsContent value="notes" className="h-full overflow-hidden mt-0 data-[state=inactive]:hidden">
                <NoteEditor key={currentPaper.id} paperId={currentPaper.id} />
              </TabsContent>
              <TabsContent value="ai" className="h-full overflow-auto mt-0">
                <Tabs value={aiTab} onValueChange={setAiTab} className="h-full flex flex-col">
                  <TabsList className="h-6 mx-3 shrink-0">
                    <TabsTrigger value="chat" className="text-xs h-5 px-2">Chat</TabsTrigger>
                    <TabsTrigger value="translate" className="text-xs h-5 px-2">Translate</TabsTrigger>
                  </TabsList>
                  <TabsContent value="chat" className="flex-1 overflow-auto mt-0">
                    <AiChatPanel key={currentPaper.id} paperId={currentPaper.id} />
                  </TabsContent>
                  <TabsContent value="translate" className="flex-1 overflow-auto mt-0">
                    <TranslationPanel key={currentPaper.id} paperId={currentPaper.id} incomingRequest={translationRequest as any} />
                  </TabsContent>
                </Tabs>
              </TabsContent>
              <TabsContent value="mindmap" className="h-full overflow-hidden mt-0">
                <MindMapCanvas key={currentPaper.id} paperId={currentPaper.id} />
              </TabsContent>
            </div>
          </Tabs>
        )}
      </div>

      {rightCollapsed && (
        <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 z-10" onClick={() => setRightCollapsed(false)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
