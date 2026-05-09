import { useState, useEffect } from 'react'
import { flushSync } from 'react-dom'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { type Paper, updatePaper, aiExtractMetadata } from '@/lib/api'
import { Sparkles } from 'lucide-react'
import { toast } from 'sonner'

interface MetadataEditorDialogProps {
  paper: Paper | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}

export function MetadataEditorDialog({
  paper,
  open,
  onOpenChange,
  onSaved,
}: MetadataEditorDialogProps) {
  const [title, setTitle] = useState('')
  const [authors, setAuthors] = useState('')
  const [year, setYear] = useState('')
  const [abstract, setAbstract] = useState('')
  const [doi, setDoi] = useState('')
  const [saving, setSaving] = useState(false)
  const [aiExtracting, setAiExtracting] = useState(false)

  useEffect(() => {
    if (paper) {
      setTitle(paper.title)
      setAuthors(paper.authors)
      setYear(paper.year?.toString() ?? '')
      setAbstract(paper.abstract)
      setDoi(paper.doi)
    }
  }, [paper])

  const handleSave = async () => {
    if (!paper) return
    setSaving(true)
    try {
      await updatePaper({
        id: paper.id,
        title,
        authors,
        year: year ? parseInt(year, 10) : null,
        abstract,
        doi,
      })
      onSaved?.()
      onOpenChange(false)
    } catch (err) {
      console.error('Failed to save metadata:', err)
    } finally {
      setSaving(false)
    }
  }

  const applyPaper = (updated: Paper) => {
    setTitle(updated.title)
    setAuthors(updated.authors)
    setYear(updated.year?.toString() ?? '')
    setAbstract(updated.abstract)
    setDoi(updated.doi)
  }

  const handleAiExtract = () => {
    if (!paper) return
    setAiExtracting(true)
    toast.info('AI 正在提取元数据...')
    // Wait two animation frames so browser paints the disabled state before heavy work
    requestAnimationFrame(() => {
      requestAnimationFrame(async () => {
        try {
          const updated = await aiExtractMetadata(String(paper.id))
          applyPaper(updated)
          onSaved?.()
          toast.success('AI 元数据提取完成')
        } catch (err) {
          console.error('Failed to AI-extract metadata:', err)
          toast.error('AI 提取失败: ' + String(err))
        } finally {
          setAiExtracting(false)
        }
      })
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Edit Metadata</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <label className="text-sm font-medium text-foreground">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium text-foreground">Authors</label>
            <Input value={authors} onChange={(e) => setAuthors(e.target.value)} />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium text-foreground">Year</label>
            <Input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium text-foreground">Abstract</label>
            <Textarea
              value={abstract}
              onChange={(e) => setAbstract(e.target.value)}
              rows={4}
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium text-foreground">DOI</label>
            <Input value={doi} onChange={(e) => setDoi(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="secondary"
            onClick={handleAiExtract}
            disabled={aiExtracting}
          >
            <Sparkles className={`h-4 w-4 ${aiExtracting ? 'animate-pulse' : ''}`} />
            {aiExtracting ? 'AI Extracting...' : 'AI Extract'}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
