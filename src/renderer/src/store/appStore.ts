// ============================================================
// CashFlow Planner — App Store (Zustand)
// Central state: file data, UI state, and cached calculations.
// ============================================================

import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { format, addMonths, subMonths, startOfMonth } from 'date-fns'

import type {
  AppState,
  CashFlowFile,
  FileMetadata,
  AppSettings,
  LineItem,
  Account,
  Asset,
  OccurrenceOverride,
  ReportDefinition,
  ViewScale,
  CumulativeChartMode,
  AppPage,
  RecentFile,
  SaveStatus
} from '../shared/types'

import {
  calculateCashFlow,
  defaultDateRange
} from '../shared/engine/calculator'

import { validateFile } from '../shared/engine/validator'
import { toISODate } from '../shared/engine/recurrence'

// ─── Default Values ───────────────────────────────────────────

function createNewFile(
  name: string,
  initialBalance: number,
  currency: string
): CashFlowFile {
  const now = new Date().toISOString()
  return {
    schemaVersion: '1.0.0',
    fileMetadata: {
      name,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
      initialLiquidBalance: initialBalance,
      currency
    },
    settings: {
      autosave: true,
      defaultViewScale: 'month',
      defaultCumulativeChartMode: 'separateChart',
      currency
    },
    accounts: [],
    assets: [],
    lineItems: [],
    occurrenceOverrides: [],
    reports: []
  }
}

function defaultDateRangeForScale(scale: ViewScale) {
  return defaultDateRange(scale)
}

// ─── Store Interface ──────────────────────────────────────────

interface AppStore extends AppState {
  // File actions
  newFile: (name: string, filePath: string, initialBalance: number, currency: string) => Promise<void>
  openFileFromPath: (filePath: string) => Promise<{ success: boolean; error?: string }>
  saveCurrentFile: () => Promise<void>
  markUnsaved: () => void
  setSaveStatus: (status: SaveStatus) => void

  // Page navigation
  setCurrentPage: (page: AppPage) => void

  // Dashboard controls
  setViewScale: (scale: ViewScale) => void
  setCumulativeChartMode: (mode: CumulativeChartMode) => void
  setDashboardDateRange: (range: { start: string; end: string }) => void
  setSelectedLineItem: (id: string | null) => void
  setDrillDownPeriod: (key: string | null) => void

  // Calculation
  recalculate: () => void

  // Line items
  addLineItem: (item: Omit<LineItem, 'id' | 'createdAt' | 'updatedAt'>) => string
  updateLineItem: (id: string, updates: Partial<LineItem>) => void
  deleteLineItem: (id: string) => void
  splitLineItem: (id: string, effectiveDate: string, newItemData: Omit<LineItem, 'id' | 'createdAt' | 'updatedAt'>) => void

  // Occurrence overrides
  upsertOccurrenceOverride: (override: Omit<OccurrenceOverride, 'id'> & { id?: string }) => void
  deleteOccurrenceOverride: (lineItemId: string, occurrenceDate: string) => void

  // Accounts
  addAccount: (account: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>) => string
  updateAccount: (id: string, updates: Partial<Account>) => void
  deleteAccount: (id: string) => void

  // Assets
  addAsset: (asset: Omit<Asset, 'id' | 'createdAt' | 'updatedAt'>) => string
  updateAsset: (id: string, updates: Partial<Asset>) => void
  deleteAsset: (id: string) => void

  // Reports
  addReport: (report: Omit<ReportDefinition, 'id' | 'createdAt'>) => string
  deleteReport: (id: string) => void

  // Settings
  updateSettings: (settings: Partial<AppSettings>) => void

  // Recent files
  setRecentFiles: (files: RecentFile[]) => void
}

// ─── Store Implementation ─────────────────────────────────────

export const useAppStore = create<AppStore>((set, get) => ({
  // ── Initial State ──
  currentFile: null,
  currentFilePath: null,
  hasUnsavedChanges: false,
  saveStatus: 'saved',
  lastSavedAt: null,
  currentPage: 'dashboard',
  viewScale: 'month',
  cumulativeChartMode: 'separateChart',
  dashboardDateRange: defaultDateRangeForScale('month'),
  calculationResult: null,
  recentFiles: [],
  selectedLineItemId: null,
  drillDownPeriodKey: null,

  // ── File Actions ──

  newFile: async (name, filePath, initialBalance, currency) => {
    const file = createNewFile(name, initialBalance, currency)
    const scale = file.settings.defaultViewScale
    const dateRange = defaultDateRangeForScale(scale)

    if (window.fileAPI) {
      await window.fileAPI.newFile(filePath, file)
      await window.fileAPI.setRecentFile({
        path: filePath,
        name: file.fileMetadata.name,
        lastOpenedAt: new Date().toISOString()
      })
    }

    set({
      currentFile: file,
      currentFilePath: filePath,
      hasUnsavedChanges: false,
      saveStatus: 'saved',
      lastSavedAt: new Date(),
      viewScale: scale,
      cumulativeChartMode: file.settings.defaultCumulativeChartMode,
      dashboardDateRange: dateRange,
      currentPage: 'dashboard'
    })
    get().recalculate()
  },

  openFileFromPath: async (filePath) => {
    if (!window.fileAPI) return { success: false, error: 'File API not available' }

    const result = await window.fileAPI.openFile(filePath)
    if (!result.success || !result.data) {
      return { success: false, error: result.error ?? 'Failed to open file' }
    }

    // Validate before loading
    const validation = validateFile(result.data)
    if (!validation.valid) {
      return {
        success: false,
        error: `Invalid file:\n${validation.errors.join('\n')}`
      }
    }

    const file = result.data as CashFlowFile
    file.fileMetadata.lastOpenedAt = new Date().toISOString()

    const scale = file.settings.defaultViewScale ?? 'month'
    const dateRange = defaultDateRangeForScale(scale)

    await window.fileAPI.setRecentFile({
      path: result.filePath!,
      name: file.fileMetadata.name,
      lastOpenedAt: new Date().toISOString()
    })

    const recentFiles = await window.fileAPI.getRecentFiles()

    set({
      currentFile: file,
      currentFilePath: result.filePath,
      hasUnsavedChanges: false,
      saveStatus: 'saved',
      lastSavedAt: new Date(),
      viewScale: scale,
      cumulativeChartMode: file.settings.defaultCumulativeChartMode,
      dashboardDateRange: dateRange,
      recentFiles,
      currentPage: 'dashboard'
    })
    get().recalculate()

    return { success: true }
  },

  saveCurrentFile: async () => {
    const { currentFile, currentFilePath } = get()
    if (!currentFile || !currentFilePath || !window.fileAPI) return

    set({ saveStatus: 'saving' })

    const updated: CashFlowFile = {
      ...currentFile,
      fileMetadata: {
        ...currentFile.fileMetadata,
        updatedAt: new Date().toISOString()
      }
    }

    const result = await window.fileAPI.saveFile(currentFilePath, updated)

    if (result.success) {
      set({
        currentFile: updated,
        hasUnsavedChanges: false,
        saveStatus: 'saved',
        lastSavedAt: new Date()
      })
    } else {
      set({ saveStatus: 'failed' })
    }
  },

  markUnsaved: () => set({ hasUnsavedChanges: true, saveStatus: 'unsaved' }),
  setSaveStatus: (status) => set({ saveStatus: status }),

  // ── Navigation ──

  setCurrentPage: (page) => set({ currentPage: page }),

  // ── Dashboard ──

  setViewScale: (scale) => {
    const dateRange = defaultDateRangeForScale(scale)
    set({ viewScale: scale, dashboardDateRange: dateRange })
    get().recalculate()
  },

  setCumulativeChartMode: (mode) => {
    set({ cumulativeChartMode: mode })
    const { currentFile } = get()
    if (currentFile) {
      set(s => ({
        currentFile: s.currentFile
          ? { ...s.currentFile, settings: { ...s.currentFile.settings, defaultCumulativeChartMode: mode } }
          : null,
        hasUnsavedChanges: true,
        saveStatus: 'unsaved'
      }))
    }
  },

  setDashboardDateRange: (range) => {
    set({ dashboardDateRange: range })
    get().recalculate()
  },

  setSelectedLineItem: (id) => set({ selectedLineItemId: id }),
  setDrillDownPeriod: (key) => set({ drillDownPeriodKey: key }),

  // ── Calculation ──

  recalculate: () => {
    const { currentFile, viewScale, dashboardDateRange } = get()
    if (!currentFile) {
      set({ calculationResult: null })
      return
    }

    try {
      const result = calculateCashFlow(currentFile, {
        scale: viewScale,
        dateRange: dashboardDateRange
      })
      set({ calculationResult: result })
    } catch (err) {
      console.error('Calculation error:', err)
      set({ calculationResult: null })
    }
  },

  // ── Line Items ──

  addLineItem: (itemData) => {
    const id = uuidv4()
    const now = new Date().toISOString()
    const item: LineItem = { ...itemData, id, createdAt: now, updatedAt: now }

    set(s => ({
      currentFile: s.currentFile
        ? { ...s.currentFile, lineItems: [...s.currentFile.lineItems, item] }
        : null,
      hasUnsavedChanges: true,
      saveStatus: 'unsaved'
    }))
    get().recalculate()

    // Autosave
    const { currentFile, currentFilePath } = get()
    if (currentFile?.settings.autosave && currentFilePath) {
      get().saveCurrentFile()
    }

    return id
  },

  updateLineItem: (id, updates) => {
    const now = new Date().toISOString()
    set(s => ({
      currentFile: s.currentFile
        ? {
            ...s.currentFile,
            lineItems: s.currentFile.lineItems.map(li =>
              li.id === id ? { ...li, ...updates, updatedAt: now } : li
            )
          }
        : null,
      hasUnsavedChanges: true,
      saveStatus: 'unsaved'
    }))
    get().recalculate()

    const { currentFile, currentFilePath } = get()
    if (currentFile?.settings.autosave && currentFilePath) {
      get().saveCurrentFile()
    }
  },

  deleteLineItem: (id) => {
    set(s => ({
      currentFile: s.currentFile
        ? {
            ...s.currentFile,
            lineItems: s.currentFile.lineItems.filter(li => li.id !== id),
            occurrenceOverrides: s.currentFile.occurrenceOverrides.filter(ov => ov.lineItemId !== id)
          }
        : null,
      hasUnsavedChanges: true,
      saveStatus: 'unsaved'
    }))
    get().recalculate()

    const { currentFile, currentFilePath } = get()
    if (currentFile?.settings.autosave && currentFilePath) {
      get().saveCurrentFile()
    }
  },

  splitLineItem: (id, effectiveDate, newItemData) => {
    const now = new Date().toISOString()
    const { currentFile } = get()
    if (!currentFile) return

    const original = currentFile.lineItems.find(li => li.id === id)
    if (!original) return

    // Modify original to end before effectiveDate
    const updatedOriginal: LineItem = {
      ...original,
      recurrenceRule: {
        ...original.recurrenceRule,
        mode: original.recurrenceRule.mode === 'infinite' ? 'finiteUntilDate' : original.recurrenceRule.mode,
        untilDate: effectiveDate
      },
      updatedAt: now
    }

    // Create new series starting at effectiveDate
    const newId = uuidv4()
    const newItem: LineItem = {
      ...newItemData,
      id: newId,
      parentSeriesId: id,
      splitFromDate: effectiveDate,
      seriesComment: original.seriesComment, // Copy comment (they are unlinked after this)
      createdAt: now,
      updatedAt: now
    }

    set(s => ({
      currentFile: s.currentFile
        ? {
            ...s.currentFile,
            lineItems: s.currentFile.lineItems.map(li =>
              li.id === id ? updatedOriginal : li
            ).concat([newItem])
          }
        : null,
      hasUnsavedChanges: true,
      saveStatus: 'unsaved'
    }))
    get().recalculate()

    const { currentFile: cf, currentFilePath } = get()
    if (cf?.settings.autosave && currentFilePath) {
      get().saveCurrentFile()
    }
  },

  // ── Occurrence Overrides ──

  upsertOccurrenceOverride: (override) => {
    const now = new Date().toISOString()
    set(s => {
      if (!s.currentFile) return {}
      const existing = s.currentFile.occurrenceOverrides.findIndex(
        ov => ov.lineItemId === override.lineItemId && ov.occurrenceDate === override.occurrenceDate
      )
      let overrides: OccurrenceOverride[]
      if (existing >= 0) {
        overrides = s.currentFile.occurrenceOverrides.map((ov, i) =>
          i === existing ? { ...ov, ...override, id: ov.id, updatedAt: now } : ov
        )
      } else {
        overrides = [
          ...s.currentFile.occurrenceOverrides,
          { ...override, id: override.id ?? uuidv4(), updatedAt: now }
        ]
      }
      return {
        currentFile: { ...s.currentFile, occurrenceOverrides: overrides },
        hasUnsavedChanges: true,
        saveStatus: 'unsaved' as SaveStatus
      }
    })
    get().recalculate()

    const { currentFile, currentFilePath } = get()
    if (currentFile?.settings.autosave && currentFilePath) {
      get().saveCurrentFile()
    }
  },

  deleteOccurrenceOverride: (lineItemId, occurrenceDate) => {
    set(s => ({
      currentFile: s.currentFile
        ? {
            ...s.currentFile,
            occurrenceOverrides: s.currentFile.occurrenceOverrides.filter(
              ov => !(ov.lineItemId === lineItemId && ov.occurrenceDate === occurrenceDate)
            )
          }
        : null,
      hasUnsavedChanges: true,
      saveStatus: 'unsaved'
    }))
    get().recalculate()
  },

  // ── Accounts ──

  addAccount: (accountData) => {
    const id = uuidv4()
    const now = new Date().toISOString()
    const account: Account = { ...accountData, id, createdAt: now, updatedAt: now }

    set(s => ({
      currentFile: s.currentFile
        ? { ...s.currentFile, accounts: [...s.currentFile.accounts, account] }
        : null,
      hasUnsavedChanges: true,
      saveStatus: 'unsaved'
    }))

    const { currentFile, currentFilePath } = get()
    if (currentFile?.settings.autosave && currentFilePath) get().saveCurrentFile()
    return id
  },

  updateAccount: (id, updates) => {
    const now = new Date().toISOString()
    set(s => ({
      currentFile: s.currentFile
        ? {
            ...s.currentFile,
            accounts: s.currentFile.accounts.map(a =>
              a.id === id ? { ...a, ...updates, updatedAt: now } : a
            )
          }
        : null,
      hasUnsavedChanges: true,
      saveStatus: 'unsaved'
    }))

    const { currentFile, currentFilePath } = get()
    if (currentFile?.settings.autosave && currentFilePath) get().saveCurrentFile()
  },

  deleteAccount: (id) => {
    set(s => ({
      currentFile: s.currentFile
        ? { ...s.currentFile, accounts: s.currentFile.accounts.filter(a => a.id !== id) }
        : null,
      hasUnsavedChanges: true,
      saveStatus: 'unsaved'
    }))

    const { currentFile, currentFilePath } = get()
    if (currentFile?.settings.autosave && currentFilePath) get().saveCurrentFile()
  },

  // ── Assets ──

  addAsset: (assetData) => {
    const id = uuidv4()
    const now = new Date().toISOString()
    const asset: Asset = { ...assetData, id, createdAt: now, updatedAt: now }

    set(s => ({
      currentFile: s.currentFile
        ? { ...s.currentFile, assets: [...s.currentFile.assets, asset] }
        : null,
      hasUnsavedChanges: true,
      saveStatus: 'unsaved'
    }))

    const { currentFile, currentFilePath } = get()
    if (currentFile?.settings.autosave && currentFilePath) get().saveCurrentFile()
    return id
  },

  updateAsset: (id, updates) => {
    const now = new Date().toISOString()
    set(s => ({
      currentFile: s.currentFile
        ? {
            ...s.currentFile,
            assets: s.currentFile.assets.map(a =>
              a.id === id ? { ...a, ...updates, updatedAt: now } : a
            )
          }
        : null,
      hasUnsavedChanges: true,
      saveStatus: 'unsaved'
    }))

    const { currentFile, currentFilePath } = get()
    if (currentFile?.settings.autosave && currentFilePath) get().saveCurrentFile()
  },

  deleteAsset: (id) => {
    set(s => ({
      currentFile: s.currentFile
        ? { ...s.currentFile, assets: s.currentFile.assets.filter(a => a.id !== id) }
        : null,
      hasUnsavedChanges: true,
      saveStatus: 'unsaved'
    }))

    const { currentFile, currentFilePath } = get()
    if (currentFile?.settings.autosave && currentFilePath) get().saveCurrentFile()
  },

  // ── Reports ──

  addReport: (reportData) => {
    const id = uuidv4()
    const report: ReportDefinition = {
      ...reportData,
      id,
      createdAt: new Date().toISOString()
    }

    set(s => ({
      currentFile: s.currentFile
        ? { ...s.currentFile, reports: [...s.currentFile.reports, report] }
        : null,
      hasUnsavedChanges: true,
      saveStatus: 'unsaved'
    }))

    const { currentFile, currentFilePath } = get()
    if (currentFile?.settings.autosave && currentFilePath) get().saveCurrentFile()
    return id
  },

  deleteReport: (id) => {
    set(s => ({
      currentFile: s.currentFile
        ? { ...s.currentFile, reports: s.currentFile.reports.filter(r => r.id !== id) }
        : null,
      hasUnsavedChanges: true,
      saveStatus: 'unsaved'
    }))
  },

  // ── Settings ──

  updateSettings: (settings) => {
    set(s => ({
      currentFile: s.currentFile
        ? { ...s.currentFile, settings: { ...s.currentFile.settings, ...settings } }
        : null,
      hasUnsavedChanges: true,
      saveStatus: 'unsaved'
    }))

    const { currentFile, currentFilePath } = get()
    if (currentFile?.settings.autosave && currentFilePath) get().saveCurrentFile()
  },

  // ── Recent Files ──

  setRecentFiles: (files) => set({ recentFiles: files })
}))

// Extend window with fileAPI type
declare global {
  interface Window {
    fileAPI: import('../shared/types').FileAPI
  }
}
