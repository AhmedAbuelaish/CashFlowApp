// ============================================================
// CashFlow Planner — App Store (Zustand)
// ============================================================

import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { format, addMonths, subMonths, startOfMonth } from 'date-fns'

import type {
  AppState,
  CashFlowFile,
  AppSettings,
  LineItem,
  Account,
  AccountAsset,
  AccountBalanceUpdate,
  OccurrenceOverride,
  ReportDefinition,
  ViewScale,
  CumulativeChartMode,
  AppPage,
  RecentFile,
  SaveStatus,
  LiquidityType
} from '../shared/types'

import { calculateCashFlow, defaultDateRange } from '../shared/engine/calculator'
import { validateFile } from '../shared/engine/validator'
import { toISODate } from '../shared/engine/recurrence'

// ─── Default Values ───────────────────────────────────────────

function createNewFile(name: string, initialBalance: number, currency: string): CashFlowFile {
  const now = new Date().toISOString()
  return {
    schemaVersion: '1.0.0',
    fileMetadata: { name, createdAt: now, updatedAt: now, lastOpenedAt: now, initialLiquidBalance: initialBalance, currency },
    settings: { autosave: true, defaultViewScale: 'month', defaultCumulativeChartMode: 'separateChart', currency },
    accounts: [],
    accountBalanceUpdates: [],
    lineItems: [],
    occurrenceOverrides: [],
    reports: []
  }
}

// ─── Store Interface ──────────────────────────────────────────

interface AppStore extends AppState {
  newFile: (name: string, filePath: string, initialBalance: number, currency: string) => Promise<void>
  openFileFromPath: (filePath: string) => Promise<{ success: boolean; error?: string }>
  saveCurrentFile: () => Promise<void>
  markUnsaved: () => void
  setSaveStatus: (status: SaveStatus) => void
  setCurrentPage: (page: AppPage) => void
  setViewScale: (scale: ViewScale) => void
  setCumulativeChartMode: (mode: CumulativeChartMode) => void
  setDashboardDateRange: (range: { start: string; end: string }) => void
  setSelectedLineItem: (id: string | null) => void
  setDrillDownPeriod: (key: string | null) => void
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
  updateAccount: (id: string, updates: Partial<Omit<Account, 'balance'>>) => void
  deleteAccount: (id: string) => void

  // Account sub-assets
  addAccountAsset: (accountId: string, asset: Omit<AccountAsset, 'id' | 'createdAt' | 'updatedAt'>) => string
  updateAccountAsset: (accountId: string, assetId: string, updates: Partial<AccountAsset>) => void
  deleteAccountAsset: (accountId: string, assetId: string) => void
  transferBetweenAssets: (accountId: string, fromAssetId: string, toAssetId: string, amount: number) => void

  // Account balance updates
  addAccountBalanceUpdate: (update: Omit<AccountBalanceUpdate, 'id' | 'createdAt' | 'updatedAt'>) => string
  updateAccountBalanceUpdate: (id: string, updates: Partial<AccountBalanceUpdate>) => void
  deleteAccountBalanceUpdate: (id: string) => void

  // Transfers
  transfer: (fromAccountId: string, toAccountId: string, amount: number, effectiveAt: string, comment?: string) => void

  // Reports
  addReport: (report: Omit<ReportDefinition, 'id' | 'createdAt'>) => string
  deleteReport: (id: string) => void

  // Settings
  updateSettings: (settings: Partial<AppSettings>) => void

  // Notifications
  dismissNotification: (id: string) => void
  clearAllNotifications: () => void

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
  dashboardDateRange: defaultDateRange('month'),
  calculationResult: null,
  recentFiles: [],
  selectedLineItemId: null,
  drillDownPeriodKey: null,
  dismissedNotificationIds: [],

  // ── File Actions ──

  newFile: async (name, filePath, initialBalance, currency) => {
    const file = createNewFile(name, initialBalance, currency)
    const scale = file.settings.defaultViewScale
    const dateRange = defaultDateRange(scale)
    if (window.fileAPI) {
      await window.fileAPI.newFile(filePath, file)
      await window.fileAPI.setRecentFile({ path: filePath, name: file.fileMetadata.name, lastOpenedAt: new Date().toISOString() })
    }
    set({ currentFile: file, currentFilePath: filePath, hasUnsavedChanges: false, saveStatus: 'saved',
          lastSavedAt: new Date(), viewScale: scale, cumulativeChartMode: file.settings.defaultCumulativeChartMode,
          dashboardDateRange: dateRange, currentPage: 'dashboard', dismissedNotificationIds: [] })
    get().recalculate()
  },

  openFileFromPath: async (filePath) => {
    if (!window.fileAPI) return { success: false, error: 'File API not available' }
    const result = await window.fileAPI.openFile(filePath)
    if (!result.success || !result.data) return { success: false, error: result.error ?? 'Failed to open file' }

    const validation = validateFile(result.data)
    if (!validation.valid) return { success: false, error: `Invalid file:\n${validation.errors.join('\n')}` }

    const file = result.data as CashFlowFile
    file.fileMetadata.lastOpenedAt = new Date().toISOString()
    if (!file.accountBalanceUpdates) file.accountBalanceUpdates = []

    // ── Migration: move top-level legacy assets into Account.assets ──
    if (file.assets && file.assets.length > 0) {
      file.accounts = file.accounts.map(acc => {
        const matching = file.assets!.filter(a => a.accountId === acc.id)
        if (matching.length === 0) return acc
        const migratedAssets = matching.map(({ id, name, currentValue, currency, liquidity, liquidationRule, fees, taxPercentage, notes, createdAt, updatedAt }) => ({
          id, name, currentValue, currency, liquidity, liquidationRule, fees, taxPercentage, notes, createdAt, updatedAt
        }))
        return { ...acc, assets: [...(acc.assets ?? []), ...migratedAssets] }
      })
      delete file.assets
    }

    const scale = file.settings.defaultViewScale ?? 'month'
    await window.fileAPI.setRecentFile({ path: result.filePath!, name: file.fileMetadata.name, lastOpenedAt: new Date().toISOString() })
    const recentFiles = await window.fileAPI.getRecentFiles()
    set({ currentFile: file, currentFilePath: result.filePath, hasUnsavedChanges: false, saveStatus: 'saved',
          lastSavedAt: new Date(), viewScale: scale, cumulativeChartMode: file.settings.defaultCumulativeChartMode,
          dashboardDateRange: defaultDateRange(scale), recentFiles, currentPage: 'dashboard', dismissedNotificationIds: [] })
    get().recalculate()
    return { success: true }
  },

  saveCurrentFile: async () => {
    const { currentFile, currentFilePath } = get()
    if (!currentFile || !currentFilePath || !window.fileAPI) return
    set({ saveStatus: 'saving' })
    const updated: CashFlowFile = { ...currentFile, fileMetadata: { ...currentFile.fileMetadata, updatedAt: new Date().toISOString() } }
    const result = await window.fileAPI.saveFile(currentFilePath, updated)
    if (result.success) set({ currentFile: updated, hasUnsavedChanges: false, saveStatus: 'saved', lastSavedAt: new Date() })
    else set({ saveStatus: 'failed' })
  },

  markUnsaved: () => set({ hasUnsavedChanges: true, saveStatus: 'unsaved' }),
  setSaveStatus: (status) => set({ saveStatus: status }),
  setCurrentPage: (page) => set({ currentPage: page }),

  setViewScale: (scale) => {
    set({ viewScale: scale, dashboardDateRange: defaultDateRange(scale) })
    get().recalculate()
  },

  setCumulativeChartMode: (mode) => {
    set(s => ({
      cumulativeChartMode: mode,
      currentFile: s.currentFile ? { ...s.currentFile, settings: { ...s.currentFile.settings, defaultCumulativeChartMode: mode } } : null,
      hasUnsavedChanges: true, saveStatus: 'unsaved' as SaveStatus
    }))
  },

  setDashboardDateRange: (range) => { set({ dashboardDateRange: range }); get().recalculate() },
  setSelectedLineItem: (id) => set({ selectedLineItemId: id }),
  setDrillDownPeriod: (key) => set({ drillDownPeriodKey: key }),

  recalculate: () => {
    const { currentFile, viewScale, dashboardDateRange } = get()
    if (!currentFile) { set({ calculationResult: null }); return }
    try {
      const result = calculateCashFlow(currentFile, { scale: viewScale, dateRange: dashboardDateRange })
      set({ calculationResult: result })
    } catch (err) {
      console.error('Calculation error:', err)
      set({ calculationResult: null })
    }
  },

  // ── Line Items ──

  addLineItem: (itemData) => {
    const id = uuidv4(); const now = new Date().toISOString()
    const item: LineItem = { ...itemData, id, createdAt: now, updatedAt: now }
    set(s => ({ currentFile: s.currentFile ? { ...s.currentFile, lineItems: [...s.currentFile.lineItems, item] } : null,
      hasUnsavedChanges: true, saveStatus: 'unsaved' as SaveStatus }))
    get().recalculate()
    autosave(get)
    return id
  },

  updateLineItem: (id, updates) => {
    const now = new Date().toISOString()
    set(s => ({ currentFile: s.currentFile ? { ...s.currentFile,
      lineItems: s.currentFile.lineItems.map(li => li.id === id ? { ...li, ...updates, updatedAt: now } : li) } : null,
      hasUnsavedChanges: true, saveStatus: 'unsaved' as SaveStatus }))
    get().recalculate(); autosave(get)
  },

  deleteLineItem: (id) => {
    set(s => ({ currentFile: s.currentFile ? { ...s.currentFile,
      lineItems: s.currentFile.lineItems.filter(li => li.id !== id),
      occurrenceOverrides: s.currentFile.occurrenceOverrides.filter(ov => ov.lineItemId !== id) } : null,
      hasUnsavedChanges: true, saveStatus: 'unsaved' as SaveStatus }))
    get().recalculate(); autosave(get)
  },

  splitLineItem: (id, effectiveDate, newItemData) => {
    const now = new Date().toISOString()
    const { currentFile } = get(); if (!currentFile) return
    const original = currentFile.lineItems.find(li => li.id === id); if (!original) return
    const updatedOriginal: LineItem = { ...original, recurrenceRule: { ...original.recurrenceRule,
      mode: original.recurrenceRule.mode === 'infinite' ? 'finiteUntilDate' : original.recurrenceRule.mode,
      untilDate: effectiveDate }, updatedAt: now }
    const newId = uuidv4()
    const newItem: LineItem = { ...newItemData, id: newId, parentSeriesId: id, splitFromDate: effectiveDate, createdAt: now, updatedAt: now }
    set(s => ({ currentFile: s.currentFile ? { ...s.currentFile,
      lineItems: s.currentFile.lineItems.map(li => li.id === id ? updatedOriginal : li).concat([newItem]) } : null,
      hasUnsavedChanges: true, saveStatus: 'unsaved' as SaveStatus }))
    get().recalculate(); autosave(get)
  },

  // ── Occurrence Overrides ──

  upsertOccurrenceOverride: (override) => {
    const now = new Date().toISOString()
    set(s => {
      if (!s.currentFile) return {}
      const existing = s.currentFile.occurrenceOverrides.findIndex(ov => ov.lineItemId === override.lineItemId && ov.occurrenceDate === override.occurrenceDate)
      const overrides = existing >= 0
        ? s.currentFile.occurrenceOverrides.map((ov, i) => i === existing ? { ...ov, ...override, id: ov.id, updatedAt: now } : ov)
        : [...s.currentFile.occurrenceOverrides, { ...override, id: override.id ?? uuidv4(), updatedAt: now }]
      return { currentFile: { ...s.currentFile, occurrenceOverrides: overrides }, hasUnsavedChanges: true, saveStatus: 'unsaved' as SaveStatus }
    })
    get().recalculate(); autosave(get)
  },

  deleteOccurrenceOverride: (lineItemId, occurrenceDate) => {
    set(s => ({ currentFile: s.currentFile ? { ...s.currentFile,
      occurrenceOverrides: s.currentFile.occurrenceOverrides.filter(ov => !(ov.lineItemId === lineItemId && ov.occurrenceDate === occurrenceDate)) } : null,
      hasUnsavedChanges: true, saveStatus: 'unsaved' as SaveStatus }))
    get().recalculate()
  },

  // ── Accounts ──

  addAccount: (accountData) => {
    const id = uuidv4(); const now = new Date().toISOString()
    const account: Account = { ...accountData, id, createdAt: now, updatedAt: now }
    // Auto-create an initial balance update record so it appears in history
    const initialUpdate: AccountBalanceUpdate = {
      id: uuidv4(), accountId: id, effectiveAt: now,
      balance: accountData.balance, liquidity: accountData.liquidity,
      isInitialSetup: true, comment: 'Initial setup balance',
      createdAt: now, updatedAt: now
    }
    set(s => ({ currentFile: s.currentFile ? { ...s.currentFile,
      accounts: [...s.currentFile.accounts, account],
      accountBalanceUpdates: [...(s.currentFile.accountBalanceUpdates ?? []), initialUpdate] } : null,
      hasUnsavedChanges: true, saveStatus: 'unsaved' as SaveStatus }))
    autosave(get)
    return id
  },

  updateAccount: (id, updates) => {
    const now = new Date().toISOString()
    set(s => ({ currentFile: s.currentFile ? { ...s.currentFile,
      accounts: s.currentFile.accounts.map(a => a.id === id ? { ...a, ...updates, updatedAt: now } : a) } : null,
      hasUnsavedChanges: true, saveStatus: 'unsaved' as SaveStatus }))
    autosave(get)
  },

  deleteAccount: (id) => {
    set(s => ({ currentFile: s.currentFile ? { ...s.currentFile,
      accounts: s.currentFile.accounts.filter(a => a.id !== id),
      accountBalanceUpdates: (s.currentFile.accountBalanceUpdates ?? []).filter(u => u.accountId !== id) } : null,
      hasUnsavedChanges: true, saveStatus: 'unsaved' as SaveStatus }))
    get().recalculate(); autosave(get)
  },

  // ── Account Sub-Assets ──

  addAccountAsset: (accountId, assetData) => {
    const id = uuidv4(); const now = new Date().toISOString()
    const asset: AccountAsset = { ...assetData, id, createdAt: now, updatedAt: now }
    set(s => ({ currentFile: s.currentFile ? { ...s.currentFile,
      accounts: s.currentFile.accounts.map(a => a.id === accountId
        ? { ...a, assets: [...(a.assets ?? []), asset], updatedAt: now } : a) } : null,
      hasUnsavedChanges: true, saveStatus: 'unsaved' as SaveStatus }))
    autosave(get)
    return id
  },

  updateAccountAsset: (accountId, assetId, updates) => {
    const now = new Date().toISOString()
    set(s => ({ currentFile: s.currentFile ? { ...s.currentFile,
      accounts: s.currentFile.accounts.map(a => a.id === accountId ? { ...a, updatedAt: now,
        assets: (a.assets ?? []).map(asset => asset.id === assetId ? { ...asset, ...updates, updatedAt: now } : asset) } : a) } : null,
      hasUnsavedChanges: true, saveStatus: 'unsaved' as SaveStatus }))
    get().recalculate()
    autosave(get)
  },

  deleteAccountAsset: (accountId, assetId) => {
    const now = new Date().toISOString()
    set(s => ({ currentFile: s.currentFile ? { ...s.currentFile,
      accounts: s.currentFile.accounts.map(a => a.id === accountId ? { ...a, updatedAt: now,
        assets: (a.assets ?? []).filter(asset => asset.id !== assetId) } : a) } : null,
      hasUnsavedChanges: true, saveStatus: 'unsaved' as SaveStatus }))
    autosave(get)
  },

  // ── Intra-account asset transfer ──
  // Moves value from one sub-asset to another within the same account.
  // Net account total is unchanged (unless the assets have different liquidity).

  transferBetweenAssets: (accountId, fromAssetId, toAssetId, amount) => {
    const now = new Date().toISOString()
    set(s => {
      if (!s.currentFile) return {}
      const accounts = s.currentFile.accounts.map(a => {
        if (a.id !== accountId) return a
        const assets = (a.assets ?? []).map(asset => {
          if (asset.id === fromAssetId) return { ...asset, currentValue: Math.max(0, asset.currentValue - amount), updatedAt: now }
          if (asset.id === toAssetId)   return { ...asset, currentValue: asset.currentValue + amount, updatedAt: now }
          return asset
        })
        return { ...a, assets, updatedAt: now }
      })
      return { currentFile: { ...s.currentFile, accounts },
               hasUnsavedChanges: true, saveStatus: 'unsaved' as SaveStatus }
    })
    get().recalculate()
    autosave(get)
  },

  // ── Account Balance Updates ──

  addAccountBalanceUpdate: (updateData) => {
    const id = uuidv4(); const now = new Date().toISOString()
    const entry: AccountBalanceUpdate = { ...updateData, id, createdAt: now, updatedAt: now }
    set(s => ({ currentFile: s.currentFile ? { ...s.currentFile,
      accountBalanceUpdates: [...(s.currentFile.accountBalanceUpdates ?? []), entry] } : null,
      hasUnsavedChanges: true, saveStatus: 'unsaved' as SaveStatus }))
    get().recalculate(); autosave(get)
    return id
  },

  updateAccountBalanceUpdate: (id, updates) => {
    const now = new Date().toISOString()
    set(s => ({ currentFile: s.currentFile ? { ...s.currentFile,
      accountBalanceUpdates: (s.currentFile.accountBalanceUpdates ?? []).map(u =>
        u.id === id ? { ...u, ...updates, updatedAt: now } : u) } : null,
      hasUnsavedChanges: true, saveStatus: 'unsaved' as SaveStatus }))
    get().recalculate(); autosave(get)
  },

  deleteAccountBalanceUpdate: (id) => {
    set(s => ({ currentFile: s.currentFile ? { ...s.currentFile,
      accountBalanceUpdates: (s.currentFile.accountBalanceUpdates ?? []).filter(u => u.id !== id) } : null,
      hasUnsavedChanges: true, saveStatus: 'unsaved' as SaveStatus }))
    get().recalculate(); autosave(get)
  },

  // ── Transfers ──

  transfer: (fromAccountId, toAccountId, amount, effectiveAt, comment) => {
    const now = new Date().toISOString()
    const { currentFile } = get(); if (!currentFile) return

    const fromAccount = currentFile.accounts.find(a => a.id === fromAccountId)
    const toAccount   = currentFile.accounts.find(a => a.id === toAccountId)
    if (!fromAccount || !toAccount) return

    // Compute effective balance for each account at effectiveAt
    const updates = currentFile.accountBalanceUpdates ?? []
    const latestFrom = latestUpdateBefore(updates, fromAccountId, effectiveAt)
    const latestTo   = latestUpdateBefore(updates, toAccountId, effectiveAt)
    const fromBalance = latestFrom?.balance ?? fromAccount.balance
    const toBalance   = latestTo?.balance   ?? toAccount.balance

    const pairId = uuidv4()
    const fromUpdate: AccountBalanceUpdate = {
      id: uuidv4(), accountId: fromAccountId, effectiveAt,
      balance: fromBalance - amount, liquidity: fromAccount.liquidity,
      isTransfer: true, transferPairId: pairId,
      comment: comment ? `Transfer out: ${comment}` : `Transfer to ${toAccount.name}`,
      createdAt: now, updatedAt: now
    }
    const toUpdate: AccountBalanceUpdate = {
      id: uuidv4(), accountId: toAccountId, effectiveAt,
      balance: toBalance + amount, liquidity: toAccount.liquidity,
      isTransfer: true, transferPairId: pairId,
      comment: comment ? `Transfer in: ${comment}` : `Transfer from ${fromAccount.name}`,
      createdAt: now, updatedAt: now
    }
    set(s => ({ currentFile: s.currentFile ? { ...s.currentFile,
      accountBalanceUpdates: [...(s.currentFile.accountBalanceUpdates ?? []), fromUpdate, toUpdate] } : null,
      hasUnsavedChanges: true, saveStatus: 'unsaved' as SaveStatus }))
    get().recalculate(); autosave(get)
  },

  // ── Reports ──

  addReport: (reportData) => {
    const id = uuidv4()
    const report: ReportDefinition = { ...reportData, id, createdAt: new Date().toISOString() }
    set(s => ({ currentFile: s.currentFile ? { ...s.currentFile, reports: [...s.currentFile.reports, report] } : null,
      hasUnsavedChanges: true, saveStatus: 'unsaved' as SaveStatus }))
    autosave(get)
    return id
  },

  deleteReport: (id) => {
    set(s => ({ currentFile: s.currentFile ? { ...s.currentFile, reports: s.currentFile.reports.filter(r => r.id !== id) } : null,
      hasUnsavedChanges: true, saveStatus: 'unsaved' as SaveStatus }))
  },

  // ── Settings ──

  updateSettings: (settings) => {
    set(s => ({ currentFile: s.currentFile ? { ...s.currentFile, settings: { ...s.currentFile.settings, ...settings } } : null,
      hasUnsavedChanges: true, saveStatus: 'unsaved' as SaveStatus }))
    autosave(get)
  },

  // ── Notifications ──

  dismissNotification: (id) => set(s => ({
    dismissedNotificationIds: [...s.dismissedNotificationIds, id]
  })),

  clearAllNotifications: () => {
    const { calculationResult } = get()
    const allIds = (calculationResult?.warnings ?? []).map(w => `${w.type}-${w.periodKey}`)
    set({ dismissedNotificationIds: allIds })
  },

  // ── Recent Files ──

  setRecentFiles: (files) => set({ recentFiles: files })
}))

// ─── Helpers ─────────────────────────────────────────────────

function autosave(get: () => AppStore) {
  const { currentFile, currentFilePath } = get()
  if (currentFile?.settings.autosave && currentFilePath) get().saveCurrentFile()
}

function latestUpdateBefore(
  updates: AccountBalanceUpdate[],
  accountId: string,
  beforeISO: string
): AccountBalanceUpdate | undefined {
  return updates
    .filter(u => u.accountId === accountId && u.effectiveAt <= beforeISO)
    .sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt))
    .at(-1)
}

declare global {
  interface Window { fileAPI: import('../shared/types').FileAPI }
}
