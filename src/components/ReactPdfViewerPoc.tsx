import { memo, useEffect, useState } from "react"
import { Worker, Viewer, SpecialZoomLevel, ScrollMode, type DocumentLoadEvent, type PageChangeEvent } from "@react-pdf-viewer/core"
import { defaultLayoutPlugin } from "@react-pdf-viewer/default-layout"
import { pageNavigationPlugin } from "@react-pdf-viewer/page-navigation"
import { exists as fsExists, readFile } from "@tauri-apps/plugin-fs"
import { toast } from "sonner"
import { updatePaper } from "@/lib/api"
import { usePdfViewerStore } from "@/lib/stores/pdf-viewer-store"
import "@react-pdf-viewer/core/lib/styles/index.css"
import "@react-pdf-viewer/default-layout/lib/styles/index.css"

interface ReactPdfViewerPocProps {
  paperId: string
  filePath: string
}

const PDFJS_ASSET_BASE = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174"

function ReactPdfViewerPocComponent({ paperId, filePath }: ReactPdfViewerPocProps) {
  const [fileData, setFileData] = useState<Uint8Array | null>(null)
  const [loading, setLoading] = useState(true)
  const currentPage = usePdfViewerStore((s) => s.currentPage)
  const setCurrentPage = usePdfViewerStore((s) => s.setCurrentPage)
  const setTotalPages = usePdfViewerStore((s) => s.setTotalPages)
  const setOutline = usePdfViewerStore((s) => s.setOutline)

  const defaultLayout = defaultLayoutPlugin()
  const pageNavigation = pageNavigationPlugin()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setFileData(null)

    async function loadFile() {
      try {
        const fileExists = await fsExists(filePath)
        if (!fileExists) {
          toast.error("PDF 文件无法加载", { description: "文件可能被移动或删除。" })
          return
        }
        const bytes = await readFile(filePath)
        if (!cancelled) setFileData(new Uint8Array(bytes as unknown as ArrayBuffer))
      } catch (e) {
        console.error("Failed to read PDF", e)
        toast.error("PDF 文件无法加载")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadFile()
    return () => { cancelled = true }
  }, [filePath])

  useEffect(() => {
    const handler = (event: Event) => {
      const e = event as CustomEvent<{ page?: number }>
      if (typeof e.detail?.page === "number") {
        pageNavigation.jumpToPage(Math.max(0, e.detail.page - 1))
      }
    }
    window.addEventListener("outline-jump", handler)
    window.addEventListener("annotation-jump", handler)
    return () => {
      window.removeEventListener("outline-jump", handler)
      window.removeEventListener("annotation-jump", handler)
    }
  }, [pageNavigation])

  useEffect(() => {
    const handleMouseUp = () => {
      const text = window.getSelection()?.toString().trim() || ""
      if (text) window.dispatchEvent(new CustomEvent("pdf-text-selected", { detail: { text } }))
    }
    document.addEventListener("mouseup", handleMouseUp)
    return () => document.removeEventListener("mouseup", handleMouseUp)
  }, [])

  const handleDocumentLoad = async (event: DocumentLoadEvent) => {
    setTotalPages(event.doc.numPages)
    const lastPage = Math.max(0, currentPage - 1)
    if (lastPage > 0) pageNavigation.jumpToPage(lastPage)

    try {
      const outline = await event.doc.getOutline()
      if (outline) {
        setOutline(outline.map((item: any) => ({
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
    } catch {
      setOutline([], null)
    }
  }

  const handlePageChange = (event: PageChangeEvent) => {
    const nextPage = event.currentPage + 1
    setCurrentPage(nextPage)
    updatePaper({ id: paperId, lastPage: nextPage }).catch(() => {})
  }

  if (loading) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading PDF...</div>
  }

  if (!fileData) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">PDF unavailable</div>
  }

  return (
    <div className="h-full bg-muted/30 react-pdf-viewer-poc">
      <Worker workerUrl={`${PDFJS_ASSET_BASE}/build/pdf.worker.min.js`}>
        <Viewer
          fileUrl={fileData}
          defaultScale={SpecialZoomLevel.PageWidth}
          enableSmoothScroll
          initialPage={Math.max(0, currentPage - 1)}
          plugins={[defaultLayout, pageNavigation]}
          scrollMode={ScrollMode.Vertical}
          transformGetDocumentParams={(params) => ({
            ...params,
            cMapUrl: `${PDFJS_ASSET_BASE}/cmaps/`,
            cMapPacked: true,
            standardFontDataUrl: `${PDFJS_ASSET_BASE}/standard_fonts/`,
            useSystemFonts: true,
          })}
          onDocumentLoad={handleDocumentLoad}
          onPageChange={handlePageChange}
        />
      </Worker>
    </div>
  )
}

export const ReactPdfViewerPoc = memo(ReactPdfViewerPocComponent)
