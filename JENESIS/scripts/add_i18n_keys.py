#!/usr/bin/env python3
"""
add_i18n_keys.py — the sanctioned way to add or change JENESIS translations.

JENESIS ships in English, French and Kinyarwanda. Every user-facing string lives
in src/i18n/{en,fr,rw}.json under the same keys, and tests/i18n-parity.test.js
fails when a key is missing from one language or the files drift apart.

Editing the three JSON files by hand is how they drift. Instead, add the string
to KEYS below (section -> key -> {en, fr, rw}) and run:

    python3 scripts/add_i18n_keys.py

The three dictionaries are rewritten with identical key order, so the parity
test stays green. Existing keys that are not listed here are left untouched.
"""
import collections
import io
import json
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
I18N_DIR = os.path.join(ROOT, 'src', 'i18n')
LANGUAGES = ('en', 'fr', 'rw')

# ---------------------------------------------------------------------------
# KEYS: section -> key -> {en, fr, rw}
# ---------------------------------------------------------------------------
KEYS = {
    'shortcuts': {
        'save': {'en': 'Save the record you are editing', 'fr': 'Enregistrer la fiche en cours', 'rw': 'Bika ibyo urimo guhindura'},
        'edit': {'en': 'Edit the selected record', 'fr': 'Modifier la fiche sélectionnée', 'rw': 'Hindura ibyo wahisemo'},
        'search': {'en': 'Go to the search box on this screen', 'fr': 'Aller à la recherche de cet écran', 'rw': 'Jya mu gushakisha kuri iyi paji'},
        'duplicate': {'en': 'Duplicate the selected document (where the screen allows it)', 'fr': 'Dupliquer le document sélectionné (quand l’écran le permet)', 'rw': 'Koporora inyandiko wahisemo (aho bishoboka)'},
        'submit': {'en': 'Confirm the dialog or submit the form', 'fr': 'Confirmer la boîte de dialogue ou envoyer le formulaire', 'rw': 'Emeza ikiganiro cyangwa ohereza ifishi'},

        'open_sales': {'en': 'Open Sales', 'fr': 'Ouvrir les Ventes', 'rw': 'Fungura Ubucuruzi'},
        'new_receipt': {'en': 'Create a new sales receipt', 'fr': 'Créer un nouveau reçu de vente', 'rw': 'Kora inyemezabwishyu nshya yo kugurisha'},
        'search_customers': {'en': 'Open Customers and search', 'fr': 'Ouvrir les Clients et rechercher', 'rw': 'Fungura Abakiriya ushakishe'},
        'open_purchases': {'en': 'Open Purchases', 'fr': 'Ouvrir les Achats', 'rw': 'Fungura Kugura'},
        'search_suppliers': {'en': 'Open Suppliers and search', 'fr': 'Ouvrir les Fournisseurs et rechercher', 'rw': 'Fungura Abaduha ibicuruzwa ushakishe'},
        'new_purchase': {'en': 'Create a new purchase document', 'fr': 'Créer un nouveau document d’achat', 'rw': 'Kora inyandiko nshya yo kugura'},
        'open_inventory': {'en': 'Open Inventory', 'fr': 'Ouvrir le Stock', 'rw': 'Fungura Ububiko'},
        'search_products': {'en': 'Open Inventory and search product codes', 'fr': 'Ouvrir le Stock et rechercher un code produit', 'rw': 'Fungura Ububiko ushakishe kode y’igicuruzwa'},
        'stock_transfers': {'en': 'Open stock transfers', 'fr': 'Ouvrir les transferts de stock', 'rw': 'Fungura imyimurire y’ububiko'},
        'open_accounting': {'en': 'Open Accounting', 'fr': 'Ouvrir la Comptabilité', 'rw': 'Fungura Ibaruramari'},
        'open_banking': {'en': 'Open Banking & Cash', 'fr': 'Ouvrir Banque et Caisse', 'rw': 'Fungura Banki n’amafaranga'},
        'open_ledger': {'en': 'Open the General Ledger', 'fr': 'Ouvrir le Grand Livre', 'rw': 'Fungura Igitabo kinini'},
        'open_reports': {'en': 'Open Reports', 'fr': 'Ouvrir les Rapports', 'rw': 'Fungura Raporo'},

        'calculator': {'en': 'Open or close the calculator', 'fr': 'Ouvrir ou fermer la calculatrice', 'rw': 'Fungura cyangwa ufunge imashini ibara'},
        'messenger': {'en': 'Open or close JENESIS Messenger', 'fr': 'Ouvrir ou fermer JENESIS Messenger', 'rw': 'Fungura cyangwa ufunge JENESIS Messenger'},
        'theme': {'en': 'Cycle the theme: Light → Dark → System', 'fr': 'Changer de thème : Clair → Sombre → Système', 'rw': 'Hindura imiterere: Umucyo → Umwijima → Sisitemu'},
        'language': {'en': 'Switch the interface language (English → Français → Kinyarwanda)', 'fr': 'Changer la langue (English → Français → Kinyarwanda)', 'rw': 'Hindura ururimi (English → Français → Kinyarwanda)'},
        'edit_none': {'en': 'There is no record to edit on this screen.', 'fr': 'Aucune fiche à modifier sur cet écran.', 'rw': 'Nta cyo guhindura kuri iyi paji.'},
        'duplicate_none': {'en': 'Select a document first, then press Ctrl+D to duplicate it.', 'fr': 'Sélectionnez un document, puis Ctrl+D pour le dupliquer.', 'rw': 'Hitamo inyandiko mbere, hanyuma ukande Ctrl+D kuyikoporora.'},
        'unavailable_in_app': {'en': 'That screen is not part of {app}.', 'fr': 'Cet écran ne fait pas partie de {app}.', 'rw': 'Iyo paji ntiri muri {app}.'},
    },
    'identity': {
        'product_name': {'en': 'JENESIS', 'fr': 'JENESIS', 'rw': 'JENESIS'},
        'developed_by': {'en': 'Created and developed by KAYIGANWA JACQUES.', 'fr': 'Créé et développé par KAYIGANWA JACQUES.', 'rw': 'Byakozwe na KAYIGANWA JACQUES.'},
        'choose_app': {'en': 'Choose your application', 'fr': 'Choisissez votre application', 'rw': 'Hitamo porogaramu yawe'},
        'switch_app': {'en': 'Switch application', 'fr': 'Changer d’application', 'rw': 'Guhindura porogaramu'},

        'seller_name': {'en': 'JENESIS Seller', 'fr': 'JENESIS Vendeur', 'rw': 'JENESIS Umucuruzi'},
        'seller_short': {'en': 'Seller', 'fr': 'Vente', 'rw': 'Ubucuruzi'},
        'seller_purpose': {'en': 'Sell, print receipts and follow up customers. Everything a sales counter needs, nothing else.', 'fr': 'Vendre, imprimer les reçus et suivre les clients. Tout ce dont un comptoir de vente a besoin, rien de plus.', 'rw': 'Kugurisha, gucapa inyemezabwishyu no gukurikirana abakiriya. Ibyo ubucuruzi bukenera gusa.'},
        'seller_colour': {'en': 'Red', 'fr': 'Rouge', 'rw': 'Umutuku'},

        'maintenance_name': {'en': 'JENESIS Maintenance', 'fr': 'JENESIS Maintenance', 'rw': 'JENESIS Kubungabunga'},
        'maintenance_short': {'en': 'Maintenance', 'fr': 'Maintenance', 'rw': 'Kubungabunga'},
        'maintenance_purpose': {'en': 'Stores and stock, the service, the network, backups, checks and troubleshooting.', 'fr': 'Dépôts et stock, le service, le réseau, les sauvegardes, les contrôles et le dépannage.', 'rw': 'Ububiko, serivisi, urusobe, ubwirinzi, isuzuma no gukemura ibibazo.'},
        'maintenance_colour': {'en': 'Green', 'fr': 'Vert', 'rw': 'Icyatsi'},

        'admin_name': {'en': 'JENESIS Admin', 'fr': 'JENESIS Admin', 'rw': 'JENESIS Umuyobozi'},
        'admin_short': {'en': 'Admin', 'fr': 'Admin', 'rw': 'Ubuyobozi'},
        'admin_purpose': {'en': 'Accounting, purchases, banking, reports, taxes, users, settings and the whole company record.', 'fr': 'Comptabilité, achats, banque, rapports, taxes, utilisateurs, paramètres et tout le dossier de l’entreprise.', 'rw': 'Ibaruramari, kugura, banki, raporo, imisoro, abakoresha, amahitamo n’amateka y’isosiyete.'},
        'admin_colour': {'en': 'Blue', 'fr': 'Bleu', 'rw': 'Ubururu'},
    },
    'launcher': {
        'title': {'en': 'Choose your JENESIS application', 'fr': 'Choisissez votre application JENESIS', 'rw': 'Hitamo porogaramu ya JENESIS'},
        'intro': {'en': 'JENESIS is three applications that share the same books. Open the one that matches your work — the desktop shortcuts open it directly.', 'fr': 'JENESIS est trois applications qui partagent les mêmes livres. Ouvrez celle qui correspond à votre travail — les raccourcis du bureau l’ouvrent directement.', 'rw': 'JENESIS ni porogaramu eshatu zisangira ibitabo bimwe. Fungura ijyanye n’akazi kawe — uburyo bwo kuri desktop burayifungura.'},
        'open': {'en': 'Open', 'fr': 'Ouvrir', 'rw': 'Fungura'},
        'remember': {'en': 'Remember my choice and open this application next time', 'fr': 'Mémoriser mon choix et ouvrir cette application la prochaine fois', 'rw': 'Ibuka icyo nahisemo maze ufungure iyi porogaramu ubutaha'},
    },
    'maintenance': {
        'title': {'en': 'Maintenance', 'fr': 'Maintenance', 'rw': 'Kubungabunga'},
        'intro': {'en': 'The health of JENESIS on this computer: the service, the database, the network, backups, checks and the log.', 'fr': 'La santé de JENESIS sur cet ordinateur : le service, la base de données, le réseau, les sauvegardes, les contrôles et le journal.', 'rw': 'Imimerere ya JENESIS kuri iyi mudasobwa: serivisi, ububiko, urusobe, ubwirinzi, isuzuma n’inyandiko.'},

        'service': {'en': 'Service and database', 'fr': 'Service et base de données', 'rw': 'Serivisi n’ububiko'},
        'version': {'en': 'Version', 'fr': 'Version', 'rw': 'Verisiyo'},
        'started': {'en': 'Service started', 'fr': 'Service démarré', 'rw': 'Serivisi yatangiye'},
        'database': {'en': 'Database file', 'fr': 'Fichier de la base', 'rw': 'Dosiye y’ububiko'},
        'database_size': {'en': 'Database size', 'fr': 'Taille de la base', 'rw': 'Ingano y’ububiko'},
        'data_folder': {'en': 'Data folder', 'fr': 'Dossier de données', 'rw': 'Ububiko bw’amakuru'},
        'backups_kept': {'en': 'Backups kept', 'fr': 'Sauvegardes conservées', 'rw': 'Ubwirinzi bubitse'},

        'network': {'en': 'Network', 'fr': 'Réseau', 'rw': 'Urusobe'},
        'allow_lan_hint': {'en': 'Off by default: only this computer can reach JENESIS. Turn it on to let other computers on the same network use this service and exchange Messenger messages — Windows will ask you to allow it in the firewall.', 'fr': 'Désactivé par défaut : seul cet ordinateur atteint JENESIS. Activez-le pour que d’autres ordinateurs du même réseau utilisent ce service et échangent des messages — Windows demandera l’autorisation dans le pare-feu.', 'rw': 'Bizimye ubusanzwe: iyi mudasobwa yonyine ni yo igera kuri JENESIS. Bikureho kugira ngo izindi mudasobwa zo ku rusobe rumwe zikoreshe iyi serivisi kandi zohererezanye ubutumwa — Windows izagusaba uburenganzira.'},
        'this_computer': {'en': 'This computer', 'fr': 'Cet ordinateur', 'rw': 'Iyi mudasobwa'},
        'enable_lan': {'en': 'Allow other computers on this network', 'fr': 'Autoriser les autres ordinateurs du réseau', 'rw': 'Emera izindi mudasobwa ku rusobe'},
        'disable_lan': {'en': 'Keep JENESIS on this computer only', 'fr': 'Limiter JENESIS à cet ordinateur', 'rw': 'Gumisha JENESIS kuri iyi mudasobwa gusa'},
        'lan_on_restarted': {'en': 'Other computers on this network can now reach JENESIS.', 'fr': 'Les autres ordinateurs du réseau peuvent maintenant atteindre JENESIS.', 'rw': 'Izindi mudasobwa ku rusobe zishobora kugera kuri JENESIS.'},
        'lan_off_restarted': {'en': 'JENESIS answers on this computer only again.', 'fr': 'JENESIS ne répond plus que sur cet ordinateur.', 'rw': 'JENESIS isubije kuri iyi mudasobwa gusa.'},
        'restart_needed': {'en': 'Saved. Close and start JENESIS again for the change to take effect.', 'fr': 'Enregistré. Fermez et redémarrez JENESIS pour appliquer le changement.', 'rw': 'Birabitswe. Funga hanyuma wonge gutangiza JENESIS kugira ngo bihinduke.'},

        'connect_another': {'en': 'Connect this computer to another JENESIS computer', 'fr': 'Connecter cet ordinateur à un autre ordinateur JENESIS', 'rw': 'Huza iyi mudasobwa n’indi mudasobwa ya JENESIS'},
        'connect_hint': {'en': 'Leave empty to use JENESIS on this computer. To share one company with another computer, type its address (shown on that computer, in this screen) and test it first.', 'fr': 'Laissez vide pour utiliser JENESIS sur cet ordinateur. Pour partager une entreprise avec un autre ordinateur, saisissez son adresse (affichée sur cet ordinateur, dans cet écran) et testez-la d’abord.', 'rw': 'Siga ubusa kugira ngo ukoreshe JENESIS kuri iyi mudasobwa. Kugira ngo musangire isosiyete n’indi mudasobwa, andika aderesi yayo (igaragara kuri iyo mudasobwa, hano) maze ubanze uyigerageze.'},
        'address_placeholder': {'en': 'http://192.168.1.20:3000', 'fr': 'http://192.168.1.20:3000', 'rw': 'http://192.168.1.20:3000'},
        'test': {'en': 'Test', 'fr': 'Tester', 'rw': 'Gerageza'},
        'test_ok': {'en': 'A JENESIS service answered at that address.', 'fr': 'Un service JENESIS a répondu à cette adresse.', 'rw': 'Serivisi ya JENESIS yasubije kuri iyo aderesi.'},
        'test_bad': {'en': 'Something else is answering at that address.', 'fr': 'Autre chose répond à cette adresse.', 'rw': 'Ikindi kintu cyasubije kuri iyo aderesi.'},
        'test_failed': {'en': 'No JENESIS service answered', 'fr': 'Aucun service JENESIS n’a répondu', 'rw': 'Nta serivisi ya JENESIS yasubije'},
        'apply': {'en': 'Use this address', 'fr': 'Utiliser cette adresse', 'rw': 'Koresha iyi aderesi'},
        'using_remote': {'en': 'JENESIS now uses the service at {url}', 'fr': 'JENESIS utilise maintenant le service à {url}', 'rw': 'JENESIS ikoresha serivisi kuri {url}'},
        'using_local': {'en': 'JENESIS now uses the service on this computer', 'fr': 'JENESIS utilise maintenant le service de cet ordinateur', 'rw': 'JENESIS ikoresha serivisi y’iyi mudasobwa'},

        'backups': {'en': 'Backups', 'fr': 'Sauvegardes', 'rw': 'Ubwirinzi'},
        'backups_hint': {'en': 'A verified copy of the whole database file, kept in your JENESIS data folder. Copy it to a USB stick or a cloud folder for real protection.', 'fr': 'Une copie vérifiée de tout le fichier de base, conservée dans votre dossier JENESIS. Copiez-la sur une clé USB ou un dossier cloud pour une vraie protection.', 'rw': 'Kopi yemewe ya dosiye yose y’ububiko, ibitswe mu bubiko bwa JENESIS. Yikoporore kuri USB cyangwa mu bubiko bwo ku kicu kugira ngo urindwe by’ukuri.'},
        'create_backup': {'en': 'Create a backup copy now', 'fr': 'Créer une sauvegarde maintenant', 'rw': 'Kora ubwirinzi nonaha'},
        'backup_done': {'en': 'Backup written: {file}', 'fr': 'Sauvegarde écrite : {file}', 'rw': 'Ubwirinzi bwanditswe: {file}'},

        'checks': {'en': 'Checks', 'fr': 'Contrôles', 'rw': 'Isuzuma'},
        'run_check': {'en': 'Run the database check', 'fr': 'Lancer la vérification', 'rw': 'Kora isuzuma ry’ububiko'},
        'check_ok': {'en': 'The database is consistent.', 'fr': 'La base est cohérente.', 'rw': 'Ububiko buruzuye.'},
        'check_problem': {'en': 'The check reported a problem — restore a backup and contact maintenance.', 'fr': 'Le contrôle a signalé un problème — restaurez une sauvegarde et contactez la maintenance.', 'rw': 'Isuzuma ryerekanye ikibazo — garuza ubwirinzi hanyuma ubaze ushinzwe kubungabunga.'},
        'foreign_keys': {'en': 'Broken links', 'fr': 'Liens rompus', 'rw': 'Isano zacitse'},
        'posted_entries': {'en': 'Posted entries', 'fr': 'Écritures validées', 'rw': 'Ibyanditswe byemejwe'},

        'logs': {'en': 'Logs', 'fr': 'Journaux', 'rw': 'Inyandiko'},
        'read_logs': {'en': 'Read the last lines', 'fr': 'Lire les dernières lignes', 'rw': 'Soma imirongo ya nyuma'},
    }
}


def load(path):
    with io.open(path, encoding='utf-8') as fh:
        return json.load(fh, object_pairs_hook=collections.OrderedDict)


def main():
    if not os.path.isdir(I18N_DIR):
        print('Cannot find %s' % I18N_DIR, file=sys.stderr)
        return 1

    for lang in LANGUAGES:
        path = os.path.join(I18N_DIR, '%s.json' % lang)
        data = load(path)
        for section, keys in KEYS.items():
            bucket = data.setdefault(section, collections.OrderedDict())
            for key, values in keys.items():
                bucket[key] = values[lang]
        with io.open(path, 'w', encoding='utf-8') as fh:
            fh.write(json.dumps(data, ensure_ascii=False, indent=2))
            fh.write('\n')
        print('updated %s' % os.path.relpath(path, ROOT))
    return 0


if __name__ == '__main__':
    sys.exit(main())
