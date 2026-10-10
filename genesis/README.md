# GENESIS — Professional Business Accounting & Management Software

**GENESIS** is an enterprise-grade accounting and business-management application crafted specifically for small and medium-sized enterprises (SMEs). Inspired by the rigor, depth, and workflows of established systems like **Sage 100**, GENESIS provides an original, modern implementation with a double-entry accounting engine, multi-company support, inventory valuation (Weighted Average & FIFO), physical stock counts, multi-currency, granular role-based permissions, and complete three-language localization (**English**, **French**, and **Kinyarwanda**).

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

### 8. Audited Financial Reports
- **Trial Balance**: Instant verification of debit-credit equality.
- **Profit & Loss (Income Statement)**: Operating Revenue, COGS, Gross Profit, Operating Expenses, and Net Profit.
- **Balance Sheet**: Assets = Liabilities + Equity balance verification.
- **Cash Flow Statement**: Inflows, outflows, and net change in liquid funds.
- **A/R Aging & A/P Aging Reports**: 1–30, 31–60, 61–90, and >90 day aging brackets.
- **Customer & Supplier Statements**: Running balance transaction statements.
- **Tax Report (VAT)**: Output tax collected vs. Input tax deductible = Net VAT payable.
- **Export & Print**: One-click CSV export and browser-native printing.

### 9. Multi-Company & Security Administration
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

### 3. Build Client & Start Production Server
```bash
npm run build
npm start
```
The server will start on port `3000` (e.g., `http://localhost:3000`).

---

## 👥 Default Demo Credentials

| Role | Username | Password |
|---|---|---|
| System Administrator | `admin` | `admin123` |
| Chief Accountant | `accountant` | `admin123` |
| Sales Executive | `sales` | `admin123` |
| Purchasing Officer | `purchases` | `admin123` |
| Warehouse Manager | `inventory` | `admin123` |
| Operations Manager | `manager` | `admin123` |

---

## ⚖️ License & Commercial Rights
Original software implementation. Ready for deployment and commercial sale to small and medium-sized enterprises.
