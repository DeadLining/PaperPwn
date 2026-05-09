import { SearchX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePaperStore } from '@/lib/stores/paper-store'

export function NoSearchResult() {
  const search = usePaperStore((s) => s.search)

  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-6">
      <SearchX className="h-12 w-12 text-muted-foreground mb-4" />
      <h3 className="text-lg font-medium text-foreground">No results found</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-md">
        No papers match your current search. Try adjusting your search terms or clear the filter.
      </p>
      <Button variant="outline" className="mt-4" onClick={() => search('')}>
        Clear Search
      </Button>
    </div>
  )
}