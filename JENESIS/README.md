# JENESIS — Professional Business Accounting & Management Software

**JENESIS** is an enterprise-grade accounting and business-management application crafted specifically for small and medium-sized enterprises (SMEs). Inspired by the rigor, depth, and workflows of established systems like **Sage 100**, JENESIS provides an original, modern implementation with a double-entry accounting engine, multi-company support, inventory valuation (Weighted Average & FIFO), physical stock counts, multi-currency (including period-end foreign-exchange revaluation), granular role-based permissions, and complete three-language localization (**English**, **French**, and **Kinyarwanda**).

---

## 📦 About this build

This is the **consolidated JENESIS application**: the features of the previous
`JEN 0.2` and `JAN 0.3` archives, merged into one project — plus a full
**Light Mode / Dark Mode theme system** — and verified by
**203 automated checks**.

- **Download the Windows installer / portable package**: [`DOWNLOAD.md`](DOWNLOAD.md)
- **Merge report** (what came from where, bugs fixed, test results): [`MERGE-REPORT.md`](MERGE-REPORT.md)
- **Installation, upgrade and first launch**: [`INSTALL.md`](INSTALL.md)
- **Desktop packaging and CI**: [`DESKTOP.md`](DESKTOP.md)

Status: **203 automated checks pass** (locally and on Linux CI, with the real
SQLite driver) and the **Windows installer is built and smoke-tested on a
GitHub-hosted Windows runner** — `JENESIS-Setup-1.0.0.exe`, 88 MB, installed-
application checks green (see the latest CI run cited in `MERGE-REPORT.md` §6;
the installer is attached to that run as the `JENESIS-Windows-installer`
artifact). It is unsigned and has not been run on a physical PC, and **no human
or browser engine has looked at the rendered themes** (the sandbox has no
display; the themes are verified by tests, contrast maths and a check inside the
installed package). See `MERGE-REPORT.md` §6 and §9 for exactly what is and is
not verified.

---

## 🚀 Key Functional Modules

### 1. Double-Entry Accounting Core
- **Mathematical Balance Enforcement**: Every posted journal entry strictly verifies `Total Debits = Total Credits` down to the exact penny before committing. Unbalanced transactions are rejected.
- **Chart of Accounts**: Full hierarchical management across Assets, Liabilities, Equity, Revenue, Cost of Goods Sold (COGS), and Operating Expenses.
- **Automated Posting**:
  - **Sales Invoice Posting**: Debits Accounts Receivable / Cash, Credits Sales Revenue & Output VAT, Debits Cost of Goods Sold (COGS), Credits Merchandise Inventory, decrements warehouse stock, and logs inventory movement.
  - **Purchase Bill Posting**: Debits Merchandise Inventory & Input VAT, Credits Accounts Payable, increments warehouse stock, recalculates weighted-average unit cost, and updates supplier balance.
  - **Payments & Receipts**: Automatic debit/credit linking customer receipts, vendor disbursements, operating expenses, and bank transfers.
- **Audit-Proof Reversals**: Posted journal entries cannot be silently destroyed; a proper `REVERSAL` transaction swaps debits and credits while referencing the original voucher.

### 1b. Light Mode and Dark Mode
- **Three choices** in **Settings → Appearance**: **Light Mode**, **Dark Mode**
  and **System Default** (follows Windows), with sun / moon / monitor icons.
- **Immediate switching**: the theme is applied to every screen without a
  restart, a reload or any loss of state.
- **Remembered**: the choice is stored on the computer and is restored on the
  next launch, after a restart of the PC, and after reinstalling the app.
- **Applied everywhere**: dashboard, sidebar, header, sales, purchases,
  customers, suppliers, inventory, banking, accounting, reports, tables, forms,
  dialogs, toasts, status badges and the sign-in screens.
- **Built for long sessions**: coordinated dark surfaces, borders that stay
  visible without glare, and text contrast verified automatically against
  WCAG AA in both themes (see `tests/theme.test.js`).
- A quick **sun/moon switch** in the header uses the same central theme manager.

### 2. Trilingual Localization
1. **English (UK / US)**
2. **Français**
3. **Ikinyarwanda**

Language switching is accessible from the top navigation bar and within Settings, with zero data loss and 100% dictionary synchronization across menus, buttons, forms, reports, dialogs, and error messages.

### 3. Executive Financial Dashboard
- **Real-time KPI Metrics**: Total Sales, Total Purchases, Liquidity Balances (Cash on Hand, Commercial Bank, Mobile Money), Accounts Receivable, Accounts Payable, Stock Asset Value, Gross Margin, and Net Profit.
- **Date Period Filter**: Today, This Week, This Month, This Quarter, This Year, or Custom Ranges.
- **Low Stock Warnings**: Proactive alerts highlighting products reaching or falling below minimum reorder levels.
- **Recent Transactions & Top Debtors / Creditors**.

### 4. Products & Stock Management
- Complete item catalog supporting physical merchandise and services.
- Real-time stock tracking with storage bay / warehouse location assignment.
- **Stock Adjustments**: Formal loss, damage, expiration, and surplus adjustment vouchers with balanced GL postings.
- **Physical Inventory Count Wizard**: Side-by-side reconciliation of theoretical system quantity vs. actual counted quantity with automated variance valuation and adjustment posting.
- **Inventory Movements Ledger**: Full chronological audit trail of all warehouse ins and outs.
- **Stock Valuation**: Real-time asset cost valuation, retail valuation, and projected margins.

### 5. Sales & Invoicing
- **Quotations / Estimates**: Pro-forma estimates with one-click conversion to Sales Invoices.
- **Sales Invoices**: Line-item computation with discounts, configurable VAT tax rates, subtotal, and balance due tracking.
- **Official Print Layout**: Clean, printer-ready corporate tax invoice with company letterhead, TIN, client billing address, itemized breakdown, and banking instructions.
- **Credit Notes**: Sales returns and refunds with optional automatic stock restoration.

### 6. Purchases & Vendor Bills
- Purchase Orders and Vendor Bills.
- Direct inventory increments and automatic unit cost recalculation.
- Accounts Payable tracking with supplier balance summaries.

### 7. Banking & Liquidity Management
- Management of Cash registers, Commercial Bank accounts, and Mobile Money merchant accounts (e.g. MTN MoMo, Airtel Money).
- Inter-account fund transfers.
- Direct expense payments (Rent, Utilities, Salaries) and non-operating revenue receipts.

### 8. Multi-Currency and Foreign Exchange
- Transactions in foreign currency store the currency, the exchange rate and the foreign amount; the ledger is always in base currency at the transaction-date rate.
- **Settlement differences**: paying a foreign-currency invoice or bill at a moved rate posts the realised difference to **4800 Foreign Exchange Gain** / **5900 Foreign Exchange Loss** and clears the document exactly.
- **Period-end revaluation**: open foreign-currency customer and supplier balances can be restated at the effective rate of a chosen date (Settings → Currencies). The unrealised difference is posted to **4810 Unrealized FX Gain** / **5910 Unrealized FX Loss** against A/R or A/P, with a balanced journal entry, a per-document audit trail and full history (`FXR-…` vouchers). The **original booking rate is preserved forever**; only the current book rate advances. Duplicate runs for the same date are refused, a run with no movement posts nothing, and customer/supplier balances stay in step with the control accounts.

### 9. Audited Financial Reports
- **Trial Balance**: Instant verification of debit-credit equality.
- **Profit & Loss (Income Statement)**: Operating Revenue, COGS, Gross Profit, Operating Expenses, and Net Profit.
- **Balance Sheet**: Assets = Liabilities + Equity balance verification.
- **Cash Flow Statement**: Inflows, outflows, and net change in liquid funds.
- **A/R Aging & A/P Aging Reports**: 1–30, 31–60, 61–90, and >90 day aging brackets.
- **Customer & Supplier Statements**: Running balance transaction statements.
- **Tax Report (VAT)**: Output tax collected vs. Input tax deductible = Net VAT payable.
- **Export & Print**: One-click CSV export and browser-native printing.

### 10. Multi-Company & Security Administration
- Independent company segregation.
- Granular Role-Based Access Control (RBAC):
  - **Administrator**
  - **Accountant**
  - **Sales**
  - **Purchases**
  - **Inventory**
  - **Manager**
- Comprehensive **Audit Trail Log** capturing timestamps, users, actions, and details.
- Full system JSON **Backup Export & Restoration** with verification.
- Demo data reset tool for sales presentations.

---

## 🛠️ Technology Stack

- **Backend**: Node.js & Express
- **Database Engine**: SQLite with WAL (Write-Ahead Logging) mode and ACID transaction guarantees via `better-sqlite3`
- **Frontend**: React 18, Vite, Tailwind CSS, Lucide Icons
- **Architecture**: Modular REST API + Embedded Single Page Application (SPA)

---

## 🚀 Running the Application

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Test Suite (Verifies Double-Entry Ledger Equality)
```bash
npm test
```

### 3. Run the Whole Suite (165 checks)
```bash
npm run test:all
```
Individual suites: `npm run test:auth`, `npm run test:security`, `npm run test:desktop`,
`npm run test:ops`, `npm run test:migrations`, `npm run test:i18n`, `npm run test:fx`
(FX settlement), `npm run test:fxreval` (FX revaluation integrity),
`npm run test:datadir` (data-directory migration), `npm run test:branding`.

### 4. Build Client & Start Production Server
```bash
npm run build
npm start
```
The server will start on port `3000` (e.g., `http://localhost:3000`).

### 5. Build the Windows Installer
```bat
build-installer.bat          :: or: npm ci && npm run desktop:dist
```
Produces `release\JENESIS-Setup-1.0.0.exe`. See [`INSTALL.md`](INSTALL.md).

---

## 👥 First Start, Sign-in and Accounts

- **New installation:** JENESIS opens a one-time setup screen. Enter the company name and create the first
  administrator. There are no default accounts and no default passwords.
- **Existing database:** sign in with your existing username. Accounts that still use an old password format
  are asked to choose a new password at first sign-in.
- **Roles:** Administrator, Accountant, Sales, Purchases, Inventory, Manager. Each role has a fixed permission
  set enforced by the server (see `server/auth.js`). The manager role is read-only.
- **Sessions:** sign-in tokens expire after 30 minutes of inactivity and after 12 hours in total.
  Five consecutive wrong passwords lock the account for 15 minutes.
- **Demo data (development only):** `GENESIS_SEED_DEMO=1` on a *new* database creates sample data with the
  accounts `admin`, `accountant`, `sales`, `purchases`, `inventory`, `manager` and password `admin123`.
  Never use this in production.


---

## ⚖️ License & Commercial Rights
Original software implementation. Ready for deployment and commercial sale to small and medium-sized enterprises.
