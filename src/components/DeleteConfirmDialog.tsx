import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { deletePaper } from '@/lib/api'
import { usePaperStore } from '@/lib/stores/paper-store'

interface DeleteConfirmDialogProps {
  paperId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DeleteConfirmDialog({
  paperId,
  open,
  onOpenChange,
}: DeleteConfirmDialogProps) {
  const loadPapers = usePaperStore((s) => s.loadPapers)

  const handleDelete = async () => {
    if (paperId === null) return
    try {
      await deletePaper(paperId)
      await loadPapers()
      onOpenChange(false)
    } catch (err) {
      console.error('Failed to delete paper:', err)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Delete Paper</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this paper? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
