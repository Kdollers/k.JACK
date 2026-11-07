/**
 * helpContent.js — the "How to use JENESIS" guide.
 *
 * The guide is written once per language in the same structure, so English,
 * French and Kinyarwanda can never drift apart: tests/help-shortcuts.test.js
 * asserts that all three languages contain every section and every field.
 *
 * Structure of a section:
 *   title     – what the section is called
 *   purpose   – why you would use it
 *   where     – where to find it in the application
 *   steps     – ordered actions to take
 *   expected  – what should happen when the steps are followed
 *   notes     – warnings, limits and tips
 */
export const LANGUAGES = ['en', 'fr', 'rw'];

export const HELP = {
  en: {
    guideTitle: 'How to use JENESIS',
    guideIntro: 'A practical guide for everyday users: how to move around the program, record a sale or a purchase, print a document, use the calculator and the Messenger, change the appearance, and keep your data safe.',
    searchPlaceholder: 'Search the guide (e.g. print, F2, backup, theme…)',
    onThisPage: 'On this page',
    purposeLabel: 'Purpose',
    whereLabel: 'Where to find it',
    stepsLabel: 'Steps',
    expectedLabel: 'Expected result',
    notesLabel: 'Notes and warnings',
    shortcutsTitle: 'Keyboard shortcuts',
    shortcutKey: 'Keys',
    shortcutAction: 'What it does',
    noResults: 'Nothing in the guide matches your search.',
    printGuide: 'Print this guide',
    sections: {
      welcome: {
        title: 'Welcome to JENESIS',
        purpose: 'JENESIS is a double-entry accounting and business management program for a shop, a store, or a small company. Every sale, purchase, payment and stock movement produces real accounting entries, so your books are always up to date without extra work.',
        where: 'The application window. The left column lists the modules; the top bar shows the company, the date, the calculator, the Messenger, the language and your name.',
        steps: [
          'Sign in with the user name and password given by your administrator.',
          'Check that the company name at the top left is the one you want to work in.',
          'Pick a module in the left column: Dashboard, Customers, Suppliers, Inventory, Sales, Purchases, Banking, Accounting, Reports, Settings, Help.'
        ],
        expected: 'You see the Dashboard with the current figures of the company. The data of another company is never visible and never mixed.',
        notes: [
          'If you forget your password, only an administrator can reset it; the data itself is never lost.',
          'Your session ends automatically after a period of inactivity. Sign in again to continue.'
        ]
      },
      signin: {
        title: 'Signing in and first use',
        purpose: 'Protect the accounts: only authorised people may work in the program, and each action is recorded with the name of the user who did it.',
        where: 'The sign-in screen shown when JENESIS starts, and Settings → Users for administrators.',
        steps: [
          'Type your user name and password, then press Sign in (or press Enter).',
          'If the program asks you to change your password, choose a long password (at least 10 characters) that you do not use anywhere else.',
          'On the very first run, the administrator creates the company, the first user and the base currency.'
        ],
        expected: 'You are signed in and the Dashboard appears. Every action you take from now on is written to the audit log with your name.',
        notes: [
          'After several wrong attempts the account is locked for a few minutes; this protects the data against guessing.',
          'Sign out (top right) when you leave the computer, so nobody uses your name.'
        ]
      },
      applications: {
        title: 'The four JENESIS applications',
        purpose: 'Each member of the team opens the application that matches their work, and everybody works on the same company data.',
        where: 'The JENESIS Seller, JENESIS Network & Maintenance, JENESIS Accounting & Business and JENESIS Settings & Access Point shortcuts on the desktop or in the Start Menu. Opening JENESIS without a shortcut shows the chooser.',
        steps: [
          'JENESIS Seller (red) — selling: sales, receipts, customers, stock levels. It opens on Sales.',
          'JENESIS Network & Maintenance (green) — upkeep: the service, the connection between the computers, verified backups, integrity check and logs. It holds no accounting, sales, purchase, customer, supplier, product, inventory or reporting screen. It opens on Maintenance.',
          'JENESIS Accounting & Business (blue) — the books: accounting, purchases, banking, reports, taxes, users and permissions. It opens on the Dashboard.',
          'JENESIS Settings & Access Point (yellow) — configuration: company, users, roles, taxes, currencies, backup, appearance and the network access point. It opens on Settings.',
          'Each application remembers its own Light or Dark choice: changing the theme in Seller does not change the others.',
          'All four read and write the same company database, so a sale recorded in Seller appears at once in the Accounting & Business reports.'
        ],
        expected: 'Each shortcut opens its own window, with its own title, colour and menu. Nothing is duplicated: there is one set of records.',
        notes: [
          'A screen that does not belong to the application is not offered: JENESIS Seller has no general ledger, JENESIS Network & Maintenance has no sales screen and no financial figures at all.',
          'Your permissions still apply inside every application: a user who may not post an entry sees the same refusal as anywhere else.',
          'Created and developed by KAYIGANWA JACQUES.'
        ],
      },
      navigation: {
        title: 'Moving around the program',
        purpose: 'Reach any screen quickly with the mouse or the keyboard, and come back to where you were.',
        where: 'The left column lists every module you are allowed to open. The Help entry (or F1) opens this guide.',
        steps: [
          'Click a module in the left column to open it.',
          'Press Alt + Left arrow to go back to the previous screen, Alt + Right arrow to go forward again.',
          'Press F5 to reload the data of the current screen.',
          'Press Ctrl + / to open the searchable list of keyboard shortcuts.'
        ],
        expected: 'The screen changes immediately; JENESIS remembers your path so Alt + Left / Alt + Right walk through the screens you visited.',
        notes: [
          'Modules you have no permission for are not shown; the server enforces the same permissions even if a screen is opened directly.',
          'Escape never closes the program. It closes the open dialog first, then the panel (calculator or Messenger), then returns to the previous screen.'
        ]
      },
      sales: {
        title: 'Sales: receipts and invoices (created PAID)',
        purpose: 'Record what you sold. In JENESIS a sales document is PAID as soon as it is created: the program posts the sale and records the real receipt in the same operation, so the cash or bank balance and the customer balance are correct immediately.',
        where: 'Sales → Sales Invoices → "New Sales Invoice".',
        steps: [
          'Choose the customer, or tick "Walk-in / Anonymous Sale" for a counter sale without a customer name.',
          'Add the items: product, quantity, unit price, discount and tax.',
          'Choose the payment method and the settlement account (cash, mobile money, bank).',
          'Leave "Post Now" ticked (the default) and save.'
        ],
        expected: 'The document appears in the list with the green PAID status, a receipt number is shown in the confirmation message, stock is reduced, the cash or bank account increases, and the accounting entries are balanced. There is no PAID/UNPAID choice: the money movement is real.',
        notes: [
          'Select a row and press F3 (or the printer button) to print the document; Ctrl + P does the same.',
          'Untick "Post Now" only to keep the document as a draft (an unpaid credit sale). A draft can be settled later with the Settle button or by pressing F2 on the selected row.',
          'Pressing F2 twice does not pay twice: the second time JENESIS tells you the document is already paid and records nothing.',
          'To correct a mistake, reverse the payment or post a credit note. Never delete a posted document: the audit trail must stay complete.'
        ]
      },
      purchases: {
        title: 'Purchases: supplier bills (created PAID)',
        purpose: 'Record what you bought. As for sales, a purchase document is PAID when it is created: the program posts the bill and records the real supplier payment in one operation.',
        where: 'Purchases → Purchase Bills / Invoices → "New Purchase Bill".',
        steps: [
          'Choose the supplier and the vendor invoice number (if any).',
          'Add the items with quantity and cost.',
          'Choose the payment method and the settlement account.',
          'Leave "Post bill immediately" ticked (the default) and save.'
        ],
        expected: 'The bill shows PAID, stock increases, the supplier balance is settled, and the payment appears in Banking with its own accounting entry.',
        notes: [
          'If your company requires formal goods receiving, receive the goods first (Purchases → Goods Receipts) and link the receipt to the bill; the bill then clears the received-not-invoiced account instead of adding stock twice.',
          'A draft bill (no posting) can be settled later with Settle or F2; settling twice never creates a second payment.'
        ]
      },
      inventory: {
        title: 'Inventory and stock',
        purpose: 'Know exactly what is in each store, move goods between stores, and count the physical stock.',
        where: 'Inventory → Products, Stores, Transfers, Adjustments, Physical Counts.',
        steps: [
          'Add or edit a product with its cost price, selling price and the store it belongs to.',
          'Use a transfer to move goods from one store to another.',
          'Use an adjustment to correct a quantity, with a reason.',
          'Use a physical count to count the store; a count must be reviewed and approved by somebody else before it changes the books.'
        ],
        expected: 'Every movement is recorded with the date, the store, the quantity and the user, and stock value follows the weighted average cost.',
        notes: [
          'The person who counts cannot approve their own count: this separation is deliberate.',
          'A sale or a purchase also moves stock automatically; you do not post anything by hand.'
        ]
      },
      banking: {
        title: 'Banking and cash',
        purpose: 'Follow the money in your bank accounts and in the till.',
        where: 'The Banking module (Ctrl + Shift + B), with three tabs: Accounts, Payments and Cash.',
        steps: [
          'Accounts — the bank and cash accounts of the company with their balances.',
          'Payments — the money movements recorded against those accounts.',
          'Cash — open a cash session at the start of the day, count the till, then close the session; a supervisor approves the closing.'
        ],
        expected: 'Every movement is an accounting entry, so the cash and bank balances always agree with the general ledger.',
        notes: [
          'Sales and purchases are recorded PAID when they are posted, so no extra payment has to be invented for them.',
          'Counting the till needs the cash:count permission; approving a closing needs its own permission.'
        ],
      },
      calculator: {
        title: 'The built-in calculator',
        purpose: 'Compute an amount (a total, a discount, a tax) without leaving the program. It is a calculator only: it never posts or stores anything.',
        where: 'The "Calculator" button in the top bar, or Ctrl + Shift + K.',
        steps: [
          'Open the calculator with the header button or Ctrl + Shift + K.',
          'Type with the physical keyboard: digits 0–9, ".", +, −, *, /, Enter or "=" for the result, Backspace to delete a digit, "c" to clear, Esc to close. The keypad works too.',
          'Or click the buttons with the mouse; the panel can be dragged by its title bar and minimised with the "−" button.'
        ],
        expected: 'The result is shown with accounting precision (for example 0.1 + 0.2 gives 0.3, not 0.30000000000000004). You can then type that number into an amount field.',
        notes: [
          'Dividing by zero shows a clear message instead of an error code; press "C" and start again.',
          'While the calculator is open the keys belong to it, so typing "5" never triggers an application shortcut. Ctrl combinations and function keys still work (Ctrl + Shift + K closes it, F1 opens this guide).'
        ]
      },
      messenger: {
        title: 'JENESIS Messenger',
        purpose: 'Talk with your colleagues inside JENESIS — ask about a price, a missing product, or a document — without leaving the program.',
        where: 'The "Messenger" button in the top bar, immediately next to the calculator, or Ctrl + Shift + M.',
        steps: [
          'Open the Messenger and choose a colleague in the left list (or search for a name).',
          'Type your message and press Enter (Shift + Enter for a new line), or click the send button.',
          'Open a conversation to read it; unread messages are marked in green and the header button shows how many you have not read.',
          'Press Escape (or the "−" button) to close the panel.'
        ],
        expected: 'The message is saved, appears in the thread, and reaches the colleague who is connected. One tick means sent, two ticks means delivered, blue ticks means read.',
        notes: [
          'You can only message colleagues of the same company; the server checks this on every action, so a message can never leave your company.',
          'If the connection drops, the panel reconnects by itself and no message is shown twice.',
          'Message text is never written to the log files; only the fact that a message was sent is recorded.'
        ]
      },
      appearance: {
        title: 'Appearance: light, dark or system theme',
        purpose: 'Work comfortably in a bright room or at night, and follow the appearance of your computer if you prefer.',
        where: 'The theme button in the top bar, or Settings → Appearance.',
        steps: [
          'Click the theme button in the header to switch between Light and Dark.',
          'Or open Settings → Appearance and choose Light, Dark, or System Default.',
          'Press Alt + T to cycle through the three choices.'
        ],
        expected: 'The whole program — screens, tables, dialogs and this guide — follows your choice immediately, and the choice is remembered for the next start.',
        notes: [
          '"System Default" follows the appearance setting of Windows; the program adapts if you change it while running.',
          'Printing always uses the light, ink-friendly palette, whatever theme is on screen.'
        ]
      },
      shortcuts: {
        title: 'Keyboard shortcuts',
        purpose: 'Do the common actions without the mouse.',
        where: 'Press Ctrl + / for the searchable list, or F1 for this guide and read the shortcut section.',
        steps: [
          'F1 — open this guide.',
          'F2 — settle (mark PAID) the selected sales or purchase document.',
          'F3 — print the selected document (Ctrl + P does the same).',
          'F5 — reload the data on this screen.',
          'Ctrl + S — save the record you are editing.',
          'Ctrl + N — create a new document on this screen.',
          'Ctrl + E — edit the selected record.',
          'Ctrl + F — go to the search box on this screen.',
          'Ctrl + D — duplicate the selected document (where the screen allows it).',
          'Ctrl + Enter — confirm the dialog or submit the form.',
          'Alt + Left arrow — go back to the previous screen.',
          'Alt + Right arrow — go forward to the next screen.',
          'Ctrl + Shift + S — open Sales.',
          'Ctrl + Shift + R — create a new sales receipt.',
          'Ctrl + Shift + C — open Customers and search.',
          'Ctrl + Shift + P — open Purchases.',
          'Ctrl + Shift + V — open Suppliers and search.',
          'Ctrl + Shift + N — create a new purchase document.',
          'Ctrl + Shift + I — open Inventory.',
          'Ctrl + Shift + F — open Inventory and search product codes.',
          'Ctrl + Shift + T — open stock transfers.',
          'Ctrl + Shift + A — open Accounting.',
          'Ctrl + Shift + B — open Banking & Cash.',
          'Ctrl + Shift + L — open the General Ledger.',
          'Ctrl + Shift + G — open Reports.',
          'Ctrl + Shift + K — open or close the calculator.',
          'Ctrl + Shift + M — open or close JENESIS Messenger.',
          'Ctrl + / — show or hide the searchable list of shortcuts.',
          'Alt + T — cycle the theme: Light → Dark → System.',
          'Alt + L — switch the interface language.',
          'Escape — close the dialog, then the panel, then go back. Never quits the program.'
        ],
        expected: 'The action happens immediately, and a message tells you when there is nothing to do (for example F2 without a selected document, or F3 on a screen with nothing to print).',
        notes: [
          'While you are typing in a field, plain shortcuts are suspended so they never steal your text; function keys, Escape and Alt or Shift combinations still work.',
          'Permissions apply to shortcuts too: a user who may not post or settle sees a refusal message, exactly as if they had clicked the button.'
        ]
      },
      contextmenu: {
        title: 'Right-click on a record',
        purpose: 'Do to one row what you would otherwise hunt for in a toolbar: copy it, open it, retire it, or bring it back.',
        where: 'Any list of records in any of the four applications — customers, suppliers, products, sales, purchases, banking, accounting, the audit trail, the other-computer list and the settings panels.',
        steps: [
          'Right-click the row you want. The menu opens with only the actions that make sense for that row.',
          'Copy puts the record on the clipboard as text, so it can be pasted into a letter or a message.',
          'Edit opens the same editor the row\u2019s own button opens.',
          'Deactivate retires a record you no longer use; Activate brings it back. Neither touches its history.',
          'Delete removes a record that nothing depends on, and asks you to confirm first, naming the record.',
          'Select All selects every row in the list, for copying or printing.'
        ],
        expected: 'The action happens to the row you right-clicked, and a message tells you what was done — or why it was refused.',
        notes: [
          'Your role decides what you are offered, and the server asks the same question, so the menu is never the only gate.',
          'An accounting record is never destroyed. A record carrying accounting history is deactivated instead, and the menu says so.',
          'Figures that are not records — a trial-balance row, an audit entry — can be copied out but never edited or removed, because they are history.',
          'The menu is drawn in the colour of the application you are in, and no keyboard shortcut was taken away to make room for it.'
        ]
      },
      seller: {
        title: 'JENESIS Seller — the counter',
        purpose: 'Sell all day without seeing the accountant\u2019s figures, while every sale still lands in the same books.',
        where: 'JENESIS Seller (red) — Dashboard, Sales, Customers, Inventory, Help.',
        steps: [
          'The dashboard is the day: how many sales, how much taken, how much in cash and how much on credit, and the week behind it.',
          'New Sale opens the sales form; New Receipt opens it ready to print.',
          'Product Search finds an item by name or code and answers with its price and whether it is on the shelf.',
          'Available Stock shows what there is. It is read-only: prices and quantities are changed in JENESIS Accounting & Business.',
          'Sales History lists the recent documents and prints a receipt for any of them.',
          'Cash Register Information shows the till accounts and what is in them.'
        ],
        expected: 'A sale made here moves stock, writes the accounting entries and takes the money into the till — the accountant sees it in the same database, immediately.',
        notes: [
          'Seller does not show, and cannot reach, the accounting dashboard, the profit and loss, the balance sheet, the trial balance, the general ledger, the payables or the receivables. They are refused by the server, not merely hidden.',
          'A cost price is never shown here.',
          'Seller has no company or user settings: those live in JENESIS Settings & Access Point (yellow).'
        ]
      },
      accounting: {
        title: 'Accounting and reports',
        purpose: 'See the real financial situation: every document is posted as a balanced double-entry transaction, and the reports are built from those entries.',
        where: 'Accounting → Journal Entries, Chart of Accounts. Reports → Trial Balance, Profit & Loss, Balance Sheet, and the other reports.',
        steps: [
          'Open Reports → Trial Balance to check that debits equal credits at any moment.',
          'Open the Profit & Loss or Balance Sheet for the period you need.',
          'Open Accounting → Journal Entries to see the entries behind a document, with the user and the date.'
        ],
        expected: 'The Trial Balance is balanced — this is the proof that the books are correct. Reports can be printed (F3) or exported.',
        notes: [
          'A posted document cannot be edited; reverse it and post again so the history stays complete.',
          'Amounts are always stored in the base currency of the company; a foreign-currency document keeps its own currency, rate and converted total.'
        ]
      },
      settings: {
        title: 'Settings, users and permissions',
        purpose: 'Adapt the program to your company and give each person only the rights they need.',
        where: 'JENESIS Settings & Access Point (yellow) — Company, Users, Taxes, Currencies, Audit, Backup, Appearance.',
        steps: [
          'Company: name, address, base currency and accounting policies.',
          'Users: create a user, give a role (admin, accountant, sales, purchases, inventory, manager) and deactivate a user who leaves. A forgotten password is reset here, without knowing the old one.',
          'Access: choose which of the four applications each person may open, and grant or withdraw individual permissions on top of their role. Closing an application signs its open windows out.',
          'Taxes: create, edit, deactivate and reactivate rates, and see active and inactive separately.',
          'Currencies: the exchange rates used by your documents.',
          'Audit: review who did what and when — including every change made to a tax rate or to someone\u2019s access.'
        ],
        expected: 'Each user sees and can do only what their role allows — both in the interface and on the server.',
        notes: [
          'A tax rate that has been used in a document cannot be deleted: deactivate it instead. Deactivating one changes nothing in the documents already raised — they keep the rate they were made with — and the retired rate is simply no longer offered for new ones.',
          'Administrators should be few: an administrator can do everything, including restoring a backup.',
          'Never share a password; create one user per person so the audit log is meaningful.'
        ]
      },
      backup: {
        title: 'Backups, restore and data safety',
        purpose: 'Be able to recover your accounts after a mistake, a broken computer or a power cut.',
        where: 'Settings → Backup (Export / Import).',
        steps: [
          'Export a backup regularly (daily for a busy shop) and keep the file outside the computer — on a USB stick or another drive.',
          'To restore: open the backup file, re-enter your password and type RESTORE to confirm.',
          'JENESIS automatically takes a safety copy before a restore and before any database upgrade.'
        ],
        expected: 'The export downloads one file containing the whole company. After a restore the figures are exactly those of the backup, and the previous state is still available as a safety copy.',
        notes: [
          'Restoring replaces the current data of the company — that is why the confirmation and the password are required.',
          'Your data lives in the JENESIS application folder of your Windows user profile; back up that folder as well if you want a complete copy.'
        ]
      },
      maintenance: {
        title: 'Maintenance: service, network, backups and logs',
        purpose: 'Keep JENESIS healthy, let the other computers of the office connect, and prove the data is intact.',
        where: 'JENESIS Network & Maintenance → Maintenance (the screen it opens on), or JENESIS Accounting & Business → Maintenance.',
        steps: [
          'Service — shows the version, when the service started, how long it has been running, and where the database and the data folder are.',
          'Network — off by default: the service answers this computer only. Switch it on to let the other computers of the network connect; the address is shown and Windows asks about the firewall.',
          'Connect to another computer — type the address of the computer that holds the data, press Test, then Apply. Every request still needs your user name, password and permissions.',
          'Backup — creates a verified copy of the database in the backups folder of the data directory and lists the previous ones.',
          'Integrity — runs the SQLite integrity and foreign-key checks and counts the posted entries.',
          'Logs — shows the last lines of the service log.'
        ],
        expected: 'The Maintenance screen never guesses: it reports what it found and tells you when the service has to be restarted.',
        notes: [
          'Opening the service to the network is a choice, never automatic: keep it off when you work alone on one computer.',
          'A backup made here is a copy of the database file. Settings → Backup exports a portable file you can keep outside the computer.'
        ],
      },
      troubleshooting: {
        title: 'Troubleshooting',
        purpose: 'Solve the most common situations without calling for help.',
        where: 'Anywhere in the program.',
        steps: [
          '"I cannot find a button": your role does not include that action — ask an administrator.',
          '"The document will not post": read the message; the usual causes are missing lines, no customer on a credit sale, or a missing cash/bank account.',
          '"The numbers look wrong": open Reports → Trial Balance; if it is balanced, the books are consistent and the report you are looking at may simply cover a different period.',
          '"The program will not start": make sure the previous instance is closed, then start it again; the message on screen tells you if the data folder could not be opened.'
        ],
        expected: 'Most problems are explained by the message shown on screen; the message always says what to do next.',
        notes: [
          'Never delete or edit database files by hand — use the backup and restore functions.',
          'Write down the exact message you see before asking for help; it makes the answer much faster.'
        ]
      },
      roles: {
        title: 'Who does what: Seller, Administrator, Maintenance',
        purpose: 'Know what is expected from each kind of user, and what each role is allowed to do.',
        where: 'Settings → Users (role of each user).',
        steps: [
          'Seller (role "sales"): record sales and walk-in receipts, create customers, read stock. Sales are created PAID; settle a draft with F2 when the customer pays later.',
          'Administrator (role "admin"): everything — users, permissions, company settings, taxes, currencies, backups and restore.',
          'Maintenance / storekeeper (role "inventory"): products, stores, transfers, adjustments and physical counts. A count must be approved by somebody else.',
          'Accountant (role "accountant"): banking, accounting, journals and reports; purchases (role "purchases") record supplier bills; manager (role "manager") can read everything but change nothing.'
        ],
        expected: 'Every person works in the same program with the rights of their job, and the audit log shows who did what.',
        notes: [
          'If a person needs two jobs, give them the role that fits and ask an administrator before widening permissions.',
          'A read-only manager is deliberate: control and execution are kept separate.'
        ]
      },
      developers: {
        title: 'About the Developers',
        purpose: 'Know who created and develops JENESIS, so you know who stands behind the program you run your business on.',
        where: 'Help → About the Developers. The same credit is written at the bottom of the left column of every application.',
        steps: [
          'Open Help (press F1, or choose Help in the left column).',
          'Scroll to the section “About the Developers”.',
          'The name of the creator and developer of JENESIS is shown there: KAYIGANWA JACQUES.'
        ],
        expected: 'You see the developer/creator credit: Created and developed by KAYIGANWA JACQUES.',
        notes: [
          'KAYIGANWA JACQUES is the developer/creator of JENESIS.',
          'The same credit appears at the bottom of the left column in all four applications, in English, French and Kinyarwanda.',
          'Support, changes and new versions of JENESIS come from the developer named here.'
        ]
      }

    }
  },

  fr: {
    guideTitle: 'Comment utiliser JENESIS',
    guideIntro: 'Un guide pratique pour les utilisateurs au quotidien : se déplacer dans le programme, enregistrer une vente ou un achat, imprimer un document, utiliser la calculatrice et le Messenger, changer l\'apparence et protéger vos données.',
    searchPlaceholder: 'Rechercher dans le guide (ex. imprimer, F2, sauvegarde, thème…)',
    onThisPage: 'Sur cette page',
    purposeLabel: 'Objectif',
    whereLabel: 'Où le trouver',
    stepsLabel: 'Étapes',
    expectedLabel: 'Résultat attendu',
    notesLabel: 'Remarques et avertissements',
    shortcutsTitle: 'Raccourcis clavier',
    shortcutKey: 'Touches',
    shortcutAction: 'Ce que cela fait',
    noResults: 'Aucun passage du guide ne correspond à votre recherche.',
    printGuide: 'Imprimer ce guide',
    sections: {
      welcome: {
        title: 'Bienvenue dans JENESIS',
        purpose: 'JENESIS est un programme de comptabilité en partie double et de gestion pour une boutique, un magasin ou une petite entreprise. Chaque vente, achat, paiement et mouvement de stock produit de vraies écritures comptables : vos livres sont à jour sans travail supplémentaire.',
        where: 'La fenêtre du programme. La colonne de gauche liste les modules ; la barre du haut affiche la société, la date, la calculatrice, le Messenger, la langue et votre nom.',
        steps: [
          'Connectez-vous avec le nom d\'utilisateur et le mot de passe fournis par votre administrateur.',
          'Vérifiez que le nom de la société en haut à gauche est bien celle dans laquelle vous voulez travailler.',
          'Choisissez un module dans la colonne de gauche : Tableau de bord, Clients, Fournisseurs, Stock, Ventes, Achats, Banque, Comptabilité, Rapports, Paramètres, Aide.'
        ],
        expected: 'Le tableau de bord s\'affiche avec les chiffres actuels de la société. Les données d\'une autre société ne sont jamais visibles ni mélangées.',
        notes: [
          'En cas d\'oubli du mot de passe, seul un administrateur peut le réinitialiser ; les données ne sont jamais perdues.',
          'Votre session se termine automatiquement après une période d\'inactivité. Reconnectez-vous pour continuer.'
        ]
      },
      signin: {
        title: 'Connexion et première utilisation',
        purpose: 'Protéger les comptes : seules les personnes autorisées travaillent dans le programme, et chaque action est enregistrée avec le nom de son auteur.',
        where: 'L\'écran de connexion affiché au démarrage, et Paramètres → Utilisateurs pour les administrateurs.',
        steps: [
          'Saisissez votre nom d\'utilisateur et votre mot de passe, puis cliquez sur Se connecter (ou appuyez sur Entrée).',
          'Si le programme demande de changer le mot de passe, choisissez un mot de passe long (au moins 10 caractères) que vous n\'utilisez nulle part ailleurs.',
          'Lors de la toute première utilisation, l\'administrateur crée la société, le premier utilisateur et la devise de base.'
        ],
        expected: 'Vous êtes connecté et le tableau de bord apparaît. Chaque action est désormais écrite dans le journal d\'audit avec votre nom.',
        notes: [
          'Après plusieurs essais erronés, le compte est verrouillé quelques minutes : cela protège les données contre les devinettes.',
          'Déconnectez-vous (en haut à droite) en quittant l\'ordinateur, afin que personne n\'agisse en votre nom.'
        ]
      },
      applications: {
        title: 'Les quatre applications JENESIS',
        purpose: 'Chacun ouvre l’application qui correspond à son travail, et tout le monde travaille sur les mêmes données.',
        where: 'Les raccourcis JENESIS Seller, JENESIS Réseau & Maintenance, JENESIS Comptabilité & Gestion et JENESIS Paramètres & Point d’accès sur le bureau ou dans le menu Démarrer. Ouvrir JENESIS sans raccourci affiche le choix.',
        steps: [
          'JENESIS Seller (rouge) — la vente : ventes, reçus, clients, niveaux de stock. Il s’ouvre sur Ventes.',
          'JENESIS Réseau & Maintenance (vert) — l’entretien : le service, la connexion entre les ordinateurs, sauvegardes vérifiées, contrôle d’intégrité et journaux. Il ne contient aucun écran de comptabilité, de vente, d’achat, de client, de fournisseur, d’article, de stock ni de rapport. Il s’ouvre sur Maintenance.',
          'JENESIS Comptabilité & Gestion (bleu) — les livres : comptabilité, achats, banque, rapports, taxes, utilisateurs et permissions. Il s’ouvre sur le Tableau de bord.',
          'JENESIS Paramètres & Point d’accès (jaune) — la configuration : société, utilisateurs, rôles, taxes, devises, sauvegarde, apparence et point d’accès réseau. Il s’ouvre sur Paramètres.',
          'Chaque application retient son propre choix Clair ou Sombre : changer le thème dans Seller ne change pas Maintenance ni Admin.',
          'Les trois lisent et écrivent la même base, donc une vente enregistrée dans Seller apparaît aussitôt dans les rapports d’Admin.'
        ],
        expected: 'Chaque raccourci ouvre sa propre fenêtre, avec son titre, sa couleur et son menu. Rien n’est dupliqué : il n’y a qu’un seul jeu d’enregistrements.',
        notes: [
          'Un écran qui n’appartient pas à l’application n’est pas proposé : JENESIS Seller n’a pas de grand livre, JENESIS Réseau & Maintenance n’a ni écran de vente ni chiffre financier.',
          'Vos permissions s’appliquent dans chaque application : un utilisateur qui ne peut pas valider une écriture voit le même refus partout.',
          'Créé et développé par KAYIGANWA JACQUES.'
        ],
      },
      navigation: {
        title: 'Se déplacer dans le programme',
        purpose: 'Atteindre rapidement n\'importe quel écran à la souris ou au clavier, et revenir là où vous étiez.',
        where: 'La colonne de gauche liste tous les modules que vous pouvez ouvrir. L\'entrée Aide (ou F1) ouvre ce guide.',
        steps: [
          'Cliquez sur un module dans la colonne de gauche pour l\'ouvrir.',
          'Appuyez sur Alt + Flèche gauche pour revenir à l\'écran précédent, Alt + Flèche droite pour avancer à nouveau.',
          'Appuyez sur F5 pour recharger les données de l\'écran courant.',
          'Appuyez sur Ctrl + / pour ouvrir la liste recherchable des raccourcis clavier.'
        ],
        expected: 'L\'écran change immédiatement ; JENESIS mémorise votre parcours, Alt + Flèche gauche / droite parcourt les écrans visités.',
        notes: [
          'Les modules non autorisés ne sont pas affichés ; le serveur applique les mêmes permissions même si un écran est ouvert directement.',
          'Échap ne ferme jamais le programme. Il ferme d\'abord la boîte de dialogue ouverte, puis le panneau (calculatrice ou Messenger), puis revient à l\'écran précédent.'
        ]
      },
      sales: {
        title: 'Ventes : reçus et factures (créés PAYÉS)',
        purpose: 'Enregistrer ce que vous avez vendu. Dans JENESIS, un document de vente est PAYÉ dès sa création : le programme comptabilise la vente et enregistre l\'encaissement réel dans la même opération, donc la caisse ou la banque et le solde client sont corrects immédiatement.',
        where: 'Ventes → Factures de vente → « Nouvelle facture de vente ».',
        steps: [
          'Choisissez le client, ou cochez « Vente au comptoir / anonyme » pour une vente sans nom de client.',
          'Ajoutez les articles : produit, quantité, prix unitaire, remise et taxe.',
          'Choisissez le mode de paiement et le compte d\'encaissement (caisse, mobile money, banque).',
          'Laissez « Comptabiliser maintenant » coché (par défaut) et enregistrez.'
        ],
        expected: 'Le document apparaît dans la liste avec le statut vert PAYÉ, un numéro de reçu est affiché dans le message de confirmation, le stock diminue, la caisse ou la banque augmente et les écritures sont équilibrées. Il n\'y a pas de choix PAYÉ/IMPAYÉ : le mouvement d\'argent est réel.',
        notes: [
          'Sélectionnez une ligne et appuyez sur F3 (ou le bouton d\'impression) pour imprimer le document ; Ctrl + P fait la même chose.',
          'Décochez « Comptabiliser maintenant » uniquement pour garder le document en brouillon (vente à crédit non payée). Un brouillon peut être réglé plus tard avec le bouton Régler ou avec F2 sur la ligne sélectionnée.',
          'Appuyer deux fois sur F2 ne paie pas deux fois : la deuxième fois, JENESIS indique que le document est déjà payé et n\'enregistre rien.',
          'Pour corriger une erreur, contre-passez le paiement ou créez un avoir. Ne supprimez jamais un document comptabilisé : la piste d\'audit doit rester complète.'
        ]
      },
      purchases: {
        title: 'Achats : factures fournisseurs (créées PAYÉES)',
        purpose: 'Enregistrer ce que vous avez acheté. Comme pour les ventes, un document d\'achat est PAYÉ lors de sa création : le programme comptabilise la facture et enregistre le paiement fournisseur réel en une seule opération.',
        where: 'Achats → Factures d\'achat → « Nouvelle facture d\'achat ».',
        steps: [
          'Choisissez le fournisseur et le numéro de facture du fournisseur (si vous l\'avez).',
          'Ajoutez les articles avec la quantité et le coût.',
          'Choisissez le mode de paiement et le compte de règlement.',
          'Laissez « Comptabiliser immédiatement » coché (par défaut) et enregistrez.'
        ],
        expected: 'La facture affiche PAYÉ, le stock augmente, le solde du fournisseur est réglé et le paiement apparaît dans Banque avec sa propre écriture.',
        notes: [
          'Si votre société exige une réception formelle des marchandises, recevez d\'abord les articles (Achats → Bons de réception) et liez le bon à la facture : la facture solde alors le compte « reçu non facturé » au lieu d\'ajouter le stock deux fois.',
          'Une facture en brouillon peut être réglée plus tard avec Régler ou F2 ; régler deux fois ne crée jamais un second paiement.'
        ]
      },
      inventory: {
        title: 'Stock et inventaire',
        purpose: 'Savoir exactement ce qui se trouve dans chaque dépôt, déplacer des marchandises et compter le stock physique.',
        where: 'Stock → Produits, Dépôts, Transferts, Ajustements, Comptages physiques.',
        steps: [
          'Ajoutez ou modifiez un produit avec son prix de revient, son prix de vente et son dépôt.',
          'Utilisez un transfert pour déplacer des marchandises d\'un dépôt à l\'autre.',
          'Utilisez un ajustement pour corriger une quantité, avec un motif.',
          'Utilisez un comptage physique pour compter le dépôt ; un comptage doit être vérifié et approuvé par quelqu\'un d\'autre avant de modifier les livres.'
        ],
        expected: 'Chaque mouvement est enregistré avec la date, le dépôt, la quantité et l\'utilisateur, et la valeur du stock suit le coût moyen pondéré.',
        notes: [
          'La personne qui compte ne peut pas approuver son propre comptage : cette séparation est volontaire.',
          'Une vente ou un achat déplace aussi le stock automatiquement ; vous n\'avez rien à comptabiliser à la main.'
        ]
      },
      banking: {
        title: 'Banque et caisse',
        purpose: 'Suivre l’argent de vos comptes bancaires et de votre caisse.',
        where: 'Le module Banque (Ctrl + Maj + B), avec trois onglets : Comptes, Paiements et Caisse.',
        steps: [
          'Comptes — les comptes bancaires et la caisse de l’entreprise avec leurs soldes.',
          'Paiements — les mouvements d’argent enregistrés sur ces comptes.',
          'Caisse — ouvrez une session de caisse en début de journée, comptez la caisse, puis fermez la session ; un responsable approuve la fermeture.'
        ],
        expected: 'Chaque mouvement est une écriture comptable : les soldes de caisse et de banque correspondent toujours au grand livre.',
        notes: [
          'Les ventes et les achats sont enregistrés PAYÉS lors de leur validation : aucun paiement supplémentaire n’est inventé.',
          'Compter la caisse demande la permission cash:count ; approuver une fermeture demande sa propre permission.'
        ],
      },
      calculator: {
        title: 'La calculatrice intégrée',
        purpose: 'Calculer un montant (total, remise, taxe) sans quitter le programme. C\'est une calculatrice : elle ne comptabilise et n\'enregistre jamais rien.',
        where: 'Le bouton « Calculatrice » dans la barre du haut, ou Ctrl + Maj + K.',
        steps: [
          'Ouvrez la calculatrice avec le bouton de l\'en-tête ou Ctrl + Maj + K.',
          'Tapez au clavier physique : chiffres 0–9, « . », +, −, *, /, Entrée ou « = » pour le résultat, Retour arrière pour effacer un chiffre, « c » pour tout effacer, Échap pour fermer. Le pavé numérique fonctionne aussi.',
          'Ou cliquez sur les boutons à la souris ; le panneau se déplace par sa barre de titre et se minimise avec le bouton « − ».'
        ],
        expected: 'Le résultat s\'affiche avec la précision comptable (par exemple 0,1 + 0,2 donne 0,3 et non 0,30000000000000004). Vous pouvez ensuite saisir ce nombre dans un champ de montant.',
        notes: [
          'Une division par zéro affiche un message clair au lieu d\'une erreur ; appuyez sur « C » et recommencez.',
          'Tant que la calculatrice est ouverte, le clavier lui appartient : taper « 5 » ne déclenche jamais un raccourci du programme. Les combinaisons Ctrl et les touches de fonction restent actives (Ctrl + Maj + K la ferme, F1 ouvre ce guide).'
        ]
      },
      messenger: {
        title: 'JENESIS Messenger',
        purpose: 'Discuter avec vos collègues dans JENESIS — demander un prix, un produit manquant ou un document — sans quitter le programme.',
        where: 'Le bouton « Messenger » dans la barre du haut, juste à côté de la calculatrice, ou Ctrl + Maj + M.',
        steps: [
          'Ouvrez le Messenger et choisissez un collègue dans la liste de gauche (ou recherchez un nom).',
          'Tapez votre message et appuyez sur Entrée (Maj + Entrée pour une nouvelle ligne), ou cliquez sur le bouton d\'envoi.',
          'Ouvrez une conversation pour la lire ; les messages non lus sont marqués en vert et le bouton de l\'en-tête indique combien vous n\'avez pas lus.',
          'Appuyez sur Échap (ou sur le bouton « − ») pour fermer le panneau.'
        ],
        expected: 'Le message est enregistré, apparaît dans le fil et parvient au collègue connecté. Un tic signifie envoyé, deux tics signifient reçu, des tics bleus signifient lu.',
        notes: [
          'Vous ne pouvez écrire qu\'aux collègues de la même société ; le serveur le vérifie à chaque action, un message ne peut donc jamais sortir de votre société.',
          'Si la connexion se coupe, le panneau se reconnecte seul et aucun message n\'est affiché deux fois.',
          'Le texte des messages n\'est jamais écrit dans les journaux ; seul l\'envoi est consigné.'
        ]
      },
      appearance: {
        title: 'Apparence : clair, sombre ou système',
        purpose: 'Travailler confortablement dans une pièce claire ou le soir, et suivre l\'apparence de l\'ordinateur si vous préférez.',
        where: 'Le bouton de thème dans la barre du haut, ou Paramètres → Apparence.',
        steps: [
          'Cliquez sur le bouton de thème de l\'en-tête pour passer de Clair à Sombre.',
          'Ou ouvrez Paramètres → Apparence et choisissez Clair, Sombre ou Système.',
          'Appuyez sur Alt + T pour passer d\'un choix à l\'autre.'
        ],
        expected: 'Tout le programme — écrans, tableaux, boîtes de dialogue, ce guide — suit immédiatement votre choix, qui est mémorisé au prochain démarrage.',
        notes: [
          '« Système » suit le réglage d\'apparence de Windows ; le programme s\'adapte si vous le changez en cours d\'utilisation.',
          'L\'impression utilise toujours la palette claire, économe en encre, quel que soit le thème affiché.'
        ]
      },
      shortcuts: {
        title: 'Raccourcis clavier',
        purpose: 'Effectuer les actions courantes sans la souris.',
        where: 'Appuyez sur Ctrl + / pour la liste recherchable, ou sur F1 pour ce guide et lisez la section des raccourcis.',
        steps: [
          'F1 — ouvrir ce guide.',
          'F2 — régler (marquer PAYÉ) le document de vente ou d’achat sélectionné.',
          'F3 — imprimer le document sélectionné (Ctrl + P fait la même chose).',
          'F5 — recharger les données de cet écran.',
          'Ctrl + S — enregistrer la fiche en cours.',
          'Ctrl + N — créer un nouveau document sur cet écran.',
          'Ctrl + E — modifier la fiche sélectionnée.',
          'Ctrl + F — aller à la recherche de cet écran.',
          'Ctrl + D — dupliquer le document sélectionné.',
          'Ctrl + Entrée — valider la boîte de dialogue ou envoyer le formulaire.',
          'Alt + Flèche gauche — revenir à l’écran précédent.',
          'Alt + Flèche droite — aller à l’écran suivant.',
          'Ctrl + Maj + S — ouvrir les Ventes.',
          'Ctrl + Maj + R — créer un reçu de vente.',
          'Ctrl + Maj + C — ouvrir les Clients et rechercher.',
          'Ctrl + Maj + P — ouvrir les Achats.',
          'Ctrl + Maj + V — ouvrir les Fournisseurs et rechercher.',
          'Ctrl + Maj + N — créer un document d’achat.',
          'Ctrl + Maj + I — ouvrir le Stock.',
          'Ctrl + Maj + F — ouvrir le Stock et rechercher un code produit.',
          'Ctrl + Maj + T — ouvrir les transferts de stock.',
          'Ctrl + Maj + A — ouvrir la Comptabilité.',
          'Ctrl + Maj + B — ouvrir Banque et Caisse.',
          'Ctrl + Maj + L — ouvrir le Grand Livre.',
          'Ctrl + Maj + G — ouvrir les Rapports.',
          'Ctrl + Maj + K — ouvrir ou fermer la calculatrice.',
          'Ctrl + Maj + M — ouvrir ou fermer JENESIS Messenger.',
          'Ctrl + / — afficher ou masquer la liste recherchable des raccourcis.',
          'Alt + T — changer de thème : Clair → Sombre → Système.',
          'Alt + L — changer la langue de l’interface.',
          'Échap — ferme la boîte de dialogue, puis le panneau, puis revient en arrière. Ne quitte jamais le programme.'
        ],
        expected: 'L\'action se produit immédiatement, et un message vous prévient lorsqu\'il n\'y a rien à faire (par exemple F2 sans document sélectionné, ou F3 sur un écran sans impression).',
        notes: [
          'Pendant la saisie dans un champ, les raccourcis simples sont suspendus pour ne jamais voler votre texte ; les touches de fonction, Échap et les combinaisons Alt ou Maj restent actives.',
          'Les permissions s\'appliquent aussi aux raccourcis : un utilisateur qui ne peut pas comptabiliser ou régler voit un message de refus, exactement comme s\'il avait cliqué sur le bouton.'
        ]
      },
      contextmenu: {
        title: 'Le clic droit sur un enregistrement',
        purpose: 'Faire sur une ligne ce que vous chercheriez sinon dans une barre d\u2019outils : la copier, l\u2019ouvrir, la retirer ou la remettre en service.',
        where: 'Toute liste d\u2019enregistrements dans les quatre applications — clients, fournisseurs, produits, ventes, achats, banque, comptabilité, piste d\u2019audit, liste des autres ordinateurs et panneaux des paramètres.',
        steps: [
          'Faites un clic droit sur la ligne voulue. Le menu s\u2019ouvre avec uniquement les actions qui ont un sens pour cette ligne.',
          'Copier place l\u2019enregistrement dans le presse-papiers sous forme de texte, pour le coller dans une lettre ou un message.',
          'Modifier ouvre le même éditeur que le bouton de la ligne.',
          'Désactiver retire un enregistrement dont vous ne vous servez plus ; Activer le remet en service. Aucune des deux n\u2019efface son historique.',
          'Supprimer efface un enregistrement dont rien ne dépend, et demande confirmation en le nommant.',
          'Tout sélectionner sélectionne toutes les lignes de la liste, pour les copier ou les imprimer.'
        ],
        expected: 'L\u2019action s\u2019applique à la ligne sur laquelle vous avez cliqué, et un message indique ce qui a été fait — ou pourquoi c\u2019a été refusé.',
        notes: [
          'Votre rôle décide de ce qui vous est proposé, et le serveur pose la même question : le menu n\u2019est jamais le seul gardien.',
          'Un enregistrement comptable n\u2019est jamais détruit. Un enregistrement qui porte un historique comptable est désactivé à la place, et le menu le dit.',
          'Les chiffres qui ne sont pas des enregistrements — une ligne de balance générale, une entrée d\u2019audit — peuvent être copiés mais jamais modifiés ni supprimés, car ce sont des archives.',
          'Le menu est dessiné dans la couleur de l\u2019application où vous êtes, et aucun raccourci clavier n\u2019a été supprimé pour lui faire place.'
        ]
      },
      seller: {
        title: 'JENESIS Vendeur — le comptoir',
        purpose: 'Vendre toute la journée sans voir les chiffres du comptable, tout en gardant chaque vente dans les mêmes livres.',
        where: 'JENESIS Vendeur (rouge) — Tableau de bord, Ventes, Clients, Stock, Aide.',
        steps: [
          'Le tableau de bord, c\u2019est la journée : combien de ventes, combien encaissé, combien en espèces et combien à crédit, et la semaine derrière.',
          'Nouvelle vente ouvre le formulaire de vente ; Nouveau reçu l\u2019ouvre prêt à imprimer.',
          'Recherche de produit trouve un article par nom ou par code et répond par son prix et s\u2019il est en rayon.',
          'Stock disponible montre ce qu\u2019il y a. Il est en lecture seule : les prix et les quantités se modifient dans JENESIS Comptabilité & Gestion.',
          'Historique des ventes liste les documents récents et imprime un reçu pour chacun.',
          'Informations de caisse montre les comptes de caisse et ce qu\u2019ils contiennent.'
        ],
        expected: 'Une vente faite ici meut le stock, écrit les écritures comptables et fait entrer l\u2019argent en caisse — le comptable la voit dans la même base de données, immédiatement.',
        notes: [
          'Le Vendeur n\u2019affiche pas, et ne peut pas atteindre, le tableau de bord comptable, le compte de résultat, le bilan, la balance générale, le grand livre, les dettes ni les créances. Ils sont refusés par le serveur, pas seulement cachés.',
          'Un prix de revient n\u2019est jamais affiché ici.',
          'Le Vendeur n\u2019a pas de paramètres de société ni d\u2019utilisateurs : ceux-ci sont dans JENESIS Paramètres & Point d\u2019accès (jaune).'
        ]
      },
      accounting: {
        title: 'Comptabilité et rapports',
        purpose: 'Voir la situation financière réelle : chaque document est comptabilisé en partie double équilibrée, et les rapports sont construits à partir de ces écritures.',
        where: 'Comptabilité → Écritures de journal, Plan comptable. Rapports → Balance, Compte de résultat, Bilan et les autres rapports.',
        steps: [
          'Ouvrez Rapports → Balance pour vérifier à tout moment que débits et crédits sont égaux.',
          'Ouvrez le Compte de résultat ou le Bilan pour la période souhaitée.',
          'Ouvrez Comptabilité → Écritures de journal pour voir les écritures d\'un document, avec l\'utilisateur et la date.'
        ],
        expected: 'La balance est équilibrée : c\'est la preuve que les livres sont corrects. Les rapports peuvent être imprimés (F3) ou exportés.',
        notes: [
          'Un document comptabilisé ne peut pas être modifié ; contre-passez-le et comptabilisez à nouveau pour garder un historique complet.',
          'Les montants sont toujours enregistrés dans la devise de base de la société ; un document en devise étrangère conserve sa devise, son taux et son total converti.'
        ]
      },
      settings: {
        title: 'Paramètres, utilisateurs et permissions',
        purpose: 'Adapter le programme à votre société et donner à chacun uniquement les droits nécessaires.',
        where: 'JENESIS Paramètres & Point d\u2019accès (jaune) — Société, Utilisateurs, Taxes, Devises, Audit, Sauvegarde, Apparence.',
        steps: [
          'Société : nom, adresse, devise de base et règles comptables.',
          'Utilisateurs : créez un utilisateur, donnez un rôle (admin, comptable, ventes, achats, stock, gestionnaire) et désactivez un utilisateur qui part. Un mot de passe oublié se réinitialise ici, sans connaître l\'ancien.',
          'Accès : choisissez laquelle des quatre applications chacun peut ouvrir, et accordez ou retirez des permissions individuelles en plus de son rôle. Fermer une application déconnecte ses fenêtres ouvertes.',
          'Taxes : créez, modifiez, désactivez et réactivez les taux, et voyez les actifs et les inactifs séparément.',
          'Devises : les cours de change utilisés par vos documents.',
          'Audit : consultez qui a fait quoi et quand — y compris chaque modification d\'un taux de taxe ou des accès de quelqu\'un.'
        ],
        expected: 'Chaque utilisateur voit et peut faire uniquement ce que son rôle autorise — dans l\'interface comme sur le serveur.',
        notes: [
          'Un taux de taxe qui a servi dans un document ne peut pas être supprimé : désactivez-le à la place. Le désactiver ne change rien aux documents déjà établis — ils gardent le taux avec lequel ils ont été faits — et le taux retiré n\u2019est simplement plus proposé pour les nouveaux.',
          'Les administrateurs doivent être peu nombreux : un administrateur peut tout faire, y compris restaurer une sauvegarde.',
          'Ne partagez jamais un mot de passe ; créez un utilisateur par personne pour que le journal d\'audit ait un sens.'
        ]
      },
      backup: {
        title: 'Sauvegardes, restauration et sécurité des données',
        purpose: 'Pouvoir récupérer vos comptes après une erreur, une panne d\'ordinateur ou une coupure de courant.',
        where: 'Paramètres → Sauvegarde (Exporter / Importer).',
        steps: [
          'Exportez une sauvegarde régulièrement (chaque jour pour un magasin actif) et conservez le fichier hors de l\'ordinateur — sur une clé USB ou un autre disque.',
          'Pour restaurer : ouvrez le fichier de sauvegarde, ressaisissez votre mot de passe et tapez RESTORE pour confirmer.',
          'JENESIS crée automatiquement une copie de sécurité avant une restauration et avant toute mise à jour de la base.'
        ],
        expected: 'L\'export télécharge un seul fichier contenant toute la société. Après une restauration, les chiffres sont exactement ceux de la sauvegarde et l\'état précédent reste disponible comme copie de sécurité.',
        notes: [
          'Restaurer remplace les données actuelles de la société — c\'est pourquoi la confirmation et le mot de passe sont exigés.',
          'Vos données se trouvent dans le dossier JENESIS de votre profil Windows ; sauvegardez aussi ce dossier si vous voulez une copie complète.'
        ]
      },
      maintenance: {
        title: 'Maintenance : service, réseau, sauvegardes et journaux',
        purpose: 'Garder JENESIS en bonne santé, laisser les autres ordinateurs du bureau se connecter, et prouver que les données sont intactes.',
        where: 'JENESIS Réseau & Maintenance → Maintenance (l’écran sur lequel il s’ouvre), ou JENESIS Comptabilité & Gestion → Maintenance.',
        steps: [
          'Service — affiche la version, le démarrage du service, sa durée de fonctionnement, et l’emplacement de la base et du dossier de données.',
          'Réseau — désactivé par défaut : le service ne répond qu’à cet ordinateur. Activez-le pour laisser les autres ordinateurs du réseau se connecter ; l’adresse est affichée et Windows demande l’autorisation du pare-feu.',
          'Se connecter à un autre ordinateur — saisissez l’adresse de l’ordinateur qui héberge les données, puis Testez, puis Appliquez. Chaque requête exige toujours votre nom d’utilisateur, votre mot de passe et vos permissions.',
          'Sauvegarde — crée une copie vérifiée de la base dans le dossier des sauvegardes et liste les précédentes.',
          'Intégrité — lance les contrôles d’intégrité et de clés étrangères de SQLite et compte les écritures validées.',
          'Journaux — affiche les dernières lignes du journal du service.'
        ],
        expected: 'L’écran de maintenance ne devine rien : il rapporte ce qu’il a trouvé et vous dit quand le service doit être redémarré.',
        notes: [
          'Ouvrir le service au réseau est un choix, jamais automatique : laissez-le désactivé si vous travaillez seul sur un ordinateur.',
          'Une sauvegarde faite ici est une copie du fichier de la base. Paramètres → Sauvegarde exporte un fichier portable à conserver hors de l’ordinateur.'
        ],
      },
      troubleshooting: {
        title: 'Résolution des problèmes',
        purpose: 'Résoudre les situations les plus courantes sans demander de l\'aide.',
        where: 'N\'importe où dans le programme.',
        steps: [
          '« Je ne trouve pas un bouton » : votre rôle ne prévoit pas cette action — demandez à un administrateur.',
          '« Le document ne se comptabilise pas » : lisez le message ; les causes habituelles sont des lignes manquantes, l\'absence de client sur une vente à crédit, ou l\'absence de compte caisse/banque.',
          '« Les chiffres semblent faux » : ouvrez Rapports → Balance ; si elle est équilibrée, les livres sont cohérents et le rapport consulté couvre peut-être une autre période.',
          '« Le programme ne démarre pas » : vérifiez que l\'instance précédente est fermée, puis relancez-le ; le message à l\'écran indique si le dossier de données n\'a pas pu être ouvert.'
        ],
        expected: 'La plupart des problèmes sont expliqués par le message affiché ; celui-ci indique toujours quoi faire ensuite.',
        notes: [
          'Ne supprimez et ne modifiez jamais les fichiers de base à la main — utilisez les fonctions de sauvegarde et de restauration.',
          'Notez le message exact avant de demander de l\'aide : la réponse sera bien plus rapide.'
        ]
      },
      roles: {
        title: 'Qui fait quoi : vendeur, administrateur, maintenance',
        purpose: 'Connaître le rôle attendu de chaque utilisateur et ce que chaque rôle a le droit de faire.',
        where: 'Paramètres → Utilisateurs (rôle de chaque utilisateur).',
        steps: [
          'Vendeur (rôle « ventes ») : enregistre les ventes et les reçus au comptoir, crée des clients, consulte le stock. Les ventes sont créées PAYÉES ; réglez un brouillon avec F2 lorsque le client paie plus tard.',
          'Administrateur (rôle « admin ») : tout — utilisateurs, permissions, société, taxes, devises, sauvegardes et restauration.',
          'Maintenance / magasinier (rôle « stock ») : produits, dépôts, transferts, ajustements et comptages physiques. Un comptage doit être approuvé par quelqu\'un d\'autre.',
          'Comptable (rôle « comptable ») : banque, comptabilité, journaux et rapports ; les achats (rôle « achats ») enregistrent les factures fournisseurs ; le gestionnaire (rôle « gestionnaire ») peut tout lire mais rien modifier.'
        ],
        expected: 'Chacun travaille dans le même programme avec les droits de son métier, et le journal d\'audit indique qui a fait quoi.',
        notes: [
          'Si une personne occupe deux fonctions, donnez-lui le rôle correspondant et demandez à un administrateur avant d\'élargir les permissions.',
          'Le gestionnaire en lecture seule est volontaire : le contrôle et l\'exécution sont séparés.'
        ]
      },
      developers: {
        title: 'À propos des développeurs',
        purpose: 'Savoir qui a créé et qui développe JENESIS, pour connaître la personne qui se tient derrière le programme qui fait tourner votre entreprise.',
        where: 'Aide → À propos des développeurs. La même mention figure en bas de la colonne de gauche de chaque application.',
        steps: [
          'Ouvrez l’Aide (appuyez sur F1, ou choisissez Aide dans la colonne de gauche).',
          'Descendez jusqu’à la section « À propos des développeurs ».',
          'Le nom du créateur et développeur de JENESIS y est indiqué : KAYIGANWA JACQUES.'
        ],
        expected: 'Vous voyez la mention du développeur : Créé et développé par KAYIGANWA JACQUES.',
        notes: [
          'KAYIGANWA JACQUES est le développeur/créateur de JENESIS.',
          'La même mention apparaît en bas de la colonne de gauche des quatre applications, en anglais, français et kinyarwanda.',
          'L’assistance, les modifications et les nouvelles versions de JENESIS viennent du développeur nommé ici.'
        ]
      }

    }
  },

  rw: {
    guideTitle: 'Uko wakoresha JENESIS',
    guideIntro: 'Igitabo cy\'imfashanyigisho ku bakoresha ba buri munsi: uko wava aho uri ukajya ahandi muri porogaramu, uko wandika igurisha cyangwa igura, uko ucapa inyandiko, uko ukoresha kalikilateli na Messenger, uko uhindura isura n\'uko urinda amakuru yawe.',
    searchPlaceholder: 'Shakisha mu gitabo (urugero: gucapa, F2, ububiko, insanganyamatsiko…)',
    onThisPage: 'Kuri iyi paji',
    purposeLabel: 'Intego',
    whereLabel: 'Aho uyisanga',
    stepsLabel: 'Intambwe',
    expectedLabel: 'Igisubizo giteganyijwe',
    notesLabel: 'Ibyitonderwa n\'amaburira',
    shortcutsTitle: 'Utubuto tw\'uburyo bwo guhamagara vuba',
    shortcutKey: 'Utubuto',
    shortcutAction: 'Icyo dukora',
    noResults: 'Nta gice na kimwe cy\'igitabo gihuye n\'ibyo washatse.',
    printGuide: 'Capa iki gitabo',
    sections: {
      welcome: {
        title: 'Murakaza neza muri JENESIS',
        purpose: 'JENESIS ni porogaramu y\'ibaruramari rikoresha inyandiko ebyiri (double-entry) n\'imicungire y\'ubucuruzi ku iduka, ububiko cyangwa sosiyete nto. Buri gurisha, igura, ubwishyu n\'igenda ry\'ibicuruzwa bikora inyandiko nyazo z\'ibaruramari, bityo ibitabo byawe biba bigezweho nta kazi kiyongereye.',
        where: 'Idirishya rya porogaramu. Ku ruhande rw\'ibumoso hari urutonde rw\'ibice; ku mugozi wo hejuru herekana sosiyete, itariki, kalikilateli, Messenger, ururimi n\'izina ryawe.',
        steps: [
          'Injira ukoresheje izina ry\'ukoresha n\'ijambo ry\'ibanga wahawe n\'umuyobozi.',
          'Reba neza ko izina rya sosiyete riri hejuru ku ruhande rw\'ibumoso ari ryo ushaka gukoramo.',
          'Hitamo igice ku ruhande rw\'ibumoso: Imbonerahamwe, Abakiriya, Abaduha ibicuruzwa, Ububiko, Ubucuruzi, Amagura, Banki, Ibaruramari, Raporo, Igenamiterere, Ubufasha.'
        ],
        expected: 'Ureba imbonerahamwe ifite imibare y\'iki gihe ya sosiyete. Amakuru ya sosiyete yindi ntashobora kugaragara cyangwa kwivanga.',
        notes: [
          'Niba wibagiwe ijambo ry\'ibanga, umuyobozi wenyine ni we warisubiza; amakuru ubwayo ntashira.',
          'Igihe cyawe kirangira cyonyine igihe umaze igihe udakora. Ongera winjire kugira ngo ukomeze.'
        ]
      },
      signin: {
        title: 'Kwinjira no gukoresha bwa mbere',
        purpose: 'Kurinda konti: ni abantu bemerewe gusa bashobora gukoresha porogaramu, kandi buri gikorwa cyandikwa n\'izina ry\'uwagikoze.',
        where: 'Ipaji yo kwinjira yerekanwa JENESIS itangiranye, na Igenamiterere → Abakoresha ku bayobozi.',
        steps: [
          'Andika izina ry\'ukoresha n\'ijambo ry\'ibanga, hanyuma kanda Injira (cyangwa kanda Enter).',
          'Niba porogaramu igusaba guhindura ijambo ry\'ibanga, hitamo ijambo rirerire (byibura inyuguti 10) udakoresha ahandi.',
          'Ku nshuro ya mbere, umuyobozi arema sosiyete, ukoresha wa mbere n\'ifaranga shingiro.'
        ],
        expected: 'Winjiye kandi imbonerahamwe iragaragara. Buri gikorwa ukoze kuva ubu cyandikwa mu gitabo cy\'igenzura (audit) n\'izina ryawe.',
        notes: [
          'Nyuma yo kwihenda inshuro nyinshi, konti ifungwa iminota mike; ibi birinda amakuru kugenzurwa n\'abandi.',
          'Sohoka (hejuru ku ruhande rw\'iburyo) igihe uvuye kuri mudasobwa, kugira ngo ntihagire ukoresha izina ryawe.'
        ]
      },
      applications: {
        title: 'Porogaramu eshatu za JENESIS',
        purpose: 'Buri wese afungura porogaramu ijyanye n’akazi ke, kandi bose bakoresha amakuru amwe.',
        where: 'Utubuto twa JENESIS Seller, JENESIS Umuyoboro & Kubungabunga, JENESIS Ibaruramari & Ubucuruzi na JENESIS Igenamiterere & Ahantu ho kwinjirira kuri desktop cyangwa muri menu yo gutangira. Gufungura JENESIS nta buto bigaragaza ihitamo.',
        steps: [
          'JENESIS Seller (umutuku) — ubucuruzi: kugurisha, inyemezabwishyu, abakiriya, ububiko. Ifungura ku Bucuruzi.',
          'JENESIS Umuyoboro & Kubungabunga (icyatsi) — kubungabunga: serivisi, ihuzwa ry’amaorudinate, kopi zagenzuwe, isuzuma ry’ubusugire n’ibitabo by’ibyabaye. Nta ipaji y’ibaruramari, yo kugurisha, yo kugura, y’abakiriya, y’abacuruzi, y’ibicuruzwa, y’ububiko cyangwa ya raporo igira. Ifungura kuri Maintenance.',
          'JENESIS Ibaruramari & Ubucuruzi (ubururu) — ibitabo: ibaruramari, kugura, banki, raporo, imisoro, abakoresha n’uburenganzira. Ifungura ku Mbonerahamwe.',
          'JENESIS Igenamiterere & Ahantu ho kwinjirira (umuhondo) — igenamiterere: ikigo, abakoresha, inshingano, imisoro, amafaranga, ububiko, isura n’ahantu ho kwinjirira ku muyoboro. Ifungura ku Igenamiterere.',
          'Buri porogaramu yibuka imiterere yayo bwite: guhindura imiterere muri Seller ntibihindura izindi.',
          'Zose eshatu zisoma kandi zandika muri base imwe, bityo igurisha ryanditswe muri Seller rigaragara ako kanya muri raporo za Admin.'
        ],
        expected: 'Buri buto bufungura idirishya ryabwo, rifite umutwe, ibara na menu yaryo. Nta gusubiramo kabiri: hari inyandiko imwe gusa.',
        notes: [
          'Ipaji idakwiye iyo porogaramu ntitangwa: JENESIS Seller nta gitabo kinini, JENESIS Umuyoboro & Kubungabunga nta paji yo kugurisha kandi nta mibare y’amafaranga na mba.',
          'Uburenganzira bwawe buracyakurikizwa muri buri porogaramu: ukoresha udashobora kwemeza inyandiko abona ubwanga bumwe hose.',
          'Byakozwe na KAYIGANWA JACQUES.'
        ],
      },
      navigation: {
        title: 'Kugenda muri porogaramu',
        purpose: 'Kugera ku ipaji iyo ari yo yose vuba ukoresheje imbeba cyangwa clavier, no gusubira aho wari uri.',
        where: 'Ku ruhande rw\'ibumoso hari ibice byose wemerewe gufungura. Ahanditse Ubufasha (cyangwa F1) hafungura iki gitabo.',
        steps: [
          'Kanda igice ku ruhande rw\'ibumoso kugira ngo ugifungure.',
          'Kanda Alt + Umwambi w\'ibumoso kugira ngo usubire ku ipaji yabanjirije, Alt + Umwambi w\'iburyo kugira ngo wongere ujye imbere.',
          'Kanda F5 kugira ngo wongere upakire amakuru y\'ipaji uriho.',
          'Kanda Ctrl + / kugira ngo ufungure urutonde rw\'utubuto twa clavier rushakishwa.'
        ],
        expected: 'Ipaji ihita ihinduka; JENESIS yibuka inzira wanyuzemo, Alt + Umwambi w\'ibumoso / iburyo binyura ku mapaji wasuye.',
        notes: [
          'Ibice utemerewe ntibyerekanwa; seriveri ishyira mu bikorwa ubwo burenganzira nubwo ipaji yafungurwa mu buryo butaziguye.',
          'Escape ntizigera ifunga porogaramu. Ifunga mbere agasanduku k\'ibiganiro gafunguye, hanyuma akanama (kalikilateli cyangwa Messenger), hanyuma isubira ku ipaji yabanjirije.'
        ]
      },
      sales: {
        title: 'Ubucuruzi: inyemezabwishyu na fagitire (zikorwa ZYISHYUWE)',
        purpose: 'Kwandika ibyo wagurishije. Muri JENESIS, inyandiko y\'ubucuruzi iba YISHYUWE igihe cyo kuyikora: porogaramu yinjiza igurisha mu ibaruramari ikanandika ubwishyu nyabwo mu gikorwa kimwe, bityo amafaranga yo mu ntoki cyangwa muri banki n\'asigaye y\'umukiriya biba ari ukuri ako kanya.',
        where: 'Ubucuruzi → Fagitire z\'Ubucuruzi → « Fagitire Nshya ».',
        steps: [
          'Hitamo umukiriya, cyangwa ushyire akamenyetso kuri « Kugurisha ku muntu utazwi » ku gurisha ryo ku idirishya ridafite izina ry\'umukiriya.',
          'Ongeraho ibicuruzwa: igicuruzwa, umubare, igiciro cy\'igice, igabanuro n\'umusoro.',
          'Hitamo uburyo bwo kwishyura na konti y\'ubwishyu (amafaranga yo mu ntoki, mobile money, banki).',
          'Siga « Injiza ubu » gifite akamenyetso (ni cyo kibanza) hanyuma ubike.'
        ],
        expected: 'Inyandiko igaragara mu rutonde ifite imiterere y\'icyatsi YISHYUWE, nimero y\'inyemezabwishyu yerekanwa mu butumwa bwo kubyemeza, ububiko buragabanuka, amafaranga yo mu ntoki cyangwa muri banki ariyongera, n\'inyandiko z\'ibaruramari ziraringanira. Nta guhitamo BYISHYUWE/NTIBYISHYUWE: amafaranga aba yimuwe koko.',
        notes: [
          'Toranya umurongo ukande F3 (cyangwa buto yo gucapa) kugira ngo ucape inyandiko; Ctrl + P ikora kimwe.',
          'Kuraho akamenyetso kuri « Injiza ubu » gusa igihe ushaka gusiga inyandiko nk\'iteganywa (igurisha ry\'inguzanyo ritishyuwe). Iteganywa rishobora kwishyurwa nyuma ukoresheje buto Kwishyura cyangwa F2 ku murongo watoranyijwe.',
          'Gukanda F2 kabiri ntibyishyura kabiri: ku nshuro ya kabiri JENESIS ikubwira ko inyandiko yishyuwe kandi nta cyanditswe.',
          'Kugira ngo ukosore ikosa, hindura ubwishyu cyangwa ukore inyandiko yo gusubiza (credit note). Ntuzigere usiba inyandiko yemejwe: inzira y\'igenzura igomba gukomeza kuba yuzuye.'
        ]
      },
      purchases: {
        title: 'Amagura: fagitire z\'abaduhaye ibicuruzwa (zikorwa ZYISHYUWE)',
        purpose: 'Kwandika ibyo waguze. Nk\'uko bimeze ku bucuruzi, inyandiko y\'amagura iba YISHYUWE igihe cyo kuyikora: porogaramu yinjiza fagitire mu ibaruramari ikanandika ubwishyu nyabwo bw\'uwaduhaye ibicuruzwa mu gikorwa kimwe.',
        where: 'Amagura → Fagitire z\'Amagura → « Fagitire Nshya y\'Amagura ».',
        steps: [
          'Hitamo uwaduhaye ibicuruzwa na nimero ya fagitire ye (niba uyifite).',
          'Ongeraho ibicuruzwa n\'umubare n\'igiciro cy\'igura.',
          'Hitamo uburyo bwo kwishyura na konti y\'ubwishyu.',
          'Siga « Injiza fagitire ubu » gifite akamenyetso (ni cyo kibanza) hanyuma ubike.'
        ],
        expected: 'Fagitire yerekana YISHYUWE, ububiko buriyongera, asigaye y\'uwaduhaye ibicuruzwa arishyurwa, kandi ubwishyu bugaragara muri Banki bufite inyandiko yabwo y\'ibaruramari.',
        notes: [
          'Niba sosiyete yawe isaba ko ibicuruzwa byakirwa ku mugaragaro, banza wakire ibicuruzwa (Amagura → Inyemezabuguzi) uhuze iyo nyandiko na fagitire; fagitire izahanagura konti « byakiriwe bitarishyurwa » aho kongera ububiko kabiri.',
          'Fagitire iteganijwe ishobora kwishyurwa nyuma ukoresheje Kwishyura cyangwa F2; kwishyura kabiri ntibikora ubwishyu bwa kabiri na rimwe.'
        ]
      },
      inventory: {
        title: 'Ububiko n\'ibarura',
        purpose: 'Kumenya neza ibiri muri buri bubiko, kwimura ibicuruzwa hagati y\'ububiko, no kubara ibicuruzwa bifatika.',
        where: 'Ububiko → Ibicuruzwa, Ububiko, Imyimurire, Amahinduka, Ibarura.',
        steps: [
          'Ongeraho cyangwa uhindure igicuruzwa n\'igiciro cy\'igura, igiciro cy\'igurisha n\'ububiko kibarizwamo.',
          'Koresha imyimurire kugira ngo wimure ibicuruzwa buvuye mu bubiko bujya mu bundi.',
          'Koresha ihinduka kugira ngo ukosore umubare, wandike impamvu.',
          'Koresha ibarura kugira ngo ubare ububiko; ibarura rigomba gusuzumwa kandi ryemezwe n\'undi muntu mbere yo guhindura ibitabo.'
        ],
        expected: 'Buri genda ryandikwa n\'itariki, ububiko, umubare n\'uwabikoze, kandi agaciro k\'ububiko gakurikiza igiciro cy\'uburinganire.',
        notes: [
          'Uwabaze ntashobora kwemeza ibarura rye: uku gutandukanya ni ubushake bw\'umushinga.',
          'Igurisha cyangwa amagura na byo bimura ububiko byonyine; nta cyo wandika mu ibaruramari ukoresheje intoki.'
        ]
      },
      banking: {
        title: 'Banki n’amafaranga',
        purpose: 'Gukurikirana amafaranga yo muri banki no mu isanduku.',
        where: 'Igice cya Banki (Ctrl + Shift + B), gifite utwanya dutatu: Konti, Ubwishyu n’Isanduku.',
        steps: [
          'Konti — konti za banki n’isanduku by’ikigo hamwe n’ubusaguke bwabyo.',
          'Ubwishyu — imyigire y’amafaranga yanditswe kuri izo konti.',
          'Isanduku — fungura igihe cy’isanduku mu gitondo, bara amafaranga, hanyuma ufunge icyo gihe; umuyobozi yemeza ifungwa.'
        ],
        expected: 'Buri myigire ni inyandiko y’ibaramuramari, bityo ubusaguke bw’isanduku na banki buhora buhuye n’igitabo kinini.',
        notes: [
          'Kugurisha no kugura byandikwa nk’IBYISHYUWE iyo byemejwe, bityo nta bwishyu bw’inyongera buhimba.',
          'Kubara isanduku bisaba uburenganzira cash:count; kwemeza ifungwa bisaba uburenganzira bwabyo.'
        ],
      },
      calculator: {
        title: 'Kalikilateli yubatswemo',
        purpose: 'Kubara amafaranga (igiteranyo, igabanuro, umusoro) utavuye muri porogaramu. Ni kalikilateli gusa: ntabwo yinjiza cyangwa ngo ibike ikintu na kimwe.',
        where: 'Buto « Kalikilateli » ku mugozi wo hejuru, cyangwa Ctrl + Shift + K.',
        steps: [
          'Fungura kalikilateli ukoresheje buto yo hejuru cyangwa Ctrl + Shift + K.',
          'Andika ukoresheje clavier nyayo: imibare 0–9, « . », +, −, *, /, Enter cyangwa « = » ku gisubizo, Backspace kugira ngo usibe umubare, « c » kugira ngo usibe byose, Escape kugira ngo ufunge. Clavier y\'imibare nayo irakora.',
          'Cyangwa kanda utubuto ukoresheje imbeba; akanama gashobora gukururwa n\'umutwe wako kandi kagahishwa ukoresheje buto « − ».'
        ],
        expected: 'Igisubizo kigaragara gifite ubunyangamugayo bw\'ibaruramari (urugero 0.1 + 0.2 itanga 0.3, atari 0.30000000000000004). Ushobora kwinjiza uwo mubare mu gice cy\'amafaranga.',
        notes: [
          'Kugabanya na zeru byerekana ubutumwa busobanutse aho kwerekana ikosa; kanda « C » wongere utangire.',
          'Igihe kalikilateli ifunguye, clavier iba iyayo: kwandika « 5 » ntibikora utubuto twa porogaramu. Gukomatanya Ctrl n\'utubuto tw\'imikorere biracyakora (Ctrl + Shift + K irayifunga, F1 ifungura iki gitabo).'
        ]
      },
      messenger: {
        title: 'JENESIS Messenger',
        purpose: 'Kuganira n\'abo mukorana muri JENESIS — kubaza igiciro, igicuruzwa cyabuze cyangwa inyandiko — utavuye muri porogaramu.',
        where: 'Buto « Messenger » ku mugozi wo hejuru, ikurikira kalikilateli, cyangwa Ctrl + Shift + M.',
        steps: [
          'Fungura Messenger uhitemo mugenzi wawe mu rutonde rw\'ibumoso (cyangwa ushakisha izina).',
          'Andika ubutumwa bwawe wande Enter (Shift + Enter ku murongo mushya), cyangwa kanda buto yo kohereza.',
          'Fungura ikiganiro kugira ngo ugisome; ubutumwa butarasomwa bwerekanwa n\'icyatsi kandi buto yo hejuru yerekanga umubare w\'ubwo utarasoma.',
          'Kanda Escape (cyangwa buto « − ») kugira ngo ufunge akanama.'
        ],
        expected: 'Ubutumwa burabitswe, bugaragara mu kiganiro, kandi bugera ku mugenzi wawe uri ku murongo. Akamenyetso kamwe gasobanura bwoherejwe, utubiri dusobanura bwageze, utubiri tw\'ubururu dusobanura bwasomwe.',
        notes: [
          'Ushobora kohereza ubutumwa gusa ku bo mukorana bo muri sosiyete imwe; seriveri ibigenzura kuri buri gikorwa, bityo ubutumwa ntibushobora kuva muri sosiyete yawe.',
          'Niba ihuzwa rihagaritse, akanama kongera kwihuza ubwako kandi nta butumwa bwerekanywe kabiri.',
          'Amagambo y\'ubutumwa ntabwo yandikwa mu bitabo by\'amakosa; icyandikwa ni uko ubutumwa bwoherejwe gusa.'
        ]
      },
      appearance: {
        title: 'Isura: urumuri, umwijima cyangwa sisitemu',
        purpose: 'Gukora neza mu cyumba gifite urumuri cyangwa nijoro, no gukurikira isura ya mudasobwa yawe niba ubishaka.',
        where: 'Buto y\'insanganyamatsiko ku mugozi wo hejuru, cyangwa Igenamiterere → Isura.',
        steps: [
          'Kanda buto y\'insanganyamatsiko hejuru kugira ngo uhindure hagati y\'Urumuri n\'Umwijima.',
          'Cyangwa ufungure Igenamiterere → Isura uhitemo Urumuri, Umwijima cyangwa Sisitemu.',
          'Kanda Alt + T kugira ngo uhinduranye ayo mahitamo atatu.'
        ],
        expected: 'Porogaramu yose — amapaji, imbonerahamwe, udusanduku tw\'ibiganiro, iki gitabo — ikurikira ako kanya icyo wahisemo, kandi kikibukwa igihe utangiye ubutaha.',
        notes: [
          '« Sisitemu » ikurikira igenamiterere ry\'isura rya Windows; porogaramu irihindura nubwo warihindura igihe irimo gukora.',
          'Gucapa gukoresha isura y\'urumuri ihoraho, izigama wino, icyo ari cyo cyose insanganyamatsiko yerekanwa.'
        ]
      },
      shortcuts: {
        title: 'Utubuto twa clavier',
        purpose: 'Gukora ibikorwa bisanzwe udakoresheje imbeba.',
        where: 'Kanda Ctrl + / ku rutonde rushakishwa, cyangwa F1 kuri iki gitabo usome igice cy\'utubuto.',
        steps: [
          'F1 — fungura iki gitabo.',
          'F2 — ishyura (erekana YISHYUWE) inyandiko y’ubucuruzi cyangwa amagura yatoranyijwe.',
          'F3 — capa inyandiko yatoranyijwe (Ctrl + P ikora kimwe).',
          'F5 — ongera upakire amakuru y’iyi paji.',
          'Ctrl + S — bika ibyo urimo guhindura.',
          'Ctrl + N — kora inyandiko nshya kuri iyi paji.',
          'Ctrl + E — hindura ibyo wahisemo.',
          'Ctrl + F — jya mu gushakisha kuri iyi paji.',
          'Ctrl + D — koporora inyandiko yatoranyijwe.',
          'Ctrl + Entrée — emeza ikiganiro cyangwa ohereza ifishi.',
          'Alt + Umwambi w’ibumoso — subira ku ipaji yabanjirije.',
          'Alt + Umwambi w’iburyo — jya ku ipaji ikurikira.',
          'Ctrl + Shift + S — fungura Ubucuruzi.',
          'Ctrl + Shift + R — kora inyemezabwishyu nshya yo kugurisha.',
          'Ctrl + Shift + C — fungura Abakiriya ushakishe.',
          'Ctrl + Shift + P — fungura Kugura.',
          'Ctrl + Shift + V — fungura Abaduha ibicuruzwa ushakishe.',
          'Ctrl + Shift + N — kora inyandiko nshya yo kugura.',
          'Ctrl + Shift + I — fungura Ububiko.',
          'Ctrl + Shift + F — fungura Ububiko ushakishe kode y’igicuruzwa.',
          'Ctrl + Shift + T — fungura imyimurire y’ububiko.',
          'Ctrl + Shift + A — fungura Ibaruramari.',
          'Ctrl + Shift + B — fungura Banki n’amafaranga.',
          'Ctrl + Shift + L — fungura Igitabo kinini.',
          'Ctrl + Shift + G — fungura Raporo.',
          'Ctrl + Shift + K — fungura cyangwa ufunge imashini ibara.',
          'Ctrl + Shift + M — fungura cyangwa ufunge JENESIS Messenger.',
          'Ctrl + / — erekana cyangwa uhisha urutonde rw’utubuto dushakishwa.',
          'Alt + T — hindura imiterere: Umucyo → Umwijima → Sisitemu.',
          'Alt + L — hindura ururimi.',
          'Escape — ifunga agasanduku k’ibiganiro, hanyuma akanama, hanyuma isubira inyuma. Ntizigera isohoka muri porogaramu.'
        ],
        expected: 'Igikorwa kiba ako kanya, kandi ubutumwa burakubwira igihe nta cyo gukora (urugero F2 nta nyandiko yatoranyijwe, cyangwa F3 ku ipaji idafite icyo icapa).',
        notes: [
          'Igihe urimo kwandika mu gace k\'inyandiko, utubuto tworoshye turahagarara kugira ngo tutakwiba inyandiko; utubuto tw\'imikorere, Escape no gukomatanya Alt cyangwa Shift biracyakora.',
          'Uburenganzira bukurikizwa no ku tubuto: ukoresha udashobora kwinjiza cyangwa kwishyura abona ubutumwa bwo kwangirwa, nk\'uko byagenda iyo akanda buto.'
        ]
      },
      contextmenu: {
        title: 'Gukanda iburyo ku nyandiko',
        purpose: 'Gukorera ku murongo icyo wajya gushakira mu bikoresho: kuwukoporora, kuwufungura, kuwuhagarika cyangwa kuwusubiza mu bikorwa.',
        where: 'Urutonde urwo ari rwo rwose rw\u2019inyandiko muri porogaramu enye — abakiriya, abatanga ibicuruzwa, ibicuruzwa, ibyagurishijwe, ibyaguwe, banki, ibaramuramari, inyandiko y\u2019igenzura, urutonde rw\u2019andi makompyuta n\u2019ibice by\u2019igenamiterere.',
        steps: [
          'Kanda iburyo ku murongo ushaka. Menu ifungura irimo gusa ibikorwa bifite icyo bisobanura kuri uwo murongo.',
          'Gukoporora bishyira inyandiko mu gikoresho cyo gukoporora nk\u2019inyandiko isanzwe, kugira ngo ishyirwe mu ibaruwa cyangwa ubutumwa.',
          'Guhindura bifungura umwanditsi umwe nk\u2019uwo buto bw\u2019uwo murongo bufungura.',
          'Kuzimya bivanaho inyandiko utagikoresha; Kuzimura birayisubiza mu bikorwa. Nta na kimwe gihanagura amateka yayo.',
          'Gusiba bisiba inyandiko nta cyo ishingiyeho, kandi bibanza kubaza, bikavuga izina ry\u2019iyo nyandiko.',
          'Guhitamo byose bihitamo imirongo yose yo ku rutonde, kugira ngo ikopororwe cyangwa icapwe.'
        ],
        expected: 'Igikorwa gikorerwa ku murongo wakandaweho, kandi ubutumwa bukakubwira ibyakozwe — cyangwa impamvu byanzwe.',
        notes: [
          'Urwego rwawe ruhitamo ibyo werekanirwa, na seriveri ikabaza ikibazo kimwe: menu si yo nzira yonyine yo kurinda.',
          'Inyandiko y\u2019ibaramuramari ntisibwa na rimwe. Inyandiko ifite amateka y\u2019ibaramuramari irazimwa ahubwo, kandi menu ikabivuga.',
          'Imibare itari inyandiko — umurongo wa balance générale, inyandiko y\u2019igenzura — ishobora gukopororwa ariko ntishobora guhindurwa cyangwa gusibwa, kuko ari amateka.',
          'Menu ishushanywa mu ibara rya porogaramu urimo, kandi nta nzira-ngufi ya clavier yavanyweho ngo iyihere umwanya.'
        ]
      },
      seller: {
        title: 'JENESIS Umucuruzi — aho kugurishiriza',
        purpose: 'Kugurisha umunsi wose utabona imibare y\u2019umubaramari, mu gihe buri cyagurishijwe kiguma mu bitabo bimwe.',
        where: 'JENESIS Umucuruzi (umutuku) — Imbonerahamwe, Ibyagurishijwe, Abakiriya, Ububiko, Ubufasha.',
        steps: [
          'Imbonerahamwe ni umunsi: ibyagurishijwe bingahe, angahe yakiriwe, angahe mu ntoki n\u2019angahe ku ideni, n\u2019icyumweru kiri inyuma.',
          'Igurishwa rishya rifungura formulaire yo kugurisha; Inyemezabwishyu nshya irayifungura yiteguye gucapwa.',
          'Gushakisha igicuruzwa gishakisha ikintu ku izina cyangwa ku kode kikagusubiza igiciro cyacyo n\u2019aho kiri.',
          'Ububiko buboneka bwerekana ibihari. Bwasomwa gusa: ibiciro n\u2019ingano bihindurwa muri JENESIS Ibaruramari & Ubucuruzi.',
          'Amateka yo kugurisha atondeka inyandiko za vuba kandi agacapa inyemezabwishyu kuri buri imwe.',
          'Amakuru ya caisse yerekana ama-konte ya caisse n\u2019ibiyarimo.'
        ],
        expected: 'Icyagurishijwe hano kinyura mu bubiko, cyandika inyandiko z\u2019ibaramuramari kikinjiza amafaranga muri caisse — umubaramari akabibona mu bubiko bumwe bw\u2019amakuru, ako kanya.',
        notes: [
          'Umucuruzi ntiyerekana, kandi ntashobora kugera ku mbonerahamwe y\u2019ibaramuramari, inyungu n\u2019igihombo, bilan, balance générale, grand livre, amadeni yishyurwa cyangwa ayishyurwa. Birangwa na seriveri, ntibihishwe gusa.',
          'Igiciro cy\u2019igura ntikigere cyerekanwa hano.',
          'Umucuruzi nta genamiterere rya sosiyete cyangwa ry\u2019abakoresha afite: ibyo biri muri JENESIS Igenamiterere & Ahantu ho Kwinjirira (umuhondo).'
        ]
      },
      accounting: {
        title: 'Ibaruramari na raporo',
        purpose: 'Kureba imiterere nyayo y\'amafaranga: buri nyandiko yinjizwa mu ibaruramari riringaniye, kandi raporo zubakwa kuri izo nyandiko.',
        where: 'Ibaruramari → Inyandiko z\'igitabo, Urutonde rwa konti. Raporo → Inyandiko y\'uburinganire (Balance), Inyungu n\'igihombo, Uburinganire bw\'umutungo n\'izindi raporo.',
        steps: [
          'Fungura Raporo → Inyandiko y\'uburinganire kugira ngo urebe ko ibyo twinjije n\'ibyasohotse bingana igihe cyose.',
          'Fungura Inyungu n\'igihombo cyangwa Uburinganire bw\'umutungo ku gihe ushaka.',
          'Fungura Ibaruramari → Inyandiko z\'igitabo kugira ngo urebe inyandiko ziri inyuma y\'inyandiko, n\'uwabikoze n\'itariki.'
        ],
        expected: 'Inyandiko y\'uburinganire iraringaniye — iki ni cyo kimenyetso ko ibitabo ari ukuri. Raporo zishobora gucapwa (F3) cyangwa koherezwa hanze.',
        notes: [
          'Inyandiko yemejwe ntishobora guhindurwa; yihindure wongere uyinjize kugira ngo amateka akomeze kuba yuzuye.',
          'Amafaranga ahora yandikwa mu ifaranga shingiro rya sosiyete; inyandiko ikoresha ifaranga ry\'amahanga igumana ifaranga ryayo, igipimo cyayo n\'igiteranyo cyahinduwe.'
        ]
      },
      settings: {
        title: 'Igenamiterere, abakoresha n\'uburenganzira',
        purpose: 'Guhuza porogaramu na sosiyete yawe no guha buri muntu gusa uburenganzira akeneye.',
        where: 'JENESIS Igenamiterere & Ahantu ho Kwinjirira (umuhondo) — Sosiyete, Abakoresha, Imisoro, Amadovize, Igenzura, Ububiko, Isura.',
        steps: [
          'Sosiyete: izina, aderesi, ifaranga shingiro n\'amategeko y\'ibaruramari.',
          'Abakoresha: kora ukoresha, umuhe uruhare (umuyobozi, umubitsi, ubucuruzi, amagura, ububiko, umucungamutungo) kandi uhagarike ukoresha ugiye. Ijambo ry\'ibanga ryibagiranye rihindurwa hano, utazi irya kera.',
          'Uburenganzira: hitamo porogaramu enye buri muntu ashobora gufungura, kandi wongere cyangwa ukureho uburenganzira ku giti cye hejuru y\'uruhare rwe. Gufunga porogaramu bisohora amadirishya yayo afunguye.',
          'Imisoro: kora, hindura, zimya kandi uhembure ibipimo, urebe ibikora n\'ibidakora ukwayo.',
          'Amadovize: ibiciro by\'ivunjisha bikoreshwa n\'inyandiko zawe.',
          'Igenzura: reba uwakoze iki n\'igihe — harimo n\'ihinduka ryose ryakozwe ku gipimo cy\'umusoro cyangwa ku burenganzira bw\'umuntu.'
        ],
        expected: 'Buri ukoresha areba kandi ashobora gukora gusa ibyo uruhare rwe rwemera — haba mu ishusho no kuri seriveri.',
        notes: [
          'Igipimo cy\'umusoro cyakoreshejwe mu nyandiko ntigishobora gusibwa: kizimye ahubwo. Kukizimya ntigihindura inyandiko zamaze gukorwa — zigumana igipimo zakoreweho — kandi icyo gipimo ntikiba kigihabwa ibishya.',
          'Abayobozi bagomba kuba bake: umuyobozi ashobora gukora byose, harimo no gusubiza ububiko.',
          'Ntuzigere usangira ijambo ry\'ibanga; kora ukoresha umwe kuri buri muntu kugira ngo igitabo cy\'igenzura kigire icyo kivuze.'
        ]
      },
      backup: {
        title: 'Ububiko, gusubiza no kurinda amakuru',
        purpose: 'Gushobora kugaruza ibitabo byawe nyuma y\'ikosa, mudasobwa yangiritse cyangwa umuriro wabuze.',
        where: 'Igenamiterere → Ububiko (Kohereza hanze / Kwinjiza).',
        steps: [
          'Kohereza ububiko hanze buri gihe (buri munsi ku iduka rihuze) kandi ubike dosiye hanze ya mudasobwa — kuri clé USB cyangwa disiki yindi.',
          'Kugira ngo usubize: fungura dosiye y\'ububiko, ongera wandike ijambo ry\'ibanga hanyuma wandike RESTORE kugira ngo wemeze.',
          'JENESIS ifata kopi y\'umutekano ubwayo mbere yo gusubiza na mbere yo kuzamura ububiko bw\'amakuru.'
        ],
        expected: 'Kohereza hanze bijyana dosiye imwe irimo sosiyete yose. Nyuma yo gusubiza, imibare iba ari nk\'iy\'ububiko, kandi imiterere yabanje iguma nka kopi y\'umutekano.',
        notes: [
          'Gusubiza bisimbuza amakuru ariho ya sosiyete — ni cyo gituma icyemezo n\'ijambo ry\'ibanga bisabwa.',
          'Amakuru yawe aba mu bubiko bwa JENESIS mu mwirondoro wawe wa Windows; ujye ubika na bwo niba ushaka kopi yuzuye.'
        ]
      },
      maintenance: {
        title: 'Kubungabunga: serivisi, urusobe, kopi z’ububiko n’ibitabo',
        purpose: 'Kubungabunga JENESIS, kwemerera andi maorudinate yo mu biro guhuzwa, no kugaragaza ko amakuru ari meza.',
        where: 'JENESIS Umuyoboro & Kubungabunga → Maintenance (ipaji ifunguraho), cyangwa JENESIS Ibaruramari & Ubucuruzi → Maintenance.',
        steps: [
          'Serivisi — yerekana verisiyo, igihe serivisi yatangiye, igihe imaze ikora, n’aho base n’ububiko bw’amakuru biri.',
          'Urusobe — ntibikora nk’ibisanzwe: serivisi isubiza iyi orudinate gusa. Bikoreshe kugira ngo andi maorudinate yo ku rusobe ahuzwe; aderesi irerekanwa na Windows ikabaza ku rukuta rw’umutekano.',
          'Kwihuza na orudinate yindi — andika aderesi ya orudinate ifite amakuru, kanda Gerageza, hanyuma Shyira mu bikorwa. Buri cyifuzo kiracyasaba izina ryawe, ijambo ry’ibanga n’uburenganzira.',
          'Kopi y’ububiko — ikora kopi yagenzuwe ya base mu bubiko bw’amakopi kandi ikanerekana izabanjirije.',
          'Isuzuma ry’ubusugire — rikoresha isuzuma rya SQLite ry’ubusugire n’imfunguzo z’amahanga kandi rikabara inyandiko zemejwe.',
          'Ibitabo — byerekana imirongo ya nyuma y’igitabo cya serivisi.'
        ],
        expected: 'Ipaji yo kubungabunga ntikeka: ivuga ibyo yasanze kandi ikakubwira igihe serivisi igomba kongera gutangizwa.',
        notes: [
          'Gufungura serivisi ku rusobe ni ihitamo, ntibiba byikora: siga bizimye iyo ukorera wenyine kuri orudinate imwe.',
          'Kopi ikorerwa hano ni kopi ya dosiye ya base. Amagenamiterere → Kopi yohereza dosiye ishyirwa ahandi ushobora kubika hanze ya orudinate.'
        ],
      },
      troubleshooting: {
        title: 'Gukemura ibibazo',
        purpose: 'Gukemura ibibazo bikunze kubaho udasabye ubufasha.',
        steps: [
          '« Sinshobora kubona buto »: uruhare rwawe ntirwemera icyo gikorwa — babaze umuyobozi.',
          '« Inyandiko ntinjira mu ibaruramari »: soma ubutumwa; impamvu zisanzwe ni imirongo ituzuye, kubura umukiriya ku gurisha ry\'inguzanyo, cyangwa kubura konti y\'amafaranga/banki.',
          '« Imibare isa n\'itari yo »: fungura Raporo → Inyandiko y\'uburinganire; niba iringaniye, ibitabo birahura kandi raporo ureba ishobora kuba ireba ikindi gihe.',
          '« Porogaramu ntitangira »: reba ko iyari yafunguwe yafunzwe, hanyuma wongere uyitangize; ubutumwa ku ipaji burakubwira niba ububiko bw\'amakuru butafunguwe.'
        ],
        where: 'Ahantu hose muri porogaramu.',
        expected: 'Ibibazo byinshi bisobanurwa n\'ubutumwa bwerekanwe; ubwo butumwa buhora buvuga icyo gukora gikurikira.',
        notes: [
          'Ntuzigere usiba cyangwa ngo uhindure dosiye z\'ububiko bw\'amakuru ukoresheje intoki — koresha imikorere yo kubika no gusubiza.',
          'Andika ubutumwa nyabwo wabonye mbere yo gusaba ubufasha; igisubizo kirihuta cyane.'
        ]
      },
      roles: {
        title: 'Uriya ukora iki: Umucuruzi, Umuyobozi, Ushinzwe kubungabunga',
        purpose: 'Kumenya ibiteganyijwe kuri buri bwoko bw\'ukoresha, n\'ibyo buri ruhare rwemererwa gukora.',
        where: 'Igenamiterere → Abakoresha (uruhare rwa buri ukoresha).',
        steps: [
          'Umucuruzi (uruhare « ubucuruzi »): yandika amagurisha n\'inyemezabwishyu zo ku idirishya, arema abakiriya, asoma ububiko. Amagurisha akorwa YISHYUWE; ishyura iteganijwe ukoresheje F2 igihe umukiriya yishyuye nyuma.',
          'Umuyobozi (uruhare « admin »): byose — abakoresha, uburenganzira, igenamiterere rya sosiyete, imisoro, amadovize, ububiko no gusubiza.',
          'Ushinzwe kubungabunga / umubitsi (uruhare « ububiko »): ibicuruzwa, ububiko, imyimurire, amahinduka n\'ibarura. Ibarura rigomba kwemezwa n\'undi muntu.',
          'Umubitsi (uruhare « umubitsi »): banki, ibaruramari, ibitabo na raporo; amagura (uruhare « amagura ») yandika fagitire z\'abaduhaye ibicuruzwa; umucungamutungo (uruhare « manager ») ashobora gusoma byose ariko ntahindure.'
        ],
        expected: 'Buri muntu akora muri porogaramu imwe afite uburenganzira bw\'akazi ke, kandi igitabo cy\'igenzura cyerekana uwakoze iki.',
        notes: [
          'Niba umuntu akora imirimo ibiri, muhe uruhare ruhuye kandi babaze umuyobozi mbere yo kwagura uburenganzira.',
          'Umucungamutungo usoma gusa ni ubushake: kugenzura no gukora biratandukanye.'
        ]
      },
      developers: {
        title: 'Ku baremye porogaramu',
        purpose: 'Kumenya uwakoze kandi uteza imbere JENESIS, kugira ngo umenye uhagarariye porogaramu ukoresha mu bucuruzi bwawe.',
        where: 'Ubufasha → Ku baremye porogaramu. Iyo nyandiko kandi iri hasi ku ruhande rw’ibumoso muri buri porogaramu.',
        steps: [
          'Fungura Ubufasha (kanda F1, cyangwa hitamo Ubufasha ku ruhande rw’ibumoso).',
          'Manuka ugere ku gice « Ku baremye porogaramu ».',
          'Izina ry’uwakoze kandi uteza imbere JENESIS rirahagaragara: KAYIGANWA JACQUES.'
        ],
        expected: 'Ubona izina ry’uwakoze porogaramu: Byakozwe na KAYIGANWA JACQUES.',
        notes: [
          'KAYIGANWA JACQUES ni we wakoze kandi uteza imbere JENESIS.',
          'Iyo nyandiko inagaragara hasi ku ruhande rw’ibumoso muri porogaramu zose uko ari enye, mu Cyongereza, Igifaransa n’Ikinyarwanda.',
          'Ubufasha, impinduka n’amavugururwa ya JENESIS bituruka ku wakoze porogaramu uvugwa hano.'
        ]
      }

    }
  }
};

/** The order in which sections are shown in the guide. */
export const HELP_ORDER = [
  'welcome',
  'signin',
  'navigation',
  'sales',
  'purchases',
  'inventory',
  'calculator',
  'messenger',
  'appearance',
  'shortcuts',
  'contextmenu',
  'seller',
  'accounting',
  'settings',
  'backup',
  'troubleshooting',
  'roles',
  'developers'
];
