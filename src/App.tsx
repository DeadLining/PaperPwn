import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { LibraryList } from '@/pages/LibraryList'
import { ReaderView } from '@/pages/ReaderView'
import { Settings } from '@/pages/Settings'
import { MindMapCanvas } from '@/components/MindMapCanvas'
import { Toaster } from '@/components/ui/sonner'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { applyThemePreference, getStoredTheme, watchSystemTheme } from '@/lib/theme'
import { useEffect } from 'react'

function App() {
  useEffect(() => {
    const applyStoredTheme = () => applyThemePreference(getStoredTheme())
    applyStoredTheme()
    return watchSystemTheme(applyStoredTheme)
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<ErrorBoundary><AppShell /></ErrorBoundary>}>
          <Route path="/" element={<ErrorBoundary><LibraryList /></ErrorBoundary>} />
          <Route path="/reader/:id" element={<ErrorBoundary><ReaderView /></ErrorBoundary>} />
          <Route path="/mindmap/:id" element={<ErrorBoundary><MindMapCanvas /></ErrorBoundary>} />
          <Route path="/settings" element={<ErrorBoundary><Settings /></ErrorBoundary>} />
        </Route>
      </Routes>
      <Toaster />
    </BrowserRouter>
  )
}

export default App
