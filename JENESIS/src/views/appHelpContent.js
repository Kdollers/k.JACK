/**
 * appHelpContent.js — the Help guide each JENESIS application shows.
 *
 * A Seller at a till, an accountant keeping the books, the person who looks
 * after the network, and whoever configures the program are four different
 * people doing four different jobs. They used to be given the same guide,
 * which meant each of them had to read past a great deal that had nothing to
 * do with them — and, worse, the Seller's guide carried accounting
 * instructions a Seller is not allowed to carry out.
 *
 * So each application now has its own guide, and it is chosen automatically
 * from the application the user opened. Nobody is ever asked which guide they
 * want: the question would be meaningless to them and easy to answer wrong.
 *
 * The guides are deliberately narrow. The Seller's guide covers the counter —
 * sales, product search, customers, receipts, printing, returns, stock and
 * shortcuts — and says nothing about accounting, because a Seller cannot post
 * a journal entry. The Maintenance guide covers the service and the network,
 * and holds no accounting, sales or stock instructions at all.
 *
 * Structure of a section, identical to helpContent.js so the two can be read
 * the same way:
 *   title, purpose, where, steps[], expected, notes[]
 *
 * Every guide ends with the same credit, in every language: JENESIS is
 * created and developed by KAYIGANWA JACQUES.
 *
 * These guides document the program as it is. Nothing here describes a
 * feature that does not exist in JENESIS.
 *
 * GENERATED FILE — edit scripts/helpgen/content/{en,fr,rw}.json and run
 * npm run help:build. Editing this file by hand loses the change on the
 * next build.
 */

export const APP_HELP_ORDER = {
  seller: ["seller_interface", "seller_sales", "seller_search", "seller_customers", "seller_receipts", "seller_printing", "seller_returns", "seller_stock", "seller_shortcuts", "seller_troubleshooting", "credits"],
  admin: ["admin_dashboard", "admin_accounting", "admin_purchases", "admin_parties", "admin_taxes", "admin_reports", "admin_records", "admin_permissions", "admin_functions", "admin_shortcuts", "credits"],
  maintenance: ["maint_interface", "maint_network", "maint_connect", "maint_manage", "maint_troubleshooting", "maint_settings", "maint_shortcuts", "credits"],
  settings: ["set_overview", "set_printers", "set_receipts", "set_languages", "set_theme", "set_preferences", "set_options", "set_troubleshooting", "credits"]
};

export const APP_HELP = {
  seller: {
    en: {
      guideTitle: "How to use JENESIS Seller",
      guideIntro: "A short guide to selling at the counter: recording a sale, finding a product, taking payment, printing a receipt, and putting goods back when a customer returns them.",
      closingNote: "Every sale you record is balanced in the accounts for you. This guide covers the counter; anything to do with the books belongs to JENESIS Accounting & Business.",
      sections: {
        seller_interface: {
          title: "The Seller screen",
          purpose: "Selling at the counter. Everything you need for a sale is on this screen and nothing else gets in the way.",
          where: "JENESIS Seller (the red application). It opens on the sales screen.",
          steps: [
            "Look at the left column: it lists where you can go — Dashboard, Sales, Customers, Inventory, Help.",
            "The top bar shows the company you are working in, today's date, the calculator, the Messenger, the language and your name.",
            "The middle of the screen is where a sale is built up: the customer, then the items.",
          ],
          expected: "You can see the shop's figures for today and start a sale without opening any other screen.",
          notes: [
            "The colour of the application is red. If the bar is blue you are in JENESIS Accounting & Business, which holds the books rather than the till.",
            "Your name is shown at the top right. Every sale you record is stored against it.",
          ]
        },
        seller_sales: {
          title: "Recording a sale",
          purpose: "Record what a customer buys. The sale, the stock and the accounts are all updated together, so you do not enter the same thing twice.",
          where: "Sales → New sale (or press F2).",
          steps: [
            "Choose the customer, or leave it as the walk-in customer if they do not have an account.",
            "Add each item: pick the product, then the quantity. Quantities can be fractions — half a kilo is 0.5.",
            "Check the price and the total at the bottom.",
            "Choose how the customer pays: cash, bank, or mobile money.",
            "Press Save (or record the payment) to finish.",
          ],
          expected: "The sale is saved, the stock of each item falls by exactly what was sold, and the accounting entry is made for you. A sale of 1.25 kg takes 1.25 kg out of stock — not one kilo, and not two.",
          notes: [
            "You cannot sell more than you hold. If the program refuses the sale, check the stock level of that item first.",
            "A sale is recorded the moment you save it. To correct a saved sale, record a return rather than editing it.",
          ]
        },
        seller_search: {
          title: "Finding a product",
          purpose: "Find what the customer is asking for quickly, by name or by the code printed on it.",
          where: "The product box on a sale, or Inventory → Products.",
          steps: [
            "Type part of the name, or the whole code, into the product box.",
            "The list shortens as you type; pick the item you want.",
            "If nothing appears, the product may not be set up yet — an administrator adds products in JENESIS Accounting & Business.",
          ],
          expected: "The product is added to the sale with its price and the stock you have left.",
          notes: [
            "Searching looks at both the name and the code, so the shorter code is often faster at a busy counter.",
            "The stock you have left is shown next to the product, so you can answer a customer without leaving the sale.",
          ]
        },
        seller_customers: {
          title: "Customers",
          purpose: "Sell on credit to a customer you know, and see what they owe.",
          where: "Customers in the left column.",
          steps: [
            "Open Customers to see every customer and the balance each one owes.",
            "To add one, press New customer and fill in the name and, if you have it, the telephone number.",
            "Choose the customer on a sale when they are buying on account rather than paying now.",
          ],
          expected: "A sale on account raises what that customer owes. When they pay you later, the balance falls.",
          notes: [
            "A customer who pays each time does not need an account: leave the sale on the walk-in customer.",
            "You can see what a customer owes, but only an administrator can write a debt off.",
          ]
        },
        seller_receipts: {
          title: "Receipts and taking payment",
          purpose: "Take the money and give the customer a receipt that matches what they bought.",
          where: "The payment part of a sale, and Sales → the list of sales.",
          steps: [
            "Choose how the customer pays: cash, bank, or mobile money.",
            "Type how much they gave you; the change is worked out for you.",
            "Save the sale, then print the receipt.",
            "To give money back, record a refund: it is a payment with a minus amount, and the money comes out of the till, the bank or the mobile money account you choose.",
          ],
          expected: "The money is recorded against the account you chose, and the customer's balance falls by what they paid.",
          notes: [
            "A refund is written as a negative amount. It takes money out of the account, and the receipt and the accounts both show it as a refund.",
            "You cannot give back more than the customer paid on that sale.",
          ]
        },
        seller_printing: {
          title: "Printing a receipt",
          purpose: "Print a receipt for the customer on whatever printer is at the counter, shaped the way your shop needs.",
          where: "The Print receipt button on a sale or on a saved invoice, and JENESIS Settings & Access Point → Printing to set it up.",
          steps: [
            "On a sale, press Print receipt. The receipt is sent straight to the printer you chose.",
            "To change how it looks, open JENESIS Settings & Access Point, go to Printing, and choose the printer, the paper (58 mm, 80 mm, A4 or a custom width), the text size and what appears on it.",
            "Press Show the preview to see the receipt exactly as it will print, and Print a test receipt to check the printer before a customer is waiting.",
            "Press Save these settings when you are happy.",
          ],
          expected: "The receipt prints on the paper you chose, with the details you chose, and is remembered for next time.",
          notes: [
            "The settings you save belong to JENESIS Seller on this computer. Saving them does not change how JENESIS Accounting & Business prints.",
            "Decimals print as you type them — 1.25 stays 1.25 — and a returned item is shown with a minus and marked as returned.",
            "Printing a receipt does not change the sale. Printing it twice gives two pieces of paper, not two sales.",
          ]
        },
        seller_returns: {
          title: "Returns and refunds",
          purpose: "Put goods back and give money back, so the stock and the till both tell the truth.",
          where: "A new sale, or a credit note against a saved invoice.",
          steps: [
            "To take goods back on the till, record the item with a negative quantity — for half a kilo returned, type -0.5.",
            "To refund a whole invoice, open the sale and raise a credit note. Say whether the goods are coming back into stock.",
            "To give money back, record a payment with a minus amount.",
          ],
          expected: "Returned goods go back into stock, and the money you give back comes out of the till, the bank or the mobile money account.",
          notes: [
            "A credit note is the proper way to return goods against an invoice: it records why, and it can put the stock back at the same time.",
            "A negative line on a sale is the quick correction at the counter. Both work; the credit note is the one that leaves a full explanation.",
            "A receipt that includes a return says so, so the customer can see goods went back rather than being sold a negative quantity.",
          ]
        },
        seller_stock: {
          title: "Checking what is in stock",
          purpose: "Answer a customer's question, or check before you promise something, without leaving the counter.",
          where: "Inventory → Products, and the stock figure shown next to each product on a sale.",
          steps: [
            "Open Inventory → Products to see what you hold of everything.",
            "On a sale, the stock left is shown next to the product as you pick it.",
            "Use the search box to find one product quickly.",
          ],
          expected: "You can see how much of an item you hold before you sell it.",
          notes: [
            "The stock figure is what is left after everything already sold, so it is the truth at this moment.",
            "Fractions are kept: if you hold 2.5 kg, you see 2.5 and not 2.",
            "Only an administrator can change what you hold; a count is the proper way to correct it.",
          ]
        },
        seller_shortcuts: {
          title: "Keyboard shortcuts",
          purpose: "Work faster at the counter without reaching for the mouse.",
          where: "Anywhere in JENESIS Seller. Press F1 for the full list.",
          steps: [
            "F1 — open this guide.",
            "F2 — start a new sale.",
            "Ctrl+Shift+K — the calculator.",
            "Ctrl+Shift+C — customers.",
            "Alt+T — change the light or dark appearance.",
            "Alt+L — change the language.",
          ],
          expected: "The screen you asked for opens straight away.",
          notes: [
            "Shortcuts stay out of the way while you are typing, so typing a product name never triggers one by accident.",
            "A shortcut only works if you are allowed to do what it does.",
          ]
        },
        seller_troubleshooting: {
          title: "When something goes wrong",
          purpose: "Sort out the handful of problems that happen at a counter, or know who to call.",
          where: "Anywhere in JENESIS Seller.",
          steps: [
            "'I cannot sell this item' — you are out of it, or you have less than you are trying to sell. Check the stock level.",
            "'The printer did nothing' — check it is switched on, has paper and is not showing a fault. Print a test receipt from Settings → Printing to check.",
            "'The receipt is cut off' — the paper size may be wrong for your printer. Open Settings → Printing and choose 58 mm or 80 mm to match the roll.",
            "'I typed the wrong amount' — do not edit the saved sale. Record a return or a refund so the accounts keep a true history.",
            "'I am locked out' — wait a few minutes and try again, or ask an administrator to reset your password.",
          ],
          expected: "You know what the message means and what to do next.",
          notes: [
            "Nothing you do at the counter can lose the accounts: a correction is always recorded as a correction, never erased.",
            "If the program will not start at all, or a screen is blank, that is a job for JENESIS Network & Maintenance.",
          ]
        },
        credits: {
          title: "Who made JENESIS",
          purpose: "Know who to contact about the program.",
          where: "This section appears at the end of every JENESIS guide.",
          steps: [
            "JENESIS is created and developed by KAYIGANWA JACQUES.",
          ],
          expected: "You know who the program belongs to and who develops it.",
          notes: [
            "This guide documents the program as it is. It describes only features that exist in JENESIS.",
          ]
        },
      }
    },
    fr: {
      guideTitle: "Comment utiliser JENESIS Seller",
      guideIntro: "Un guide court pour vendre au comptoir : enregistrer une vente, trouver un produit, encaisser, imprimer un reçu, et reprendre des marchandises lorsqu'un client les rapporte.",
      closingNote: "Chaque vente que vous enregistrez est équilibrée dans les comptes pour vous. Ce guide couvre le comptoir ; tout ce qui concerne les livres appartient à JENESIS Accounting & Business.",
      sections: {
        seller_interface: {
          title: "L'écran du vendeur",
          purpose: "Vendre au comptoir. Tout ce dont vous avez besoin pour une vente est sur cet écran, et rien d'autre ne vous gêne.",
          where: "JENESIS Seller (l'application rouge). Elle s'ouvre sur l'écran des ventes.",
          steps: [
            "Regardez la colonne de gauche : elle indique où vous pouvez aller — Tableau de bord, Ventes, Clients, Stocks, Aide.",
            "La barre du haut montre l'entreprise dans laquelle vous travaillez, la date du jour, la calculatrice, le Messenger, la langue et votre nom.",
            "Le milieu de l'écran est l'endroit où la vente se construit : le client, puis les articles.",
          ],
          expected: "Vous voyez les chiffres du jour et pouvez commencer une vente sans ouvrir un autre écran.",
          notes: [
            "La couleur de l'application est le rouge. Si la barre est bleue, vous êtes dans JENESIS Accounting & Business, qui contient la comptabilité et non la caisse.",
            "Votre nom s'affiche en haut à droite. Chaque vente que vous enregistrez est conservée sous ce nom.",
          ]
        },
        seller_sales: {
          title: "Enregistrer une vente",
          purpose: "Enregistrer ce qu'un client achète. La vente, le stock et la comptabilité sont mis à jour ensemble, vous ne saisissez donc pas deux fois la même chose.",
          where: "Ventes → Nouvelle vente (ou appuyez sur F2).",
          steps: [
            "Choisissez le client, ou laissez le client de passage s'il n'a pas de compte.",
            "Ajoutez chaque article : choisissez le produit, puis la quantité. Les quantités peuvent être fractionnaires — un demi-kilo s'écrit 0,5.",
            "Vérifiez le prix et le total en bas.",
            "Choisissez comment le client paie : espèces, banque ou argent mobile.",
            "Appuyez sur Enregistrer (ou enregistrez le paiement) pour terminer.",
          ],
          expected: "La vente est enregistrée, le stock de chaque article baisse exactement de ce qui a été vendu, et l'écriture comptable est faite pour vous. Une vente de 1,25 kg retire 1,25 kg du stock — pas un kilo, ni deux.",
          notes: [
            "Vous ne pouvez pas vendre plus que ce que vous avez. Si le programme refuse la vente, vérifiez d'abord le stock de cet article.",
            "Une vente est enregistrée dès que vous la sauvegardez. Pour corriger une vente déjà enregistrée, faites un retour plutôt que de la modifier.",
          ]
        },
        seller_search: {
          title: "Trouver un produit",
          purpose: "Trouver rapidement ce que le client demande, par son nom ou par le code qui y figure.",
          where: "La case produit sur une vente, ou Stocks → Produits.",
          steps: [
            "Tapez une partie du nom, ou le code entier, dans la case produit.",
            "La liste se raccourcit au fur et à mesure ; choisissez l'article voulu.",
            "Si rien n'apparaît, le produit n'est peut-être pas encore créé — un administrateur ajoute les produits dans JENESIS Accounting & Business.",
          ],
          expected: "Le produit est ajouté à la vente avec son prix et le stock qu'il vous reste.",
          notes: [
            "La recherche porte sur le nom et sur le code : le code, plus court, est souvent plus rapide quand il y a du monde.",
            "Le stock restant s'affiche à côté du produit, vous pouvez donc répondre au client sans quitter la vente.",
          ]
        },
        seller_customers: {
          title: "Les clients",
          purpose: "Vendre à crédit à un client que vous connaissez, et voir ce qu'il doit.",
          where: "Clients dans la colonne de gauche.",
          steps: [
            "Ouvrez Clients pour voir chaque client et le solde de ce qu'il doit.",
            "Pour en ajouter un, appuyez sur Nouveau client et remplissez le nom et, si vous l'avez, le numéro de téléphone.",
            "Choisissez le client sur une vente lorsqu'il achète à crédit plutôt que de payer tout de suite.",
          ],
          expected: "Une vente à crédit augmente ce que ce client doit. Lorsqu'il vous paie plus tard, le solde baisse.",
          notes: [
            "Un client qui paie à chaque fois n'a pas besoin de compte : laissez la vente sur le client de passage.",
            "Vous pouvez voir ce qu'un client doit, mais seul un administrateur peut annuler une dette.",
          ]
        },
        seller_receipts: {
          title: "Les reçus et l'encaissement",
          purpose: "Prendre l'argent et donner au client un reçu conforme à ce qu'il a acheté.",
          where: "La partie paiement d'une vente, et Ventes → la liste des ventes.",
          steps: [
            "Choisissez comment le client paie : espèces, banque ou argent mobile.",
            "Tapez ce qu'il vous a donné ; la monnaie est calculée pour vous.",
            "Enregistrez la vente, puis imprimez le reçu.",
            "Pour rendre de l'argent, enregistrez un remboursement : c'est un paiement avec un montant négatif, et l'argent sort de la caisse, de la banque ou du compte d'argent mobile que vous choisissez.",
          ],
          expected: "L'argent est enregistré sur le compte choisi, et le solde du client baisse de ce qu'il a payé.",
          notes: [
            "Un remboursement s'écrit avec un montant négatif. Il retire l'argent du compte, et le reçu comme la comptabilité le présentent comme un remboursement.",
            "Vous ne pouvez pas rendre plus que ce que le client a payé sur cette vente.",
          ]
        },
        seller_printing: {
          title: "Imprimer un reçu",
          purpose: "Imprimer un reçu pour le client sur l'imprimante qui se trouve au comptoir, à la façon dont votre boutique en a besoin.",
          where: "Le bouton Imprimer le reçu sur une vente ou sur une facture enregistrée, et JENESIS Settings & Access Point → Impression pour le régler.",
          steps: [
            "Sur une vente, appuyez sur Imprimer le reçu. Le reçu part directement vers l'imprimante choisie.",
            "Pour changer son apparence, ouvrez JENESIS Settings & Access Point, allez dans Impression, et choisissez l'imprimante, le papier (58 mm, 80 mm, A4 ou une largeur personnalisée), la taille du texte et ce qui doit y figurer.",
            "Appuyez sur Afficher l'aperçu pour voir le reçu exactement tel qu'il sera imprimé, et sur Imprimer un reçu de test pour vérifier l'imprimante avant qu'un client n'attende.",
            "Appuyez sur Enregistrer ces paramètres quand cela vous convient.",
          ],
          expected: "Le reçu s'imprime sur le papier choisi, avec les informations choisies, et cela reste ainsi pour la prochaine fois.",
          notes: [
            "Les paramètres que vous enregistrez appartiennent à JENESIS Seller sur cet ordinateur. Les enregistrer ne change pas l'impression de JENESIS Accounting & Business.",
            "Les décimales s'impriment telles que vous les tapez — 1,25 reste 1,25 — et un article retourné s'affiche avec un signe moins et la mention « retourné ».",
            "Imprimer un reçu ne modifie pas la vente. L'imprimer deux fois donne deux morceaux de papier, pas deux ventes.",
          ]
        },
        seller_returns: {
          title: "Les retours et les remboursements",
          purpose: "Reprendre des marchandises et rendre de l'argent, pour que le stock et la caisse disent tous les deux la vérité.",
          where: "Une nouvelle vente, ou un avoir sur une facture enregistrée.",
          steps: [
            "Pour reprendre des marchandises à la caisse, enregistrez l'article avec une quantité négative — pour un demi-kilo rendu, tapez -0,5.",
            "Pour rembourser une facture entière, ouvrez la vente et créez un avoir. Indiquez si les marchandises reviennent en stock.",
            "Pour rendre de l'argent, enregistrez un paiement avec un montant négatif.",
          ],
          expected: "Les marchandises retournées rentrent en stock, et l'argent que vous rendez sort de la caisse, de la banque ou du compte d'argent mobile.",
          notes: [
            "L'avoir est la bonne façon de reprendre des marchandises sur une facture : il enregistre pourquoi, et il peut remettre le stock en même temps.",
            "Une ligne négative sur une vente est la correction rapide à la caisse. Les deux fonctionnent ; l'avoir est celui qui laisse une explication complète.",
            "Un reçu qui comporte un retour le dit, afin que le client voie que des marchandises sont revenues plutôt qu'une quantité négative vendue.",
          ]
        },
        seller_stock: {
          title: "Vérifier ce qu'il y a en stock",
          purpose: "Répondre à la question d'un client, ou vérifier avant de promettre quelque chose, sans quitter le comptoir.",
          where: "Stocks → Produits, et le chiffre de stock affiché à côté de chaque produit sur une vente.",
          steps: [
            "Ouvrez Stocks → Produits pour voir ce que vous avez de tout.",
            "Sur une vente, le stock restant s'affiche à côté du produit quand vous le choisissez.",
            "Utilisez la recherche pour trouver vite un produit.",
          ],
          expected: "Vous voyez combien vous avez d'un article avant de le vendre.",
          notes: [
            "Le chiffre du stock est ce qui reste après tout ce qui a déjà été vendu : c'est la vérité à cet instant.",
            "Les fractions sont conservées : si vous avez 2,5 kg, vous voyez 2,5 et non 2.",
            "Seul un administrateur peut modifier ce que vous avez ; un inventaire est la bonne façon de le corriger.",
          ]
        },
        seller_shortcuts: {
          title: "Les raccourcis clavier",
          purpose: "Travailler plus vite au comptoir sans chercher la souris.",
          where: "N'importe où dans JENESIS Seller. Appuyez sur F1 pour la liste complète.",
          steps: [
            "F1 — ouvrir ce guide.",
            "F2 — commencer une nouvelle vente.",
            "Ctrl+Maj+K — la calculatrice.",
            "Ctrl+Maj+C — les clients.",
            "Alt+T — changer l'apparence claire ou sombre.",
            "Alt+L — changer la langue.",
          ],
          expected: "L'écran demandé s'ouvre immédiatement.",
          notes: [
            "Les raccourcis ne se déclenchent pas pendant que vous tapez : écrire un nom de produit n'en déclenche aucun par accident.",
            "Un raccourci ne fonctionne que si vous avez le droit de faire ce qu'il fait.",
          ]
        },
        seller_troubleshooting: {
          title: "Quand quelque chose ne va pas",
          purpose: "Régler les quelques problèmes qui arrivent à un comptoir, ou savoir qui appeler.",
          where: "N'importe où dans JENESIS Seller.",
          steps: [
            "« Je ne peux pas vendre cet article » — vous n'en avez plus, ou vous en avez moins que ce que vous essayez de vendre. Vérifiez le stock.",
            "« L'imprimante n'a rien fait » — vérifiez qu'elle est allumée, qu'elle a du papier et qu'elle n'affiche pas d'erreur. Imprimez un reçu de test depuis Paramètres → Impression pour vérifier.",
            "« Le reçu est coupé » — le format de papier ne correspond peut-être pas à votre imprimante. Ouvrez Paramètres → Impression et choisissez 58 mm ou 80 mm selon le rouleau.",
            "« Je me suis trompé de montant » — ne modifiez pas la vente enregistrée. Faites un retour ou un remboursement pour que la comptabilité garde un historique fidèle.",
            "« Je suis bloqué » — attendez quelques minutes et réessayez, ou demandez à un administrateur de réinitialiser votre mot de passe.",
          ],
          expected: "Vous savez ce que le message signifie et quoi faire ensuite.",
          notes: [
            "Rien de ce que vous faites au comptoir ne peut perdre la comptabilité : une correction est toujours enregistrée comme une correction, jamais effacée.",
            "Si le programme ne démarre pas du tout, ou si un écran est blanc, c'est le travail de JENESIS Network & Maintenance.",
          ]
        },
        credits: {
          title: "Qui a fait JENESIS",
          purpose: "Savoir qui contacter au sujet du programme.",
          where: "Cette section figure à la fin de chaque guide JENESIS.",
          steps: [
            "JENESIS est créé et développé par KAYIGANWA JACQUES.",
          ],
          expected: "Vous savez à qui appartient le programme et qui le développe.",
          notes: [
            "Ce guide documente le programme tel qu'il est. Il ne décrit que des fonctions qui existent dans JENESIS.",
          ]
        },
      }
    },
    rw: {
      guideTitle: "Uburyo bwo gukoresha JENESIS Seller",
      guideIntro: "Ubufasha bugufi bwo kugurisha ku meza yo kwishyuriraho: kwandika igurisha, gushaka igicuruzwa, kwakira amafaranga, gucapa inyemezabwishyu, no kwakira ibicuruzwa igihe umukiriya abisubije.",
      closingNote: "Buri gurisha wanditse riringanizwa mu ibaruramari. Ubu bufasha bukubiyemo imashini yo kwishyuriraho; ibyerekeye ibitabo ni ibya JENESIS Accounting & Business.",
      sections: {
        seller_interface: {
          title: "Ipaji y'umucuruzi",
          purpose: "Kugurisha ku meza yo kwishyuriraho. Icyo ukeneye cyose mu kugurisha kiri kuri iyi paji, nta kindi kiguhagarara imbere.",
          where: "JENESIS Seller (porogaramu itukura). Ifungura ipaji yo kugurisha.",
          steps: [
            "Reba inkingi ibumoso: yerekana aho ushobora kujya — Imbonerahamwe, Igurisha, Abakiriya, Ububiko, Ubufasha.",
            "Umurongo wo hejuru werekana sosiyete ukoreramo, itariki y'uyu munsi, imashini ibara, Messenger, ururimi n'izina ryawe.",
            "Hagati ya paji niho igurisha ryubakwa: umukiriya, hanyuma ibicuruzwa.",
          ],
          expected: "Ubona imibare y'uyu munsi kandi ushobora gutangira kugurisha utafunguye indi paji.",
          notes: [
            "Ibara rya porogaramu ni umutuku. Niba umurongo uri ubururu, uri muri JENESIS Accounting & Business, ifite ibitabo by'ibaruramari atari imashini yo kwishyuriraho.",
            "Izina ryawe riri hejuru iburyo. Igurisha ryose wanditse rijyanishwa n'iryo zina.",
          ]
        },
        seller_sales: {
          title: "Kwandika igurisha",
          purpose: "Kwandika ibyo umukiriya aguze. Igurisha, ububiko n'ibaruramari bivugururwa icyarimwe, bityo ntiwandika ikintu kimwe kabiri.",
          where: "Igurisha → Igurisha rishya (cyangwa kanda F2).",
          steps: [
            "Hitamo umukiriya, cyangwa usige ari umukiriya w'inzira niba atafite konti.",
            "Ongeraho buri kintu: hitamo igicuruzwa, hanyuma ingano. Ingano zishobora kuba ibice — nusu kilo yandikwa 0.5.",
            "Reba igiciro n'igiteranyo hasi.",
            "Hitamo uko umukiriya yishyura: amafaranga mu ntoki, banki, cyangwa Mobile Money.",
            "Kanda Bika (cyangwa andike ubwishyu) kugira ngo urangize.",
          ],
          expected: "Igurisha rirabitswe, ububiko bwa buri kintu buragabanuka n'ingano nyayo yaguzwe, kandi inyandiko y'ibaruramari ikorwa. Kugurisha 1.25 kg bikura 1.25 kg mu bubiko — atari kilo imwe, kandi atari ebyiri.",
          notes: [
            "Ntushobora kugurisha ibirenze ibyo ufite. Niba porogaramu yanga igurisha, banza urebe ingano y'ububiko bw'icyo kintu.",
            "Igurisha ryandikwa ako kanya uribikishije. Kugira ngo ukosore igurisha ryabitswe, andika isubizwa aho kurihindura.",
          ]
        },
        seller_search: {
          title: "Gushaka igicuruzwa",
          purpose: "Kubona vuba icyo umukiriya asaba, ukoresheje izina cyangwa kode iriho.",
          where: "Agasanduku k'igicuruzwa ku igurisha, cyangwa Ububiko → Ibicuruzwa.",
          steps: [
            "Andika igice cy'izina, cyangwa kode yose, mu gasanduku k'igicuruzwa.",
            "Urutonde ruragabanuka uko wandika; hitamo icyo ushaka.",
            "Niba nta kintu kigaragara, igicuruzwa gishobora kuba kitarakorwa — umuyobozi yongeramo ibicuruzwa muri JENESIS Accounting & Business.",
          ],
          expected: "Igicuruzwa cyongerwa ku igurisha hamwe n'igiciro cyacyo n'ububiko busigaye.",
          notes: [
            "Gushaka bireba izina na kode, bityo kode ngufi akenshi irihuta iyo hari abantu benshi.",
            "Ububiko busigaye bwerekanwa iruhande rw'igicuruzwa, ushobora gusubiza umukiriya udasohotse ku igurisha.",
          ]
        },
        seller_customers: {
          title: "Abakiriya",
          purpose: "Kugurisha ku ideni ku mukiriya uzi, no kureba ibyo arimo.",
          where: "Abakiriya mu nkingi ibumoso.",
          steps: [
            "Fungura Abakiriya kugira ngo urebe buri mukiriya n'ibyo arimo.",
            "Kugira ngo wongereho umwe, kanda Umukiriya mushya maze wuzuze izina na nimero ya telefoni niba uyifite.",
            "Hitamo umukiriya ku igurisha iyo aguze ku ideni aho kwishyura ako kanya.",
          ],
          expected: "Kugurisha ku ideni byongera ibyo uwo mukiriya arimo. Iyo yishyuye nyuma, ibyo arimo biragabanuka.",
          notes: [
            "Umukiriya wishyura buri gihe ntabwo akeneye konti: siga igurisha ku mukiriya w'inzira.",
            "Ushobora kureba ibyo umukiriya arimo, ari umuyobozi gusa ushobora guhanagura ideni.",
          ]
        },
        seller_receipts: {
          title: "Inyemezabwishyu no kwakira amafaranga",
          purpose: "Kwakira amafaranga no guha umukiriya inyemezabwishyu ihuye n'ibyo yaguze.",
          where: "Igice cy'ubwishyu ku igurisha, na Igurisha → urutonde rw'igurisha.",
          steps: [
            "Hitamo uko umukiriya yishyura: amafaranga mu ntoki, banki, cyangwa Mobile Money.",
            "Andika ibyo yaguhaye; ibyo usubiza abarirwa.",
            "Bika igurisha, hanyuma capa inyemezabwishyu.",
            "Kugira ngo usubize amafaranga, andika isubizwa: ni ubwishyu bufite ingano ifite akamenyetso k'ubusa, kandi amafaranga ava mu isanduku, muri banki cyangwa kuri konti ya Mobile Money wahisemo.",
          ],
          expected: "Amafaranga yandikwa kuri konti wahisemo, kandi ibyo umukiriya arimo biragabanuka n'ibyo yishyuye.",
          notes: [
            "Isubizwa ryandikwa rifite ingano ifite akamenyetso k'ubusa. Rikura amafaranga kuri konti, kandi inyemezabwishyu n'ibaruramari byerekana ko ari isubizwa.",
            "Ntushobora gusubiza ibirenze ibyo umukiriya yishyuye kuri iryo gurisha.",
          ]
        },
        seller_printing: {
          title: "Gucapa inyemezabwishyu",
          purpose: "Gucapira umukiriya inyemezabwishyu ku icapa iri ku meza yo kwishyuriraho, mu buryo iduka ryawe rikeneye.",
          where: "Buto Capa inyemezabwishyu ku igurisha cyangwa ku nyemezabuguzi yabitswe, na JENESIS Settings & Access Point → Gucapa kugira ngo uyishyireho.",
          steps: [
            "Ku igurisha, kanda Capa inyemezabwishyu. Inyemezabwishyu ijya ku icapa wahisemo.",
            "Kugira ngo uhindure uko isa, fungura JENESIS Settings & Access Point, jya mu Gucapa, hanyuma uhitemo icapa, impapuro (58 mm, 80 mm, A4 cyangwa ubugari wihitiyemo), ingano y'inyandiko n'ibizagaragaraho.",
            "Kanda Erekana igerageza kugira ngo urebe inyemezabwishyu nk'uko izacapwa, na Capa inyemezabwishyu yo kugerageza kugira ngo urebe icapa mbere y'uko umukiriya ategereza.",
            "Kanda Bika iyi miterere iyo bikunejeje.",
          ],
          expected: "Inyemezabwishyu icapa ku rupapuro wahisemo, ifite ibisobanuro wahisemo, kandi bikomeza bityo ubutaha.",
          notes: [
            "Imiterere ubitse ni iya JENESIS Seller kuri iyi mudasobwa. Kubika ntibihindura icapa rya JENESIS Accounting & Business.",
            "Imibare y'ibice icapa nk'uko uyanditse — 1.25 iguma 1.25 — kandi igicuruzwa cyasubijwe cyerekana akamenyetso k'ubusa n'ijambo « byasubijwe ».",
            "Gucapa inyemezabwishyu ntibihindura igurisha. Kuyicapa kabiri bita impapuro ebyiri, atari igurisha kabiri.",
          ]
        },
        seller_returns: {
          title: "Ibyasubijwe n'amasubizwa",
          purpose: "Gusubiza ibicuruzwa no gusubiza amafaranga, kugira ngo ububiko n'isanduku byombi bivuge ukuri.",
          where: "Igurisha rishya, cyangwa inyemezabwishyu yo gusubiza ku nyemezabuguzi yabitswe.",
          steps: [
            "Kugira ngo wakire ibicuruzwa ku meza yo kwishyuriraho, andika igicuruzwa gifite ingano ifite akamenyetso k'ubusa — kuri nusu kilo yasubijwe, andika -0.5.",
            "Kugira ngo usubize inyemezabuguzi yose, fungura igurisha maze ukore inyemezabwishyu yo gusubiza. Vuga niba ibicuruzwa bisubira mu bubiko.",
            "Kugira ngo usubize amafaranga, andika ubwishyu bufite ingano ifite akamenyetso k'ubusa.",
          ],
          expected: "Ibicuruzwa byasubijwe bisubira mu bubiko, kandi amafaranga usubiza ava mu isanduku, muri banki cyangwa kuri konti ya Mobile Money.",
          notes: [
            "Inyemezabwishyu yo gusubiza ni bwo buryo bwiza bwo kwakira ibicuruzwa ku nyemezabuguzi: yandika impamvu, kandi ishobora gusubiza ububiko icyarimwe.",
            "Umurongo ufite akamenyetso k'ubusa ku igurisha ni ikosora ryihuse ku meza yo kwishyuriraho. Byombi birakora; inyemezabwishyu yo gusubiza ni yo isiga ibisobanuro byuzuye.",
            "Inyemezabwishyu irimo ibyasubijwe irabyerekana, kugira ngo umukiriya abone ko ibicuruzwa byasubijwe aho kuba ingano ifite akamenyetso k'ubusa yaguzwe.",
          ]
        },
        seller_stock: {
          title: "Kureba ibiri mu bubiko",
          purpose: "Gusubiza ikibazo cy'umukiriya, cyangwa kureba mbere yo kumusezeranya, udasohotse ku meza yo kwishyuriraho.",
          where: "Ububiko → Ibicuruzwa, n'umubare w'ububiko werekanwa iruhande rwa buri gicuruzwa ku igurisha.",
          steps: [
            "Fungura Ububiko → Ibicuruzwa kugira ngo urebe ibyo ufite kuri buri kintu.",
            "Ku igurisha, ububiko busigaye bwerekanwa iruhande rw'igicuruzwa igihe ugihisemo.",
            "Koresha agasanduku ko gushaka kugira ngo ubone igicuruzwa kimwe vuba.",
          ],
          expected: "Ubona ingano ufite y'ikintu mbere yo kukigurisha.",
          notes: [
            "Umubare w'ububiko ni ibyasigaye nyuma y'ibyaguzwe byose: ni ukuri muri uyu mwanya.",
            "Ibice birakomeza: niba ufite 2.5 kg, ureba 2.5 atari 2.",
            "Umuyobozi gusa ashobora guhindura ibyo ufite; kubara ububiko ni bwo buryo bwiza bwo kubikosora.",
          ]
        },
        seller_shortcuts: {
          title: "Inzira ngufi za clavier",
          purpose: "Gukora vuba ku meza yo kwishyuriraho udashaka imbeba.",
          where: "Ahantu hose muri JENESIS Seller. Kanda F1 kugira ngo ubone urutonde rwose.",
          steps: [
            "F1 — fungura ubu bufasha.",
            "F2 — tangira igurisha rishya.",
            "Ctrl+Maj+K — imashini ibara.",
            "Ctrl+Maj+C — abakiriya.",
            "Alt+T — hindura imiterere y'umucyo cyangwa umwijima.",
            "Alt+L — hindura ururimi.",
          ],
          expected: "Ipaji wasabye irakinguka ako kanya.",
          notes: [
            "Inzira ngufi ntizikora igihe urimo wandika: kwandika izina ry'igicuruzwa ntibizatera iyo ari yo yose ku bw'impanuka.",
            "Inzira ngufi ikora gusa niba ufite uburenganzira bwo gukora icyo ikora.",
          ]
        },
        seller_troubleshooting: {
          title: "Iyo ikintu kitagenze neza",
          purpose: "Gukemura ibibazo bike bibaho ku meza yo kwishyuriraho, cyangwa kumenya uwo bahamagara.",
          where: "Ahantu hose muri JENESIS Seller.",
          steps: [
            "« Sinshobora kugurisha iki kintu » — nta cyo ugifite, cyangwa ufite gito ugerageza kugurisha. Reba ingano y'ububiko.",
            "« Icapa nta cyo ryakoze » — reba ko ryakongerewe, rifite impapuro kandi ridafite ikibazo. Capa inyemezabwishyu yo kugerageza uvuye mu Imiterere → Gucapa kugira ngo urebe.",
            "« Inyemezabwishyu iraciwe » — ingano y'urupapuro ishobora kuba itari yo ku icapa ryawe. Fungura Imiterere → Gucapa uhitemo 58 mm cyangwa 80 mm bihuye n'umuzingo.",
            "« Nanditse umubare utari wo » — ntuhindure igurisha ryabitswe. Andika isubizwa cyangwa isubizwa ry'amafaranga kugira ngo ibaruramari rigume rifite amateka nyayo.",
            "« Nafunzwe » — tegereza iminota mike wongere ugerageze, cyangwa usabe umuyobozi kuguhindurira ijambo ry'ibanga.",
          ],
          expected: "Uzi icyo ubutumwa busobanura n'icyo gukora nyuma.",
          notes: [
            "Nta cyo ukora ku meza yo kwishyuriraho gishobora gutakaza ibaruramari: ikosora ryandikwa nk'ikosora, ntirihanagurwa na rimwe.",
            "Niba porogaramu itangira na gato, cyangwa ipaji iri ubusa, ako ni akazi ka JENESIS Network & Maintenance.",
          ]
        },
        credits: {
          title: "Uwakoze JENESIS",
          purpose: "Kumenya uwo wabaza kuri porogaramu.",
          where: "Iki gice kiri ku musozo wa buri gafasha ka JENESIS.",
          steps: [
            "JENESIS yakozwe kandi itezwa imbere na KAYIGANWA JACQUES.",
          ],
          expected: "Uzi uwo porogaramu ari we n'uyiteza imbere.",
          notes: [
            "Ubu bufasha busobanura porogaramu uko iri. Busobanura gusa ibikorwa bihari muri JENESIS.",
          ]
        },
      }
    },
  },
  admin: {
    en: {
      guideTitle: "How to use JENESIS Accounting & Business",
      guideIntro: "A short guide to keeping the books: making entries, recording purchases, running the reports, and deciding what each person is allowed to do.",
      closingNote: "Every entry you post is balanced before it is accepted, so the reports always agree with the books.",
      sections: {
        admin_dashboard: {
          title: "The dashboard",
          purpose: "See the state of the business at a glance before going into the detail.",
          where: "Dashboard in the left column of JENESIS Accounting & Business (the blue application).",
          steps: [
            "Open the Dashboard to see sales, purchases, what customers owe, what you owe suppliers, and the profit so far.",
            "Use the date range at the top to look at a different period.",
            "Open any figure to go to the records behind it.",
          ],
          expected: "You can see how the business is doing and jump straight into anything that looks wrong.",
          notes: [
            "Every figure is calculated from the accounting entries, so it agrees with the reports to the penny.",
            "The dashboard shows the company you are working in. Change company at the top left if you look after more than one.",
          ]
        },
        admin_accounting: {
          title: "Accounting operations",
          purpose: "Make entries in the books: journals, adjustments and the corrections that keep them straight.",
          where: "Accounting in the left column.",
          steps: [
            "Open the chart of accounts to see every account and its balance.",
            "To make an entry by hand, open a new journal entry: choose the accounts, then the debits and the credits.",
            "Check that the debits and the credits are equal before you post — the program will refuse an entry that does not balance.",
            "To reduce a side rather than increase it, write the amount as a negative; it is recorded on the opposite side, which is what a correction is.",
          ],
          expected: "The entry is posted and both the trial balance and the reports pick it up immediately.",
          notes: [
            "An entry that does not balance cannot be posted. That rule is what keeps the books correct.",
            "Amounts can be decimals, and a correction is a negative on the side being reduced.",
            "Entries made by a sale, a purchase or a payment also appear here; they are not separate books.",
          ]
        },
        admin_purchases: {
          title: "Purchases and supplier bills",
          purpose: "Record what you buy and what you owe, and keep the stock and the accounts in step.",
          where: "Purchases in the left column.",
          steps: [
            "Record a bill from a supplier: the supplier, the date, then what you bought and at what price.",
            "If the goods have arrived, receive them so the stock goes up.",
            "Record the payment when you pay the supplier; what you owe them falls.",
            "To send goods back, raise a purchase return against the bill.",
          ],
          expected: "The purchase, the stock and what you owe are all up to date, and the expense is in the accounts.",
          notes: [
            "Quantities can be decimals, so buying 2.5 kg is recorded as 2.5.",
            "To correct a bill you have already recorded, raise a return or a credit note rather than changing the original.",
            "A received quantity cannot be negative; use a purchase return, which records why.",
          ]
        },
        admin_parties: {
          title: "Customers and suppliers",
          purpose: "Keep the people you trade with, and know exactly who owes what.",
          where: "Customers and Suppliers in the left column.",
          steps: [
            "Open Customers to see each customer and what they owe; open Suppliers for what you owe.",
            "Add or edit a record with the name, the contact details and, where you have it, the tax number.",
            "Print a statement for one of them to show what is outstanding.",
          ],
          expected: "The balances agree with the accounts, because both come from the same entries.",
          notes: [
            "A balance rises when you sell or buy on account, and falls when payment is recorded.",
            "Deleting a customer who has history is not allowed; the record is closed instead so the accounts stay whole.",
          ]
        },
        admin_taxes: {
          title: "Taxes and VAT",
          purpose: "Charge the right tax, and report it correctly.",
          where: "Settings → Taxes, and the tax column on any sale or purchase.",
          steps: [
            "Set up each tax rate once: the name and the percentage.",
            "The rate is applied to a line when you record a sale or a purchase.",
            "Prices can include tax or exclude it; the company setting decides, and it is set in Settings → Company.",
            "Run the VAT report to see what you have collected and what you have paid.",
          ],
          expected: "Tax is charged on each line at the rate you set, and the VAT report agrees with the accounts.",
          notes: [
            "A tax rate that is no longer used is switched off rather than deleted, so old documents stay correct.",
            "The rate is stored on each line at the time of the sale, so changing a rate later does not rewrite history.",
          ]
        },
        admin_reports: {
          title: "Financial reports",
          purpose: "Produce the figures the business and the tax office need.",
          where: "Reports in the left column.",
          steps: [
            "Choose the report: General Ledger, Journal Entries, Trial Balance, Profit and Loss, Balance Sheet, Cash Flow, Aged Receivables, Aged Payables, VAT, or Inventory Valuation.",
            "Set the date range you want.",
            "Read it on screen, print it, or export it.",
          ],
          expected: "The report agrees with the accounts, because it is produced from the same entries.",
          notes: [
            "Every report handles negative and decimal amounts, so a refund or a fractional quantity shows as it was recorded.",
            "The Trial Balance and the Balance Sheet must balance. If one does not, there is an entry to find, not a report to doubt.",
          ]
        },
        admin_records: {
          title: "Accounting records",
          purpose: "Find any entry again, and see who made it and when.",
          where: "Accounting → the list of entries, and Settings → Audit log.",
          steps: [
            "Search the list of entries by date, by account, or by the reference on the document.",
            "Open an entry to see both sides of it and the document that produced it.",
            "The audit log shows who did what and when.",
          ],
          expected: "Any figure in any report can be traced back to the entry that produced it.",
          notes: [
            "Entries are never erased. A mistake is corrected with a reversing entry, so the history stays complete.",
            "Each entry records the user who posted it.",
          ]
        },
        admin_permissions: {
          title: "Users, roles and permissions",
          purpose: "Let each person do their job and nothing more, and know who did what.",
          where: "Settings → Users. Only an administrator can open it.",
          steps: [
            "Add a user with a name and a starting password; they change it when they first sign in.",
            "Give them a role — Administrator, Accountant, Sales, Purchases, or Inventory — which decides what they can see and do.",
            "Switch a user off when they leave rather than deleting them.",
          ],
          expected: "Each person sees the screens their work needs, and every action is recorded against their name.",
          notes: [
            "Permissions are enforced by the program as well as by the menus, so hiding a button is not the only protection.",
            "Give the smallest role that lets someone do their job.",
          ]
        },
        admin_functions: {
          title: "Administrator functions",
          purpose: "The jobs only an administrator does: setting the company up, and keeping the data safe.",
          where: "JENESIS Settings & Access Point, and Settings in JENESIS Accounting & Business.",
          steps: [
            "Set the company up: the name, the address, the tax number and the currency.",
            "Make a backup before anything risky, and keep the backup file somewhere other than this computer.",
            "Restore from a backup only when you mean to, and understand that it replaces the data.",
            "Add the users and decide what each of them may do.",
          ],
          expected: "The company is set up correctly and there is always a copy of the data to fall back on.",
          notes: [
            "A backup is only a backup if you have checked it restores. Test it before you need it.",
            "Changing a user's access ends their current session, so warn them first.",
          ]
        },
        admin_shortcuts: {
          title: "Keyboard shortcuts",
          purpose: "Move around the books without reaching for the mouse.",
          where: "Anywhere in JENESIS Accounting & Business. Press F1 for the full list.",
          steps: [
            "F1 — open this guide.",
            "Ctrl+Shift+L — the general ledger.",
            "Ctrl+Shift+T — transfers.",
            "Ctrl+Shift+K — the calculator.",
            "Ctrl+Shift+M — the Messenger.",
            "Alt+T — change the light or dark appearance.",
            "Alt+L — change the language.",
          ],
          expected: "The screen you asked for opens straight away.",
          notes: [
            "Shortcuts stay out of the way while you are typing.",
            "A shortcut only works if your role allows what it does.",
          ]
        },
        credits: {
          title: "Who made JENESIS",
          purpose: "Know who to contact about the program.",
          where: "This section appears at the end of every JENESIS guide.",
          steps: [
            "JENESIS is created and developed by KAYIGANWA JACQUES.",
          ],
          expected: "You know who the program belongs to and who develops it.",
          notes: [
            "This guide documents the program as it is. It describes only features that exist in JENESIS.",
          ]
        },
      }
    },
    fr: {
      guideTitle: "Comment utiliser JENESIS Accounting & Business",
      guideIntro: "Un guide court pour tenir les comptes : passer des écritures, enregistrer des achats, produire les rapports, et décider ce que chacun a le droit de faire.",
      closingNote: "Chaque écriture que vous validez est équilibrée avant d'être acceptée, afin que les rapports correspondent toujours aux livres.",
      sections: {
        admin_dashboard: {
          title: "Le tableau de bord",
          purpose: "Voir l'état de l'entreprise d'un coup d'œil avant d'entrer dans le détail.",
          where: "Tableau de bord dans la colonne de gauche de JENESIS Accounting & Business (l'application bleue).",
          steps: [
            "Ouvrez le tableau de bord pour voir les ventes, les achats, ce que les clients doivent, ce que vous devez aux fournisseurs et le bénéfice à ce jour.",
            "Utilisez la période en haut pour regarder un autre intervalle.",
            "Ouvrez un chiffre pour aller aux écritures qui le composent.",
          ],
          expected: "Vous voyez comment va l'entreprise et pouvez aller droit sur ce qui semble faux.",
          notes: [
            "Chaque chiffre est calculé à partir des écritures comptables : il correspond donc aux rapports au centime près.",
            "Le tableau de bord montre l'entreprise dans laquelle vous travaillez. Changez d'entreprise en haut à gauche si vous en gérez plusieurs.",
          ]
        },
        admin_accounting: {
          title: "Les opérations comptables",
          purpose: "Passer des écritures : journaux, ajustements et corrections qui tiennent les comptes droits.",
          where: "Comptabilité dans la colonne de gauche.",
          steps: [
            "Ouvrez le plan comptable pour voir chaque compte et son solde.",
            "Pour passer une écriture à la main, ouvrez une nouvelle écriture de journal : choisissez les comptes, puis les débits et les crédits.",
            "Vérifiez que les débits et les crédits sont égaux avant de valider — le programme refuse une écriture qui n'est pas équilibrée.",
            "Pour réduire un côté plutôt que l'augmenter, écrivez le montant en négatif : il est enregistré du côté opposé, c'est cela une correction.",
          ],
          expected: "L'écriture est validée, et la balance comme les rapports la reprennent immédiatement.",
          notes: [
            "Une écriture qui n'est pas équilibrée ne peut pas être validée. C'est cette règle qui garde les comptes justes.",
            "Les montants peuvent être décimaux, et une correction est un négatif du côté à réduire.",
            "Les écritures issues d'une vente, d'un achat ou d'un paiement apparaissent aussi ici ; ce ne sont pas des livres séparés.",
          ]
        },
        admin_purchases: {
          title: "Les achats et les factures fournisseurs",
          purpose: "Enregistrer ce que vous achetez et ce que vous devez, et garder le stock et la comptabilité au même rythme.",
          where: "Achats dans la colonne de gauche.",
          steps: [
            "Enregistrez une facture d'un fournisseur : le fournisseur, la date, puis ce que vous avez acheté et à quel prix.",
            "Si les marchandises sont arrivées, réceptionnez-les pour que le stock monte.",
            "Enregistrez le paiement quand vous payez le fournisseur ; ce que vous lui devez baisse.",
            "Pour renvoyer des marchandises, créez un retour d'achat sur la facture.",
          ],
          expected: "L'achat, le stock et ce que vous devez sont à jour, et la charge est dans la comptabilité.",
          notes: [
            "Les quantités peuvent être décimales : acheter 2,5 kg s'enregistre 2,5.",
            "Pour corriger une facture déjà enregistrée, créez un retour ou un avoir plutôt que de modifier l'original.",
            "Une quantité réceptionnée ne peut pas être négative ; utilisez un retour d'achat, qui enregistre pourquoi.",
          ]
        },
        admin_parties: {
          title: "Les clients et les fournisseurs",
          purpose: "Tenir à jour les personnes avec qui vous travaillez, et savoir exactement qui doit quoi.",
          where: "Clients et Fournisseurs dans la colonne de gauche.",
          steps: [
            "Ouvrez Clients pour voir chaque client et ce qu'il doit ; ouvrez Fournisseurs pour ce que vous devez.",
            "Ajoutez ou modifiez une fiche avec le nom, les coordonnées et, si vous l'avez, le numéro fiscal.",
            "Imprimez un relevé pour montrer ce qui reste dû.",
          ],
          expected: "Les soldes correspondent à la comptabilité, car les deux viennent des mêmes écritures.",
          notes: [
            "Un solde augmente quand vous vendez ou achetez à crédit, et baisse quand le paiement est enregistré.",
            "Supprimer un client qui a un historique n'est pas autorisé ; la fiche est clôturée à la place, pour que les comptes restent complets.",
          ]
        },
        admin_taxes: {
          title: "Les taxes et la TVA",
          purpose: "Facturer la bonne taxe et la déclarer correctement.",
          where: "Paramètres → Taxes, et la colonne taxe sur toute vente ou tout achat.",
          steps: [
            "Créez chaque taux de taxe une fois : le nom et le pourcentage.",
            "Le taux s'applique à une ligne quand vous enregistrez une vente ou un achat.",
            "Les prix peuvent inclure la taxe ou non ; le réglage de l'entreprise en décide, il se fait dans Paramètres → Entreprise.",
            "Lancez le rapport de TVA pour voir ce que vous avez collecté et ce que vous avez payé.",
          ],
          expected: "La taxe est facturée sur chaque ligne au taux défini, et le rapport de TVA correspond à la comptabilité.",
          notes: [
            "Un taux qui n'est plus utilisé est désactivé plutôt que supprimé, pour que les anciens documents restent justes.",
            "Le taux est enregistré sur chaque ligne au moment de la vente : changer un taux plus tard ne réécrit pas l'historique.",
          ]
        },
        admin_reports: {
          title: "Les rapports financiers",
          purpose: "Produire les chiffres dont l'entreprise et l'administration fiscale ont besoin.",
          where: "Rapports dans la colonne de gauche.",
          steps: [
            "Choisissez le rapport : Grand Livre, Journal, Balance, Compte de résultat, Bilan, Flux de trésorerie, Balance âgée clients, Balance âgée fournisseurs, TVA, ou Valorisation du stock.",
            "Définissez la période voulue.",
            "Lisez-le à l'écran, imprimez-le ou exportez-le.",
          ],
          expected: "Le rapport correspond à la comptabilité, car il est produit à partir des mêmes écritures.",
          notes: [
            "Chaque rapport traite les montants négatifs et décimaux : un remboursement ou une quantité fractionnaire s'affiche tel qu'il a été enregistré.",
            "La Balance et le Bilan doivent être équilibrés. Si ce n'est pas le cas, c'est une écriture à trouver, pas un rapport à mettre en doute.",
          ]
        },
        admin_records: {
          title: "Les écritures comptables",
          purpose: "Retrouver n'importe quelle écriture, et voir qui l'a faite et quand.",
          where: "Comptabilité → la liste des écritures, et Paramètres → Journal d'audit.",
          steps: [
            "Cherchez dans la liste des écritures par date, par compte, ou par la référence du document.",
            "Ouvrez une écriture pour voir ses deux côtés et le document qui l'a produite.",
            "Le journal d'audit montre qui a fait quoi et quand.",
          ],
          expected: "Tout chiffre de tout rapport peut être retracé jusqu'à l'écriture qui l'a produit.",
          notes: [
            "Les écritures ne sont jamais effacées. Une erreur se corrige par une écriture inverse, l'historique reste donc complet.",
            "Chaque écriture porte le nom de l'utilisateur qui l'a validée.",
          ]
        },
        admin_permissions: {
          title: "Les utilisateurs, les rôles et les droits",
          purpose: "Permettre à chacun de faire son travail et rien de plus, et savoir qui a fait quoi.",
          where: "Paramètres → Utilisateurs. Seul un administrateur peut l'ouvrir.",
          steps: [
            "Ajoutez un utilisateur avec un nom et un mot de passe provisoire ; il le change à sa première connexion.",
            "Donnez-lui un rôle — Administrateur, Comptable, Ventes, Achats ou Stocks — qui décide ce qu'il voit et ce qu'il peut faire.",
            "Désactivez un utilisateur qui part plutôt que de le supprimer.",
          ],
          expected: "Chacun voit les écrans dont son travail a besoin, et chaque action est enregistrée sous son nom.",
          notes: [
            "Les droits sont appliqués par le programme et pas seulement par les menus : masquer un bouton n'est pas la seule protection.",
            "Donnez le plus petit rôle qui permette à quelqu'un de faire son travail.",
          ]
        },
        admin_functions: {
          title: "Les fonctions d'administrateur",
          purpose: "Les tâches que seul un administrateur fait : configurer l'entreprise et garder les données en sécurité.",
          where: "JENESIS Settings & Access Point, et Paramètres dans JENESIS Accounting & Business.",
          steps: [
            "Configurez l'entreprise : le nom, l'adresse, le numéro fiscal et la devise.",
            "Faites une sauvegarde avant toute opération risquée, et conservez le fichier ailleurs que sur cet ordinateur.",
            "Restaurez une sauvegarde seulement quand vous le voulez vraiment, en sachant qu'elle remplace les données.",
            "Ajoutez les utilisateurs et décidez de ce que chacun peut faire.",
          ],
          expected: "L'entreprise est bien configurée et il existe toujours une copie des données.",
          notes: [
            "Une sauvegarde n'est une sauvegarde que si vous avez vérifié qu'elle se restaure. Testez-la avant d'en avoir besoin.",
            "Modifier les droits d'un utilisateur met fin à sa session en cours : prévenez-le d'abord.",
          ]
        },
        admin_shortcuts: {
          title: "Les raccourcis clavier",
          purpose: "Se déplacer dans la comptabilité sans chercher la souris.",
          where: "N'importe où dans JENESIS Accounting & Business. Appuyez sur F1 pour la liste complète.",
          steps: [
            "F1 — ouvrir ce guide.",
            "Ctrl+Maj+L — le grand livre.",
            "Ctrl+Maj+T — les transferts.",
            "Ctrl+Maj+K — la calculatrice.",
            "Ctrl+Maj+M — le Messenger.",
            "Alt+T — changer l'apparence claire ou sombre.",
            "Alt+L — changer la langue.",
          ],
          expected: "L'écran demandé s'ouvre immédiatement.",
          notes: [
            "Les raccourcis ne se déclenchent pas pendant que vous tapez.",
            "Un raccourci ne fonctionne que si votre rôle permet ce qu'il fait.",
          ]
        },
        credits: {
          title: "Qui a fait JENESIS",
          purpose: "Savoir qui contacter au sujet du programme.",
          where: "Cette section figure à la fin de chaque guide JENESIS.",
          steps: [
            "JENESIS est créé et développé par KAYIGANWA JACQUES.",
          ],
          expected: "Vous savez à qui appartient le programme et qui le développe.",
          notes: [
            "Ce guide documente le programme tel qu'il est. Il ne décrit que des fonctions qui existent dans JENESIS.",
          ]
        },
      }
    },
    rw: {
      guideTitle: "Uburyo bwo gukoresha JENESIS Accounting & Business",
      guideIntro: "Ubufasha bugufi bwo gucunga ibitabo: kwandika inyandiko, kwandika kugura, gukora raporo, no kwemeza ibyo buri muntu yemerewe gukora.",
      closingNote: "Buri nyandiko wemeje iringanizwa mbere yo kwemerwa, kugira ngo raporo zihorana n'ibitabo.",
      sections: {
        admin_dashboard: {
          title: "Imbonerahamwe",
          purpose: "Kureba uko ubucuruzi bumeze mu kanya gato mbere yo kwinjira mu bisobanuro.",
          where: "Imbonerahamwe mu nkingi ibumoso ya JENESIS Accounting & Business (porogaramu y'ubururu).",
          steps: [
            "Fungura Imbonerahamwe kugira ngo urebe igurisha, kugura, ibyo abakiriya barimo, ibyo urimo abatanga ibicuruzwa, n'inyungu kugeza ubu.",
            "Koresha igihe cyo hejuru kugira ngo urebe ikindi gihe.",
            "Fungura umubare uwo ari wo wose kugira ngo ujye ku nyandiko ziwugize.",
          ],
          expected: "Ubona uko ubucuruzi bumeze kandi ushobora kujya ku kintu icyo ari cyo cyose gisa nabi.",
          notes: [
            "Buri mubare ubarwa uvuye ku nyandiko z'ibaruramari, bityo uhuza na raporo ku giceri.",
            "Imbonerahamwe yerekana sosiyete ukoreramo. Hindura sosiyete hejuru ibumoso niba ucunga izirenze imwe.",
          ]
        },
        admin_accounting: {
          title: "Ibikorwa by'ibaruramari",
          purpose: "Kwandika inyandiko mu bitabo: ibitabo, ibyongerwa n'ibikosora bituma ibisigaye birungi.",
          where: "Ibaruramari mu nkingi ibumoso.",
          steps: [
            "Fungura urutonde rw'amakonti kugira ngo urebe buri konti n'ibyo isigaranye.",
            "Kugira ngo wandike inyandiko ukoresheje intoki, fungura inyandiko nshya y'igitabo: hitamo amakonti, hanyuma ibyinjira n'ibisohoka.",
            "Reba ko ibyinjira n'ibisohoka bingana mbere yo kwemeza — porogaramu yanga inyandiko idahwanye.",
            "Kugira ngo ugabanye uruhande aho kurwongera, andika umubare ufite akamenyetso k'ubusa; rwandikwa ku ruhande rundi, icyo ni cyo ikosora.",
          ],
          expected: "Inyandiko iremezwa, kandi imizania na raporo birayifata ako kanya.",
          notes: [
            "Inyandiko idahwanye ntishobora kwemezwa. Iyo tegeko ni ryo rituma ibitabo biba ukuri.",
            "Imibare ishobora kuba iy'ibice, kandi ikosora ni umubare ufite akamenyetso k'ubusa ku ruhande rugabanywa.",
            "Inyandiko ziva ku igurisha, ku kugura cyangwa ku bwishyu nazo zigaragara hano; si ibitabo bitandukanye.",
          ]
        },
        admin_purchases: {
          title: "Kugura n'inyemezabuguzi z'abatanga ibicuruzwa",
          purpose: "Kwandika ibyo ugura n'ibyo urimo, no kugumisha ububiko n'ibaruramari ku ntambwe imwe.",
          where: "Kugura mu nkingi ibumoso.",
          steps: [
            "Andika inyemezabuguzi y'uwaguhaye ibicuruzwa: uwabitanze, itariki, hanyuma ibyo waguze n'igiciro cyabyo.",
            "Niba ibicuruzwa byageze, byakire kugira ngo ububiko buzamuke.",
            "Andika ubwishyu igihe wishyuye uwaguhaye ibicuruzwa; ibyo umurimo biragabanuka.",
            "Kugira ngo usubize ibicuruzwa, kora isubizwa ryo kugura ku nyemezabuguzi.",
          ],
          expected: "Kugura, ububiko n'ibyo urimo biba bigezweho, kandi igihombo kiri mu ibaruramari.",
          notes: [
            "Ingano zishobora kuba iy'ibice: kugura 2.5 kg byandikwa 2.5.",
            "Kugira ngo ukosore inyemezabuguzi wanditse, kora isubizwa cyangwa inyemezabwishyu yo gusubiza aho guhindura iy'umwimerere.",
            "Ingano yakiriwe ntishobora kuba ifite akamenyetso k'ubusa; koresha isubizwa ryo kugura, ryandika impamvu.",
          ]
        },
        admin_parties: {
          title: "Abakiriya n'abatanga ibicuruzwa",
          purpose: "Kugumana abantu ukorana nabo, no kumenya neza ibyo buri wese arimo.",
          where: "Abakiriya n'Abatanga ibicuruzwa mu nkingi ibumoso.",
          steps: [
            "Fungura Abakiriya kugira ngo urebe buri mukiriya n'ibyo arimo; fungura Abatanga ibicuruzwa ku byo urimo.",
            "Ongeraho cyangwa uhindure dosiye ukoresheje izina, uburyo bwo kubabona na nimero y'umusoro niba uyifite.",
            "Capa imenyekanisha kuri umwe muri bo kugira ngo werekane ibisigaye.",
          ],
          expected: "Ibisigaye bihuza n'ibaruramari, kuko byombi biva ku nyandiko zimwe.",
          notes: [
            "Ibisigaye birazamuka iyo ugurishije cyangwa uguze ku ideni, kandi biragabanuka iyo ubwishyu bwanditswe.",
            "Guhanagura umukiriya ufite amateka ntibyemewe; dosiye irafungwa aho, kugira ngo ibaruramari rigume ryuzuye.",
          ]
        },
        admin_taxes: {
          title: "Imisoro na TVA",
          purpose: "Kwishyuza umusoro ukwiye, no kuwutanga neza.",
          where: "Imiterere → Imisoro, n'inkingi y'umusoro ku igurisha cyangwa ku kugura.",
          steps: [
            "Shyiraho buri gipimo cy'umusoro rimwe: izina n'ijanisha.",
            "Igipimo gishyirwa ku murongo iyo wanditse igurisha cyangwa kugura.",
            "Ibiciro bishobora kuba birimo umusoro cyangwa bitawurimo; imiterere ya sosiyete ni yo ibigena, ishyirwa mu Imiterere → Sosiyete.",
            "Koresha raporo ya TVA kugira ngo urebe ibyo wakusanyije n'ibyo wishyuye.",
          ],
          expected: "Umusoro wishyuzwa kuri buri murongo ku gipimo washyizeho, kandi raporo ya TVA ihuza n'ibaruramari.",
          notes: [
            "Igipimo kitagikoreshwa kirahagarikwa aho guhanagurwa, kugira ngo inyandiko za kera zigume ari ukuri.",
            "Igipimo kibikwa kuri buri murongo igihe cyo kugurisha: guhindura igipimo nyuma ntibisubika amateka.",
          ]
        },
        admin_reports: {
          title: "Raporo z'imari",
          purpose: "Gukora imibare ubucuruzi n'ubuyobozi bw'imisoro bakeneye.",
          where: "Raporo mu nkingi ibumoso.",
          steps: [
            "Hitamo raporo: Igitabo rusange, Inyandiko z'igitabo, Imizania, Inyungu n'igihombo, Bilan, Imigendekere y'amafaranga, Imyenda y'abakiriya, Imyenda y'abatanga ibicuruzwa, TVA, cyangwa Igiciro cy'ububiko.",
            "Shyiraho igihe ushaka.",
            "Yisomere kuri ecran, uyicape, cyangwa uyohereze hanze.",
          ],
          expected: "Raporo ihuza n'ibaruramari, kuko ikorwa iva ku nyandiko zimwe.",
          notes: [
            "Buri raporo ikemura imibare ifite akamenyetso k'ubusa n'iy'ibice, bityo isubizwa cyangwa ingano y'igice cyerekana uko cyanditswe.",
            "Imizania na Bilan bigomba guhwana. Niba bitari ko biri, hari inyandiko yo gushaka, atari raporo yo gushidikanya.",
          ]
        },
        admin_records: {
          title: "Inyandiko z'ibaruramari",
          purpose: "Kongera kubona inyandiko iyo ari yo yose, no kumenya uwayikoze n'igihe.",
          where: "Ibaruramari → urutonde rw'inyandiko, na Imiterere → Inyandiko y'igenzura.",
          steps: [
            "Shakisha mu rutonde rw'inyandiko ukoresheje itariki, konti, cyangwa numero y'iranga inyandiko.",
            "Fungura inyandiko kugira ngo urebe impande zombi zayo n'inyandiko yayikoze.",
            "Inyandiko y'igenzura yerekana ukoze iki n'igihe.",
          ],
          expected: "Umubare uwo ari wo wose muri raporo iyo ari yo yose ushobora gukurikiranwa kugeza ku nyandiko yawukoze.",
          notes: [
            "Inyandiko ntizihanagurwa na rimwe. Ikosa rikosorwa n'inyandiko ihindura, bityo amateka aguma yuzuye.",
            "Buri nyandiko yandika izina ry'uwakoresheje wayemeje.",
          ]
        },
        admin_permissions: {
          title: "Abakoresha, inshingano n'uburenganzira",
          purpose: "Kureka buri muntu agakora akazi ke n'ibindi atarenza, no kumenya uwakoze iki.",
          where: "Imiterere → Abakoresha. Umuyobozi gusa ashobora kuyifungura.",
          steps: [
            "Ongeraho ukoresha afite izina n'ijambo ry'ibanga ry'agateganyo; arihindura ubwa mbere yinjiye.",
            "Muhe inshingano — Umuyobozi, Umubaramari, Igurisha, Kugura cyangwa Ububiko — igena ibyo abona n'ibyo ashobora gukora.",
            "Hagarika ukoresha ugiye aho kumuhanagura.",
          ],
          expected: "Buri muntu abona amapaji akazi ke gakeneye, kandi buri gikorwa cyandikwa ku izina rye.",
          notes: [
            "Uburenganzira bushyirwa mu bikorwa na porogaramu atari gusa na menu: guhisha buto si bwo burinzi bwonyine.",
            "Tanga inshingano ntoya ishoboka ituma umuntu akora akazi ke.",
          ]
        },
        admin_functions: {
          title: "Imirimo y'umuyobozi",
          purpose: "Imirimo umuyobozi gusa akora: gushyiraho sosiyete, no kurinda amakuru.",
          where: "JENESIS Settings & Access Point, na Imiterere muri JENESIS Accounting & Business.",
          steps: [
            "Shyiraho sosiyete: izina, aderesi, nimero y'umusoro n'ifaranga.",
            "Kora ububiko bw'amakuru (backup) mbere yo gukora ikintu gishobora guteza akaga, kandi ubike dosiye ahandi hatari kuri iyi mudasobwa.",
            "Subiza amakuru uvuye mu bubiko gusa igihe ubishaka, wumva ko asimbura ayari ahari.",
            "Ongeraho abakoresha kandi wemeze ibyo buri wese ashobora gukora.",
          ],
          expected: "Sosiyete ishyizweho neza kandi hari kopi y'amakuru yo kugarukaho.",
          notes: [
            "Ububiko bw'amakuru ni ububiko gusa niba warebye ko busubiza. Bwipime mbere yo kubukenera.",
            "Guhindura uburenganzira bw'ukoresha bihagarika umwanya arimo: banza umubwire.",
          ]
        },
        admin_shortcuts: {
          title: "Inzira ngufi za clavier",
          purpose: "Kugendagenda mu bitabo udashaka imbeba.",
          where: "Ahantu hose muri JENESIS Accounting & Business. Kanda F1 kugira ngo ubone urutonde rwose.",
          steps: [
            "F1 — fungura ubu bufasha.",
            "Ctrl+Maj+L — igitabo rusange.",
            "Ctrl+Maj+T — kohereza.",
            "Ctrl+Maj+K — imashini ibara.",
            "Ctrl+Maj+M — Messenger.",
            "Alt+T — hindura imiterere y'umucyo cyangwa umwijima.",
            "Alt+L — hindura ururimi.",
          ],
          expected: "Ipaji wasabye irakinguka ako kanya.",
          notes: [
            "Inzira ngufi ntizikora igihe urimo wandika.",
            "Inzira ngufi ikora gusa niba inshingano zawe zemera icyo ikora.",
          ]
        },
        credits: {
          title: "Uwakoze JENESIS",
          purpose: "Kumenya uwo wabaza kuri porogaramu.",
          where: "Iki gice kiri ku musozo wa buri gafasha ka JENESIS.",
          steps: [
            "JENESIS yakozwe kandi itezwa imbere na KAYIGANWA JACQUES.",
          ],
          expected: "Uzi uwo porogaramu ari we n'uyiteza imbere.",
          notes: [
            "Ubu bufasha busobanura porogaramu uko iri. Busobanura gusa ibikorwa bihari muri JENESIS.",
          ]
        },
      }
    },
  },
  maintenance: {
    en: {
      guideTitle: "How to use JENESIS Network & Maintenance",
      guideIntro: "A short guide to keeping the JENESIS service running: the network settings, connecting the other computers in the shop, and what to check when one of them cannot reach JENESIS.",
      closingNote: "Everything this application does concerns the service and the network. It never changes the accounts.",
      sections: {
        maint_interface: {
          title: "The Maintenance screen",
          purpose: "Keep the JENESIS service running and the computers on the network talking to it.",
          where: "JENESIS Network & Maintenance (the green application).",
          steps: [
            "Open the application to see whether the service is running and which computers are connected.",
            "The screen shows the state of the service, the address other computers use, and the list of computers found on the network.",
            "Use the buttons to restart the service or to check the network again.",
          ],
          expected: "You can see at a glance whether other computers can reach JENESIS, and act if they cannot.",
          notes: [
            "This application deliberately holds no accounting, sales, customer or product screens. It looks after the service, not the books.",
            "Restarting the service briefly disconnects anyone using JENESIS on another computer, so do it when the shop is quiet.",
          ]
        },
        maint_network: {
          title: "Network configuration",
          purpose: "Set the address and the port other computers use to reach JENESIS.",
          where: "The network section of JENESIS Network & Maintenance.",
          steps: [
            "Check the address shown: it is the address of this computer on the local network.",
            "The port is the number JENESIS listens on. Other computers need the same one.",
            "Restart the service after changing anything, so the change takes effect.",
          ],
          expected: "The service comes back up on the address and port you set.",
          notes: [
            "Sharing JENESIS with other computers is switched off until you turn it on. Nothing is shared by accident.",
            "If the address of this computer changes, other computers will need to be pointed at the new one.",
          ]
        },
        maint_connect: {
          title: "Connecting computers on the network",
          purpose: "Let the other computers in the shop use the same JENESIS data.",
          where: "The list of computers in JENESIS Network & Maintenance, and the connection settings on the other computer.",
          steps: [
            "Make sure every computer is on the same local network.",
            "On the other computer, open JENESIS and point it at the address and port shown here.",
            "Check the computer appears in the list as reachable.",
          ],
          expected: "The other computer opens JENESIS and works on the same data as this one.",
          notes: [
            "Both computers must be on the same network. A computer on a different network, or off, will not be found.",
            "Finding computers on the network is switched off by default for privacy; turn it on here when you need it.",
          ]
        },
        maint_manage: {
          title: "Managing connections",
          purpose: "See who is connected, and deal with a computer that should not be.",
          where: "The list of computers in JENESIS Network & Maintenance.",
          steps: [
            "The list shows each computer found, whether it is answering, and whether it is connected now.",
            "Press Refresh to look again.",
            "Use the connection controls to allow or refuse a computer.",
          ],
          expected: "You know which computers can reach JENESIS, and you can cut one off.",
          notes: [
            "A computer that has never been checked shows as unknown until you look for it.",
            "A device on the network that is not running JENESIS is listed as such rather than being mistaken for a till.",
          ]
        },
        maint_troubleshooting: {
          title: "Network troubleshooting",
          purpose: "Work out why a computer cannot reach JENESIS, and fix it.",
          where: "JENESIS Network & Maintenance.",
          steps: [
            "'The other computer cannot connect' — check both are on the same network, that this computer is switched on, and that the port is not blocked by a firewall.",
            "'A computer vanished from the list' — it may be switched off or asleep. Press Refresh to look again.",
            "'It worked yesterday' — the address of this computer may have changed. Check the address shown here matches the one the other computer is using.",
            "'JENESIS will not start' — restart the service from this screen and watch for the message saying it is running.",
            "'A screen is blank' — report it with the start-up log, which this application writes so a failed start can always be explained afterwards.",
          ],
          expected: "You know which of the few usual causes it is, and what to do about it.",
          notes: [
            "Anything you cannot solve here is an accounting question for JENESIS Accounting & Business, not a network one.",
            "The service writes a log. It is the first place to look when something will not start.",
          ]
        },
        maint_settings: {
          title: "Settings",
          purpose: "The handful of settings that belong to the service rather than to the accounts.",
          where: "The settings section of JENESIS Network & Maintenance.",
          steps: [
            "Open the settings section to see what can be changed here.",
            "Change only what you need to, and restart the service afterwards if you are asked to.",
          ],
          expected: "The service runs the way you have set it.",
          notes: [
            "Company details, users, taxes, currencies and printing are set in JENESIS Settings & Access Point, not here.",
            "This application never changes the accounts.",
          ]
        },
        maint_shortcuts: {
          title: "Keyboard shortcuts",
          purpose: "Move around the screen without reaching for the mouse.",
          where: "Anywhere in JENESIS Network & Maintenance. Press F1 for the full list.",
          steps: [
            "F1 — open this guide.",
            "Alt+T — change the light or dark appearance.",
            "Alt+L — change the language.",
          ],
          expected: "The screen you asked for opens straight away.",
          notes: [
            "Shortcuts stay out of the way while you are typing.",
            "There are deliberately few shortcuts here: this application has few screens.",
          ]
        },
        credits: {
          title: "Who made JENESIS",
          purpose: "Know who to contact about the program.",
          where: "This section appears at the end of every JENESIS guide.",
          steps: [
            "JENESIS is created and developed by KAYIGANWA JACQUES.",
          ],
          expected: "You know who the program belongs to and who develops it.",
          notes: [
            "This guide documents the program as it is. It describes only features that exist in JENESIS.",
          ]
        },
      }
    },
    fr: {
      guideTitle: "Comment utiliser JENESIS Network & Maintenance",
      guideIntro: "Un guide court pour garder le service JENESIS en marche : les réglages réseau, la connexion des autres ordinateurs de la boutique, et quoi vérifier quand l'un d'eux n'atteint pas JENESIS.",
      closingNote: "Tout ce que fait cette application concerne le service et le réseau. Elle ne modifie jamais les comptes.",
      sections: {
        maint_interface: {
          title: "L'écran de maintenance",
          purpose: "Garder le service JENESIS en marche et les ordinateurs du réseau en contact avec lui.",
          where: "JENESIS Network & Maintenance (l'application verte).",
          steps: [
            "Ouvrez l'application pour voir si le service tourne et quels ordinateurs sont connectés.",
            "L'écran montre l'état du service, l'adresse que les autres ordinateurs utilisent, et la liste des ordinateurs trouvés sur le réseau.",
            "Utilisez les boutons pour redémarrer le service ou revérifier le réseau.",
          ],
          expected: "Vous voyez d'un coup d'œil si les autres ordinateurs atteignent JENESIS, et vous pouvez agir sinon.",
          notes: [
            "Cette application ne contient volontairement aucun écran de comptabilité, de vente, de client ou de produit. Elle s'occupe du service, pas des comptes.",
            "Redémarrer le service déconnecte brièvement ceux qui utilisent JENESIS sur un autre ordinateur : faites-le quand la boutique est calme.",
          ]
        },
        maint_network: {
          title: "La configuration réseau",
          purpose: "Définir l'adresse et le port que les autres ordinateurs utilisent pour atteindre JENESIS.",
          where: "La section réseau de JENESIS Network & Maintenance.",
          steps: [
            "Vérifiez l'adresse affichée : c'est l'adresse de cet ordinateur sur le réseau local.",
            "Le port est le numéro sur lequel JENESIS écoute. Les autres ordinateurs doivent utiliser le même.",
            "Redémarrez le service après tout changement, pour qu'il soit pris en compte.",
          ],
          expected: "Le service redémarre sur l'adresse et le port définis.",
          notes: [
            "Partager JENESIS avec d'autres ordinateurs est désactivé jusqu'à ce que vous l'activiez. Rien n'est partagé par accident.",
            "Si l'adresse de cet ordinateur change, les autres devront être redirigés vers la nouvelle.",
          ]
        },
        maint_connect: {
          title: "Connecter les ordinateurs du réseau",
          purpose: "Permettre aux autres ordinateurs de la boutique d'utiliser les mêmes données JENESIS.",
          where: "La liste des ordinateurs dans JENESIS Network & Maintenance, et les réglages de connexion sur l'autre ordinateur.",
          steps: [
            "Assurez-vous que chaque ordinateur est sur le même réseau local.",
            "Sur l'autre ordinateur, ouvrez JENESIS et pointez-le vers l'adresse et le port affichés ici.",
            "Vérifiez que l'ordinateur apparaît dans la liste comme joignable.",
          ],
          expected: "L'autre ordinateur ouvre JENESIS et travaille sur les mêmes données que celui-ci.",
          notes: [
            "Les deux ordinateurs doivent être sur le même réseau. Un ordinateur sur un autre réseau, ou éteint, ne sera pas trouvé.",
            "La recherche d'ordinateurs sur le réseau est désactivée par défaut pour la confidentialité ; activez-la ici quand vous en avez besoin.",
          ]
        },
        maint_manage: {
          title: "Gérer les connexions",
          purpose: "Voir qui est connecté, et traiter un ordinateur qui ne devrait pas l'être.",
          where: "La liste des ordinateurs dans JENESIS Network & Maintenance.",
          steps: [
            "La liste montre chaque ordinateur trouvé, s'il répond, et s'il est connecté maintenant.",
            "Appuyez sur Actualiser pour chercher à nouveau.",
            "Utilisez les commandes de connexion pour autoriser ou refuser un ordinateur.",
          ],
          expected: "Vous savez quels ordinateurs atteignent JENESIS et vous pouvez en couper un.",
          notes: [
            "Un ordinateur jamais vérifié s'affiche comme inconnu jusqu'à ce que vous le cherchiez.",
            "Un appareil du réseau qui n'exécute pas JENESIS est signalé comme tel plutôt que pris pour une caisse.",
          ]
        },
        maint_troubleshooting: {
          title: "Dépannage réseau",
          purpose: "Comprendre pourquoi un ordinateur n'atteint pas JENESIS, et corriger le problème.",
          where: "JENESIS Network & Maintenance.",
          steps: [
            "« L'autre ordinateur n'arrive pas à se connecter » — vérifiez que les deux sont sur le même réseau, que cet ordinateur est allumé, et qu'un pare-feu ne bloque pas le port.",
            "« Un ordinateur a disparu de la liste » — il est peut-être éteint ou en veille. Appuyez sur Actualiser pour chercher à nouveau.",
            "« Ça marchait hier » — l'adresse de cet ordinateur a peut-être changé. Vérifiez qu'elle correspond à celle que l'autre ordinateur utilise.",
            "« JENESIS ne démarre pas » — redémarrez le service depuis cet écran et guettez le message disant qu'il tourne.",
            "« Un écran est blanc » — signalez-le avec le journal de démarrage, que cette application écrit pour qu'un échec puisse toujours être expliqué après coup.",
          ],
          expected: "Vous savez laquelle des quelques causes habituelles c'est, et quoi faire.",
          notes: [
            "Ce que vous ne pouvez pas résoudre ici est une question de comptabilité pour JENESIS Accounting & Business, pas une question de réseau.",
            "Le service écrit un journal. C'est le premier endroit où regarder quand quelque chose ne démarre pas.",
          ]
        },
        maint_settings: {
          title: "Les paramètres",
          purpose: "Les quelques réglages qui appartiennent au service plutôt qu'à la comptabilité.",
          where: "La section paramètres de JENESIS Network & Maintenance.",
          steps: [
            "Ouvrez la section paramètres pour voir ce qui peut être changé ici.",
            "Ne changez que ce qui est nécessaire, et redémarrez le service ensuite si on vous le demande.",
          ],
          expected: "Le service fonctionne comme vous l'avez réglé.",
          notes: [
            "Les coordonnées de l'entreprise, les utilisateurs, les taxes, les devises et l'impression se règlent dans JENESIS Settings & Access Point, pas ici.",
            "Cette application ne modifie jamais la comptabilité.",
          ]
        },
        maint_shortcuts: {
          title: "Les raccourcis clavier",
          purpose: "Se déplacer à l'écran sans chercher la souris.",
          where: "N'importe où dans JENESIS Network & Maintenance. Appuyez sur F1 pour la liste complète.",
          steps: [
            "F1 — ouvrir ce guide.",
            "Alt+T — changer l'apparence claire ou sombre.",
            "Alt+L — changer la langue.",
          ],
          expected: "L'écran demandé s'ouvre immédiatement.",
          notes: [
            "Les raccourcis ne se déclenchent pas pendant que vous tapez.",
            "Il y a volontairement peu de raccourcis ici : cette application a peu d'écrans.",
          ]
        },
        credits: {
          title: "Qui a fait JENESIS",
          purpose: "Savoir qui contacter au sujet du programme.",
          where: "Cette section figure à la fin de chaque guide JENESIS.",
          steps: [
            "JENESIS est créé et développé par KAYIGANWA JACQUES.",
          ],
          expected: "Vous savez à qui appartient le programme et qui le développe.",
          notes: [
            "Ce guide documente le programme tel qu'il est. Il ne décrit que des fonctions qui existent dans JENESIS.",
          ]
        },
      }
    },
    rw: {
      guideTitle: "Uburyo bwo gukoresha JENESIS Network & Maintenance",
      guideIntro: "Ubufasha bugufi bwo kugumisha serivisi ya JENESIS ikora: imiterere ya réseau, guhuza andi mamudasobwa yo mu iduka, n'ibyo kureba iyo imwe muri yo itagera kuri JENESIS.",
      closingNote: "Ibyo iyi porogaramu ikora byose bireba serivisi na réseau. Ntihindura ibaruramari na rimwe.",
      sections: {
        maint_interface: {
          title: "Ipaji yo gufata neza",
          purpose: "Kugumisha serivisi ya JENESIS ikora n'amamudasobwa yo kuri réseau avugana na yo.",
          where: "JENESIS Network & Maintenance (porogaramu y'icyatsi).",
          steps: [
            "Fungura porogaramu kugira ngo urebe niba serivisi irimo gukora n'amamudasobwa ahujwe.",
            "Ipaji yerekana imiterere ya serivisi, aderesi andi mamudasobwa akoresha, n'urutonde rw'amamudasobwa abonetse kuri réseau.",
            "Koresha utubuto kugira ngo wongere utangize serivisi cyangwa wongere urebe réseau.",
          ],
          expected: "Ubona mu kanya gato niba andi mamudasobwa ashobora kugera kuri JENESIS, kandi ugakora niba atabishobora.",
          notes: [
            "Iyi porogaramu nta mapaji y'ibaruramari, yo kugurisha, y'abakiriya cyangwa y'ibicuruzwa igira ku bushake. Yita kuri serivisi, atari ku bitabo.",
            "Kongera gutangiza serivisi bihagarika gato abari gukoresha JENESIS ku yindi mudasobwa: bikore igihe iduka rituje.",
          ]
        },
        maint_network: {
          title: "Imiterere ya réseau",
          purpose: "Gushyiraho aderesi n'umuryango andi mamudasobwa akoresha kugira ngo agere kuri JENESIS.",
          where: "Igice cya réseau muri JENESIS Network & Maintenance.",
          steps: [
            "Reba aderesi yerekanwe: ni aderesi y'iyi mudasobwa kuri réseau y'aho.",
            "Umuryango ni numero JENESIS yumviraho. Andi mamudasobwa akeneye umwe.",
            "Ongera utangize serivisi nyuma yo guhindura ikintu, kugira ngo bihinduke.",
          ],
          expected: "Serivisi yongera gutangira kuri aderesi n'umuryango washyizeho.",
          notes: [
            "Gusangira JENESIS n'andi mamudasobwa birahagaritswe kugeza ubikongeje. Nta kintu gisangirwa ku bw'impanuka.",
            "Niba aderesi y'iyi mudasobwa ihindutse, andi mamudasobwa azakenera kuyoborwa ku nshya.",
          ]
        },
        maint_connect: {
          title: "Guhuza amamudasobwa kuri réseau",
          purpose: "Kureka andi mamudasobwa yo mu iduka agakoresha amakuru amwe ya JENESIS.",
          where: "Urutonde rw'amamudasobwa muri JENESIS Network & Maintenance, n'imiterere yo guhuza ku yindi mudasobwa.",
          steps: [
            "Menya neza ko buri mudasobwa iri kuri réseau imwe y'aho.",
            "Ku yindi mudasobwa, fungura JENESIS uyiyobore kuri aderesi n'umuryango werekanwe hano.",
            "Reba niba mudasobwa igaragara mu rutonde nk'igerwaho.",
          ],
          expected: "Indi mudasobwa ifungura JENESIS igakora ku makuru amwe n'aya.",
          notes: [
            "Amamudasobwa yombi agomba kuba kuri réseau imwe. Mudasobwa iri ku yindi réseau, cyangwa yazimye, ntizaboneka.",
            "Gushaka amamudasobwa kuri réseau birahagaritswe ku ntangiriro ku bw'ibanga; bikongeje hano igihe ubikeneye.",
          ]
        },
        maint_manage: {
          title: "Gucunga uhuza",
          purpose: "Kureba uwo uhuye, no kugenza mudasobwa itagombye kuba ihujwe.",
          where: "Urutonde rw'amamudasobwa muri JENESIS Network & Maintenance.",
          steps: [
            "Urutonde rwerekana buri mudasobwa yabonetse, niba isubiza, kandi niba ihujwe ubu.",
            "Kanda Ongera urebe kugira ngo wongere ushake.",
            "Koresha amabwiriza yo guhuza kugira ngo wemere cyangwa wange mudasobwa.",
          ],
          expected: "Uzi amamudasobwa ashobora kugera kuri JENESIS, kandi ushobora guhagarika imwe.",
          notes: [
            "Mudasobwa itigeze isuzumwa yerekana nk'itazwi kugeza uyishatse.",
            "Igikoresho kiri kuri réseau kidakoresha JENESIS cyerekana ko ari cyo aho kugifatwa nk'imashini yo kwishyuriraho.",
          ]
        },
        maint_troubleshooting: {
          title: "Gukemura ibibazo bya réseau",
          purpose: "Kumenya impamvu mudasobwa itagera kuri JENESIS, no kuyikemura.",
          where: "JENESIS Network & Maintenance.",
          steps: [
            "« Indi mudasobwa ntishobora guhuza » — reba ko zombi ziri kuri réseau imwe, ko iyi mudasobwa yakongerewe, kandi ko umuryango utabujijwe na pare-feu.",
            "« Mudasobwa yabuze ku rutonde » — ishobora kuba yazimye cyangwa iri mu bitotsi. Kanda Ongera urebe kugira ngo wongere ushake.",
            "« Byakoraga ejo » — aderesi y'iyi mudasobwa ishobora kuba yarahindutse. Reba ko aderesi yerekanwe hano ihuye n'iyo indi mudasobwa ikoresha.",
            "« JENESIS ntitangira » — ongera utangize serivisi uvuye kuri iyi paji urebe ubutumwa buvuga ko irimo gukora.",
            "« Ipaji iri ubusa » — byerekane hamwe n'inyandiko yo gutangira, iyi porogaramu yandika kugira ngo itangira ryananiwe risobanurwe nyuma.",
          ],
          expected: "Uzi impamvu imwe muri nkeya zisanzwe ari yo, n'icyo gukora.",
          notes: [
            "Icyo udashobora gukemura hano ni ikibazo cy'ibaruramari kuri JENESIS Accounting & Business, atari icya réseau.",
            "Serivisi yandika inyandiko. Ni ho ha mbere ho kureba iyo ikintu kitangiye.",
          ]
        },
        maint_settings: {
          title: "Imiterere",
          purpose: "Imimerere mike ibarizwa kuri serivisi aho kuba iy'ibaruramari.",
          where: "Igice cy'imiterere muri JENESIS Network & Maintenance.",
          steps: [
            "Fungura igice cy'imiterere kugira ngo urebe ibishobora guhinduka hano.",
            "Hindura gusa ibyo ukeneye, kandi wongere utangize serivisi nyuma niba ubisabwe.",
          ],
          expected: "Serivisi ikora uko wayishyizeho.",
          notes: [
            "Amakuru ya sosiyete, abakoresha, imisoro, amafaranga no gucapa bishyirwa muri JENESIS Settings & Access Point, atari hano.",
            "Iyi porogaramu ntihindura ibaruramari na rimwe.",
          ]
        },
        maint_shortcuts: {
          title: "Inzira ngufi za clavier",
          purpose: "Kugendagenda kuri paji udashaka imbeba.",
          where: "Ahantu hose muri JENESIS Network & Maintenance. Kanda F1 kugira ngo ubone urutonde rwose.",
          steps: [
            "F1 — fungura ubu bufasha.",
            "Alt+T — hindura imiterere y'umucyo cyangwa umwijima.",
            "Alt+L — hindura ururimi.",
          ],
          expected: "Ipaji wasabye irakinguka ako kanya.",
          notes: [
            "Inzira ngufi ntizikora igihe urimo wandika.",
            "Hano hari inzira ngufi nke ku bushake: iyi porogaramu ifite amapaji make.",
          ]
        },
        credits: {
          title: "Uwakoze JENESIS",
          purpose: "Kumenya uwo wabaza kuri porogaramu.",
          where: "Iki gice kiri ku musozo wa buri gafasha ka JENESIS.",
          steps: [
            "JENESIS yakozwe kandi itezwa imbere na KAYIGANWA JACQUES.",
          ],
          expected: "Uzi uwo porogaramu ari we n'uyiteza imbere.",
          notes: [
            "Ubu bufasha busobanura porogaramu uko iri. Busobanura gusa ibikorwa bihari muri JENESIS.",
          ]
        },
      }
    },
  },
  settings: {
    en: {
      guideTitle: "How to use JENESIS Settings & Access Point",
      guideIntro: "A short guide to setting JENESIS up: the printers, the shape of a receipt, the language, the light and dark appearance, and the options that shape how the business is recorded.",
      closingNote: "Everything you change here is about how JENESIS behaves. None of it erases what has already been recorded.",
      sections: {
        set_overview: {
          title: "What Settings is for",
          purpose: "Configure JENESIS: the company, the users, the taxes, the currencies, the backup, the appearance and printing.",
          where: "JENESIS Settings & Access Point (the yellow application), or Settings inside JENESIS Accounting & Business.",
          steps: [
            "The tabs across the top are: Company, Users, Taxes, Audit, Currencies, Backup, Appearance and Printing.",
            "Open the tab you need, change what you need, and save.",
            "Some tabs need an administrator; if you are not one, they will not open.",
          ],
          expected: "JENESIS is set up the way your business works.",
          notes: [
            "Settings change how the program behaves. They do not change the accounts that are already recorded.",
            "If a tab is missing, your role does not include it. Ask an administrator.",
          ]
        },
        set_printers: {
          title: "Printers",
          purpose: "Choose which printer prints what, and check it works before a customer is waiting.",
          where: "Printing, in the printer section.",
          steps: [
            "Open the Printing tab. The list shows every printer on this computer, both those plugged in and those on the network.",
            "Choose the printer you want from the list; leaving it on the default uses the one Windows would use.",
            "Press Print a test receipt to check it works and is aligned.",
            "Press Save these settings.",
          ],
          expected: "Receipts go to the printer you chose, and you have seen a test page come out of it.",
          notes: [
            "A printer that is switched off, out of paper or jammed is shown in the list rather than hidden, so you can see it is there and not ready.",
            "The printer you choose is remembered on this computer. Another computer keeps its own choice.",
            "In a browser, without the JENESIS desktop application, printing goes through the browser's own print window.",
          ]
        },
        set_receipts: {
          title: "Receipt layouts",
          purpose: "Decide what a receipt looks like: the paper, the text, and which details appear.",
          where: "Printing, in the paper, appearance and content sections.",
          steps: [
            "Choose the paper: a 58 mm roll, an 80 mm roll, an A4 sheet, or a custom width if yours is different.",
            "Set the text: the size, the typeface, whether it is bold, the line spacing and the four margins.",
            "Type the title the receipt carries and the message at the bottom.",
            "Tick the pieces of information you want: the logo, the business name, the address, the telephone, the email, the tax number, the document number, the date, the cashier, the customer, the item details, the tax breakdown, the totals, the payment method, the footer and the cut line.",
            "Press Show the preview to see it exactly as it will print, and whether it fits the paper.",
            "Press Save these settings.",
          ],
          expected: "The receipt prints the way you designed it, and stays that way.",
          notes: [
            "These settings belong to the application you are in. Saving them in JENESIS Seller does not change JENESIS Accounting & Business, and the other way round.",
            "The preview is the real print document at true size, so if a line is cut off there it will be cut off on paper.",
            "Decimals and returns print correctly: 1.25 stays 1.25, and a returned item carries a minus and is marked as returned.",
            "Printing never changes a sale, a payment or an entry. It only produces paper.",
          ]
        },
        set_languages: {
          title: "Language",
          purpose: "Use JENESIS in English, French or Kinyarwanda.",
          where: "The language choice at the top of the screen, or press Alt+L.",
          steps: [
            "Click the language at the top of the screen, or press Alt+L to move through the three.",
            "Pick English, Français or Kinyarwanda.",
          ],
          expected: "The whole interface changes language at once, and your choice is remembered.",
          notes: [
            "The language is yours alone: it does not change what other users see on their own computers.",
            "Documents you have already printed stay in the language they were printed in.",
          ]
        },
        set_theme: {
          title: "Light and dark appearance",
          purpose: "Work in bright light or in a dark room without straining your eyes.",
          where: "The appearance control at the top of the screen, or press Alt+T.",
          steps: [
            "Press Alt+T, or click the appearance control, to move between light, dark and following the computer.",
            "Following the computer means JENESIS matches the setting Windows is using.",
          ],
          expected: "The interface changes at once and your choice is remembered.",
          notes: [
            "Each JENESIS application remembers its own appearance, so the till can be light while the back office is dark.",
            "The colours of the four applications never change: Seller is red, Maintenance green, Accounting blue and Settings yellow, in both light and dark.",
          ]
        },
        set_preferences: {
          title: "Preferences",
          purpose: "The choices that are yours and nobody else's.",
          where: "Across the top of the screen and in the Appearance tab.",
          steps: [
            "Language, appearance, your password and your own details are yours alone.",
            "Change your password from your name at the top right when the program asks you to, or when you want to.",
          ],
          expected: "JENESIS looks and reads the way you prefer, and the other users are unaffected.",
          notes: [
            "Your language and appearance follow you, not the computer, so a shared till still feels like yours.",
            "Some settings, like the company details and the taxes, belong to everybody and need an administrator.",
          ]
        },
        set_options: {
          title: "Configuration options",
          purpose: "The settings that shape how the whole business is recorded.",
          where: "The Company, Taxes, Currencies and Backup tabs.",
          steps: [
            "Company — the name, the address, the tax number, the financial year, the currency and how stock is valued.",
            "Taxes — the rates you charge and pay, and whether prices include tax.",
            "Currencies — the currencies you trade in and the exchange rates.",
            "Backup — making a copy of the data and restoring it.",
          ],
          expected: "Sales, purchases and reports behave the way your business needs them to.",
          notes: [
            "These settings affect everybody, so an administrator is the one who changes them.",
            "A rate that is no longer used is switched off rather than deleted, so old documents stay correct.",
          ]
        },
        set_troubleshooting: {
          title: "When a setting will not work",
          purpose: "Work out why a change did not take effect.",
          where: "Anywhere in JENESIS Settings & Access Point.",
          steps: [
            "'I cannot open a tab' — it needs an administrator. Ask one, or sign in as one.",
            "'My printer is not in the list' — check it is switched on and installed in Windows. Press Refresh to look again.",
            "'The receipt is cut off' — the paper size does not match the roll. Try 58 mm or 80 mm, and check the preview.",
            "'I saved the layout but the till prints the old way' — the setting belongs to the application you were in. Set it again in the application you print from.",
            "'The language did not change everywhere' — a document already printed keeps the language it was printed in.",
          ],
          expected: "You know why it happened and what to do.",
          notes: [
            "Nothing in Settings deletes the accounts. Even a restore is a deliberate act with a backup behind it.",
          ]
        },
        credits: {
          title: "Who made JENESIS",
          purpose: "Know who to contact about the program.",
          where: "This section appears at the end of every JENESIS guide.",
          steps: [
            "JENESIS is created and developed by KAYIGANWA JACQUES.",
          ],
          expected: "You know who the program belongs to and who develops it.",
          notes: [
            "This guide documents the program as it is. It describes only features that exist in JENESIS.",
          ]
        },
      }
    },
    fr: {
      guideTitle: "Comment utiliser JENESIS Settings & Access Point",
      guideIntro: "Un guide court pour configurer JENESIS : les imprimantes, la forme d'un reçu, la langue, l'apparence claire ou sombre, et les options qui déterminent comment l'entreprise est enregistrée.",
      closingNote: "Tout ce que vous changez ici concerne le comportement de JENESIS. Rien n'efface ce qui a déjà été enregistré.",
      sections: {
        set_overview: {
          title: "À quoi servent les Paramètres",
          purpose: "Configurer JENESIS : l'entreprise, les utilisateurs, les taxes, les devises, la sauvegarde, l'apparence et l'impression.",
          where: "JENESIS Settings & Access Point (l'application jaune), ou Paramètres dans JENESIS Accounting & Business.",
          steps: [
            "Les onglets en haut sont : Entreprise, Utilisateurs, Taxes, Audit, Devises, Sauvegarde, Apparence et Impression.",
            "Ouvrez l'onglet voulu, changez ce qui est nécessaire, et enregistrez.",
            "Certains onglets demandent un administrateur ; si vous ne l'êtes pas, ils ne s'ouvrent pas.",
          ],
          expected: "JENESIS est configuré selon le fonctionnement de votre entreprise.",
          notes: [
            "Les paramètres changent le comportement du programme. Ils ne modifient pas les comptes déjà enregistrés.",
            "S'il manque un onglet, votre rôle ne l'inclut pas. Demandez à un administrateur.",
          ]
        },
        set_printers: {
          title: "Les imprimantes",
          purpose: "Choisir quelle imprimante imprime quoi, et vérifier qu'elle marche avant qu'un client n'attende.",
          where: "Impression, dans la section imprimante.",
          steps: [
            "Ouvrez l'onglet Impression. La liste montre toutes les imprimantes de cet ordinateur, branchées ou sur le réseau.",
            "Choisissez l'imprimante voulue ; laisser sur l'imprimante par défaut utilise celle que Windows utiliserait.",
            "Appuyez sur Imprimer un reçu de test pour vérifier qu'elle marche et qu'elle est bien alignée.",
            "Appuyez sur Enregistrer ces paramètres.",
          ],
          expected: "Les reçus vont vers l'imprimante choisie, et vous en avez vu sortir une page de test.",
          notes: [
            "Une imprimante éteinte, sans papier ou bourrée est affichée dans la liste plutôt que cachée, pour que vous voyiez qu'elle est là et pas prête.",
            "L'imprimante choisie est retenue sur cet ordinateur. Un autre ordinateur garde son propre choix.",
            "Dans un navigateur, sans l'application de bureau JENESIS, l'impression passe par la fenêtre d'impression du navigateur.",
          ]
        },
        set_receipts: {
          title: "La mise en page des reçus",
          purpose: "Décider à quoi ressemble un reçu : le papier, le texte et les informations qui apparaissent.",
          where: "Impression, dans les sections papier, apparence et contenu.",
          steps: [
            "Choisissez le papier : un rouleau de 58 mm, un rouleau de 80 mm, une feuille A4, ou une largeur personnalisée si la vôtre est différente.",
            "Réglez le texte : la taille, la police, le gras, l'interligne et les quatre marges.",
            "Tapez le titre du reçu et le message du bas.",
            "Cochez les informations voulues : le logo, le nom de l'entreprise, l'adresse, le téléphone, le courriel, le numéro fiscal, le numéro du document, la date, le caissier, le client, les détails des articles, le détail des taxes, les totaux, le mode de paiement, le bas de page et la ligne de coupe.",
            "Appuyez sur Afficher l'aperçu pour le voir exactement tel qu'il sera imprimé, et s'il tient sur le papier.",
            "Appuyez sur Enregistrer ces paramètres.",
          ],
          expected: "Le reçu s'imprime comme vous l'avez conçu, et reste ainsi.",
          notes: [
            "Ces paramètres appartiennent à l'application dans laquelle vous êtes. Les enregistrer dans JENESIS Seller ne change pas JENESIS Accounting & Business, et inversement.",
            "L'aperçu est le document d'impression réel à taille réelle : si une ligne y est coupée, elle sera coupée sur le papier.",
            "Les décimales et les retours s'impriment correctement : 1,25 reste 1,25, et un article retourné porte un signe moins et la mention « retourné ».",
            "L'impression ne modifie jamais une vente, un paiement ni une écriture. Elle ne produit que du papier.",
          ]
        },
        set_languages: {
          title: "La langue",
          purpose: "Utiliser JENESIS en anglais, en français ou en kinyarwanda.",
          where: "Le choix de la langue en haut de l'écran, ou appuyez sur Alt+L.",
          steps: [
            "Cliquez sur la langue en haut de l'écran, ou appuyez sur Alt+L pour passer de l'une à l'autre.",
            "Choisissez English, Français ou Kinyarwanda.",
          ],
          expected: "Toute l'interface change de langue d'un coup, et votre choix est retenu.",
          notes: [
            "La langue est la vôtre : elle ne change pas ce que les autres utilisateurs voient sur leur propre ordinateur.",
            "Les documents déjà imprimés restent dans la langue où ils ont été imprimés.",
          ]
        },
        set_theme: {
          title: "L'apparence claire et sombre",
          purpose: "Travailler en pleine lumière ou dans une pièce sombre sans fatiguer les yeux.",
          where: "La commande d'apparence en haut de l'écran, ou appuyez sur Alt+T.",
          steps: [
            "Appuyez sur Alt+T, ou cliquez sur la commande d'apparence, pour passer de clair à sombre ou à « suivre l'ordinateur ».",
            "Suivre l'ordinateur signifie que JENESIS adopte le réglage utilisé par Windows.",
          ],
          expected: "L'interface change immédiatement et votre choix est retenu.",
          notes: [
            "Chaque application JENESIS retient sa propre apparence : la caisse peut être claire pendant que le bureau est sombre.",
            "Les couleurs des quatre applications ne changent jamais : Seller est rouge, Maintenance verte, Accounting bleue et Settings jaune, en clair comme en sombre.",
          ]
        },
        set_preferences: {
          title: "Les préférences",
          purpose: "Les choix qui sont les vôtres et ceux de personne d'autre.",
          where: "En haut de l'écran et dans l'onglet Apparence.",
          steps: [
            "La langue, l'apparence, votre mot de passe et vos propres informations n'appartiennent qu'à vous.",
            "Changez votre mot de passe depuis votre nom en haut à droite quand le programme vous le demande, ou quand vous le voulez.",
          ],
          expected: "JENESIS s'affiche et se lit comme vous le préférez, sans affecter les autres utilisateurs.",
          notes: [
            "Votre langue et votre apparence vous suivent, pas l'ordinateur : une caisse partagée reste la vôtre.",
            "Certains réglages, comme les coordonnées de l'entreprise et les taxes, appartiennent à tout le monde et demandent un administrateur.",
          ]
        },
        set_options: {
          title: "Les options de configuration",
          purpose: "Les réglages qui déterminent comment toute l'entreprise est enregistrée.",
          where: "Les onglets Entreprise, Taxes, Devises et Sauvegarde.",
          steps: [
            "Entreprise — le nom, l'adresse, le numéro fiscal, l'exercice, la devise et la valorisation du stock.",
            "Taxes — les taux que vous facturez et payez, et si les prix incluent la taxe.",
            "Devises — les devises dans lesquelles vous travaillez et les taux de change.",
            "Sauvegarde — faire une copie des données et la restaurer.",
          ],
          expected: "Les ventes, les achats et les rapports se comportent comme votre entreprise en a besoin.",
          notes: [
            "Ces réglages affectent tout le monde : c'est un administrateur qui les modifie.",
            "Un taux qui n'est plus utilisé est désactivé plutôt que supprimé, pour que les anciens documents restent justes.",
          ]
        },
        set_troubleshooting: {
          title: "Quand un réglage ne marche pas",
          purpose: "Comprendre pourquoi un changement n'a pas pris effet.",
          where: "N'importe où dans JENESIS Settings & Access Point.",
          steps: [
            "« Je n'arrive pas à ouvrir un onglet » — il faut être administrateur. Demandez à l'un d'eux, ou connectez-vous comme tel.",
            "« Mon imprimante n'est pas dans la liste » — vérifiez qu'elle est allumée et installée dans Windows. Appuyez sur Actualiser pour chercher à nouveau.",
            "« Le reçu est coupé » — le format de papier ne correspond pas au rouleau. Essayez 58 mm ou 80 mm, et regardez l'aperçu.",
            "« J'ai enregistré la mise en page mais la caisse imprime comme avant » — le réglage appartient à l'application où vous étiez. Refaites-le dans l'application depuis laquelle vous imprimez.",
            "« La langue n'a pas changé partout » — un document déjà imprimé garde la langue dans laquelle il a été imprimé.",
          ],
          expected: "Vous savez pourquoi c'est arrivé et quoi faire.",
          notes: [
            "Rien dans les Paramètres ne supprime la comptabilité. Même une restauration est un acte délibéré, appuyé sur une sauvegarde.",
          ]
        },
        credits: {
          title: "Qui a fait JENESIS",
          purpose: "Savoir qui contacter au sujet du programme.",
          where: "Cette section figure à la fin de chaque guide JENESIS.",
          steps: [
            "JENESIS est créé et développé par KAYIGANWA JACQUES.",
          ],
          expected: "Vous savez à qui appartient le programme et qui le développe.",
          notes: [
            "Ce guide documente le programme tel qu'il est. Il ne décrit que des fonctions qui existent dans JENESIS.",
          ]
        },
      }
    },
    rw: {
      guideTitle: "Uburyo bwo gukoresha JENESIS Settings & Access Point",
      guideIntro: "Ubufasha bugufi bwo gushyiraho JENESIS: ibyapa, imiterere y'inyemezabwishyu, ururimi, imiterere y'umucyo n'umwijima, n'amahitamo agena uko ubucuruzi bwandikwa.",
      closingNote: "Ibyo uhindura hano byose bireba imyitwarire ya JENESIS. Nta na kimwe gisiba ibyanditswe.",
      sections: {
        set_overview: {
          title: "Icyo Imiterere imariye",
          purpose: "Gushyiraho JENESIS: sosiyete, abakoresha, imisoro, amafaranga, ububiko bw'amakuru, imiterere n'icapa.",
          where: "JENESIS Settings & Access Point (porogaramu y'umuhondo), cyangwa Imiterere muri JENESIS Accounting & Business.",
          steps: [
            "Udupapuro two hejuru ni: Sosiyete, Abakoresha, Imisoro, Igenzura, Amafaranga, Ububiko, Imiterere n'Icapa.",
            "Fungura igipapuro ushaka, hindura ibyo ukeneye, hanyuma ubike.",
            "Udupapuro tumwe dusaba umuyobozi; niba utari we, ntidufunguka.",
          ],
          expected: "JENESIS ishyizweho uko ubucuruzi bwawe bukora.",
          notes: [
            "Imiterere ihindura imyitwarire ya porogaramu. Ntihindura ibaruramari ryanditswe.",
            "Niba igipapuro kibuze, inshingano zawe ntizirimo. Saba umuyobozi.",
          ]
        },
        set_printers: {
          title: "Ibyapa",
          purpose: "Guhitamo icapa rica iki, no kureba ko rikora mbere y'uko umukiriya ategereza.",
          where: "Icapa, mu gice cy'icapa.",
          steps: [
            "Fungura igipapuro Gucapa. Urutonde rwerekana ibyapa byose by'iyi mudasobwa, ibyinjijwe n'ibiri kuri réseau.",
            "Hitamo icapa ushaka; kurisiga ku icapa ryo ku ntangiriro bikoresha iryo Windows yakoresha.",
            "Kanda Capa inyemezabwishyu yo kugerageza kugira ngo urebe ko rikora kandi rihuye.",
            "Kanda Bika iyi miterere.",
          ],
          expected: "Inyemezabwishyu zijya ku icapa wahisemo, kandi wabonye urupapuro rwo kugerageza rusohoka.",
          notes: [
            "Icapa ryazimye, ritagira impapuro cyangwa ryafashwe n'ikibazo cyerekanwa ku rutonde aho guhishwa, kugira ngo ubone ko rihari ari rititeguye.",
            "Icapa wahisemo ryibukwa kuri iyi mudasobwa. Indi mudasobwa igumana icyo yahisemo.",
            "Muri navigateur, hatari porogaramu ya JENESIS ya mudasobwa, icapa rinyura mu idirishya ry'icapa rya navigateur.",
          ]
        },
        set_receipts: {
          title: "Imiterere y'inyemezabwishyu",
          purpose: "Kwemeza uko inyemezabwishyu isa: urupapuro, inyandiko, n'amakuru agaragara.",
          where: "Icapa, mu bice by'impapuro, imiterere n'ibirimo.",
          steps: [
            "Hitamo urupapuro: umuzingo wa 58 mm, umuzingo wa 80 mm, urupapuro rwa A4, cyangwa ubugari wihitiyemo niba uwanyu utandukanye.",
            "Shyiraho inyandiko: ingano, ubwoko bw'inyuguti, inyuguti zijimye, intera hagati y'imirongo n'uturimbo tune.",
            "Andika umutwe inyemezabwishyu ifite n'ubutumwa bwo hasi.",
            "Tora amakuru ushaka: ikirango, izina ry'ubucuruzi, aderesi, telefoni, imeyili, nimero y'umusoro, numero y'inyandiko, itariki, umucuruzi, umukiriya, ibisobanuro by'ibicuruzwa, uko imisoro iteye, ibiteranyo, uburyo bwo kwishyura, ibiri hasi n'umurongo wo kugabanya.",
            "Kanda Erekana igerageza kugira ngo uyibone nk'uko izacapwa, kandi niba ihagije ku rupapuro.",
            "Kanda Bika iyi miterere.",
          ],
          expected: "Inyemezabwishyu icapa uko wayiteguye, kandi igumaho.",
          notes: [
            "Iyi miterere ni iya porogaramu urimo. Kuyibika muri JENESIS Seller ntibihindura JENESIS Accounting & Business, no mu buryo bunyuranye.",
            "Igerageza ni inyandiko nyayo yo gucapa ku ngayo nyayo: niba umurongo uciweyo, uzacibwa no ku rupapuro.",
            "Imibare y'ibice n'ibyasubijwe bicapa neza: 1.25 iguma 1.25, kandi igicuruzwa cyasubijwe gifite akamenyetso k'ubusa n'ijambo « byasubijwe ».",
            "Gucapa ntibihindura igurisha, ubwishyu cyangwa inyandiko. Bikora impapuro gusa.",
          ]
        },
        set_languages: {
          title: "Ururimi",
          purpose: "Gukoresha JENESIS mu Cyongereza, mu Gifaransa cyangwa mu Kinyarwanda.",
          where: "Ihitamo ry'ururimi hejuru ya paji, cyangwa kanda Alt+L.",
          steps: [
            "Kanda ku rurimi hejuru ya paji, cyangwa kanda Alt+L kugira ngo unyure muri eshatu.",
            "Hitamo English, Français cyangwa Kinyarwanda.",
          ],
          expected: "Interface yose ihindura ururimi icyarimwe, kandi icyo wahisemo kiribukwa.",
          notes: [
            "Ururimi ni urwawe: ntiruhindura ibyo abandi bakoresha babona ku mamudasobwa yabo.",
            "Inyandiko zacapwe zisigara mu rurimi zacapiwemo.",
          ]
        },
        set_theme: {
          title: "Imiterere y'umucyo n'umwijima",
          purpose: "Gukora mu rumuri rwinshi cyangwa mu cyumba cyijimye udananiwe amaso.",
          where: "Igenzura ry'imiterere hejuru ya paji, cyangwa kanda Alt+T.",
          steps: [
            "Kanda Alt+T, cyangwa ku igenzura ry'imiterere, kugira ngo unyure hagati y'umucyo, umwijima no gukurikira mudasobwa.",
            "Gukurikira mudasobwa bivuga ko JENESIS ikurikiza imiterere Windows ikoresha.",
          ],
          expected: "Interface irahinduka ako kanya kandi icyo wahisemo kiribukwa.",
          notes: [
            "Buri porogaramu ya JENESIS yibuka imiterere yayo: imashini yo kwishyuriraho ishobora kuba umucyo mu gihe biro biri umwijima.",
            "Amabara ya porogaramu enye ntahinduka: Seller ni umutuku, Maintenance icyatsi, Accounting ubururu na Settings umuhondo, mu mucyo no mu mwijima.",
          ]
        },
        set_preferences: {
          title: "Ibyo ukunda",
          purpose: "Amahitamo ari ayawe kandi atari ay'undi muntu.",
          where: "Hejuru ya paji no mu gipapuro Imiterere.",
          steps: [
            "Ururimi, imiterere, ijambo ry'ibanga n'amakuru yawe ni ibyawe gusa.",
            "Hindura ijambo ry'ibanga uvuye ku izina ryawe hejuru iburyo igihe porogaramu ibikubajije, cyangwa igihe ubishakiye.",
          ],
          expected: "JENESISA irasa kandi isomwa uko ukunda, nta kugira uwo ihungabanya.",
          notes: [
            "Ururimi n'imiterere yawe biragukurikira, atari mudasobwa: imashini yo kwishyuriraho isangiwe iguma ari iyawe.",
            "Imiterere imwe, nk'amakuru ya sosiyete n'imisoro, ni iya buri wese kandi isaba umuyobozi.",
          ]
        },
        set_options: {
          title: "Amahitamo yo gushyiraho",
          purpose: "Imimerere igena uko ubucuruzi bwose bwanzikwa.",
          where: "Udupapuro Sosiyete, Imisoro, Amafaranga n'Ububiko bw'amakuru.",
          steps: [
            "Sosiyete — izina, aderesi, nimero y'umusoro, umwaka w'ibaruramari, ifaranga n'igiciro cy'ububiko.",
            "Imisoro — ibipimo wishyuza kandi wishyura, kandi niba ibiciro birimo umusoro.",
            "Amafaranga — amafaranga ukoreramo n'ibipimo byo guhana.",
            "Ububiko bw'amakuru — gukora kopi y'amakuru no kuyasubiza.",
          ],
          expected: "Igurisha, kugura na raporo byitwara uko ubucuruzi bwawe bubikeneye.",
          notes: [
            "Iyi mimerere igira buri weseho: umuyobozi ni we uyihindura.",
            "Igipimo kitagikoreshwa kirahagarikwa aho guhanagurwa, kugira ngo inyandiko za kera zigume ari ukuri.",
          ]
        },
        set_troubleshooting: {
          title: "Iyo imiterere idakora",
          purpose: "Kumenya impamvu impinduka itagize ingaruka.",
          where: "Ahantu hose muri JENESIS Settings & Access Point.",
          steps: [
            "« Sinshobora gufungura igipapuro » — bisaba umuyobozi. Saba umwe, cyangwa injira nk'umuyobozi.",
            "« Icapa ryanjye ntiriri ku rutonde » — reba ko ryakongerewe kandi rishyizwe muri Windows. Kanda Ongera urebe kugira ngo wongere ushake.",
            "« Inyemezabwishyu iraciwe » — ingano y'impapuro ntihuye n'umuzingo. Gerageza 58 mm cyangwa 80 mm, kandi urebe igerageza.",
            "« Nabikishije imiterere ariko imashini yo kwishyuriraho iracapa nka mbere » — imiterere ni iya porogaramu wari urimo. Yongere uyishyire muri porogaramu ucapisha.",
            "« Ururimi ntirwahindutse hose » — inyandiko icapwe isigara mu rurimi yacapiwemo.",
          ],
          expected: "Uzi impamvu byabaye n'icyo gukora.",
          notes: [
            "Nta kintu mu Imiterere gisiba ibaruramari. Ndetse no gusubiza amakuru ni igikorwa cyatekerejweho, gishingiye ku bubiko bw'amakuru.",
          ]
        },
        credits: {
          title: "Uwakoze JENESIS",
          purpose: "Kumenya uwo wabaza kuri porogaramu.",
          where: "Iki gice kiri ku musozo wa buri gafasha ka JENESIS.",
          steps: [
            "JENESIS yakozwe kandi itezwa imbere na KAYIGANWA JACQUES.",
          ],
          expected: "Uzi uwo porogaramu ari we n'uyiteza imbere.",
          notes: [
            "Ubu bufasha busobanura porogaramu uko iri. Busobanura gusa ibikorwa bihari muri JENESIS.",
          ]
        },
      }
    },
  },
};
