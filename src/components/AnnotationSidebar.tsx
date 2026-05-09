import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAnnotationStore } from '@/lib/stores/annotation-store'
import { usePaperStore } from '@/lib/stores/paper-store'
import { cn } from '@/lib/utils'
import { Trash2, Pencil, Copy } from 'lucide-react'

const COLOR_MAP: Record<string, string> = {
  yellow: 'bg-yellow-400',
  green: 'bg-green-400',
  blue: 'bg-blue-400',
  red: 'bg-red-400',
  purple: 'bg-purple-400',
}

export function AnnotationSidebar() {
  const annotations = useAnnotationStore((s) => s.annotations)
  const loadAnnotations = useAnnotationStore((s) => s.loadAnnotations)
  const removeAnnotation = useAnnotationStore((s) => s.removeAnnotation)
  const editAnnotation = useAnnotationStore((s) => s.editAnnotation)
  const exportMarkdown = useAnnotationStore((s) => s.exportMarkdown)
  const currentPaper = usePaperStore((s) => s.currentPaper)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editComment, setEditComment] = useState('')
  const [editColor, setEditColor] = useState('')

  const handleJump = (annotation: { page: number; rects: { y: number }[] }) => {
    const yRatio = annotation.rects.length > 0 ? annotation.rects[0].y : 0
    window.dispatchEvent(new CustomEvent('annotation-jump', { detail: { page: annotation.page, yRatio } }))
  }

  const handleStartEdit = (id: string, comment: string, color: string) => {
    setEditingId(id)
    setEditComment(comment)
    setEditColor(color)
  }

  const handleSaveEdit = async (id: string) => {
    if (!currentPaper) return
    await editAnnotation(currentPaper.id, id, editComment, editColor)
    setEditingId(null)
  }

  const handleCancelEdit = () => {
    setEditingId(null)
  }

  const handleDelete = async (id: string) => {
    if (!currentPaper) return
    await removeAnnotation(currentPaper.id, id)
    await loadAnnotations(currentPaper.id)
  }

  const handleExport = async () => {
    const md = exportMarkdown()
    await navigator.clipboard.writeText(md)
  }

  if (annotations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
        <p className="text-xs">No annotations yet</p>
        <p className="text-xs mt-1">Select text in the PDF to create highlights</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {annotations.map((a) => (
            <div
              key={a.id}
              className="group rounded-md border border-border p-2 hover:bg-accent/50 transition-colors"
            >
              {editingId === a.id ? (
                /* Inline edit mode */
                <div className="space-y-2">
                  <Input
                    value={editComment}
                    onChange={(e) => setEditComment(e.target.value)}
                    className="h-7 text-xs"
                    placeholder="Edit comment..."
                  />
                  <div className="flex items-center gap-1">
                    {['yellow', 'green', 'blue', 'red', 'purple'].map((c) => (
                      <button
                        key={c}
                        className={cn(
                          'h-4 w-4 rounded-full border transition-colors',
                          COLOR_MAP[c] || 'bg-gray-400',
                          editColor === c ? 'border-foreground' : 'border-transparent'
                        )}
                        onClick={() => setEditColor(c)}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" className="h-6 text-xs" onClick={() => handleSaveEdit(a.id)}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={handleCancelEdit}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                /* Display mode */
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'h-3 w-3 rounded-full',
                        COLOR_MAP[a.color] || 'bg-gray-400'
                      )}
                    />
                    <span className="text-xs text-muted-foreground">Page {a.page}</span>
                  </div>
                  <p
                    className="text-xs text-foreground line-clamp-2 cursor-pointer hover:text-primary"
                    onClick={() => handleJump(a)}
                  >
                    {a.highlightedText}
                  </p>
                  {a.comment && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{a.comment}</p>
                  )}
                  <div className="hidden group-hover:flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 w-5 p-0"
                      onClick={() => handleStartEdit(a.id, a.comment, a.color)}
                      title="Edit"
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 w-5 p-0"
                      onClick={() => handleDelete(a.id)}
                      title="Delete"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
      <div className="p-2 border-t border-border">
        <Button
          size="sm"
          variant="outline"
          className="w-full h-7 text-xs"
          onClick={handleExport}
        >
          <Copy className="h-3 w-3 mr-1" />
          Export as Markdown
        </Button>
      </div>
    </div>
  )
}