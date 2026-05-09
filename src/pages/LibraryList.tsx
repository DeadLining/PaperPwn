import { useState, useCallback, useRef, useEffect } from "react"
import { listen } from "@tauri-apps/api/event"
import { useNavigate } from "react-router-dom"
import { BookOpen, Search, Plus, Filter, SortAsc, Upload, FolderOpen, Folder, Edit, X, Link, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { usePaperStore } from "@/lib/stores/paper-store"
import { importPaperFromUrl, importPapers, getFolders, createFolder, updatePaper, type Paper, type ImportResult, type FolderMetadata } from "@/lib/api"
import { MetadataEditorDialog } from "@/components/MetadataEditorDialog"
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog"
import { NoSearchResult } from "@/components/NoSearchResult"
import { open } from "@tauri-apps/plugin-dialog"
import { toast } from "sonner"

export function LibraryList() {
  const navigate = useNavigate()
  const {
    papers, tags, loading, searchQuery, sortKey, selectedReadStatus, selectedTag,
    loadPapers, search, setSortKey, setSelectedTag, setSelectedReadStatus,
    toggleStarred, loadTags, setCurrentPaper,
  } = usePaperStore()

  const [isDragOver, setIsDragOver] = useState(false)
  const [importing, setImporting] = useState(false)
  const [editingPaper, setEditingPaper] = useState<Paper | null>(null)
  const [metadataDialogOpen, setMetadataDialogOpen] = useState(false)
  const [deletePaperId, setDeletePaperId] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [urlDialogOpen, setUrlDialogOpen] = useState(false)
  const [paperUrl, setPaperUrl] = useState("")
  const [folders, setFolders] = useState<FolderMetadata[]>([])
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [folderDialogOpen, setFolderDialogOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [draggedPaperId, setDraggedPaperId] = useState<string | null>(null)
  const [justDropped, setJustDropped] = useState(false)
  const [folderSelectPaperId, setFolderSelectPaperId] = useState<string | null>(null)
  const [folderSelectDialogOpen, setFolderSelectDialogOpen] = useState(false)

  // Search debounce
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleSearchChange = useCallback((value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      search(value)
    }, 300)
  }, [search])

  // Load data on mount
  useEffect(() => {
    loadPapers()
    loadTags()
    loadFolders()
  }, [loadPapers, loadTags])

  const loadFolders = async () => {
    try {
      const folderList = await getFolders()
      setFolders(folderList)
    } catch (e) {
      console.error('Failed to load folders:', e)
    }
  }

  const handleCardClick = useCallback(async (paperId: string) => {
    setCurrentPaper(paperId)
    navigate("/reader/" + paperId)
  }, [setCurrentPaper, navigate])

  // Drag-and-drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    // Only handle external file drags (for PDF import), not internal paper card drags
    if (!e.dataTransfer.types.includes("Files")) return
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  // Listen for Tauri native drag-drop events (browser dataTransfer.files is empty in Tauri)
  useEffect(() => {
    let cancelled = false
    const unlisteners: (() => void)[] = []

    async function setup() {
      const unlistenDrop = await listen<{ paths: string[]; position: { x: number; y: number } }>('tauri://drag-drop', async (event) => {
        if (cancelled) return
        setIsDragOver(false)
        const paths = event.payload.paths.filter(p => p.toLowerCase().endsWith('.pdf'))
        if (paths.length === 0) {
          toast.info('Only PDF files can be imported')
          return
        }
        setImporting(true)
        try {
          const results: ImportResult[] = await importPapers(paths)
          const succeeded = results.filter(r => r.success).length
          const duplicated = results.filter(r => r.error?.includes('duplicate') || r.error?.includes('already')).length
          const failed = results.filter(r => !r.success).length
          if (succeeded > 0) toast.success(`Imported ${succeeded} paper(s) successfully`)
          if (duplicated > 0) toast.warning(`${duplicated} paper(s) were duplicates`)
          if (failed > 0 && succeeded === 0) toast.error(`${failed} paper(s) failed to import`)
          await loadPapers()
          await loadTags()
        } catch (err) {
          toast.error('Import failed: ' + String(err))
        } finally {
          setImporting(false)
        }
      })
      unlisteners.push(unlistenDrop)

      const unlistenHover = await listen<{ position: { x: number; y: number } }>('tauri://drag-hover', () => {
        if (!cancelled) setIsDragOver(true)
      })
      unlisteners.push(unlistenHover)

      const unlistenLeave = await listen('tauri://drag-leave', () => {
        if (!cancelled) setIsDragOver(false)
      })
      unlisteners.push(unlistenLeave)
    }

    setup()
    return () => {
      cancelled = true
      unlisteners.forEach(fn => fn())
    }
  }, [loadPapers, loadTags])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    // Browser drop is handled by Tauri native events above
  }, [])

  // Single file import
  const handleSingleImport = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
        title: "Select PDF files",
      })
      if (!selected) return

      setImporting(true)
      const paths = Array.isArray(selected) ? selected : [selected as string]
      const results: ImportResult[] = await importPapers(paths)
      const succeeded = results.filter(r => r.success).length
      const duplicated = results.filter(r => r.error?.includes("duplicate") || r.error?.includes("already")).length
      const failed = results.filter(r => !r.success).length

      if (succeeded > 0) toast.success(`Imported ${succeeded} paper(s) successfully`)
      if (duplicated > 0) toast.warning(`${duplicated} paper(s) were duplicates`)
      if (failed > 0 && succeeded === 0) toast.error(`${failed} paper(s) failed to import`)
      await loadPapers()
      await loadTags()
    } catch (err) {
      toast.error("Import failed: " + String(err))
    } finally {
      setImporting(false)
    }
  }

  // Batch import via folder dialog
  const handleBatchImport = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select folder containing PDFs",
      })
      if (!selected) return

      setImporting(true)
      const results: ImportResult[] = await importPapers([selected as string])
      const succeeded = results.filter(r => r.success).length
      const duplicated = results.filter(r => r.error?.includes("duplicate") || r.error?.includes("already")).length
      const failed = results.filter(r => !r.success).length

      if (succeeded > 0) toast.success(`Imported ${succeeded} paper(s) successfully`)
      if (duplicated > 0) toast.warning(`${duplicated} paper(s) were duplicates`)
      if (failed > 0 && succeeded === 0) toast.error(`${failed} paper(s) failed to import`)
      if (results.length === 0) toast.info("No PDFs found in selected folder")
      await loadPapers()
      await loadTags()
    } catch (err) {
      toast.error("Batch import failed: " + String(err))
    } finally {
      setImporting(false)
    }
  }

  const handleUrlImport = async () => {
    const url = paperUrl.trim()
    if (!url) {
      toast.error("Please enter a paper URL or arXiv ID")
      return
    }
    try {
      setImporting(true)
      const result = await importPaperFromUrl(url)
      if (result.success) {
        toast.success("Paper downloaded and imported")
        setPaperUrl("")
        setUrlDialogOpen(false)
        await loadPapers()
        await loadTags()
      } else {
        toast.error(result.error || "Import failed")
      }
    } catch (err) {
      toast.error("URL import failed: " + String(err))
    } finally {
      setImporting(false)
    }
  }

  const handleCreateFolder = async () => {
    const name = newFolderName.trim()
    if (!name) {
      toast.error("Folder name cannot be empty")
      return
    }
    try {
      await createFolder(name)
      toast.success("Folder created")
      setNewFolderName("")
      setFolderDialogOpen(false)
      await loadFolders()
    } catch (e) {
      toast.error("Failed to create folder: " + String(e))
    }
  }

  const handleEditMetadata = (paper: Paper) => {
    setEditingPaper(paper)
    setMetadataDialogOpen(true)
  }

  const handleDelete = (paperId: string) => {
    setDeletePaperId(paperId)
    setDeleteDialogOpen(true)
  }

  const handleReadStatusChange = async (paperId: string, status: string) => {
    await usePaperStore.getState().updateReadStatus(paperId, status)
  }

  // Filter papers based on folder view
  const filteredPapers = currentFolderId
    ? papers.filter(p => p.folderIds?.includes(currentFolderId))
    : papers.filter(p => !p.folderIds || p.folderIds.length === 0)

  const handleMoveToFolder = (paperId: string) => {
    setFolderSelectPaperId(paperId)
    setFolderSelectDialogOpen(true)
  }

  const handleFolderSelect = async (folderId: string | null) => {
    if (!folderSelectPaperId) return
    try {
      await updatePaper({ id: folderSelectPaperId, folderIds: folderId ? [folderId] : [] })
      toast.success(folderId ? "Paper moved to folder" : "Paper moved to unsorted")
      await loadPapers()
      await loadFolders()
      setFolderSelectDialogOpen(false)
      setFolderSelectPaperId(null)
    } catch (err) {
      toast.error("Failed to move paper: " + String(err))
    }
  }

  // Drag handlers for papers
  const handlePaperDragStart = (e: React.DragEvent, paperId: string) => {
    console.log("Drag started for paper:", paperId)
    e.dataTransfer.setData("application/x-paper-id", paperId)
    e.dataTransfer.effectAllowed = "move"
  }

  // Drop handlers for folders
  const handleFolderDragOver = (e: React.DragEvent) => {
    console.log("Folder dragOver")
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = "move"
  }

  const handleFolderDrop = async (e: React.DragEvent, folderId: string) => {
    e.preventDefault()
    e.stopPropagation()
    console.log("Folder drop on:", folderId)
    const paperId = e.dataTransfer.getData("application/x-paper-id")
    console.log("Paper ID from data:", paperId)
    if (!paperId) {
      console.error("No paper ID found in drag data")
      return
    }
    try {
      await updatePaper({ id: paperId, folderIds: [folderId] })
      toast.success("Paper moved to folder")
      await loadPapers()
      await loadFolders()
    } catch (err) {
      toast.error("Failed to move paper: " + String(err))
      console.error("Update paper error:", err)
    }
  }

  return (
    <div
      className="relative flex flex-col h-full"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header / Toolbar */}
      <header className="flex items-center justify-between gap-2 p-4 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          {currentFolderId && (
            <Button variant="ghost" size="sm" onClick={() => setCurrentFolderId(null)}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          )}
          <h2 className="text-lg font-semibold text-foreground truncate">
            {currentFolderId ? folders.find(f => f.id === currentFolderId)?.name || "Folder" : "My Library"}
          </h2>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 px-2 py-1">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              type="text"
              placeholder="Search..."
              className="h-8 w-28"
              defaultValue={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Filter className="h-4 w-4" />
                Filter
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSelectedReadStatus(null)}>
                All statuses
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectedReadStatus("unread")}>
                Unread
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectedReadStatus("reading")}>
                Reading
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectedReadStatus("read")}>
                Read
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {tags.map(tag => (
                <DropdownMenuItem key={tag.id} onClick={() => setSelectedTag(tag.name)}>
                  Tag: {tag.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onClick={() => setSelectedTag(null)}>
                All tags
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <SortAsc className="h-4 w-4" />
                Sort
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSortKey("importTime")}>
                Import time {sortKey === "importTime" && "\u2713"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortKey("year")}>
                Year {sortKey === "year" && "\u2713"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortKey("title")}>
                Title {sortKey === "title" && "\u2713"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="outline" size="sm" onClick={handleSingleImport} disabled={importing}>
            <Upload className="h-4 w-4" />
            {importing ? "Importing..." : "Add PDF"}
          </Button>

          <Button variant="outline" size="sm" onClick={handleBatchImport} disabled={importing}>
            <FolderOpen className="h-4 w-4" />
            {importing ? "Importing..." : "Import Folder"}
          </Button>

          <Button variant="outline" size="sm" onClick={() => setFolderDialogOpen(true)} disabled={importing}>
            <Folder className="h-4 w-4" />
            New Folder
          </Button>

          <Button variant="outline" size="sm" onClick={() => setUrlDialogOpen(true)} disabled={importing}>
            <Link className="h-4 w-4" />
            From URL
          </Button>
        </div>
      </header>

      {/* Active filter indicators */}
      {(selectedTag || selectedReadStatus) && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
          {selectedReadStatus && (
            <Badge variant="secondary" className="text-xs">
              Status: {selectedReadStatus}
              <button className="ml-1" onClick={() => setSelectedReadStatus(null)}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {selectedTag && (
            <Badge variant="secondary" className="text-xs">
              Tag: {selectedTag}
              <button className="ml-1" onClick={() => setSelectedTag(null)}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
        </div>
      )}

      {/* Drop Zone Overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center border-2 border-dashed border-primary bg-primary/10 rounded-lg m-4 pointer-events-none">
          <div className="text-center">
            <Upload className="h-12 w-12 text-primary mb-2" />
            <p className="text-lg font-medium text-primary">Drop PDF files here to import</p>
            <p className="text-sm text-muted-foreground mt-1">Or use the Add PDF / Import Folder buttons</p>
          </div>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground">Loading...</p>
            </div>
          )}

          {!loading && papers.length === 0 && searchQuery && (
            <NoSearchResult />
          )}

          {!loading && papers.length === 0 && !searchQuery && (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <BookOpen className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground">No papers yet</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                Start building your library by importing PDFs. Drag & drop files here,
                or use the Import button to batch import.
              </p>
              <Button className="mt-4" onClick={handleSingleImport}>
                <Plus className="h-4 w-4" />
                Import Your First Paper
              </Button>
            </div>
          )}

          {!loading && papers.length > 0 && (
            <div className="flex flex-col h-full">
              {/* Folders section - fixed at top */}
              {!currentFolderId && folders.length > 0 && (
                <div
                  className="p-4 pb-2 border-b border-border"
                  onDragOver={handleFolderDragOver}
                >
                  <section>
                    <h3 className="text-sm font-medium text-muted-foreground mb-3">Folders</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {folders.map(folder => (
                        <Card
                          key={folder.id}
                          className="cursor-pointer hover:bg-accent/50 transition-colors"
                          onClick={() => setCurrentFolderId(folder.id)}
                          onDragOver={handleFolderDragOver}
                          onDrop={(e) => handleFolderDrop(e, folder.id)}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-center gap-2">
                              <Folder className="h-5 w-5 text-primary" />
                              <span className="text-sm font-medium text-foreground truncate">{folder.name}</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {papers.filter(p => p.folderIds?.includes(folder.id)).length} papers
                            </p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </section>
                </div>
              )}

              {/* Papers section - scrollable */}
              <ScrollArea className="flex-1">
                <div className="p-4">
                  <section>
                    <h3 className="text-sm font-medium text-muted-foreground mb-3">
                      {currentFolderId ? "Papers in this folder" : "Unsorted Papers"}
                    </h3>
                    <div className="grid gap-3">
                      {filteredPapers.map(paper => (
                        <Card
                          key={paper.id}
                          className="cursor-pointer hover:bg-accent/50 transition-colors"
                          onClick={() => handleCardClick(paper.id)}
                          draggable
                          onDragStart={(e) => handlePaperDragStart(e, paper.id)}
                        >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-medium text-foreground truncate">
                                {paper.title}
                              </h4>
                              <p className="text-xs text-muted-foreground mt-1">
                                {paper.authors} {paper.year ? `(${paper.year})` : ""}
                              </p>
                              {paper.abstract && (
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                  {paper.abstract}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                variant="ghost" size="icon" className="h-7 w-7"
                                onClick={(e) => { e.stopPropagation(); toggleStarred(paper.id) }}
                              >
                                <span className={paper.starred ? "text-yellow-500" : "text-muted-foreground"}>
                                  {paper.starred ? "★" : "☆"}
                                </span>
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
                                    <Edit className="h-3.5 w-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEditMetadata(paper) }}>
                                    Edit metadata
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleReadStatusChange(paper.id, "unread") }}>
                                    Mark as unread
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleReadStatusChange(paper.id, "reading") }}>
                                    Mark as reading
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleReadStatusChange(paper.id, "read") }}>
                                    Mark as read
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleMoveToFolder(paper.id) }}>
                                    Move to folder
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDelete(paper.id) }} className="text-destructive">
                                    Delete paper
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge
                              variant={paper.readStatus === "read" ? "default" : paper.readStatus === "reading" ? "secondary" : "outline"}
                              className="text-xs"
                            >
                              {paper.readStatus || "unread"}
                            </Badge>
                            {tags.slice(0, 3).map(tag => (
                              <Badge key={tag.id} variant="outline" className="text-xs">
                                {tag.name}
                              </Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </section>
              </div>
            </ScrollArea>
            </div>
          )}
        </div>

      {/* Metadata Editor Dialog */}
      <MetadataEditorDialog
        paper={editingPaper}
        open={metadataDialogOpen}
        onOpenChange={setMetadataDialogOpen}
        onSaved={loadPapers}
      />

      {/* Delete Confirm Dialog */}
      <DeleteConfirmDialog
        paperId={deletePaperId}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />

      <Dialog open={urlDialogOpen} onOpenChange={setUrlDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Import paper from URL</DialogTitle>
            <DialogDescription>
              Enter a direct PDF URL, arXiv URL, or arXiv ID. The PDF will be downloaded into your local library.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Input
              value={paperUrl}
              onChange={(e) => setPaperUrl(e.target.value)}
              placeholder="e.g. 2401.00001, arxiv:2401.00001, or https://arxiv.org/abs/2401.00001"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleUrlImport()
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUrlDialogOpen(false)} disabled={importing}>
              Cancel
            </Button>
            <Button onClick={handleUrlImport} disabled={importing}>
              {importing ? "Importing..." : "Download & Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Create Folder</DialogTitle>
            <DialogDescription>
              Enter a name for the new folder.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateFolder()
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateFolder}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={folderSelectDialogOpen} onOpenChange={setFolderSelectDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Move to Folder</DialogTitle>
            <DialogDescription>
              Select a folder to move this paper to.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2 max-h-60 overflow-y-auto">
            <Button
              variant={folderSelectPaperId && !papers.find(p => p.id === folderSelectPaperId)?.folderIds?.length ? "default" : "outline"}
              className="justify-start"
              onClick={() => handleFolderSelect(null)}
            >
              Unsorted
            </Button>
            {folders.map(folder => (
              <Button
                key={folder.id}
                variant={folderSelectPaperId && papers.find(p => p.id === folderSelectPaperId)?.folderIds?.includes(folder.id) ? "default" : "outline"}
                className="justify-start"
                onClick={() => handleFolderSelect(folder.id)}
              >
                <Folder className="h-4 w-4 mr-2" />
                {folder.name}
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderSelectDialogOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
