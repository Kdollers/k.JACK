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
        where: 'Settings → Company, Users, Taxes, Audit, Currencies, Backup, Appearance.',
        steps: [
          'Company: name, address, base currency and accounting policies.',
          'Users: create a user, give a role (admin, accountant, sales, purchases, inventory, manager) and deactivate a user who leaves.',
          'Taxes and Currencies: the rates used by your documents and the exchange rates.',
          'Audit: review who did what and when.'
        ],
        expected: 'Each user sees and can do only what their role allows — both in the interface and on the server.',
        notes: [
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
        where: 'Paramètres → Société, Utilisateurs, Taxes, Audit, Devises, Sauvegarde, Apparence.',
        steps: [
          'Société : nom, adresse, devise de base et règles comptables.',
          'Utilisateurs : créez un utilisateur, donnez un rôle (admin, comptable, ventes, achats, stock, gestionnaire) et désactivez un utilisateur qui part.',
          'Taxes et Devises : les taux utilisés par vos documents et les cours de change.',
          'Audit : consultez qui a fait quoi et quand.'
        ],
        expected: 'Chaque utilisateur voit et peut faire uniquement ce que son rôle autorise — dans l\'interface comme sur le serveur.',
        notes: [
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
        where: 'Igenamiterere → Sosiyete, Abakoresha, Imisoro, Igenzura, Amadovize, Ububiko, Isura.',
        steps: [
          'Sosiyete: izina, aderesi, ifaranga shingiro n\'amategeko y\'ibaruramari.',
          'Abakoresha: kora ukoresha, umuhe uruhare (umuyobozi, umubitsi, ubucuruzi, amagura, ububiko, umucungamutungo) kandi uhagarike ukoresha ugiye.',
          'Imisoro n\'Amadovize: ibipimo bikoreshwa n\'inyandiko zawe n\'ibiciro by\'ivunjisha.',
          'Igenzura: reba uwakoze iki n\'igihe.'
        ],
        expected: 'Buri ukoresha areba kandi ashobora gukora gusa ibyo uruhare rwe rwemera — haba mu ishusho no kuri seriveri.',
        notes: [
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
  'accounting',
  'settings',
  'backup',
  'troubleshooting',
  'roles'
];
