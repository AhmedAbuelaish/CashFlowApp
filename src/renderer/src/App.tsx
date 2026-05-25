import React, { useEffect } from 'react'
import { useAppStore } from './store/appStore'
import SplashScreen from './components/Splash/SplashScreen'
import Layout from './components/shared/Layout'
import Dashboard from './components/Dashboard/Dashboard'
import LineItemsList from './components/LineItems/LineItemsList'
import AccountsList from './components/Accounts/AccountsList'
import Categories from './components/Categories/Categories'
import Reports from './components/Reports/Reports'
import Settings from './components/Settings/Settings'

export default function App() {
  const currentFile = useAppStore(s => s.currentFile)
  const currentPage = useAppStore(s => s.currentPage)
  const hasUnsavedChanges = useAppStore(s => s.hasUnsavedChanges)
  const saveCurrentFile = useAppStore(s => s.saveCurrentFile)
  const openFileFromPath = useAppStore(s => s.openFileFromPath)
  const setRecentFiles = useAppStore(s => s.setRecentFiles)

  // Wire up Electron menu and lifecycle events
  useEffect(() => {
    if (!window.fileAPI) return

    // Load recent files
    window.fileAPI.getRecentFiles().then(files => setRecentFiles(files))

    // Menu: New handled by SplashScreen / Layout
    const offNew  = window.fileAPI.onMenuNew(() => {
      // Handled in Layout when file is open
    })

    const offOpen = window.fileAPI.onMenuOpen(async () => {
      const result = await openFileFromPath(undefined as unknown as string)
      if (!result.success && result.error !== 'Canceled') {
        alert(`Failed to open file: ${result.error}`)
      }
    })

    const offSave = window.fileAPI.onMenuSave(() => {
      saveCurrentFile()
    })

    const offClose = window.fileAPI.onBeforeClose(async () => {
      if (!hasUnsavedChanges) return true
      const choice = confirm(
        'You have unsaved changes. Save before closing?\n\nClick OK to save, Cancel to discard.'
      )
      if (choice) {
        await saveCurrentFile()
      }
      return true
    })

    return () => {
      offNew()
      offOpen()
      offSave()
      offClose()
    }
  }, [hasUnsavedChanges, saveCurrentFile, openFileFromPath, setRecentFiles])

  // If no file is open, show splash screen
  if (!currentFile) {
    return <SplashScreen />
  }

  return (
    <Layout>
      {currentPage === 'dashboard'  && <Dashboard />}
      {currentPage === 'lineItems'  && <LineItemsList />}
      {currentPage === 'accounts'   && <AccountsList />}
      {currentPage === 'categories' && <Categories />}
      {currentPage === 'reports'    && <Reports />}
      {currentPage === 'settings'   && <Settings />}
    </Layout>
  )
}
