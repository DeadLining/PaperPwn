import { useEffect, useState, useRef, useCallback } from "react"
import { Copy, Loader2, Eye, Edit3 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { getOrCreateNote, updateNote } from "@/lib/api"
import { toast } from "sonner"
import { MdPreview } from "md-editor-rt"
import "md-editor-rt/lib/preview.css"

interface NoteEditorProps {
  paperId: string | number
}

const READING_TEMPLATE = `## 背景

## 研究问题

## 方法

## 实验

## 结论

## 局限

---

`

export function NoteEditor({ paperId }: NoteEditorProps) {
  const [content, setContent] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(true)
  const [previewOnly, setPreviewOnly] = useState(false)
  const contentRef = useRef("")
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    contentRef.current = content
  }, [content])

  const triggerDebounceSave = useCallback((newContent: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      updateNote(paperId, newContent)
        .then(() => setSaved(true))
        .catch((e) => {
          toast.error("笔记保存失败")
          setError(String(e))
        })
    }, 500)
  }, [paperId])

  const appendToNote = useCallback((markdown: string) => {
    const newContent = contentRef.current + markdown
    setContent(newContent)
    contentRef.current = newContent
    setSaved(false)
    triggerDebounceSave(newContent)
  }, [triggerDebounceSave])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    getOrCreateNote(paperId)
      .then((note) => {
        if (cancelled) return
        const initialContent = note.content.trim() === "" ? READING_TEMPLATE : note.content
        setContent(initialContent)
        contentRef.current = initialContent
        setSaved(true)
        setLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        setError(String(e))
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [paperId])

  useEffect(() => {
    const handleAnnotationExcerpt = (event: Event) => {
      const e = event as CustomEvent<{ text: string; page: number }>
      appendToNote(`\n\n---\n**Highlight (p.${e.detail.page}):** ${e.detail.text}\n`)
    }

    const handleAiResponseToNote = (event: Event) => {
      const e = event as CustomEvent<{ response: string }>
      appendToNote(`\n\n---\n**AI Response:** ${e.detail.response}\n`)
    }

    const handleNoteUpdated = (event: Event) => {
      const e = event as CustomEvent<{ paperId: number; content: string }>
      if (e.detail.paperId !== paperId) return
      setContent(e.detail.content)
      contentRef.current = e.detail.content
      setSaved(true)
    }

    window.addEventListener("annotation-excerpt", handleAnnotationExcerpt)
    window.addEventListener("ai-response-to-note", handleAiResponseToNote)
    window.addEventListener("note-updated", handleNoteUpdated)
    return () => {
      window.removeEventListener("annotation-excerpt", handleAnnotationExcerpt)
      window.removeEventListener("ai-response-to-note", handleAiResponseToNote)
      window.removeEventListener("note-updated", handleNoteUpdated)
    }
  }, [appendToNote, paperId])

  const handleChange = (value: string) => {
    setContent(value)
    contentRef.current = value
    setSaved(false)
    triggerDebounceSave(value)
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(content)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <p className="text-sm text-red-500">{error}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1 border-b border-border">
        <span className="text-xs text-muted-foreground">
          {saved ? "已保存" : "未保存..."}
        </span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={handleCopy} title="复制笔记">
            <Copy className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setPreviewOnly((v) => !v)} title={previewOnly ? "切换到编辑模式" : "切换到预览模式"}>
            {previewOnly ? <Edit3 className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          </Button>
        </div>
      </div>
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
        {previewOnly ? (
          <ScrollArea className="h-full">
            <div className="p-4">
            <MdPreview modelValue={content} previewTheme="github" />
            </div>
          </ScrollArea>
        ) : (
          <textarea
            value={content}
            onChange={(e) => handleChange(e.target.value)}
            className="h-full w-full resize-none border-0 bg-background p-3 text-sm leading-6 outline-none"
            placeholder="Write your notes in Markdown..."
            spellCheck={false}
          />
        )}
      </div>
    </div>
  )
}
