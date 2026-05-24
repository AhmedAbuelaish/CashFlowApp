// ============================================================
// CashFlow Planner — Preload Bridge
// Exposes a typed, minimal IPC surface to the renderer.
// contextIsolation: true — no direct Node access from renderer.
// ============================================================

import { contextBridge, ipcRenderer } from 'electron'
import type { FileAPI, CashFlowFile, RecentFile } from '../renderer/src/shared/types'

const fileAPI: FileAPI = {
  newFile: (filePath, initialData) =>
    ipcRenderer.invoke('file:new', filePath, initialData),

  openFile: (filePath) =>
    ipcRenderer.invoke('file:open', filePath),

  saveFile: (filePath, data) =>
    ipcRenderer.invoke('file:save', filePath, data),

  showSaveDialog: (defaultName) =>
    ipcRenderer.invoke('file:showSaveDialog', defaultName),

  showOpenDialog: () =>
    ipcRenderer.invoke('file:showOpenDialog'),

  getRecentFiles: () =>
    ipcRenderer.invoke('prefs:getRecentFiles'),

  setRecentFile: (file) =>
    ipcRenderer.invoke('prefs:setRecentFile', file),

  exportCSV: (filePath, content) =>
    ipcRenderer.invoke('export:csv', filePath, content),

  exportJSON: (filePath, content) =>
    ipcRenderer.invoke('export:json', filePath, content),

  // Menu events
  onMenuNew: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu:new', handler)
    return () => ipcRenderer.removeListener('menu:new', handler)
  },

  onMenuOpen: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu:open', handler)
    return () => ipcRenderer.removeListener('menu:open', handler)
  },

  onMenuSave: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu:save', handler)
    return () => ipcRenderer.removeListener('menu:save', handler)
  },

  // Before-close dialog
  onBeforeClose: (callback) => {
    const handler = async () => {
      const shouldClose = await callback()
      ipcRenderer.invoke('app:confirmClose', shouldClose)
    }
    ipcRenderer.on('app:before-close', handler)
    return () => ipcRenderer.removeListener('app:before-close', handler)
  }
}

contextBridge.exposeInMainWorld('fileAPI', fileAPI)
