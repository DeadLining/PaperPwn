import { useState, useEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { BookOpen, Languages, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePdfViewerStore } from '@/lib/stores/pdf-viewer-store'
import { useAnnotationStore } from '@/lib/stores/annotation-store'
import { usePaperStore } from '@/lib/stores/paper-store'
import { useAiStore } from '@/lib/stores/ai-store'
import { cn } from '@/lib/utils'
import { type HighlightRect } from '@/lib/api'
import { sanitizePdfSelectionText } from '@/lib/pdf/text-layer-spacers'

const HIGHLIGHT_COLORS = [
  { name: 'Yellow', value: 'yellow', className: 'bg-yellow-400' },
  { name: 'Green', value: 'green', className: 'bg-green-400' },
  { name: 'Blue', value: 'blue', className: 'bg-blue-400' },
  { name: 'Red', value: 'red', className: 'bg-red-400' },
  { name: 'Purple', value: 'purple', className: 'bg-purple-400' },
]

interface HighlightPopupProps {
  onTranslateRequest?: (payload: { paperId: string; text: string; page: number }) => void
}

export function HighlightPopup({ onTranslateRequest }: HighlightPopupProps) {
  const [selectedText, setSelectedText] = useState('')
  const [selectedRects, setSelectedRects] = useState<HighlightRect[]>([])
  const [selectedPage, setSelectedPage] = useState(1)
  const [selectedColor, setSelectedColor] = useState('yellow')
  const [comment, setComment] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 })
  const isOpenRef = useRef(false)
  const popupRef = useRef<HTMLDivElement>(null)
  const currentPage = usePdfViewerStore((s) => s.currentPage)
  const currentPaper = usePaperStore((s) => s.currentPaper)
  const addAnnotation = useAnnotationStore((s) => s.addAnnotation)
  const explainText = useAiStore((s) => s.explainText)
  const explainLoading = useAiStore((s) => s.explainLoading)
  const translateLoading = useAiStore((s) => s.translateLoading)

  // Keep ref in sync with state
  useEffect(() => {
    isOpenRef.current = isOpen
  }, [isOpen])

  // Listen for mouseup on document to detect text selection in textLayer
  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      // If popup is open, check if click is inside popup — if not, close it
      if (isOpenRef.current) {
        if (popupRef.current && popupRef.current.contains(e.target as Node)) {
          return // Click inside popup, do nothing
        }
        // Click outside popup, close it
        setIsOpen(false)
        setSelectedText('')
        setSelectedRects([])
        setSelectedPage(1)
        setComment('')
        return
      }

      const selection = window.getSelection()
      const text = sanitizePdfSelectionText(selection?.toString() || '')
      if (text.length === 0) return

      const target = e.target as HTMLElement
      const textLayer = target.closest('.textLayer')
      if (!textLayer) return

      // Capture normalized rects relative to page wrapper
      const range = selection!.getRangeAt(0)
      const clientRects = range.getClientRects()
      const wrapper = textLayer.parentElement
      if (!wrapper) return
      const page = Number(wrapper.dataset.page) || currentPage
      const wrapperRect = wrapper.getBoundingClientRect()
      const normalizedRects: HighlightRect[] = []
      for (let i = 0; i < clientRects.length; i++) {
        const cr = clientRects[i]
        if (cr.width < 1 || cr.height < 1) continue
        const midX = cr.left + cr.width / 2
        const midY = cr.top + cr.height / 2
        const rectTarget = document.elementFromPoint(midX, midY) as HTMLElement | null
        if (rectTarget?.closest?.('[data-virtual-selection="true"]')) continue
        normalizedRects.push({
          x: (cr.left - wrapperRect.left) / wrapperRect.width,
          y: (cr.top - wrapperRect.top) / wrapperRect.height,
          w: cr.width / wrapperRect.width,
          h: cr.height / wrapperRect.height,
        })
      }

      if (normalizedRects.length === 0) return

      setSelectedText(text)
      setSelectedRects(normalizedRects)
      setSelectedPage(page)
      setComment('')
      setSelectedColor('yellow')
      setPopupPosition({ x: e.clientX, y: e.clientY })
      setIsOpen(true)
    }

    document.addEventListener('mouseup', handleMouseUp)
    return () => document.removeEventListener('mouseup', handleMouseUp)
  }, [currentPage])

  const handleSave = async () => {
    if (!currentPaper || !selectedText) return
    await addAnnotation(currentPaper.id, selectedPage, selectedText, comment, selectedColor, selectedRects)
    setIsOpen(false)
    setSelectedText('')
    setSelectedRects([])
    setSelectedPage(1)
    setComment('')
    window.getSelection()?.removeAllRanges()
  }

  const handleExplain = async () => {
    if (!currentPaper || !selectedText) return
    await explainText(currentPaper.id, selectedText, selectedPage)
    setIsOpen(false)
    setSelectedText('')
    setSelectedRects([])
    setSelectedPage(1)
    setComment('')
    window.getSelection()?.removeAllRanges()
  }

  const handleCancel = () => {
    setIsOpen(false)
    setSelectedText('')
    setSelectedRects([])
    setSelectedPage(1)
    setComment('')
  }

  const handleTranslate = async () => {
    if (!currentPaper || !selectedText) return
    onTranslateRequest?.({ paperId: currentPaper.id, text: selectedText, page: selectedPage })
    setIsOpen(false)
    setSelectedText('')
    setSelectedRects([])
    setSelectedPage(1)
    setComment('')
    window.getSelection()?.removeAllRanges()
  }

  if (!isOpen) return null

  return (
    <div
      ref={popupRef}
      className="fixed z-50 w-72 rounded-md border bg-popover p-3 text-popover-foreground shadow-md"
      style={{
        left: popupPosition.x,
        top: popupPosition.y - 10,
        transform: 'translateY(-100%)',
      }}
    >
      <div className="space-y-3">
        <div>
          <div className="text-xs text-muted-foreground line-clamp-2">
            {selectedText}
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground">Page {selectedPage}</div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Color:</span>
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c.value}
              className={cn(
                'h-5 w-5 rounded-full border-2 transition-colors',
                c.className,
                selectedColor === c.value
                  ? 'border-foreground'
                  : 'border-transparent hover:border-muted-foreground'
              )}
              onClick={() => setSelectedColor(c.value)}
              title={c.name}
            />
          ))}
        </div>

        <Input
          placeholder="Add a comment..."
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="h-8 text-xs"
        />

        <div className="flex items-center gap-2">
          <Button size="sm" className="h-7 text-xs" onClick={handleSave}>
            Save
          </Button>
          <Button size="icon" variant="secondary" className="h-7 w-7" onClick={handleExplain} disabled={explainLoading} title="中文解释">
            {explainLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <BookOpen className="h-3 w-3" />}
          </Button>
          <Button size="icon" variant="secondary" className="h-7 w-7" onClick={handleTranslate} disabled={translateLoading} title="翻译为中文">
            {translateLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Languages className="h-3 w-3" />}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
