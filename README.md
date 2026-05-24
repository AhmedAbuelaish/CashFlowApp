# CashFlow Planner

A local-first Electron desktop application for personal, household, and scenario-based cash-flow planning. Converts income, expenses, assets, and recurrence rules into a traceable actual-date cash-flow forecast with period and cumulative surplus/deficit tracking.

---

## Table of Contents

1. [Overview](#overview)
2. [Installation](#installation)
3. [Running in Development](#running-in-development)
4. [Packaging for Distribution](#packaging-for-distribution)
5. [Project Structure](#project-structure)
6. [Data Model](#data-model)
7. [Calculation Engine](#calculation-engine)
8. [Unit Tests](#unit-tests)
9. [Example Data](#example-data)
10. [Limitations and Next Steps](#limitations-and-next-steps)

---

## Overview

CashFlow Planner answers the core planning question:

> **Will I accumulate enough cumulative surplus before large future payments occur?**

Key principles:
- All income and expenses are calculated on their **actual scheduled occurrence dates** — annual, quarterly, semiannual, and irregular payments are never automatically spread across months.
- Period surplus/deficit and **cumulative** surplus/deficit are first-class values.
- Every calculated number is **traceable** to its source line item, recurrence rule, occurrence, override, or linked formula.
- All data is stored locally in a portable JSON file — no cloud, no database.

---

## Installation

### Prerequisites

- **Node.js** 18 or later
- **npm** 9 or later

### Install dependencies

```bash
cd cashflow-planner
npm install
```

---

## Running in Development

```bash
npm run dev
```

This starts the Electron app with hot-reloading via `electron-vite`. The main process, preload bridge, and React renderer all reload on file changes.

---

## Packaging for Distribution

### macOS

```bash
npm run build
npm run dist:mac
```

Produces a `.dmg` installer in `dist/`.

### Windows

```bash
npm run build
npm run dist:win
```

Produces a `.exe` NSIS installer in `dist/`.

### Linux

```bash
npm run build
npm run dist:linux
```

Produces an `.AppImage` in `dist/`.

> **Note:** Cross-compilation (building for a different OS than your host) requires additional toolchain setup. Build on the target platform for simplest results.

---

## Project Structure

```
cashflow-planner/
├── electron.vite.config.ts     # Build config (main + preload + renderer)
├── package.json
├── tsconfig.json               # Root tsconfig
├── tsconfig.node.json          # Main/preload tsconfig
├── tsconfig.web.json           # Renderer tsconfig
├── vitest.config.ts            # Test runner config
│
├── src/
│   ├── main/
│   │   └── index.ts            # Electron main process: window, menus, IPC, file I/O
│   ├── preload/
│   │   └── index.ts            # Secure IPC bridge (contextIsolation: true)
│   └── renderer/
│       ├── index.html
│       └── src/
│           ├── main.tsx        # React entry point
│           ├── App.tsx         # Routing, menu event wiring
│           ├── index.css       # Design system (CSS variables, layout, components)
│           ├── store/
│           │   └── appStore.ts # Zustand global store + actions
│           ├── shared/
│           │   ├── types.ts    # All TypeScript interfaces
│           │   └── engine/
│           │       ├── types.ts        # Re-export alias
│           │       ├── recurrence.ts   # Recurrence rule engine
│           │       ├── calculator.ts   # Full calculation engine
│           │       └── validator.ts    # Input + file validation
│           └── components/
│               ├── Splash/
│               │   └── SplashScreen.tsx
│               ├── shared/
│               │   ├── Layout.tsx
│               │   └── Modal.tsx
│               ├── Dashboard/
│               │   ├── Dashboard.tsx
│               │   ├── CashFlowChart.tsx
│               │   ├── CashFlowTable.tsx
│               │   └── PastProjectedReview.tsx
│               ├── LineItems/
│               │   ├── LineItemForm.tsx
│               │   ├── LineItemsList.tsx
│               │   └── OccurrencesList.tsx
│               ├── Accounts/
│               │   ├── AccountForm.tsx
│               │   └── AccountsList.tsx
│               ├── Reports/
│               │   └── Reports.tsx
│               └── Settings/
│                   └── Settings.tsx
│
├── tests/
│   ├── recurrence.test.ts  # Recurrence engine unit tests
│   └── calculator.test.ts  # Calculation engine unit tests
│
└── example-data/
    └── example.cashflow.json   # Sample data file
```

---

## Data Model

The app stores all data in a single `.cashflow.json` file. No external database is required.

### Top-level structure

```json
{
  "schemaVersion": "1.0.0",
  "fileMetadata": { "name": "", "createdAt": "", "updatedAt": "" },
  "settings": { "autosave": true, "defaultViewScale": "month", ... },
  "accounts": [],
  "assets": [],
  "lineItems": [],
  "occurrenceOverrides": [],
  "reports": []
}
```

### Key entities

| Entity | Purpose |
|---|---|
| `Account` | Liquid or tied-up account with balance and currency |
| `Asset` | Asset with liquidation rule, fees, and availability |
| `LineItem` | Income or expense series with full recurrence + amount rules |
| `RecurrenceRule` | Defines when occurrences happen (single date, specific dates, finite by count, finite until date, infinite) |
| `AmountRule` | Fixed, percentage of another line item, or percentage of a category |
| `OccurrenceOverride` | Per-occurrence amount, status, or comment override |
| `ConditionalRule` | Makes an expense optional based on surplus/balance threshold |
| `ReportDefinition` | Saved report configuration (type, start, end, scale) |

### Design decisions

- **Source rules are always stored, never only outputs.** Occurrences are regenerated from rules at calculation time. Calculated values may be cached but are clearly separated.
- **`parentSeriesId`** is stored on split series so historical occurrences remain traceable to the original series.
- **`occurrenceOverrides`** are keyed by `(lineItemId, occurrenceDate)` so they survive recalculation without being lost.
- The file schema is versioned (`schemaVersion`) to support future migrations without breaking existing files.

---

## Calculation Engine

Located in `src/renderer/src/shared/engine/`.

### Recurrence engine (`recurrence.ts`)

Generates occurrence dates from a `RecurrenceRule`:

| Mode | Description |
|---|---|
| `singleDate` | One-time occurrence |
| `specificDates` | User-provided list of dates |
| `finiteByCount` | Repeats N times at given interval/unit |
| `finiteUntilDate` | Repeats until a given end date |
| `infinite` | Repeats indefinitely (requires a date range to bound generation) |

Supported units: `day`, `week`, `month`, `year`.

Business-day adjustment: `none`, `nextBusinessDay`, `previousBusinessDay`.

Special rules: `firstBusinessDayOfMonth`, `lastBusinessDayOfMonth`.

Day-of-month pinning: if `dayOfMonth` is set, monthly recurrences land on that day (with end-of-month clamping for short months).

### Calculation engine (`calculator.ts`)

Calculation sequence (mandatory order):

1. Generate income occurrences for the date range
2. Generate expense occurrences for the date range
3. Apply `occurrenceOverrides`
4. Resolve linked amounts (topological sort, cycle detection)
5. Aggregate **required** income and expenses by period
6. Calculate preliminary period surplus/deficit
7. Calculate preliminary cumulative surplus/deficit
8. Evaluate optional expenses against their `ConditionalRule`
9. Recalculate final period surplus/deficit
10. Recalculate final cumulative surplus/deficit
11. Calculate beginning and ending liquid balances
12. Flag past projected income for review

### Required formulas

```
Period Cash Flow In  = Σ income occurrences in period
Period Cash Flow Out = Σ expense occurrences in period
Period Net           = Cash Flow In − Cash Flow Out
Cumulative[N]        = Cumulative[N-1] + Net[N]
Ending Liquid Bal.   = Beginning Liquid Bal. + Net[N]
```

### Critical principle

**The engine never spreads annual, quarterly, semiannual, or irregular payments across months.** A `$3,000` annual insurance payment in December appears as `$3,000` in December only. The cumulative surplus/deficit row is the mechanism for understanding whether the user has built enough surplus before that obligation arrives.

### Linked amounts

A line item amount can be defined as a percentage of another line item or of a category total. The engine resolves dependencies using a topological sort. If a circular dependency is detected, a clear validation error is raised and the formula cannot be saved.

### Optional expenses

Expenses with a `ConditionalRule` are evaluated after required expenses are summed. If the condition is met (e.g., period surplus > threshold), the optional expense is included and the period/cumulative values are recalculated. The UI marks each optional expense as included or excluded per period.

### Traceability

Every `Occurrence` carries a `traceability` array of `TraceabilityRecord` objects identifying:
- Source line item and ID
- Whether the value was actual, projected, linked, optional, or overridden
- Original recurrence rule
- Any override that was applied

Clicking a period total in the table drills down to the contributing occurrences with full traceability.

---

## Unit Tests

Run all tests:

```bash
npm test
```

### `tests/recurrence.test.ts`

- Monthly recurrence on a specific day of month
- Monthly recurrence with end-of-month clamping
- Weekly recurrence finite by count
- Semiannual recurrence finite by count
- Annual recurrence
- First business day of month (weekday and weekend cases)
- Last business day of month
- Business-day adjustment (next/previous)
- `finiteUntilDate` mode
- `specificDates` mode
- Occurrence list sorted by date

### `tests/calculator.test.ts`

- Period cash flow in/out aggregation
- Cumulative surplus/deficit accumulation
- Annual payment impact on cumulative (the core "don't normalize" scenario)
- Quarterly and yearly scale aggregation
- Optional expense included vs excluded based on surplus threshold
- Linked percentage income calculation
- Occurrence override applied to amount and status
- Past projected income flagged for review
- Series split: original ends, new series starts at effective date
- Circular reference detection
- Beginning and ending liquid balance calculation
- Warning: first period where cumulative goes negative

---

## Example Data

`example-data/example.cashflow.json` contains a complete sample file with:

- 2 liquid accounts (checking + savings)
- 1 tied-up asset (retirement fund with 5-business-day liquidation delay)
- 13 line items:
  - Monthly salary (infinite, confirmed)
  - Annual bonus (infinite, projected)
  - Semiannual commission (infinite, projected)
  - Monthly rent (infinite)
  - Utilities (monthly, projected)
  - Annual homeowners insurance (annual, December)
  - Car insurance (semiannual)
  - Groceries (monthly)
  - Optional gym membership (conditional: surplus > $145)
  - Summer vacation (lump sum, future)
  - Winter vacation (lump sum, future)
  - Car maintenance (annual)
  - 401k contribution (monthly, linked: 6% of salary)
- 1 occurrence override (confirmed actual salary for a past month)
- 3 saved report definitions

To open it: launch the app → **Open** → select `example.cashflow.json`.

---

## Limitations and Next Steps

### Current limitations

| Area | Limitation |
|---|---|
| Holiday calendar | Weekends treated as non-business days; no holiday calendar |
| Proration UI | Proration is calculated by the engine but the UI does not expose a dedicated proration editor |
| PDF export | Reports export to CSV and JSON; PDF export is architected but not implemented |
| Transaction import | Manual line items only; no bank/credit card import |
| Multi-currency math | Currency field is stored but exchange rates are not applied |
| Reconciliation | Manual balance adjustment entry is supported; auto-reconciliation is future work |

### Recommended next improvements

1. **Holiday calendar** — Add a configurable holiday list to the business-day engine
2. **PDF report export** — Add a headless Chromium or `pdfkit`-based export from the existing report data
3. **Balance reconciliation view** — A dedicated reconciliation screen per account comparing calculated vs actual balance
4. **Transaction import** — CSV import from bank exports, mapped to line item categories
5. **Scenario comparison** — Side-by-side view of two `.cashflow.json` files
6. **Normalization overlay** — Optional analytical overlay showing what equivalent monthly amounts would look like (display only, does not affect calculation)
7. **Rolling forecast** — Auto-advance the view to always show N periods back and M periods forward from today
8. **Keyboard navigation** — Full keyboard shortcuts for the dashboard table
9. **Dark/light theme toggle** — The design system uses CSS variables; a light theme can be added by swapping the variable set

---

## Security Notes

- `contextIsolation: true` and `nodeIntegration: false` are enforced.
- All file I/O goes through the preload IPC bridge — the renderer has no direct Node.js access.
- All loaded JSON files are validated against the schema before being merged into app state.
- A malformed or incompatible file displays a clear error and does not corrupt the current session.

---

## License

MIT
