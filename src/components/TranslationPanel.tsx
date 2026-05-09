import { useEffect, useState } from "react"
import { Languages, Loader2, Copy, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAiStore } from "@/lib/stores/ai-store"
import { getOrCreateNote, updateNote } from "@/lib/api"
import { toast } from "sonner"

interface TranslationPanelProps {
  paperId: string | number
  incomingRequest?: {
    paperId: string | number
    text: string
    page: number
    nonce: number
  } | null
}

export function TranslationPanel({ paperId, incomingRequest }: TranslationPanelProps) {
  const { translateLoading, translateText } = useAiStore()
  const [inputText, setInputText] = useState("")
  const [page, setPage] = useState(0)
  const [translationResult, setTranslationResult] = useState<string | null>(null)

  useEffect(() => {
    if (!incomingRequest?.text || incomingRequest.paperId !== paperId) return

    let cancelled = false
    setInputText(incomingRequest.text)
    setPage(incomingRequest.page ?? 0)

    const run = async () => {
      try {
        const result = await translateText(paperId, incomingRequest.text, incomingRequest.page ?? 0)
        if (!cancelled) setTranslationResult(result)
      } catch {
        // Error toast is handled in ai-store
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [incomingRequest, paperId, translateText])

  const handleTranslate = async () => {
    if (!inputText.trim()) {
      toast.error("请输入需要翻译的文本")
      return
    }
    try {
      const result = await translateText(paperId, inputText.trim(), page)
      setTranslationResult(result)
    } catch (e) {
      // Error is handled by ai-store toast
    }
  }

  const handleSaveToNote = async () => {
    if (translationResult) {
      try {
        const note = await getOrCreateNote(paperId)
        const entry = `**Translation (p.${page}):** ${inputText}\n> ${translationResult}`
        const nextContent = `${note.content || ""}\n\n---\n${entry}\n`
        await updateNote(paperId, nextContent)
        window.dispatchEvent(new CustomEvent("note-updated", { detail: { paperId, content: nextContent } }))
        toast.success("翻译已保存到笔记")
      } catch (e) {
        toast.error("保存到笔记失败")
      }
    }
  }

  const handleCopy = () => {
    if (translationResult) {
      navigator.clipboard.writeText(translationResult)
      toast.success("翻译已复制到剪贴板")
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border">
        <Languages className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Translation</span>
      </div>

      <div className="p-3 space-y-2">
        <textarea className="w-full h-20 text-xs border border-input rounded-md bg-background text-foreground p-2 resize-none outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground" placeholder="输入需要翻译的文本..." value={inputText} onChange={(e) => setInputText(e.target.value)} />
        <div className="flex items-center gap-2">
          <input type="number" className="w-16 px-2 py-1 text-xs border border-input rounded-md bg-background text-foreground outline-none" placeholder="页码" value={page} onChange={(e) => setPage(parseInt(e.target.value) || 0)} min={0} />
          <Button variant="default" size="sm" className="h-7 text-xs flex-1" onClick={handleTranslate} disabled={translateLoading || !inputText.trim()}>
            {translateLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Languages className="h-3 w-3 mr-1" />}
            翻译为中文
          </Button>
        </div>
      </div>

      {translationResult && (
        <ScrollArea className="flex-1 px-3">
          <div className="rounded-md border border-border bg-accent/50 p-3">
            <p className="text-xs text-foreground leading-relaxed">{translationResult}</p>
          </div>
          <div className="flex gap-2 mt-2 mb-3">
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={handleCopy}>
              <Copy className="h-3 w-3 mr-1" /> 复制
            </Button>
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={handleSaveToNote}>
              <FileText className="h-3 w-3 mr-1" /> 保存到笔记
            </Button>
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
