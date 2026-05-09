import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText } from 'lucide-react'
import { usePaperStore } from '@/lib/stores/paper-store'
import { cn } from '@/lib/utils'
import { getRecentPapers, type RecentPaper } from '@/lib/api'

function truncateTitle(title: string, maxLen: number = 28): string {
  if (title.length <= maxLen) return title
  return title.slice(0, maxLen) + '...'
}

export function RecentPapers() {
  const [recentPapers, setRecentPapers] = useState<RecentPaper[]>([])
  const currentPaper = usePaperStore((s) => s.currentPaper)
  const setCurrentPaper = usePaperStore((s) => s.setCurrentPaper)
  const loadPapers = usePaperStore((s) => s.loadPapers)
  const navigate = useNavigate()

  const loadRecentPapers = useCallback(async () => {
    try {
      setRecentPapers(await getRecentPapers(5))
    } catch (e) {
      console.error('Failed to load recent papers', e)
    }
  }, [])

  useEffect(() => {
    loadRecentPapers()
    window.addEventListener('paper-opened', loadRecentPapers)
    return () => window.removeEventListener('paper-opened', loadRecentPapers)
  }, [loadRecentPapers])

  const handleOpenPaper = async (paperId: string) => {
    await loadPapers()
    setCurrentPaper(paperId)
    navigate(`/reader/${paperId}`)
  }

  if (recentPapers.length === 0) {
    return null
  }

  return (
    <div className="px-2">
      <p className="text-xs font-medium text-muted-foreground px-2 mb-1">Recent Papers</p>
      <div className="space-y-1">
        {recentPapers.map((paper) => (
          <button
            key={paper.id}
            onClick={() => handleOpenPaper(paper.id)}
            className={cn(
              'flex items-start gap-2 px-2 py-1.5 rounded-md text-sm transition-colors w-full text-left',
              currentPaper?.id === paper.id
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <FileText className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium leading-tight">
                {truncateTitle(paper.title)}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {paper.authors || (paper.year ? String(paper.year) : 'No author')}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
