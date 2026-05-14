import { memo, useEffect, useState, useRef, useCallback } from "react"
import { Send, Trash2, Sparkles, Loader2, RotateCcw, BookOpen, Brain, AtSign, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAiStore } from "@/lib/stores/ai-store"
import { usePdfViewerStore } from "@/lib/stores/pdf-viewer-store"
import { getOrCreateNote, updateNote } from "@/lib/api"
import { toast } from "sonner"
import { Link } from "react-router-dom"
import { MdPreview } from "md-editor-rt"
import "md-editor-rt/lib/preview.css"

interface AiChatPanelProps {
  paperId: string | number
}

/** Convert page references like "Page 3", "page 5", "p. 7" into clickable markdown links */
function linkifyPageRefs(content: string): string {
  // Match: Page 3, page 5, p.7, p. 12, Pg.3, pg. 10
  return content.replace(
    /\b([Pp](?:age|g)?\.?\s*)(\d{1,4})\b/g,
    '[$1$2](#page-$2)'
  )
}

const AssistantMarkdown = memo(function AssistantMarkdown({ content }: { content: string }) {
  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    const anchor = target.closest('a') as HTMLAnchorElement | null
    if (!anchor) return
    const href = anchor.getAttribute('href') || ''
    const match = href.match(/^#page-(\d+)$/)
    if (match) {
      e.preventDefault()
      const page = parseInt(match[1], 10)
      window.dispatchEvent(new CustomEvent('outline-jump', { detail: { page } }))
    }
  }, [])

  return (
    <div className="ai-chat-markdown" onClick={handleClick}>
      <MdPreview
        modelValue={linkifyPageRefs(content)}
        previewTheme="github"
        showCodeRowNumber={false}
        noHighlight
        codeFoldable={false}
      />
    </div>
  )
})

function AiChatPanelComponent({ paperId }: AiChatPanelProps) {
  const { config, conversations, loading, summaryLoading, explainLoading, chatLoading, loadConfig, loadConversations, clearConversations, generateSummary, explainText, aiChat } = useAiStore()
  const [input, setInput] = useState("")
  const [explainTextInput, setExplainTextInput] = useState("")
  const [showExplain, setShowExplain] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [selectedPdfText, setSelectedPdfText] = useState<string>("")
  const [contextScope, setContextScope] = useState<{ type: "auto" | "full" | "current" | "page"; page?: number }>({ type: "auto" })
  const [showContextMenu, setShowContextMenu] = useState(false)
  const totalPages = usePdfViewerStore((s) => s.totalPages)
  const visibleCurrentPage = usePdfViewerStore((s) => s.currentPage)

  // Load AI config on mount so chat works without visiting Settings first
  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  useEffect(() => {
    loadConversations(paperId)
  }, [paperId, loadConversations])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [conversations])
  useEffect(() => {
    const handleTextSelected = (e: CustomEvent<{ text: string }>) => {
      if (e.detail?.text && e.detail.text.trim().length > 0) {
        setSelectedPdfText(e.detail.text.trim())
      }
    }
    window.addEventListener("pdf-text-selected", handleTextSelected as EventListener)
    return () => window.removeEventListener("pdf-text-selected", handleTextSelected as EventListener)
  }, [])


  const describeContextScope = () => {
    if (contextScope.type === "full") return "全文"
    if (contextScope.type === "current") return `当前页 ${visibleCurrentPage}`
    if (contextScope.type === "page") return `第 ${contextScope.page} 页`
    return "自动"
  }

  const buildContext = () => {
    const currentPage = usePdfViewerStore.getState().currentPage
    const lines = [`page:${currentPage}`]
    if (contextScope.type === "full") lines.push("scope:full")
    if (contextScope.type === "current") lines.push(`scope:page:${currentPage}`)
    if (contextScope.type === "page" && contextScope.page) lines.push(`scope:page:${contextScope.page}`)
    if (selectedPdfText) lines.push(`selected:${selectedPdfText}`)
    return lines.join("\n")
  }

  const handleInputChange = (value: string) => {
    setInput(value)
    const lastToken = value.split(/\s/).pop() || ""
    setShowContextMenu(lastToken.startsWith("@"))
  }

  const handlePickContext = (scope: { type: "auto" | "full" | "current" | "page"; page?: number }) => {
    setContextScope(scope)
    setShowContextMenu(false)
    setInput((value) => value.replace(/@[^\s]*$/, "").trimStart())
  }

  const handleSend = async () => {
    if (!input.trim()) return
    const question = input.trim()
    const context = buildContext()

    setInput("")
    setSelectedPdfText("")
    setShowContextMenu(false)
    await aiChat(paperId, question, context)
  }


  const handleGenerateSummary = async () => {
    await generateSummary(paperId)
  }

  const handleExplain = async () => {
    if (!explainTextInput.trim()) return
    await explainText(paperId, explainTextInput.trim(), 0)
    setShowExplain(false)
    setExplainTextInput("")
  }

  const handleClear = () => {
    clearConversations()
  }
  const handleSaveToNote = async (response: string) => {
    try {
      const note = await getOrCreateNote(paperId)
      const nextContent = `${note.content || ""}\n\n---\n**AI Response:** ${response}\n`
      await updateNote(paperId, nextContent)
      window.dispatchEvent(new CustomEvent("note-updated", { detail: { paperId, content: nextContent } }))
      toast.success("已保存到笔记")
    } catch (e) {
      toast.error("保存到笔记失败")
    }
  }
  const handleRetry = () => {
    const lastUserMsg = conversations.filter(m => m.role === "user").pop()
    if (lastUserMsg) {
      aiChat(paperId, lastUserMsg.content)
    }
  }

  if (!config) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-4">
        <Brain className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium text-muted-foreground">未配置 AI</p>
        <p className="text-xs text-muted-foreground">请在 Settings 中配置 API Key 和模型</p>
        <Link to="/settings">
          <Button variant="outline" size="sm" className="h-7 text-xs">前往 Settings</Button>
        </Link>
      </div>
    )
  }
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">AI</span>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={handleGenerateSummary} disabled={summaryLoading} title="生成摘要">
            {summaryLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setShowExplain(!showExplain)} title="解释文本">
            <BookOpen className="h-3 w-3" />
          </Button>
        </div>
        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={handleClear}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      {showExplain && (
        <div className="px-3 py-2 border-b border-border space-y-2">
          <textarea className="w-full h-16 text-xs border border-input rounded-md bg-background text-foreground p-2 resize-none outline-none focus:ring-1 focus:ring-ring" placeholder="输入需要解释的学术文本..." value={explainTextInput} onChange={(e) => setExplainTextInput(e.target.value)} />
          <Button variant="default" size="sm" className="h-6 text-xs w-full" onClick={handleExplain} disabled={explainLoading || !explainTextInput.trim()}>
            {explainLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <BookOpen className="h-3 w-3 mr-1" />}
            中文解释
          </Button>
        </div>
      )}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {conversations.length === 0 && !loading && !chatLoading && (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <Sparkles className="h-6 w-6 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">向 AI 提问关于这篇论文的问题</p>
              <p className="text-xs text-muted-foreground">或点击 ✦ 生成摘要</p>
            </div>
          )}
          {(selectedPdfText || contextScope.type !== "auto") && (
            <div className="rounded-lg px-3 py-2 text-xs bg-muted text-muted-foreground border border-border space-y-1">
              {contextScope.type !== "auto" && (
                <div className="flex items-center justify-between gap-2">
                  <span><span className="font-medium">上下文：</span>{describeContextScope()}</span>
                  <button className="text-muted-foreground hover:text-foreground" onClick={() => setContextScope({ type: "auto" })} title="清除上下文"><X className="h-3 w-3" /></button>
                </div>
              )}
              {selectedPdfText && (
                <div>
                  <span className="font-medium">选中的PDF文本：</span>
                  {selectedPdfText.length > 100 ? selectedPdfText.substring(0, 100) + "..." : selectedPdfText}
                </div>
              )}
            </div>
          )}
          {conversations.map((msg, i) => (
            <div key={i} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
              <div className={`rounded-lg px-3 py-2 text-xs max-w-[92%] ${msg.role === "user" ? "bg-primary text-primary-foreground whitespace-pre-wrap" : msg.role === "error" ? "bg-red-100 text-red-700 border border-red-300 whitespace-pre-wrap" : "bg-muted/70 text-foreground border border-border/70"}`}>
                {msg.role === "assistant" ? (
                  <AssistantMarkdown content={msg.content} />
                ) : (
                  msg.content
                )}
              </div>
              {msg.role === "assistant" && (
                <Button variant="ghost" size="sm" className="h-5 text-xs mt-1" onClick={() => handleSaveToNote(msg.content)}>Save to Note</Button>
              )}
              {msg.role === "error" && (
                <Button variant="ghost" size="sm" className="h-5 text-xs mt-1 text-red-500" onClick={handleRetry}>
                  <RotateCcw className="h-3 w-3 mr-1" /> Retry
                </Button>
              )}
            </div>
          ))}
          {(loading || chatLoading || summaryLoading || explainLoading) && (
            <div className="flex items-center gap-2 px-3 py-2">
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Thinking...</p>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>
      <div className="border-t border-border p-2 relative">
        {showContextMenu && (
          <div className="absolute bottom-12 left-2 right-2 z-20 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg p-1 text-xs">
            <div className="max-h-[180px] overflow-y-auto overscroll-contain pr-1">
              <button className="w-full text-left px-2 py-1.5 rounded hover:bg-accent" onClick={() => handlePickContext({ type: "full" })}>@全文 - 使用整篇论文检索</button>
              <button className="w-full text-left px-2 py-1.5 rounded hover:bg-accent" onClick={() => handlePickContext({ type: "current" })}>@当前页 - 只看当前 Page {visibleCurrentPage}</button>
              {Array.from({ length: totalPages || 0 }, (_, i) => i + 1).map((page) => (
                <button key={page} className="w-full text-left px-2 py-1.5 rounded hover:bg-accent" onClick={() => handlePickContext({ type: "page", page })}>@第{page}页</button>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <Button variant={contextScope.type === "auto" ? "ghost" : "secondary"} size="icon" className="h-7 w-7 shrink-0" onClick={() => setShowContextMenu((v) => !v)} title={`上下文：${describeContextScope()}`}>
            <AtSign className="h-3 w-3" />
          </Button>
          <input type="text" className="flex-1 px-3 py-1.5 text-xs border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring" placeholder="输入问题，或 @ 选择全文/页码..." value={input} onChange={(e) => handleInputChange(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) handleSend(); if (e.key === "Escape") setShowContextMenu(false) }} disabled={chatLoading || summaryLoading} />
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSend} disabled={chatLoading || !input.trim()}>
            <Send className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  )
}

export const AiChatPanel = memo(AiChatPanelComponent)
