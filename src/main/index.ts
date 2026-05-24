// ============================================================
// CashFlow Planner — Main Process
// Handles Electron window lifecycle, menus, and IPC for file I/O.
// ============================================================

import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  Menu,
  MenuItemConstructorOptions
} from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { is } from '@electron-toolkit/utils'

let mainWindow: BrowserWindow | null = null

// Path to store app preferences (recent files, etc.)
const userDataPath = app.getPath('userData')
const prefsPath = join(userDataPath, 'prefs.json')

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#0f1117',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
    if (is.dev) {
      mainWindow!.webContents.openDevTools({ mode: 'detach' })
    }
  })

  // Intercept close to allow unsaved-changes prompt in renderer
  mainWindow.on('close', (e) => {
    e.preventDefault()
    mainWindow!.webContents.send('app:before-close')
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  buildMenu()
}

// ─── Application Menu ─────────────────────────────────────────

function buildMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New File',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow?.webContents.send('menu:new')
        },
        {
          label: 'Open...',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow?.webContents.send('menu:open')
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow?.webContents.send('menu:save')
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About CashFlow Planner',
          click: () => {
            dialog.showMessageBox(mainWindow!, {
              title: 'About CashFlow Planner',
              message: 'CashFlow Planner v1.0.0',
              detail: 'Local-first cash-flow planning for households and scenarios.'
            })
          }
        }
      ]
    }
  ]

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    })
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ─── IPC Handlers ─────────────────────────────────────────────

// File: Show save dialog
ipcMain.handle('file:showSaveDialog', async (_, defaultName: string) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: defaultName,
    filters: [{ name: 'CashFlow Files', extensions: ['cashflow.json', 'json'] }]
  })
  return { canceled: result.canceled, filePath: result.filePath }
})

// File: Show open dialog
ipcMain.handle('file:showOpenDialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    filters: [{ name: 'CashFlow Files', extensions: ['cashflow.json', 'json'] }],
    properties: ['openFile']
  })
  return {
    canceled: result.canceled,
    filePath: result.filePaths[0]
  }
})

// File: Read and parse a file
ipcMain.handle('file:open', async (_, filePath?: string) => {
  try {
    let targetPath = filePath
    if (!targetPath) {
      const dlg = await dialog.showOpenDialog(mainWindow!, {
        filters: [{ name: 'CashFlow Files', extensions: ['cashflow.json', 'json'] }],
        properties: ['openFile']
      })
      if (dlg.canceled || !dlg.filePaths[0]) {
        return { success: false, error: 'Canceled' }
      }
      targetPath = dlg.filePaths[0]
    }

    if (!existsSync(targetPath)) {
      return { success: false, error: `File not found: ${targetPath}` }
    }

    const raw = readFileSync(targetPath, 'utf-8')
    let data: unknown
    try {
      data = JSON.parse(raw)
    } catch {
      return { success: false, error: 'File is not valid JSON' }
    }

    return { success: true, data, filePath: targetPath }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

// File: Write a file
ipcMain.handle('file:save', async (_, filePath: string, data: unknown) => {
  try {
    const json = JSON.stringify(data, null, 2)
    writeFileSync(filePath, json, 'utf-8')
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

// File: Create a new file
ipcMain.handle('file:new', async (_, filePath: string, data: unknown) => {
  try {
    const json = JSON.stringify(data, null, 2)
    writeFileSync(filePath, json, 'utf-8')
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

// Prefs: Get recent files
ipcMain.handle('prefs:getRecentFiles', async () => {
  try {
    if (!existsSync(prefsPath)) return []
    const raw = readFileSync(prefsPath, 'utf-8')
    const prefs = JSON.parse(raw)
    return prefs.recentFiles ?? []
  } catch {
    return []
  }
})

// Prefs: Set recent file
ipcMain.handle('prefs:setRecentFile', async (_, file: unknown) => {
  try {
    let prefs: Record<string, unknown> = {}
    if (existsSync(prefsPath)) {
      prefs = JSON.parse(readFileSync(prefsPath, 'utf-8'))
    }
    const existing: unknown[] = (prefs.recentFiles as unknown[]) ?? []
    const filtered = existing.filter(
      (f: unknown) => (f as Record<string, unknown>).path !== (file as Record<string, unknown>).path
    )
    prefs.recentFiles = [file, ...filtered].slice(0, 10)
    writeFileSync(prefsPath, JSON.stringify(prefs, null, 2), 'utf-8')
  } catch {
    // Ignore prefs write failures
  }
})

// Export: CSV
ipcMain.handle('export:csv', async (_, filePath: string, content: string) => {
  try {
    writeFileSync(filePath, content, 'utf-8')
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

// Export: JSON
ipcMain.handle('export:json', async (_, filePath: string, content: string) => {
  try {
    writeFileSync(filePath, content, 'utf-8')
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

// Window: Allow renderer to confirm close
ipcMain.handle('app:confirmClose', async (_, shouldClose: boolean) => {
  if (shouldClose) {
    mainWindow?.destroy()
    app.quit()
  }
})

// ─── App Lifecycle ────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
