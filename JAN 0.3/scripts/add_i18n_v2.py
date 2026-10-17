#!/usr/bin/env python3
"""One-shot i18n expansion for the GENESIS 0.4 feature set.

Adds every new UI string in English, French and Kinyarwanda IN THE SAME
CHANGE (multi-store, transfers, goods receipts, cash reconciliation,
multi-currency, count workflow, walk-in sales, corrections, calculator and
translated business-error codes). Existing keys are never overwritten.
Run: python3 scripts/add_i18n_v2.py
"""
import json
import os

ROOT = os.path.join(os.path.dirname(__file__), '..')
I18N = os.path.join(ROOT, 'src', 'i18n')

ADD = {
    'en': {
        'common': {
            'approved': 'Approved', 'rejected': 'Rejected', 'submitted': 'Submitted',
            'reversed': 'Reversed', 'reason': 'Reason', 'refresh': 'Refresh'
        },
        'calculator': {
            'title': 'Calculator',
            'hint': 'The calculator never posts transactions — it only helps you compute amounts.',
            'clear': 'Clear'
        },
        'inventory': {
            'catalog': 'Catalog', 'products_listed': 'products listed',
            'low_stock': 'Low Stock', 'normal_stock': 'Normal', 'out_of_stock': 'Out of Stock',
            'tab_stores': 'Stores', 'tab_transfers': 'Transfers',
            'store_code': 'Store Code', 'store_name': 'Store Name', 'store_address': 'Address',
            'default_store': 'Default Store', 'add_store': 'New Store', 'edit_store': 'Edit Store',
            'no_stores': 'No stores defined', 'store_saved': 'Store saved',
            'stock_by_store': 'Stock by Store', 'company_total_stock': 'Company Total',
            'view_stock': 'View stock by store', 'count_store': 'Store Being Counted',
            'all_stores': 'All stores', 'movements_store': 'Store',
            'print_count_sheet': 'Print Count Sheet', 'count_sheet_title': 'Physical Count Sheet',
            'counted_by': 'Counted by', 'count_date': 'Count Date', 'count_number': 'Count Number',
            'save_draft': 'Save Draft', 'submit_for_review': 'Submit for Review',
            'approve_count': 'Approve', 'reject_count': 'Reject',
            'post_approved_count': 'Post Approved Count', 'revise_count': 'Revise',
            'workflow_hint': 'Workflow: draft → submit → independent approval → posting. The person who counted cannot approve their own count.',
            'variance_reason': 'Variance Reason', 'reason_missing': 'Missing',
            'reason_excess': 'Excess', 'reason_damaged': 'Damaged', 'reason_other': 'Other',
            'rejection_reason': 'Rejection Reason', 'counts_history': 'Counts History',
            'counter': 'Counter', 'submitted_by': 'Submitted by', 'approved_by': 'Approved by',
            'no_counts': 'No physical counts recorded',
            'adjustment_store': 'Store Being Adjusted',
            'transfers': {
                'transfer_number': 'Transfer Number', 'from_store': 'From Store', 'to_store': 'To Store',
                'new_transfer': 'New Transfer', 'dispatch_transfer': 'Dispatch',
                'receive_transfer': 'Receive', 'cancel_transfer': 'Cancel Transfer',
                'requested_qty': 'Requested Qty', 'received_qty': 'Received Qty',
                'status_in_transit': 'In Transit', 'status_completed': 'Completed',
                'transfer_created': 'Transfer created', 'no_transfers': 'No stock transfers',
                'add_transfer_line': 'Add Line',
                'dispatch_hint': 'Dispatch deducts from the source store only — the company-wide total stays unchanged until the goods are received.',
                'partial_hint': 'Partial receipt is allowed: enter the quantities actually received per line.',
                'company_stock_note': 'Transfers never create or destroy company inventory.',
                'receive_lines_hint': 'Enter received quantities (0 to keep in transit):'
            }
        },
        'purchases': {
            'tab_receipts': 'Goods Receipts', 'goods_receipt': 'Goods Receipt', 'new_receipt': 'New Goods Receipt',
            'receipt_number': 'Receipt Number', 'post_receipt': 'Post Receipt', 'select_po': 'Purchase Order',
            'receipt_store': 'Receiving Store', 'ordered_qty': 'Ordered Qty', 'received_qty': 'Received Qty',
            'remaining_qty': 'Remaining Qty', 'total_quantity': 'Total Quantity', 'total_value': 'Total Value',
            'receipt_hint': 'Stock increases ONLY when a goods receipt is posted — never when creating products, orders or bills.',
            'direct_receipt_no_po': 'Direct receipt (no purchase order)',
            'link_receipt_bill': 'Link a posted goods receipt', 'no_receipts': 'No goods receipts recorded',
            'status_partially_received': 'Partially Received', 'status_received': 'Received',
            'receipts_of_po': 'Receipts for this order'
        },
        'banking': {
            'tab_cash': 'Cash Counting', 'open_session': 'Open Cash Session', 'close_session': 'Close Cash Session',
            'approve_session': 'Approve Reconciliation', 'opening_count': 'Opening Count',
            'closing_count': 'Closing Count', 'denomination': 'Denomination', 'unit_value': 'Unit Value',
            'counted_total': 'Counted Total', 'expected_cash': 'Expected Cash', 'variance': 'Variance',
            'explanation': 'Explanation',
            'explanation_hint': 'An explanation is required whenever counted cash differs from expected cash. A discrepancy never posts an automatic accounting adjustment.',
            'session_number': 'Session Number', 'opened_by': 'Opened by', 'opened_at': 'Opened at',
            'closed_by': 'Closed by', 'closed_at': 'Closed at', 'approved_at': 'Approved at',
            'add_denom_line': 'Add Denomination Line', 'no_sessions': 'No cash sessions recorded',
            'no_auto_adjust_note': 'No automatic accounting adjustment: discrepancies stay documented for independent approval.',
            'cash_hint': 'Denomination-based counting compares the physical cash with expected cash (opening + receipts − payouts of the period).',
            'reverse_payment': 'Reverse Payment', 'reversal_reason': 'Reversal Reason',
            'reverse_confirm': 'Reverse this payment? Its journal entry and all balances will be restored and the reversal audited.',
            'cash_account': 'Cash Account', 'approval_note': 'The person who closed the session cannot approve it — an independent approver is required.'
        },
        'sales': {
            'walk_in_sale': 'Walk-in / Anonymous Sale',
            'walk_in_hint': 'No customer name needed; the sale is settled immediately. Credit sales require an identified customer.',
            'walk_in_badge': 'Walk-in', 'credit_customer_hint': 'A credit sale requires an identified customer.',
            'currency': 'Currency', 'exchange_rate': 'Exchange Rate', 'foreign_total': 'Total in Transaction Currency',
            'base_total_note': 'Ledger amounts are converted to the base currency at this rate; the original amount and rate are preserved.',
            'settlement_account': 'Settlement Account', 'filter_walk_in': 'Walk-in only',
            'search_invoices': 'Search number, customer…'
        },
        'settings': {
            'tab_currencies': 'Currencies & Rates', 'add_currency': 'New Currency',
            'currency_code': 'Code (ISO 4217)', 'currency_name': 'Currency Name', 'currency_symbol': 'Symbol',
            'decimals': 'Decimal Places', 'decimals_hint': 'Per-currency precision: 0 (JPY), 2 (USD/EUR), 3 (BHD)…',
            'base_currency': 'Base Currency', 'add_rate': 'New Exchange Rate', 'rate_from': 'From',
            'rate_to': 'To', 'rate_value': 'Rate', 'effective_date': 'Effective Date',
            'rate_history': 'Rate History', 'no_rates': 'No exchange rates recorded',
            'convert_tester': 'Conversion Tester', 'converted': 'Converted Result',
            'currency_saved': 'Currency saved', 'rate_saved': 'Exchange rate saved',
            'require_goods_receipt': 'Require goods receipts',
            'require_goods_receipt_hint': 'When enabled, a supplier bill can only be posted against a posted goods receipt — stock never increases without formal receiving.',
            'valuation_hint': 'FIFO consumes the oldest purchase layers; weighted average uses the moving average cost.',
            'no_currencies': 'No currencies configured'
        },
        'errors': {
            'INSUFFICIENT_STOCK': 'Insufficient stock for this operation. Check the available quantities per store.',
            'ALREADY_POSTED': 'This document has already been posted. Duplicate posting is blocked.',
            'ALREADY_REVERSED': 'This record has already been reversed.',
            'NOTHING_TO_REVERSE': 'There is no journal entry to reverse for this record.',
            'FULLY_CREDITED': 'This invoice has already been fully credited. Duplicate credit notes are blocked.',
            'OVER_RETURN': 'The return quantity exceeds the still-returnable quantity of the invoice.',
            'OVER_REFUND': 'This refund would exceed the amount the invoice allows.',
            'CN_NEEDS_POSTED_INVOICE': 'Credit notes can only be issued against posted invoices.',
            'WALKIN_IMMEDIATE_PAYMENT': 'Walk-in sales must be paid immediately. For a credit sale, use an identified customer.',
            'NOT_WALKIN': 'This invoice is not a walk-in sale.',
            'NO_CASH_ACCOUNT': 'No active cash account is configured for walk-in sales.',
            'GRN_REQUIRED': 'This company requires a posted goods receipt before a supplier invoice can be posted. Receive the goods first, then link the receipt to the bill.',
            'GRN_NOT_POSTED': 'The linked goods receipt is not posted.',
            'OVER_RECEIPT': 'The receipt exceeds the ordered or already-received quantities.',
            'PO_CANCELLED': 'Goods cannot be received against a cancelled purchase order.',
            'NOTHING_TO_RECEIVE': 'Nothing to receive: all lines are already fully received.',
            'SERVICE_NOT_STOCKABLE': 'Only goods can be received into stock or transferred between stores (services have no stock).',
            'COUNT_SELF_APPROVAL': 'You cannot approve a count that you created or submitted. An independent reviewer must approve it.',
            'CASH_SELF_APPROVAL': 'You cannot approve a cash reconciliation that you closed. An independent approver is required.',
            'REJECT_REASON_REQUIRED': 'A rejection reason is required.',
            'COUNT_NOT_SUBMITTED': 'Only submitted counts can be approved or rejected.',
            'COUNT_NOT_DRAFT': 'Only draft or rejected counts can be edited or submitted.',
            'COUNT_NOT_APPROVED': 'Only approved counts can be posted.',
            'SESSION_ALREADY_OPEN': 'A cash session is already open for this account. Close it first.',
            'SESSION_NOT_CASH_ACCOUNT': 'Cash sessions can only be opened on CASH-type accounts.',
            'SESSION_NOT_OPEN': 'Only open cash sessions can be closed.',
            'SESSION_NOT_CLOSED': 'Only closed cash sessions can be approved.',
            'VARIANCE_EXPLANATION_REQUIRED': 'An explanation is required when counted cash differs from expected cash.',
            'ACCOUNT_INACTIVE': 'This cash account is inactive.',
            'TRANSFER_SAME_STORE': 'Source and destination stores must be different.',
            'TRANSFER_SAME_ACCOUNT': 'Source and destination accounts must be different.',
            'TRANSFER_NOT_DRAFT': 'Only draft transfers can be dispatched or cancelled.',
            'TRANSFER_NOT_DISPATCHED': 'Only dispatched (in-transit) transfers can be received.',
            'NEGATIVE_QUANTITY': 'Quantities must be greater than zero.',
            'ALREADY_EXISTS': 'An identical record already exists.',
            'DEFAULT_STORE_LOCKED': 'The default store cannot be deactivated. Choose another default store first.',
            'STORE_HAS_STOCK': 'This store still holds stock. Transfer the stock out before deactivating it.',
            'BASE_CURRENCY_LOCKED': 'The base currency cannot be deactivated.',
            'NO_EXCHANGE_RATE': 'No exchange rate is configured for this currency pair on that date.',
            'INVALID_RATE': 'The exchange rate must be greater than zero.',
            'INVALID_CURRENCY_CODE': 'The currency code must be 3 letters (ISO 4217), e.g. USD, EUR, RWF.',
            'CURRENCY_NOT_CONFIGURED': 'This currency is not configured for the company. Add it in Settings → Currencies.',
            'INVALID_DECIMALS': 'Currency decimals must be between 0 and 4.',
            'INVALID_STORE_CODE': 'The store code must be 2–20 characters: letters, digits, dot, dash or underscore.',
            'INVALID_DATE': 'The date must be in YYYY-MM-DD format.',
            'SAME_CURRENCY_PAIR': 'A rate must link two different currencies.',
            'UNBALANCED_JOURNAL': 'Unbalanced journal entry: total debits must equal total credits.',
            'CUSTOMER_REQUIRED': 'A customer is required. For an anonymous cash sale, enable walk-in mode.',
            'SUPPLIER_REQUIRED': 'A supplier is required.'
        }
    },
    'fr': {
        'common': {
            'approved': 'Approuvé', 'rejected': 'Rejeté', 'submitted': 'Soumis',
            'reversed': 'Contre-passé', 'reason': 'Motif', 'refresh': 'Actualiser'
        },
        'calculator': {
            'title': 'Calculatrice',
            'hint': 'La calculatrice ne comptabilise aucune transaction — elle sert uniquement à calculer des montants.',
            'clear': 'Effacer'
        },
        'inventory': {
            'catalog': 'Catalogue', 'products_listed': 'articles listés',
            'low_stock': 'Stock faible', 'normal_stock': 'Normal', 'out_of_stock': 'Rupture de stock',
            'tab_stores': 'Magasins', 'tab_transfers': 'Transferts',
            'store_code': 'Code du magasin', 'store_name': 'Nom du magasin', 'store_address': 'Adresse',
            'default_store': 'Magasin par défaut', 'add_store': 'Nouveau magasin', 'edit_store': 'Modifier le magasin',
            'no_stores': 'Aucun magasin défini', 'store_saved': 'Magasin enregistré',
            'stock_by_store': 'Stock par magasin', 'company_total_stock': 'Total entreprise',
            'view_stock': 'Voir le stock par magasin', 'count_store': 'Magasin compté',
            'all_stores': 'Tous les magasins', 'movements_store': 'Magasin',
            'print_count_sheet': 'Imprimer la feuille de comptage', 'count_sheet_title': 'Feuille de comptage physique',
            'counted_by': 'Compté par', 'count_date': 'Date du comptage', 'count_number': 'N° de comptage',
            'save_draft': 'Enregistrer le brouillon', 'submit_for_review': 'Soumettre pour validation',
            'approve_count': 'Approuver', 'reject_count': 'Rejeter',
            'post_approved_count': 'Comptabiliser le comptage approuvé', 'revise_count': 'Réviser',
            'workflow_hint': 'Flux : brouillon → soumission → approbation indépendante → comptabilisation. L’auteur du comptage ne peut pas l’approuver lui-même.',
            'variance_reason': 'Motif de l’écart', 'reason_missing': 'Manquant',
            'reason_excess': 'Excédent', 'reason_damaged': 'Endommagé', 'reason_other': 'Autre',
            'rejection_reason': 'Motif du rejet', 'counts_history': 'Historique des comptages',
            'counter': 'Agent d’inventaire', 'submitted_by': 'Soumis par', 'approved_by': 'Approuvé par',
            'no_counts': 'Aucun comptage physique enregistré',
            'adjustment_store': 'Magasin ajusté',
            'transfers': {
                'transfer_number': 'N° de transfert', 'from_store': 'Magasin source', 'to_store': 'Magasin destinataire',
                'new_transfer': 'Nouveau transfert', 'dispatch_transfer': 'Expédier',
                'receive_transfer': 'Réceptionner', 'cancel_transfer': 'Annuler le transfert',
                'requested_qty': 'Qté demandée', 'received_qty': 'Qté reçue',
                'status_in_transit': 'En transit', 'status_completed': 'Terminé',
                'transfer_created': 'Transfert créé', 'no_transfers': 'Aucun transfert de stock',
                'add_transfer_line': 'Ajouter une ligne',
                'dispatch_hint': 'L’expédition déduit uniquement du magasin source — le total de l’entreprise reste inchangé jusqu’à la réception.',
                'partial_hint': 'La réception partielle est autorisée : saisissez les quantités réellement reçues par ligne.',
                'company_stock_note': 'Les transferts ne créent ni ne détruisent le stock de l’entreprise.',
                'receive_lines_hint': 'Saisissez les quantités reçues (0 pour laisser en transit) :'
            }
        },
        'purchases': {
            'tab_receipts': 'Réceptions', 'goods_receipt': 'Bon de réception', 'new_receipt': 'Nouvelle réception',
            'receipt_number': 'N° de réception', 'post_receipt': 'Comptabiliser la réception', 'select_po': 'Commande fournisseur',
            'receipt_store': 'Magasin de réception', 'ordered_qty': 'Qté commandée', 'received_qty': 'Qté reçue',
            'remaining_qty': 'Qté restante', 'total_quantity': 'Quantité totale', 'total_value': 'Valeur totale',
            'receipt_hint': 'Le stock n’augmente QUE lors de la comptabilisation d’une réception — jamais à la création d’un article, d’une commande ou d’une facture.',
            'direct_receipt_no_po': 'Réception directe (sans commande)',
            'link_receipt_bill': 'Lier un bon de réception comptabilisé', 'no_receipts': 'Aucune réception enregistrée',
            'status_partially_received': 'Partiellement reçue', 'status_received': 'Reçue',
            'receipts_of_po': 'Réceptions de cette commande'
        },
        'banking': {
            'tab_cash': 'Comptage de caisse', 'open_session': 'Ouvrir la caisse', 'close_session': 'Clôturer la caisse',
            'approve_session': 'Approuver le rapprochement', 'opening_count': 'Comptage d’ouverture',
            'closing_count': 'Comptage de clôture', 'denomination': 'Coupure', 'unit_value': 'Valeur unitaire',
            'counted_total': 'Total compté', 'expected_cash': 'Espèces attendues', 'variance': 'Écart',
            'explanation': 'Explication',
            'explanation_hint': 'Une explication est obligatoire dès que le comptage diffère des espèces attendues. Un écart ne génère jamais d’écriture comptable automatique.',
            'session_number': 'N° de session', 'opened_by': 'Ouverte par', 'opened_at': 'Ouverte le',
            'closed_by': 'Clôturée par', 'closed_at': 'Clôturée le', 'approved_at': 'Approuvée le',
            'add_denom_line': 'Ajouter une coupure', 'no_sessions': 'Aucune session de caisse enregistrée',
            'no_auto_adjust_note': 'Aucun ajustement comptable automatique : les écarts restent documentés pour approbation indépendante.',
            'cash_hint': 'Le comptage par coupures compare les espèces physiques aux espèces attendues (ouverture + encaissements − décaissements de la période).',
            'reverse_payment': 'Contre-passer le paiement', 'reversal_reason': 'Motif de la contre-passation',
            'reverse_confirm': 'Contre-passer ce paiement ? Son écriture et tous les soldes liés seront restaurés, avec piste d’audit.',
            'cash_account': 'Compte de caisse', 'approval_note': 'La personne qui a clôturé la session ne peut pas l’approuver — un approbateur indépendant est requis.'
        },
        'sales': {
            'walk_in_sale': 'Vente au comptoir (client anonyme)',
            'walk_in_hint': 'Aucun nom de client requis ; la vente est encaissée immédiatement. Les ventes à crédit exigent un client identifié.',
            'walk_in_badge': 'Comptoir', 'credit_customer_hint': 'Une vente à crédit exige un client identifié.',
            'currency': 'Devise', 'exchange_rate': 'Taux de change', 'foreign_total': 'Total en devise de transaction',
            'base_total_note': 'Les montants comptables sont convertis en devise de base à ce taux ; le montant et le taux d’origine sont conservés.',
            'settlement_account': 'Compte d’encaissement', 'filter_walk_in': 'Comptoir uniquement',
            'search_invoices': 'Rechercher numéro, client…'
        },
        'settings': {
            'tab_currencies': 'Devises et taux', 'add_currency': 'Nouvelle devise',
            'currency_code': 'Code (ISO 4217)', 'currency_name': 'Nom de la devise', 'currency_symbol': 'Symbole',
            'decimals': 'Décimales', 'decimals_hint': 'Précision par devise : 0 (JPY), 2 (USD/EUR), 3 (BHD)…',
            'base_currency': 'Devise de base', 'add_rate': 'Nouveau taux de change', 'rate_from': 'De',
            'rate_to': 'Vers', 'rate_value': 'Taux', 'effective_date': 'Date d’effet',
            'rate_history': 'Historique des taux', 'no_rates': 'Aucun taux de change enregistré',
            'convert_tester': 'Test de conversion', 'converted': 'Résultat converti',
            'currency_saved': 'Devise enregistrée', 'rate_saved': 'Taux de change enregistré',
            'require_goods_receipt': 'Exiger un bon de réception',
            'require_goods_receipt_hint': 'Si activé, une facture fournisseur ne peut être comptabilisée que liée à une réception comptabilisée — le stock n’augmente jamais sans réception formelle.',
            'valuation_hint': 'FIFO consomme les couches d’achat les plus anciennes ; le coût moyen pondéré utilise le coût moyen mobile.',
            'no_currencies': 'Aucune devise configurée'
        },
        'errors': {
            'INSUFFICIENT_STOCK': 'Stock insuffisant pour cette opération. Vérifiez les quantités disponibles par magasin.',
            'ALREADY_POSTED': 'Ce document a déjà été comptabilisé. La double comptabilisation est bloquée.',
            'ALREADY_REVERSED': 'Cet enregistrement a déjà été contre-passé.',
            'NOTHING_TO_REVERSE': 'Aucune écriture à contre-passer pour cet enregistrement.',
            'FULLY_CREDITED': 'Cette facture a déjà été entièrement créditée. Les avoirs en double sont bloqués.',
            'OVER_RETURN': 'La quantité retournée dépasse la quantité encore retournable de la facture.',
            'OVER_REFUND': 'Ce remboursement dépasserait le montant autorisé par la facture.',
            'CN_NEEDS_POSTED_INVOICE': 'Un avoir ne peut être émis que sur une facture comptabilisée.',
            'WALKIN_IMMEDIATE_PAYMENT': 'Les ventes au comptoir doivent être encaissées immédiatement. Pour une vente à crédit, utilisez un client identifié.',
            'NOT_WALKIN': 'Cette facture n’est pas une vente au comptoir.',
            'NO_CASH_ACCOUNT': 'Aucune caisse active n’est configurée pour les ventes au comptoir.',
            'GRN_REQUIRED': 'Cette entreprise exige une réception comptabilisée avant de comptabiliser une facture fournisseur. Réceptionnez d’abord les marchandises, puis liez la réception à la facture.',
            'GRN_NOT_POSTED': 'Le bon de réception lié n’est pas comptabilisé.',
            'OVER_RECEIPT': 'La réception dépasse les quantités commandées ou déjà reçues.',
            'PO_CANCELLED': 'Impossible de réceptionner des marchandises sur une commande annulée.',
            'NOTHING_TO_RECEIVE': 'Rien à réceptionner : toutes les lignes sont déjà entièrement reçues.',
            'SERVICE_NOT_STOCKABLE': 'Seules les marchandises peuvent être reçues en stock ou transférées entre magasins (les services n’ont pas de stock).',
            'COUNT_SELF_APPROVAL': 'Vous ne pouvez pas approuver un comptage que vous avez créé ou soumis. Un validateur indépendant est requis.',
            'CASH_SELF_APPROVAL': 'Vous ne pouvez pas approuver un rapprochement de caisse que vous avez clôturé. Un approbateur indépendant est requis.',
            'REJECT_REASON_REQUIRED': 'Un motif de rejet est obligatoire.',
            'COUNT_NOT_SUBMITTED': 'Seuls les comptages soumis peuvent être approuvés ou rejetés.',
            'COUNT_NOT_DRAFT': 'Seuls les comptages en brouillon ou rejetés peuvent être modifiés ou soumis.',
            'COUNT_NOT_APPROVED': 'Seuls les comptages approuvés peuvent être comptabilisés.',
            'SESSION_ALREADY_OPEN': 'Une session de caisse est déjà ouverte pour ce compte. Clôturez-la d’abord.',
            'SESSION_NOT_CASH_ACCOUNT': 'Les sessions de caisse ne peuvent être ouvertes que sur des comptes de type CAISSE.',
            'SESSION_NOT_OPEN': 'Seules les sessions ouvertes peuvent être clôturées.',
            'SESSION_NOT_CLOSED': 'Seules les sessions clôturées peuvent être approuvées.',
            'VARIANCE_EXPLANATION_REQUIRED': 'Une explication est obligatoire lorsque le comptage diffère des espèces attendues.',
            'ACCOUNT_INACTIVE': 'Ce compte de caisse est inactif.',
            'TRANSFER_SAME_STORE': 'Les magasins source et destinataire doivent être différents.',
            'TRANSFER_SAME_ACCOUNT': 'Les comptes source et destinataire doivent être différents.',
            'TRANSFER_NOT_DRAFT': 'Seuls les transferts en brouillon peuvent être expédiés ou annulés.',
            'TRANSFER_NOT_DISPATCHED': 'Seuls les transferts expédiés (en transit) peuvent être réceptionnés.',
            'NEGATIVE_QUANTITY': 'Les quantités doivent être supérieures à zéro.',
            'ALREADY_EXISTS': 'Un enregistrement identique existe déjà.',
            'DEFAULT_STORE_LOCKED': 'Le magasin par défaut ne peut pas être désactivé. Choisissez d’abord un autre magasin par défaut.',
            'STORE_HAS_STOCK': 'Ce magasin détient encore du stock. Transférez le stock avant de le désactiver.',
            'BASE_CURRENCY_LOCKED': 'La devise de base ne peut pas être désactivée.',
            'NO_EXCHANGE_RATE': 'Aucun taux de change n’est configuré pour cette paire de devises à cette date.',
            'INVALID_RATE': 'Le taux de change doit être supérieur à zéro.',
            'INVALID_CURRENCY_CODE': 'Le code devise doit comporter 3 lettres (ISO 4217), ex. USD, EUR, RWF.',
            'CURRENCY_NOT_CONFIGURED': 'Cette devise n’est pas configurée pour l’entreprise. Ajoutez-la dans Paramètres → Devises.',
            'INVALID_DECIMALS': 'Le nombre de décimales d’une devise doit être entre 0 et 4.',
            'INVALID_STORE_CODE': 'Le code magasin doit comporter 2 à 20 caractères : lettres, chiffres, point, tiret ou souligné.',
            'INVALID_DATE': 'La date doit être au format AAAA-MM-JJ.',
            'SAME_CURRENCY_PAIR': 'Un taux doit relier deux devises différentes.',
            'UNBALANCED_JOURNAL': 'Écriture déséquilibrée : le total des débits doit être égal au total des crédits.',
            'CUSTOMER_REQUIRED': 'Un client est requis. Pour une vente au comptoir anonyme, activez le mode comptoir.',
            'SUPPLIER_REQUIRED': 'Un fournisseur est requis.'
        }
    },
    'rw': {
        'common': {
            'approved': 'Byemejwe', 'rejected': 'Byahakanwe', 'submitted': 'Byoherejwe',
            'reversed': 'Byakuweho', 'reason': 'Impamvu', 'refresh': 'Ongera Uvugurure'
        },
        'calculator': {
            'title': 'Imashini Ibara',
            'hint': 'Imashini ibara ntiyandika mu ibaruramari — ifasha gusa kubara amafaranga.',
            'clear': 'Gusiba Byose'
        },
        'inventory': {
            'catalog': 'Urutonde rw’Ibicuruzwa', 'products_listed': 'ibicuruzwa biri ku rutonde',
            'low_stock': 'Ububiko Buke', 'normal_stock': 'Bisanzwe', 'out_of_stock': 'Byashize mu Bubiko',
            'tab_stores': 'Amaduka', 'tab_transfers': 'Kwimura',
            'store_code': 'Kode y’Iduka', 'store_name': 'Izina ry’Iduka', 'store_address': 'Aderesi',
            'default_store': 'Iduka Risanzwe', 'add_store': 'Iduka Rishya', 'edit_store': 'Guhindura Iduka',
            'no_stores': 'Nta maduka yanditswe', 'store_saved': 'Iduka ryabitswe',
            'stock_by_store': 'Ububiko kuri Buri Duka', 'company_total_stock': 'Igiteranyo cy’Isosiyete',
            'view_stock': 'Reba ububiko kuri buri duka', 'count_store': 'Iduka Ribarurwa',
            'all_stores': 'Amaduka yose', 'movements_store': 'Iduka',
            'print_count_sheet': 'Capa Urupapuro rwo Kubara', 'count_sheet_title': 'Urupapuro rwo Kubara Ibicuruzwa',
            'counted_by': 'Byabazwe na', 'count_date': 'Itariki yo Kubara', 'count_number': 'Nimero yo Kubara',
            'save_draft': 'Bika Inyandiko y’Iteganywa', 'submit_for_review': 'Ohereza Kwemezwa',
            'approve_count': 'Emeza', 'reject_count': 'Hakana',
            'post_approved_count': 'Injiza Kubara Byemejwe', 'revise_count': 'Gukosora',
            'workflow_hint': 'Uko bikorwa: inyandiko y’iteganywa → kohereza → kwemezwa n’undi wigenga → kwinjiza mu ibaruramari. Uwabaze ntashobora kwemeza kubara kwe ubwe.',
            'variance_reason': 'Impamvu y’Itandukaniro', 'reason_missing': 'Ibyabuze',
            'reason_excess': 'Ibyiyongereye', 'reason_damaged': 'Ibyangiritse', 'reason_other': 'Ibindi',
            'rejection_reason': 'Impamvu yo Guhakana', 'counts_history': 'Amateka yo Kubara',
            'counter': 'Uwabaze', 'submitted_by': 'Byoherejwe na', 'approved_by': 'Byemejwe na',
            'no_counts': 'Nta kubara kwabaye',
            'adjustment_store': 'Iduka Rikorerwa Ihindura',
            'transfers': {
                'transfer_number': 'Nimero yo Kwimura', 'from_store': 'Iduka Bivamo', 'to_store': 'Iduka Bijyamo',
                'new_transfer': 'Kwimura Gushya', 'dispatch_transfer': 'Ohereza',
                'receive_transfer': 'Akira', 'cancel_transfer': 'Sesa Kwimura',
                'requested_qty': 'Ingano Yasabwe', 'received_qty': 'Ingano Yakiriwe',
                'status_in_transit': 'Biri mu Nzira', 'status_completed': 'Byarangiye',
                'transfer_created': 'Kwimura byanditswe', 'no_transfers': 'Nta kwimura kwabaye',
                'add_transfer_line': 'Ongera Umurongo',
                'dispatch_hint': 'Iyo bohereje, bikurwa mu duka bivamo gusa — igiteranyo cy’isosiyete ntigihinduka kugeza byakiriwe.',
                'partial_hint': 'Wemerewe kwakira igice: andika ingano yakiriwe kuri buri murongo.',
                'company_stock_note': 'Kwimura ntibyongera cyangwa ngo bigabanye ububiko bw’isosiyete.',
                'receive_lines_hint': 'Andika ingano yakiriwe (0 bisigare mu nzira):'
            }
        },
        'purchases': {
            'tab_receipts': 'Kwakira Ibicuruzwa', 'goods_receipt': 'Inyandiko yo Kwakira', 'new_receipt': 'Kwakira Gushya',
            'receipt_number': 'Nimero yo Kwakira', 'post_receipt': 'Injiza Kwakira', 'select_po': 'Komande yo Kugura',
            'receipt_store': 'Iduka Byakirirwamo', 'ordered_qty': 'Ingano Yatumijwe', 'received_qty': 'Ingano Yakiriwe',
            'remaining_qty': 'Ingano Isigaye', 'total_quantity': 'Igiteranyo cy’Ingano', 'total_value': 'Igiteranyo cy’Agaciro',
            'receipt_hint': 'Ububiko bwiyongera GUSA iyo inyandiko yo kwakira yinjiye — ntabwo bwiyongera ku gukora igicuruzwa, komande cyangwa fagitire.',
            'direct_receipt_no_po': 'Kwakira bidafite komande',
            'link_receipt_bill': 'Huza n’inyandiko yo kwakira yinjiye', 'no_receipts': 'Nta kwakira kwabaye',
            'status_partially_received': 'Byakiriwe Igice', 'status_received': 'Byakiriwe',
            'receipts_of_po': 'Inyandiko zo kwakira z’iyi komande'
        },
        'banking': {
            'tab_cash': 'Kubara Amafaranga', 'open_session': 'Fungura Kese', 'close_session': 'Funga Kese',
            'approve_session': 'Emeza Igenzura', 'opening_count': 'Kubara Gufungura',
            'closing_count': 'Kubara Gufunga', 'denomination': 'Ubwoko bw’Ifaranga', 'unit_value': 'Agaciro k’Ifaranga Rimwe',
            'counted_total': 'Igiteranyo Cyabazwe', 'expected_cash': 'Amafaranga Yateganyijwe', 'variance': 'Itandukaniro',
            'explanation': 'Ibisobanuro',
            'explanation_hint': 'Ibisobanuro birasabwa iyo amafaranga abazwe atandukanye n’ayateganyijwe. Itandukaniro ntirihita ryandikwa mu ibaruramari.',
            'session_number': 'Nimero y’Igenzura', 'opened_by': 'Byafunguwe na', 'opened_at': 'Itariki yo Gufungura',
            'closed_by': 'Byafunzwe na', 'closed_at': 'Itariki yo Gufunga', 'approved_at': 'Itariki yo Kwemeza',
            'add_denom_line': 'Ongera Ubwoko bw’Ifaranga', 'no_sessions': 'Nta genzura rya kese ryabaye',
            'no_auto_adjust_note': 'Nta guhindura imibare y’ibaruramari byikora: itandukaniro ryandikwa mu nyandiko gusa kugira ngo ryemezwe n’undi wigenga.',
            'cash_hint': 'Kubara amafaranga mu bwoko bwabyo bigereranya ayo mu kese n’ayateganyijwe (yafunguwe + yinjiye − yasohotse by’igihe).',
            'reverse_payment': 'Gukuraho Ubwishyu', 'reversal_reason': 'Impamvu yo Gukuraho',
            'reverse_confirm': 'Uremeza gukuraho ubu bwishyu? Inyandiko y’ibaruramari n’imibare yose bizasubizwa uko byari biri, kandi byandikwe mu mateka.',
            'cash_account': 'Konti ya Kese', 'approval_note': 'Wafunze igenzura ntashobora kuryemeza — hagomba kwemeza undi muntu wigenga.'
        },
        'sales': {
            'walk_in_sale': 'Kugurisha ku Mukiriya Utazwi (Walk-in)',
            'walk_in_hint': 'Nta zina ry’umukiriya rikenerwa; amafaranga yakirwa ako kanya. Kugurisha ku ideni bisaba umukiriya uzwi.',
            'walk_in_badge': 'Walk-in', 'credit_customer_hint': 'Kugurisha ku ideni bisaba umukiriya uzwi.',
            'currency': 'Ubwoko bw’Ifaranga', 'exchange_rate': 'Igipimo cy’Ivunjisha', 'foreign_total': 'Igiteranyo mu Ifaranga Ryakoreshejwe',
            'base_total_note': 'Imibare y’ibaruramari ihindurwa mu ifaranga ry’ibanze hakurikijwe iki gipimo; igiteranyo n’igipimo by’umwimerere birabikwa.',
            'settlement_account': 'Konti Yakirirwaho Amafaranga', 'filter_walk_in': 'Walk-in gusa',
            'search_invoices': 'Shakisha nimero, umukiriya…'
        },
        'settings': {
            'tab_currencies': 'Amafaranga y’Amahanga n’Ibipimo', 'add_currency': 'Ifaranga Rishya',
            'currency_code': 'Kode (ISO 4217)', 'currency_name': 'Izina ry’Ifaranga', 'currency_symbol': 'Ikimenyetso',
            'decimals': 'Imibare Nyuma y’Akadomo', 'decimals_hint': 'Buri faranga rifite imibare yarwo: 0 (JPY), 2 (USD/EUR), 3 (BHD)…',
            'base_currency': 'Ifaranga ry’Ibanze', 'add_rate': 'Igipimo Gishya', 'rate_from': 'Kuva',
            'rate_to': 'Kujya', 'rate_value': 'Igipimo', 'effective_date': 'Itariki Itangiriraho',
            'rate_history': 'Amateka y’Ibipimo', 'no_rates': 'Nta bipimo byanditswe',
            'convert_tester': 'Igerageza ryo Guhindura', 'converted': 'Igisubizo Cyahinduwe',
            'currency_saved': 'Ifaranga ryabitswe', 'rate_saved': 'Igipimo cyabitswe',
            'require_goods_receipt': 'Gusaba inyandiko yo kwakira',
            'require_goods_receipt_hint': 'Nibyemezwa, fagitire y’umugemura yinjizwa gusa ifitanye isano n’inyandiko yo kwakira yinjiye — ububiko ntabwo bwiyongera bidafite kwakira ku mugaragaro.',
            'valuation_hint': 'FIFO ikoresha ibiciro by’ibya mbere byaguzwe; impuzandengo (weighted average) ikoresha impuzandengo y’ibiciro igenda ihinduka.',
            'no_currencies': 'Nta mafaranga yanditswe'
        },
        'errors': {
            'INSUFFICIENT_STOCK': 'Ububiko ntibuhagije kuri iki gikorwa. Reba ingano ihari kuri buri duka.',
            'ALREADY_POSTED': 'Iyi nyandiko yamaze kwinjizwa mu ibaruramari. Kwinjiza kabiri ntibyemewe.',
            'ALREADY_REVERSED': 'Ibi byamaze gukurwaho.',
            'NOTHING_TO_REVERSE': 'Nta nyandiko y’ibaruramari yo gukuraho kuri iyi nyandiko.',
            'FULLY_CREDITED': 'Iyi fagitire yamaze gusubizwa yose. Ntabwo wasubiza kabiri.',
            'OVER_RETURN': 'Ingano usubiza iruta ingano isigaye isubizwa kuri iyi fagitire.',
            'OVER_REFUND': 'Iri subiza ryarenza amafaranga fagitire yemera.',
            'CN_NEEDS_POSTED_INVOICE': 'Inyandiko yo gusubiza ikorwa gusa kuri fagitire yamaze kwinjizwa.',
            'WALKIN_IMMEDIATE_PAYMENT': 'Ibyagurishijwe kuri walk-in bigomba kwishyurwa ako kanya. Ku ideni, koresha umukiriya uzwi.',
            'NOT_WALKIN': 'Iyi fagitire si iya walk-in.',
            'NO_CASH_ACCOUNT': 'Nta kese ikora yagenwe ku bicuruzwa bya walk-in.',
            'GRN_REQUIRED': 'Iyi sosiyete isaba inyandiko yo kwakira yinjiye mbere yo kwinjiza fagitire y’umugemura. Banza wakire ibicuruzwa, ubihuze na fagitire.',
            'GRN_NOT_POSTED': 'Inyandiko yo kwakira ifitanye isano ntiyarinjizwa.',
            'OVER_RECEIPT': 'Kwakira kurengeje ibyatumijwe cyangwa ibyamaze kwakirwa.',
            'PO_CANCELLED': 'Ntabwo wakwakira ibicuruzwa kuri komande yaseswe.',
            'NOTHING_TO_RECEIVE': 'Nta cyo kwakira: imirongo yose yamaze kwakirwa yuzuye.',
            'SERVICE_NOT_STOCKABLE': 'Ibicuruzwa bifatika gusa nibyo byakirwa mu bubiko cyangwa byimurwa hagati y’amaduka (serivisi nta bubiko zigira).',
            'COUNT_SELF_APPROVAL': 'Ntushobora kwemeza kubara wakoze cyangwa wohereje. Hagomba kwemeza undi muntu wigenga.',
            'CASH_SELF_APPROVAL': 'Ntushobora kwemeza igenzura rya kese wafunze. Hagomba kwemeza undi muntu wigenga.',
            'REJECT_REASON_REQUIRED': 'Impamvu yo guhakana irasabwa.',
            'COUNT_NOT_SUBMITTED': 'Kubara kwoherejwe gusa nibyo bishobora kwemezwa cyangwa guhakanwa.',
            'COUNT_NOT_DRAFT': 'Kubara kw’inyandiko y’iteganywa cyangwa kwahakanwe gusa nibyo bishobora guhindurwa cyangwa koherezwa.',
            'COUNT_NOT_APPROVED': 'Kubara kwemejwe gusa nibyo bishobora kwinjizwa.',
            'SESSION_ALREADY_OPEN': 'Igenzura rya kese riracyafunguye kuri iyi konti. Banza urifunge.',
            'SESSION_NOT_CASH_ACCOUNT': 'Amagenzura ya kese akorwa gusa kuri konti zo mu bwoko bwa KESE.',
            'SESSION_NOT_OPEN': 'Igenzura rifunguye gusa niryo rishobora gufungwa.',
            'SESSION_NOT_CLOSED': 'Igenzura ryafunzwe gusa niryo rishobora kwemezwa.',
            'VARIANCE_EXPLANATION_REQUIRED': 'Ibisobanuro birasabwa iyo amafaranga abazwe atandukanye n’ayateganyijwe.',
            'ACCOUNT_INACTIVE': 'Iyi konti ya kese ntabwo ikora.',
            'TRANSFER_SAME_STORE': 'Iduka ibicuruzwa bivamo n’irijyamo bigomba gutandukana.',
            'TRANSFER_SAME_ACCOUNT': 'Konti ivaho n’ijyaho bigomba gutandukana.',
            'TRANSFER_NOT_DRAFT': 'Kwimura kw’inyandiko y’iteganywa gusa nibyo bishobora koherezwa cyangwa guseswa.',
            'TRANSFER_NOT_DISPATCHED': 'Kwimura kwoherejwe (mu nzira) gusa nibyo bishobora kwakirwa.',
            'NEGATIVE_QUANTITY': 'Ingano igomba kuba iruta zeru.',
            'ALREADY_EXISTS': 'Hari inyandiko isa nk’iyi isanzwe ihari.',
            'DEFAULT_STORE_LOCKED': 'Iduka risanzwe ntirishobora gufungwa. Banza uhitamo irindi duka risanzwe.',
            'STORE_HAS_STOCK': 'Iri duka rikifite ibicuruzwa. Bimure mbere yo kurifunga.',
            'BASE_CURRENCY_LOCKED': 'Ifaranga ry’ibanze ntirishobora gukurwaho.',
            'NO_EXCHANGE_RATE': 'Nta gipimo cy’ivunjisha cyanditswe kuri aya mafaranga kuri iyi tariki.',
            'INVALID_RATE': 'Igipimo cy’ivunjisha kigomba kuba kiruta zeru.',
            'INVALID_CURRENCY_CODE': 'Kode y’ifaranga igomba kuba inyuguti 3 (ISO 4217), urugero USD, EUR, RWF.',
            'CURRENCY_NOT_CONFIGURED': 'Iri faranga ntabwo ryanditswe kuri iyi sosiyete. Ryongere mu Ibyagenwe → Amafaranga.',
            'INVALID_DECIMALS': 'Imibare nyuma y’akadomo y’ifaranga igomba kuba hagati ya 0 na 4.',
            'INVALID_STORE_CODE': 'Kode y’iduka igomba kuba inyuguti 2–20: inyuguti, imibare, akadomo, akaruhurirwa cyangwa umurongo wo hasi.',
            'INVALID_DATE': 'Itariki igomba kuba mu buryo YYYY-MM-DD.',
            'SAME_CURRENCY_PAIR': 'Igipimo kigomba guhuza amafaranga abiri atandukanye.',
            'UNBALANCED_JOURNAL': 'Inyandiko y’ibaruramari ntiiringaniye: igiteranyo cya Debite kigomba kungana n’igiteranyo cya Kredite.',
            'CUSTOMER_REQUIRED': 'Umukiriya arasabwa. Ku kugurisha kw’amafaranga ku muntu utazwi, koresha uburyo bwa walk-in.',
            'SUPPLIER_REQUIRED': 'Umugemura arasabwa.'
        }
    }
}


def deep_merge(dst, src, path=''):
    added = 0
    for k, v in src.items():
        key = f'{path}.{k}' if path else k
        if isinstance(v, dict):
            dst.setdefault(k, {})
            added += deep_merge(dst[k], v, key)
        else:
            if k in dst:
                continue  # never overwrite existing translations
            dst[k] = v
            added += 1
    return added


def flatten(d, pre=''):
    for k, v in d.items():
        if isinstance(v, dict):
            yield from flatten(v, pre + k + '.')
        else:
            yield pre + k


def main():
    langs = {}
    for lang in ('en', 'fr', 'rw'):
        p = os.path.join(I18N, f'{lang}.json')
        with open(p, encoding='utf-8') as f:
            langs[lang] = json.load(f)
        n = deep_merge(langs[lang], ADD[lang])
        with open(p, 'w', encoding='utf-8') as f:
            json.dump(langs[lang], f, ensure_ascii=False, indent=2)
            f.write('\n')
        print(f'{lang}: +{n} keys')

    # Parity gate
    sets = {lang: set(flatten(d)) for lang, d in langs.items()}
    problems = 0
    for a in sets:
        for b in sets:
            if a < b:
                missing = sorted(sets[b] - sets[a])
                print(f'MISSING in {a}: {missing}')
                problems += 1
    for lang, d in langs.items():
        for k in sets[lang]:
            node = d
            for part in k.split('.'):
                node = node[part]
            if not isinstance(node, str) or not node.strip():
                print(f'EMPTY value {lang}:{k}')
                problems += 1
    print(f'TOTAL keys: {len(sets["en"])} per language; parity problems: {problems}')
    raise SystemExit(1 if problems else 0)


if __name__ == '__main__':
    main()
