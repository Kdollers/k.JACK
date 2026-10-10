Build a professional business accounting and management software called **GENESIS**.

The software should be inspired by the workflow and capabilities of established accounting systems such as **Sage 100**, but it must be an original implementation with its own interface, code, database structure, and branding. Do not copy Sage's proprietary code, artwork, or exact interface.

## 1. Main objective

Create a reliable accounting and business-management application for small and medium-sized businesses.

The software should manage:

- Customers
- Suppliers
- Products and services
- Inventory/stock
- Sales
- Purchases
- Payments and receipts
- Accounts receivable
- Accounts payable
- General ledger
- Chart of accounts
- Journal entries
- Financial reports
- Taxes
- Users and permissions
- Company settings
- Data backup and restoration
- Audit history

The application must be designed as a real accounting system, not merely a demonstration or mockup.

## 2. Languages

The entire application must support three languages:

1. English
2. French
3. Kinyarwanda

Language selection must be available when the application starts and also inside Settings.

The user must be able to switch languages without losing data.

Every user-facing element must be translated, including:

- Menus
- Buttons
- Forms
- Labels
- Error messages
- Confirmation messages
- Notifications
- Reports
- Settings
- Dialog boxes
- Help text
- Validation messages

Do NOT leave untranslated English text in the French or Kinyarwanda interface.

Use a proper localization system instead of hard-coding translations throughout the application.

For example:

English:

- Customers
- Suppliers
- Products & Stock
- Sales
- Purchases
- Payments
- Accounting
- Reports

French:

- Clients
- Fournisseurs
- Produits et stock
- Ventes
- Achats
- Paiements
- Comptabilité
- Rapports

Kinyarwanda:
Use natural and professionally appropriate Kinyarwanda terminology for accounting and business concepts.

Keep all three translation dictionaries synchronized whenever a new interface text is added.

## 3. Dashboard

Create a professional accounting dashboard showing information such as:

- Total sales
- Total purchases
- Cash balance
- Bank balance
- Accounts receivable
- Accounts payable
- Inventory value
- Gross profit
- Net profit
- Recent transactions
- Low-stock products
- Outstanding customer balances
- Outstanding supplier balances

Allow the user to select a date period.

## 4. Company management

The user should be able to create and manage companies.

Company information should include:

- Company name
- Address
- Telephone
- Email
- Tax identification number
- Currency
- Fiscal year
- Default language
- Accounting settings

Design the system so that accounting data from different companies cannot accidentally mix.

## 5. Customers

Create a complete customer management module.

Customers should have:

- Customer code
- Name
- Address
- Telephone
- Email
- Tax information
- Opening balance
- Credit limit
- Payment terms
- Active/inactive status

The system must maintain customer transaction history.

Allow users to:

- Create customers
- Edit customers
- Search customers
- View customer accounts
- View invoices
- Record payments
- View outstanding balances
- Print/export statements

## 6. Suppliers

Create a supplier management module with similar functionality.

Include:

- Supplier code
- Name
- Address
- Telephone
- Email
- Tax information
- Opening balance
- Payment terms
- Transaction history
- Outstanding balance

## 7. Products and inventory

Create a complete inventory system.

Each product should support:

- Product code/SKU
- Barcode
- Product name
- Description
- Category
- Unit
- Cost price
- Selling price
- Tax rate
- Minimum stock level
- Current stock
- Warehouse/location
- Active/inactive status

Inventory functionality should include:

- Stock receipts
- Stock issues
- Stock adjustments
- Stock transfers
- Physical inventory counts
- Stock corrections
- Stock valuation
- Low-stock warnings
- Inventory movement history

The physical inventory function must allow the user to enter:

- System quantity
- Physical quantity
- Difference
- Cost/value difference

The system must preserve an audit trail of inventory adjustments.

Support appropriate inventory valuation methods such as:

- FIFO
- Weighted average

## 8. Sales

Create a complete sales module.

Support:

- Quotes
- Sales orders
- Sales invoices
- Credit notes
- Customer payments
- Sales returns

A sales invoice should include:

- Invoice number
- Date
- Customer
- Products/services
- Quantity
- Unit price
- Discount
- Tax
- Subtotal
- Total
- Amount paid
- Balance due
- Payment method

When an invoice is posted, the accounting system must automatically create the appropriate journal entries.

For inventory products, posting a sale must also correctly update stock and cost of goods sold.

Do not allow accounting and inventory to become inconsistent.

## 9. Purchases

Create:

- Purchase orders
- Purchase invoices
- Supplier payments
- Purchase returns

Posting a purchase should correctly update inventory and accounting according to the configured accounting rules.

## 10. Payments

Support multiple payment methods such as:

- Cash
- Bank
- Mobile Money
- Other configured payment accounts

Payments must be linked to the appropriate customer, supplier, invoice, or account.

## 11. Accounting engine

Build a real double-entry accounting engine.

Every posted accounting transaction must have:

- Debit entries
- Credit entries
- Date
- Reference
- Description
- Source document
- User
- Timestamp

The system must enforce:

**Total Debits = Total Credits**

Do not allow an unbalanced journal entry to be posted.

Provide:

- Chart of Accounts
- Journal Entries
- General Ledger
- Trial Balance
- Profit & Loss
- Balance Sheet
- Cash/Bank reports
- Accounts Receivable
- Accounts Payable

## 12. Chart of accounts

Allow users to create and modify accounts.

Each account should have:

- Account code
- Account name
- Account type
- Parent account
- Active/inactive status

Support account types such as:

- Assets
- Liabilities
- Equity
- Revenue
- Cost of Goods Sold
- Expenses

Do not hard-code the chart of accounts so that different businesses can configure their own accounts.

## 13. Financial reports

Create professional reports including:

- Trial Balance
- General Ledger
- Profit & Loss
- Balance Sheet
- Cash Flow
- Sales Report
- Purchase Report
- Inventory Valuation
- Inventory Movement
- Customer Statement
- Supplier Statement
- Accounts Receivable Aging
- Accounts Payable Aging
- Tax Report

Reports should support:

- Date filtering
- Account/customer/supplier/product filtering
- Print
- PDF export
- Excel/CSV export

## 14. Tax system

Create a configurable tax system.

Allow the company to define:

- Tax name
- Tax rate
- Tax account
- Tax-inclusive/exclusive pricing

Do not assume that every country uses the same tax rules.

The architecture should allow country-specific tax configurations.

## 15. Users and security

Create a user-management system.

Support:

- Username
- Password
- Role
- Permissions
- Active/inactive status

Create roles such as:

- Administrator
- Accountant
- Sales
- Purchases
- Inventory
- Manager

Permissions should control access to modules and actions.

For example, a sales employee should not automatically have permission to delete accounting entries.

## 16. Audit trail

Important actions must be recorded.

Record:

- User
- Date/time
- Action
- Module
- Record affected
- Previous value where appropriate
- New value where appropriate

Important accounting transactions should not simply be deleted after posting.

Use proper reversal/correction mechanisms.

## 17. Database

Use a robust relational database.

The database must maintain:

- Referential integrity
- Foreign keys
- Unique constraints
- Appropriate indexes
- Transactions
- Backups
- Data validation

Never store important accounting information only in the interface.

The accounting database must remain consistent even if the application closes unexpectedly.

## 18. Backup and restore

Create a backup system.

Allow the administrator to:

- Create a backup
- Restore a backup
- Schedule backups where supported
- Choose backup location
- Verify backup integrity

Warn the user before destructive operations.

## 19. User interface

Create a modern professional desktop-style interface.

The interface should contain:

- Sidebar navigation
- Dashboard
- Search
- Tables
- Forms
- Filters
- Date selectors
- Confirmation dialogs
- Notifications
- Professional reports

The interface should be easy for someone familiar with accounting software to understand.

Do not make it look like a simple student project.

## 20. Data validation

Implement strong validation.

Examples:

- Required fields cannot be empty.
- Quantities cannot contain invalid values.
- Prices must be valid numbers.
- Dates must be valid.
- Accounting entries must balance.
- Duplicate codes should be prevented.
- Invalid references should be rejected.
- Posted accounting transactions should be protected from accidental modification.

Give the user clear error messages in the currently selected language.

## 21. Search and filtering

Provide fast search throughout the application.

Users should be able to search:

- Customers
- Suppliers
- Products
- Invoices
- Purchases
- Payments
- Journal entries
- Accounts

Support filtering by:

- Date
- Code
- Name
- Status
- Amount
- User

## 22. Currency

Make currency configurable by company.

Do not hard-code one currency.

Support proper currency formatting and decimal handling.

## 23. Architecture

Use a clean modular architecture.

Separate:

- User interface
- Business logic
- Accounting engine
- Inventory engine
- Database layer
- Authentication
- Localization
- Reporting
- Configuration

Do not put the entire application into one giant source file.

## 24. Reliability requirements

The application must prioritize accounting accuracy over visual appearance.

Before considering the application complete, test:

- Sales
- Purchases
- Payments
- Returns
- Inventory adjustments
- Customer balances
- Supplier balances
- Journal entries
- Trial Balance
- Profit & Loss
- Balance Sheet

Test that transactions correctly flow through all related modules.

For example:

SALE → CUSTOMER BALANCE → CASH/RECEIVABLE → REVENUE → INVENTORY → COGS → GENERAL LEDGER → FINANCIAL REPORTS

All totals must remain consistent.

## 25. Important development rule

Do not create fake buttons or screens that do nothing.

Every major button must perform a real operation.

Do not claim that a feature is complete unless it has been implemented and tested.

Build the application incrementally.

After implementing each major module, test it before moving to the next module.

## 26. Initial development order

Build in this order:

1. Project architecture
2. Database
3. Authentication and users
4. Localization
5. Company setup
6. Chart of accounts
7. Customers
8. Suppliers
9. Products and inventory
10. Sales
11. Purchases
12. Payments
13. Accounting engine
14. Financial reports
15. Tax system
16. Audit trail
17. Backup/restore
18. Testing
19. Packaging/installation

## 27. Final requirement

The goal is to produce a serious accounting application called **GENESIS** that can eventually be used by real businesses.

It should have the depth and workflow expected from professional accounting software, while remaining an original product.

Do not build only a visual prototype.

Build the underlying accounting, inventory, database, reporting, security, and localization systems properly.