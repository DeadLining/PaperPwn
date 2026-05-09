import { memo, useEffect, useRef, useCallback, useState } from "react"
import * as pdfjsLib from "pdfjs-dist"
import { Button } from "@/components/ui/button"
import { ZoomIn, ZoomOut, Maximize } from "lucide-react"
import { usePdfViewerStore } from "@/lib/stores/pdf-viewer-store"
import { useAnnotationStore } from "@/lib/stores/annotation-store"
import { usePaperStore } from "@/lib/stores/paper-store"
import { updatePaper } from "@/lib/api"
import { bindTextLayerSelection } from "@/lib/pdf/text-layer-selection"
import { addTextLayerLineSpacers } from "@/lib/pdf/text-layer-spacers"
import { toast } from "sonner"
import { exists as fsExists, readFile } from "@tauri-apps/plugin-fs"
import "pdfjs-dist/web/pdf_viewer.css"

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`

interface PdfViewerProps {
  paperId: string
  filePath: string
}

interface PageInfo {
  wrapper: HTMLDivElement
  pageNum: number
  renderedScale: number | null
  rendering: boolean
}

interface ZoomAnchor {
  pageNum: number
  xRatio: number
  yRatio: number
  viewportX: number
  viewportY: number
}

const HIGHLIGHT_COLOR_MAP: Record<string, string> = {
  yellow: 'rgba(255, 235, 59, 0.35)',
  green: 'rgba(76, 175, 80, 0.35)',
  blue: 'rgba(33, 150, 243, 0.35)',
  red: 'rgba(244, 67, 54, 0.35)',
  purple: 'rgba(156, 39, 176, 0.35)',
}

const VISIBLE_PAGE_BUFFER = 2
const PDFJS_ASSET_BASE = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174"

function PdfViewerComponent({ paperId, filePath }: PdfViewerProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const zoomShellRef = useRef<HTMLDivElement>(null)
  const pagesContainerRef = useRef<HTMLDivElement>(null)
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null)
  const pagesRef = useRef<PageInfo[]>([])
  const renderTaskRef = useRef<pdfjsLib.RenderTask[]>([])
  const selectionBindingsRef = useRef(new Map<HTMLDivElement, () => void>())
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadSeqRef = useRef(0)
  const zoomTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollRenderFrameRef = useRef<number | null>(null)
  const zoomFrameRef = useRef<number | null>(null)
  const renderSeqRef = useRef(0)
  const visualZoomRef = useRef(1)
  const committedScaleRef = useRef(1)
  const zoomAnchorRef = useRef<ZoomAnchor | null>(null)
  const zoomGestureRef = useRef<{ anchor: ZoomAnchor | null; targetZoom: number } | null>(null)
  const [scrollPage, setScrollPage] = useState(1)
  const [visualZoom, setVisualZoom] = useState(1)
  const [committedScale, setCommittedScale] = useState(1)
  const [zoomShellSize, setZoomShellSize] = useState({ width: 0, height: 0 })

  const { totalPages, zoom, scaleMode,
    setTotalPages, setZoom, zoomIn, zoomOut, setFitWidth, setOutline, setCurrentPage
  } = usePdfViewerStore()

  const annotations = useAnnotationStore((s) => s.annotations)
  const currentPaper = usePaperStore((s) => s.currentPaper)

  useEffect(() => {
    visualZoomRef.current = visualZoom
  }, [visualZoom])

  useEffect(() => {
    committedScaleRef.current = committedScale
  }, [committedScale])

  const computeScale = useCallback(async () => {
    if (scaleMode === "fit-width" && scrollContainerRef.current && pdfDocRef.current) {
      const page = await pdfDocRef.current.getPage(1)
      const viewport = page.getViewport({ scale: 1 })
      const containerWidth = scrollContainerRef.current.clientWidth - 48
      return containerWidth / viewport.width
    }
    return zoom
  }, [scaleMode, zoom])

  const renderHighlightLayersRef = useRef<() => void>(() => {})

  const getScrollAnchor = useCallback((viewportX?: number, viewportY?: number) => {
    const container = scrollContainerRef.current
    if (!container || !pagesRef.current.length) return null

    const anchorViewportX = viewportX ?? container.clientWidth / 2
    const anchorViewportY = viewportY ?? container.clientHeight / 2
    const visualRatio = visualZoomRef.current / committedScaleRef.current
    const contentX = (container.scrollLeft + anchorViewportX) / visualRatio
    const centerLine = (container.scrollTop + anchorViewportY) / visualRatio
    let anchor = pagesRef.current[0]
    for (const info of pagesRef.current) {
      const top = info.wrapper.offsetTop
      const bottom = top + info.wrapper.offsetHeight
      if (centerLine >= top && centerLine <= bottom) {
        anchor = info
        break
      }
      if (centerLine > bottom) anchor = info
    }

    const xRatio = anchor.wrapper.offsetWidth > 0
      ? (contentX - anchor.wrapper.offsetLeft) / anchor.wrapper.offsetWidth
      : 0.5
    const yRatio = anchor.wrapper.offsetHeight > 0
      ? (centerLine - anchor.wrapper.offsetTop) / anchor.wrapper.offsetHeight
      : 0
    return {
      pageNum: anchor.pageNum,
      xRatio: Math.max(0, Math.min(1, xRatio)),
      yRatio: Math.max(0, Math.min(1, yRatio)),
      viewportX: anchorViewportX,
      viewportY: anchorViewportY,
    }
  }, [])

  const restoreScrollAnchor = useCallback((anchor: ZoomAnchor | null) => {
    const container = scrollContainerRef.current
    if (!anchor || !container) return
    const info = pagesRef.current.find((p) => p.pageNum === anchor.pageNum)
    if (!info) return
    const visualRatio = visualZoomRef.current / committedScaleRef.current
    const targetX = (info.wrapper.offsetLeft + info.wrapper.offsetWidth * anchor.xRatio) * visualRatio
    const targetY = (info.wrapper.offsetTop + info.wrapper.offsetHeight * anchor.yRatio) * visualRatio
    container.scrollLeft = Math.max(0, targetX - anchor.viewportX)
    container.scrollTop = Math.max(0, targetY - anchor.viewportY)
  }, [])

  const updateZoomShellSize = useCallback((nextVisualZoom = visualZoomRef.current) => {
    const pagesContainer = pagesContainerRef.current
    if (!pagesContainer) return
    const visualRatio = nextVisualZoom / committedScaleRef.current
    setZoomShellSize({
      width: Math.ceil(pagesContainer.offsetWidth * visualRatio),
      height: Math.ceil(pagesContainer.offsetHeight * visualRatio),
    })
  }, [])

  const applyVisualZoom = useCallback((nextZoom: number, anchor: ZoomAnchor | null) => {
    visualZoomRef.current = nextZoom
    setVisualZoom(nextZoom)
    updateZoomShellSize(nextZoom)
    requestAnimationFrame(() => restoreScrollAnchor(anchor))
  }, [restoreScrollAnchor, updateZoomShellSize])

  const renderHighlightLayers = useCallback(() => {
    if (!pagesRef.current.length) return

    for (const info of pagesRef.current) {
      const existing = info.wrapper.querySelector('.highlightLayer')
      if (existing) existing.remove()

      const pageAnnotations = annotations.filter(a => a.page === info.pageNum && a.rects.length > 0)
      if (pageAnnotations.length === 0) continue

      const highlightLayer = document.createElement("div")
      highlightLayer.className = "highlightLayer"
      highlightLayer.style.position = "absolute"
      highlightLayer.style.inset = "0"
      highlightLayer.style.zIndex = "1"
      highlightLayer.style.pointerEvents = "none"
      highlightLayer.style.mixBlendMode = "multiply"

      for (const annotation of pageAnnotations) {
        for (const rect of annotation.rects) {
          const highlightDiv = document.createElement("div")
          highlightDiv.style.position = "absolute"
          highlightDiv.style.left = `${rect.x * 100}%`
          highlightDiv.style.top = `${rect.y * 100}%`
          highlightDiv.style.width = `${rect.w * 100}%`
          highlightDiv.style.height = `${rect.h * 100}%`
          highlightDiv.style.backgroundColor = HIGHLIGHT_COLOR_MAP[annotation.color] || 'rgba(255, 235, 59, 0.35)'
          highlightDiv.dataset.annotationId = String(annotation.id)
          highlightLayer.appendChild(highlightDiv)
        }
      }
      info.wrapper.appendChild(highlightLayer)
    }
  }, [annotations])

  renderHighlightLayersRef.current = renderHighlightLayers

  const renderPage = useCallback(async (info: PageInfo, scale: number) => {
    if (!pdfDocRef.current || info.rendering || info.renderedScale === scale) return
    info.rendering = true

    const renderSeq = renderSeqRef.current

    try {
      const page = await pdfDocRef.current.getPage(info.pageNum)
      if (renderSeq !== renderSeqRef.current) return
      const viewport = page.getViewport({ scale })
      const outputScale = window.devicePixelRatio || 1

      selectionBindingsRef.current.get(info.wrapper)?.()
      selectionBindingsRef.current.delete(info.wrapper)
      info.wrapper.innerHTML = ""
      info.wrapper.style.width = `${Math.floor(viewport.width)}px`
      info.wrapper.style.height = `${Math.floor(viewport.height)}px`
      info.wrapper.style.setProperty("--scale-factor", String(scale))

      const canvas = document.createElement("canvas")
      canvas.width = Math.floor(viewport.width * outputScale)
      canvas.height = Math.floor(viewport.height * outputScale)
      canvas.className = "block shadow-lg bg-white"
      canvas.style.width = `${Math.floor(viewport.width)}px`
      canvas.style.height = `${Math.floor(viewport.height)}px`
      info.wrapper.appendChild(canvas)

      const textLayerDiv = document.createElement("div")
      textLayerDiv.className = "textLayer"
      // Keep selection inside the page box; visible overflow makes blank-area drags snap to nearby lines.
      textLayerDiv.style.overflow = "hidden"
      textLayerDiv.style.userSelect = "none"
      textLayerDiv.style.webkitUserSelect = "none"
      selectionBindingsRef.current.set(info.wrapper, bindTextLayerSelection(textLayerDiv).dispose)
      info.wrapper.appendChild(textLayerDiv)

      const ctx = canvas.getContext("2d")
      if (ctx) {
        ctx.scale(outputScale, outputScale)
        const renderTask = page.render({ canvasContext: ctx, viewport })
        renderTaskRef.current.push(renderTask)
        await renderTask.promise
      }
      if (renderSeq !== renderSeqRef.current) return

      const textContent = await page.getTextContent()
      if (renderSeq !== renderSeqRef.current) return
      await pdfjsLib.renderTextLayer({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport,
      }).promise
      textLayerDiv.style.opacity = "1"
      addTextLayerLineSpacers(textLayerDiv)
      info.renderedScale = scale
      renderHighlightLayersRef.current()
    } catch (e: any) {
      if (e?.name !== "RenderingCancelledException") console.error("Failed to render page", info.pageNum, e)
    } finally {
      info.rendering = false
    }
  }, [])

  const renderVisiblePages = useCallback(async () => {
    if (!scrollContainerRef.current || !pagesRef.current.length) return
    const scale = await computeScale()
    const renderSeq = renderSeqRef.current
    const container = scrollContainerRef.current
    const visualRatio = visualZoomRef.current / committedScaleRef.current
    const viewportTop = container.scrollTop / visualRatio
    const viewportBottom = (container.scrollTop + container.clientHeight) / visualRatio
    const visibleInfos = pagesRef.current.filter((info) => {
      const top = info.wrapper.offsetTop
      const bottom = top + info.wrapper.offsetHeight
      return bottom >= viewportTop - (container.clientHeight / visualRatio) * VISIBLE_PAGE_BUFFER &&
        top <= viewportBottom + (container.clientHeight / visualRatio) * VISIBLE_PAGE_BUFFER
    })

    // Render one page at a time so PDF painting does not monopolize the UI thread.
    for (const info of visibleInfos) {
      if (renderSeq !== renderSeqRef.current) return
      await renderPage(info, scale)
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    }
  }, [computeScale, renderPage])

  const setupPagePlaceholders = useCallback(async () => {
    if (!pdfDocRef.current || !pagesContainerRef.current) return
    const anchor = zoomAnchorRef.current ?? getScrollAnchor()
    zoomAnchorRef.current = null
    const setupSeq = ++renderSeqRef.current

    for (const task of renderTaskRef.current) {
      try { task.cancel() } catch {}
    }
    renderTaskRef.current = []

    const doc = pdfDocRef.current
    const scale = await computeScale()
    if (setupSeq !== renderSeqRef.current) return
    const pagesContainer = pagesContainerRef.current
    pagesContainer.innerHTML = ""
    pagesRef.current = []
    setCommittedScale(scale)
    committedScaleRef.current = scale
    visualZoomRef.current = scale
    setVisualZoom(scale)

    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      if (setupSeq !== renderSeqRef.current) return
      const viewport = page.getViewport({ scale })

      const wrapper = document.createElement("div")
      wrapper.className = "relative mb-3 bg-white shadow-lg"
      wrapper.dataset.page = String(i)
      wrapper.dataset.baseWidth = String(Math.floor(viewport.width))
      wrapper.dataset.baseHeight = String(Math.floor(viewport.height))
      wrapper.style.width = `${Math.floor(viewport.width)}px`
      wrapper.style.height = `${Math.floor(viewport.height)}px`
      wrapper.style.setProperty("--scale-factor", String(scale))

      pagesContainer.appendChild(wrapper)
      pagesRef.current.push({ wrapper, pageNum: i, renderedScale: null, rendering: false })
    }

    updateZoomShellSize(scale)
    restoreScrollAnchor(anchor)
    await renderVisiblePages()
  }, [computeScale, getScrollAnchor, renderVisiblePages, restoreScrollAnchor, updateZoomShellSize])

  const loadPdf = useCallback(async () => {
    const loadSeq = ++loadSeqRef.current
    const previousDoc = pdfDocRef.current
    for (const task of renderTaskRef.current) {
      try { task.cancel() } catch {}
    }
    renderTaskRef.current = []
    pdfDocRef.current = null
    if (previousDoc) {
      try { await previousDoc.destroy() } catch {}
    }
    pagesRef.current = []
    if (pagesContainerRef.current) pagesContainerRef.current.replaceChildren()
    setTotalPages(0)
    setScrollPage(1)

    try {
      const fileExists = await fsExists(filePath)
      if (!fileExists) {
        toast.error("PDF 文件无法加载", { description: "文件可能被移动或删除。" })
        return
      }

      const data = await readFile(filePath)
      const uint8 = new Uint8Array(data as unknown as ArrayBuffer)
      const doc = await pdfjsLib.getDocument({
        data: uint8 as unknown as ArrayBuffer,
        cMapUrl: `${PDFJS_ASSET_BASE}/cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `${PDFJS_ASSET_BASE}/standard_fonts/`,
        useSystemFonts: true,
      }).promise
      if (loadSeq !== loadSeqRef.current) {
        try { await doc.destroy() } catch {}
        return
      }
      pdfDocRef.current = doc
      pagesRef.current = []
      if (pagesContainerRef.current) pagesContainerRef.current.replaceChildren()
      setTotalPages(doc.numPages)
      setScrollPage(1)

      const outlineData = await doc.getOutline()
      if (outlineData) {
        setOutline(outlineData.map((item: any) => ({
          title: item.title || "",
          dest: item.dest as string | number | null,
          items: (item.items || []).map((sub: any) => ({
            title: sub.title || "",
            dest: sub.dest as string | number | null,
            items: [],
          })),
        })), "pdf")
      } else {
        setOutline([], null)
      }

      if (loadSeq === loadSeqRef.current) {
        await setupPagePlaceholders()
        const restoredPage = Math.max(1, Math.min(usePdfViewerStore.getState().currentPage, doc.numPages))
        const restoredInfo = pagesRef.current.find((p) => p.pageNum === restoredPage)
        if (restoredInfo && scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = Math.max(0, restoredInfo.wrapper.offsetTop - 20)
          setScrollPage(restoredPage)
        }
      }
    } catch (e) {
      console.error("Failed to load PDF", e)
      toast.error("PDF 文件无法加载")
    }
  }, [filePath, setTotalPages, setOutline, setupPagePlaceholders])

  useEffect(() => {
    if (filePath) loadPdf()
    return () => {
      if (scrollRenderFrameRef.current !== null) cancelAnimationFrame(scrollRenderFrameRef.current)
      loadSeqRef.current += 1
      renderSeqRef.current += 1
      for (const task of renderTaskRef.current) {
        try { task.cancel() } catch {}
      }
      renderTaskRef.current = []
      const previousDoc = pdfDocRef.current
      pdfDocRef.current = null
      if (previousDoc) {
        try { previousDoc.destroy() } catch {}
      }
      pagesRef.current = []
      selectionBindingsRef.current.forEach((dispose) => dispose())
      selectionBindingsRef.current.clear()
      if (pagesContainerRef.current) pagesContainerRef.current.replaceChildren()
    }
  // Only reload the PDF when the file changes. Zoom changes rebuild placeholders
  // separately; including loadPdf here would reload the document and reset scroll.
  }, [filePath])

  useEffect(() => {
    if (!pdfDocRef.current) return
    if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current)
    zoomTimerRef.current = setTimeout(() => {
      setupPagePlaceholders()
    }, 300)
    return () => { if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current) }
  }, [zoom, scaleMode, setupPagePlaceholders])

  // Render highlight layers when annotations change (without full page re-render)
  useEffect(() => {
    renderHighlightLayers()
  }, [renderHighlightLayers])

  // Resolve outline dest to page number using pdf doc
  const resolveDestToPage = useCallback(async (dest: string | number | null): Promise<number | null> => {
    if (!pdfDocRef.current || dest === null) return null
    const doc = pdfDocRef.current
    try {
      if (typeof dest === "string") {
        const destArray = await doc.getDestination(dest)
        if (destArray) {
          const ref = destArray[0]
          const pageIndex = await doc.getPageIndex(ref as any)
          return pageIndex + 1
        }
      } else if (typeof dest === "number") {
        return dest as number
      }
    } catch {}
    return null
  }, [])

  // Listen for annotation-jump and outline-jump events
  useEffect(() => {
    const handler = async (event: Event) => {
      const e = event as CustomEvent
      const page = e.detail?.page
      if (page && typeof page === "number") {
        const info = pagesRef.current.find(p => p.pageNum === page)
        if (info && scrollContainerRef.current) {
          const yRatio = e.detail?.yRatio ?? 0
          const targetY = info.wrapper.offsetTop + info.wrapper.offsetHeight * yRatio
          const viewportHeight = scrollContainerRef.current.clientHeight
          scrollContainerRef.current.scrollTo({
            top: targetY - viewportHeight / 3,
            behavior: "smooth"
          })
        }
      }
      // Handle dest strings from outline
      const dest = e.detail?.dest
      if (dest) {
        const pageNum = await resolveDestToPage(dest)
        if (pageNum) {
          const info = pagesRef.current.find(p => p.pageNum === pageNum)
          if (info && scrollContainerRef.current) {
            scrollContainerRef.current.scrollTo({ top: info.wrapper.offsetTop - 20, behavior: "smooth" })
          }
        }
      }
    }
    window.addEventListener("annotation-jump", handler)
    window.addEventListener("outline-jump", handler)
    return () => {
      window.removeEventListener("annotation-jump", handler)
      window.removeEventListener("outline-jump", handler)
    }
  }, [resolveDestToPage])

  useEffect(() => {
    const handler = async (event: Event) => {
      const e = event as CustomEvent<{ pages?: number; maxChars?: number; callback: (text: string) => void }>
      if (!pdfDocRef.current || !e.detail?.callback) return
      const pages = e.detail.pages ?? 3
      const maxChars = e.detail.maxChars ?? 8000
      let text = ""
      for (let i = 1; i <= Math.min(pages, pdfDocRef.current.numPages); i++) {
        const page = await pdfDocRef.current.getPage(i)
        const content = await page.getTextContent()
        text += content.items.map((item: any) => item.str || "").join(" ") + "\n"
        if (text.length >= maxChars) {
          text = text.slice(0, maxChars)
          break
        }
      }
      e.detail.callback(text)
    }

    window.addEventListener("request-pdf-summary-context", handler)
    return () => window.removeEventListener("request-pdf-summary-context", handler)
  }, [])

  // Track current page from scroll position
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      const clickedText = Boolean(target.closest(".textLayer span, .textLayer br"))
      const clickedPageBlank = Boolean(target.closest("[data-page]")) && !clickedText
      if (clickedPageBlank && !e.shiftKey) {
        window.getSelection()?.removeAllRanges()
      }
    }

    const handleScroll = () => {
      const visualRatio = visualZoomRef.current / committedScaleRef.current
      const scrollTop = container.scrollTop / visualRatio
      const viewHeight = container.clientHeight
      const centerLine = scrollTop + (viewHeight / visualRatio) / 3

      let current = 1
      for (const info of pagesRef.current) {
        const top = info.wrapper.offsetTop
        const bottom = top + info.wrapper.offsetHeight
        if (centerLine >= top && centerLine < bottom) {
          current = info.pageNum
          break
        }
        if (centerLine >= bottom) current = info.pageNum
      }
      setScrollPage(current)
      setCurrentPage(current)
      if (zoomGestureRef.current) return
      if (scrollRenderFrameRef.current !== null) return
      scrollRenderFrameRef.current = requestAnimationFrame(() => {
        scrollRenderFrameRef.current = null
        renderVisiblePages()
      })
    }

    container.addEventListener("mousedown", handleMouseDown)
    container.addEventListener("scroll", handleScroll, { passive: true })
    return () => {
      container.removeEventListener("mousedown", handleMouseDown)
      container.removeEventListener("scroll", handleScroll)
      if (scrollRenderFrameRef.current !== null) cancelAnimationFrame(scrollRenderFrameRef.current)
      scrollRenderFrameRef.current = null
    }
  }, [setCurrentPage, renderVisiblePages])

  // Modifier-wheel zoom. Normalize wheel deltas because mouse wheels can emit
  // much larger values than trackpad pinch events.
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) {
        e.preventDefault()
        const normalizedDelta = Math.max(-2, Math.min(2, -e.deltaY / 100))
        const zoomFactor = Math.pow(1.06, normalizedDelta)
        if (!zoomGestureRef.current) {
          const containerRect = container.getBoundingClientRect()
          zoomGestureRef.current = {
            anchor: getScrollAnchor(e.clientX - containerRect.left, e.clientY - containerRect.top),
            targetZoom: visualZoomRef.current,
          }
        }
        zoomGestureRef.current.targetZoom = Math.min(5, Math.max(0.25, zoomGestureRef.current.targetZoom * zoomFactor))
        zoomAnchorRef.current = zoomGestureRef.current.anchor
        usePdfViewerStore.setState({ scaleMode: 'fixed' })

        if (zoomFrameRef.current === null) {
          zoomFrameRef.current = requestAnimationFrame(() => {
            zoomFrameRef.current = null
            const gesture = zoomGestureRef.current
            if (gesture) applyVisualZoom(gesture.targetZoom, gesture.anchor)
          })
        }

        if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current)
        zoomTimerRef.current = setTimeout(() => {
          if (zoomFrameRef.current !== null) {
            cancelAnimationFrame(zoomFrameRef.current)
            zoomFrameRef.current = null
          }
          const gesture = zoomGestureRef.current
          if (gesture) applyVisualZoom(gesture.targetZoom, gesture.anchor)
          zoomGestureRef.current = null
          setZoom(visualZoomRef.current)
        }, 360)
      }
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      container.removeEventListener('wheel', handleWheel)
      if (zoomFrameRef.current !== null) cancelAnimationFrame(zoomFrameRef.current)
      zoomFrameRef.current = null
      if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current)
      zoomTimerRef.current = null
      zoomGestureRef.current = null
    }
  }, [applyVisualZoom, getScrollAnchor, setZoom])

  // Save reading progress
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      try { await updatePaper({ id: paperId, lastPage: scrollPage }) } catch {}
    }, 2000)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [scrollPage, paperId])

  // Mark as read once the user reaches the end area of the PDF.
  useEffect(() => {
    if (!currentPaper || currentPaper.id !== paperId || currentPaper.readStatus === "read" || totalPages <= 0) return
    const readThreshold = Math.max(1, Math.min(totalPages, Math.ceil(totalPages * 0.9)))
    if (scrollPage >= readThreshold) {
      usePaperStore.getState().updateReadStatus(paperId, "read").catch(() => {})
    }
  }, [currentPaper, paperId, scrollPage, totalPages])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card shrink-0">
        <span className="text-sm text-muted-foreground">第 {scrollPage} / {totalPages} 页</span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={zoomOut}><ZoomOut className="h-4 w-4" /></Button>
          <span className="text-sm text-muted-foreground w-16 text-center">
            {scaleMode === "fit-width" ? "Fit" : `${Math.round(zoom * 100)}%`}
          </span>
          <Button variant="ghost" size="icon" onClick={zoomIn}><ZoomIn className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={setFitWidth}><Maximize className="h-4 w-4" /></Button>
        </div>
      </div>

      <div ref={scrollContainerRef} className="flex-1 overflow-auto bg-muted/30" style={{ WebkitOverflowScrolling: "touch" }}>
        <div
          ref={zoomShellRef}
          className="relative mx-auto"
          style={{
            width: zoomShellSize.width ? `${zoomShellSize.width}px` : undefined,
            height: zoomShellSize.height ? `${zoomShellSize.height}px` : undefined,
          }}
        >
          <div
            ref={pagesContainerRef}
            className="absolute left-0 top-0 py-4 px-2"
            style={{
              transform: `scale(${visualZoom / committedScale})`,
              transformOrigin: 'top left',
            }}
          />
        </div>
      </div>
    </div>
  )
}

export const PdfViewer = memo(PdfViewerComponent)
