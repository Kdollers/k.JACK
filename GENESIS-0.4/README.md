# GENESIS — Professional Business Accounting & Management Software

**GENESIS** is a Windows desktop accounting and business-management application for small and medium-sized businesses. It contains a double-entry accounting engine, sales and purchasing workflows, inventory, reports, bank/cash records, and server-enforced roles. The interface has English, French, and Kinyarwanda dictionaries. This source checkout was extracted from `GEN 0.4.zip`; the archive's historical database is **not** a starter database and must not be used for a new installation. See [DESKTOP.md](DESKTOP.md) for deployment and limitations.

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

### 2. Trilingual Localization
1. **English (UK / US)**
2. **Français**
3. **Ikinyarwanda**

Switch languages in the top navigation bar or Settings. All three dictionaries share the same keys; `npm run test:i18n` checks key/placeholder parity and translated UI text. Formatting changes only presentation—not stored transaction values or currency configuration. User-entered names and memos remain verbatim. Recognized generated ledger and audit descriptions are translated only when displayed; the original audit wording is still available. Legal/accounting terminology, especially Kinyarwanda, should be reviewed by a qualified local accountant before regulated use.

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
- **Printable invoice**: Displays the available company/client information and itemized totals; it does not invent missing contact details or payment instructions. Review legally required invoice fields locally before use.
- **Credit Notes**: Sales returns and refunds with optional automatic stock restoration.

### 6. Purchases & Vendor Bills
- Purchase Orders and Vendor Bills.
- Direct inventory increments and automatic unit cost recalculation.
- Accounts Payable tracking with supplier balance summaries.

### 7. Banking & Liquidity Management
- Management of Cash registers, Commercial Bank accounts, and Mobile Money merchant accounts (e.g. MTN MoMo, Airtel Money).
- Inter-account fund transfers.
- Direct expense payments (Rent, Utilities, Salaries) and non-operating revenue receipts.

### 8. Audited Financial Reports
- **Trial Balance**: Instant verification of debit-credit equality.
- **Profit & Loss (Income Statement)**: Operating Revenue, COGS, Gross Profit, Operating Expenses, and Net Profit.
- **Balance Sheet**: Assets = Liabilities + Equity balance verification.
- **Cash Flow Statement**: Inflows, outflows, and net change in liquid funds.
- **A/R Aging & A/P Aging Reports**: 1–30, 31–60, 61–90, and >90 day aging brackets.
- **Customer & Supplier Statements**: Running balance transaction statements.
- **Tax Report (VAT)**: Output tax collected vs. Input tax deductible = Net VAT payable.
- **Export & Print**: One-click CSV export and browser-native printing.

### 9. Security Administration
- Server-side company scoping for the signed-in user. Creating more companies does **not** automatically grant existing users access to them; cross-company workflows have not been qualified.
- Granular Role-Based Access Control (RBAC):
  - **Administrator**
  - **Accountant**
  - **Sales**
  - **Purchases**
  - **Inventory**
  - **Manager**
- Comprehensive **Audit Trail Log** capturing timestamps, users, actions, and details.
- Full system JSON **Backup Export & Restoration** with verification.
- Public first-run setup is disabled after the first administrator is created; there is no demo-account reset endpoint.

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

### 2. Run Tests and Localization Audit
```bash
npm run test:all
node scripts/check-i18n.cjs
```
The suite uses isolated temporary databases, including a copy of the legacy database extracted from the original zip; it never modifies the extracted `genesis.db`.

### 3. Build Client & Start the Local Server
```bash
npm run build
npm start
```
The server binds to `127.0.0.1:3000` by default. The database lives in per-user storage, **not** in this source directory: on Windows `%APPDATA%\GENESIS\genesis.db` (or the explicit `GENESIS_DB_PATH` for an authorized test/restore). For desktop installation and backups see [DESKTOP.md](DESKTOP.md).

---

## 👥 First Start, Sign-in and Accounts

- **New installation:** GENESIS opens a one-time setup screen. Enter the company name and create the first
  administrator. There are no default accounts and no default passwords.
- **Existing database:** sign in with your existing username. Accounts that still use an old password format
  are asked to choose a new password at first sign-in.
- **Roles:** Administrator, Accountant, Sales, Purchases, Inventory, Manager. Each role has a fixed permission
  set enforced by the server (see `server/auth.js`). The manager role is read-only.
- **Sessions:** sign-in tokens expire after 30 minutes of inactivity and after 12 hours in total.
  Five consecutive wrong passwords lock the account for 15 minutes.
- **Existing installation with no active administrator:** setup remains locked to protect business data. Close
  GENESIS, make a safe backup, and have the authorized owner use the offline recovery procedure in
  [DESKTOP.md](DESKTOP.md). The historical archive includes sample users; they are **never automatically
  deleted or deactivated** by upgrading. The optional recovery action to deactivate six exact historical demo
  identities requires explicit confirmation. There are no shipped default credentials or demo-seeding switch.


---

## Limitations and validation
The source license field is `UNLICENSED`; this README does not grant commercial rights or certify accounting/tax compliance. FIFO is shown as a selectable setting, but the current postings use weighted-average costing; do not rely on FIFO behavior without separate implementation and verification. An unsigned installer and local tests alone do not establish suitability for production or regulatory filings. Have a qualified accountant and native Kinyarwanda reviewer validate workflows and terminology before rollout.
