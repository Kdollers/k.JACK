'use strict';
// Native menus and fatal dialogs must work even if the React service cannot
// start. Keep these tiny catalogs independent of the frontend and its bundler.
const messages = {
  en: {
    file: 'File', edit: 'Edit', view: 'View', window: 'Window', quit: 'Quit',
    undo: 'Undo', redo: 'Redo', cut: 'Cut', copy: 'Copy', paste: 'Paste', selectAll: 'Select all',
    reload: 'Reload', fullscreen: 'Toggle full screen', devTools: 'Developer tools',
    minimize: 'Minimize', close: 'Close',
    backendStopped: 'The GENESIS accounting service stopped unexpectedly. Close and restart GENESIS.',
    startupFailed: 'GENESIS could not start its local accounting service. Close the application and check the backup and log before trying again.',
    logFile: 'Diagnostic log:'
  },
  fr: {
    file: 'Fichier', edit: 'Édition', view: 'Affichage', window: 'Fenêtre', quit: 'Quitter',
    undo: 'Annuler', redo: 'Rétablir', cut: 'Couper', copy: 'Copier', paste: 'Coller', selectAll: 'Tout sélectionner',
    reload: 'Recharger', fullscreen: 'Basculer en plein écran', devTools: 'Outils de développement',
    minimize: 'Réduire', close: 'Fermer',
    backendStopped: 'Le service comptable GENESIS s’est arrêté de façon inattendue. Fermez et redémarrez GENESIS.',
    startupFailed: 'GENESIS n’a pas pu démarrer son service comptable local. Fermez l’application, vérifiez la sauvegarde et le journal avant de réessayer.',
    logFile: 'Journal de diagnostic :'
  },
  rw: {
    file: 'Dosiye', edit: 'Guhindura', view: 'Kureba', window: 'Idirishya', quit: 'Sohoka',
    undo: 'Subiza inyuma', redo: 'Subiramo', cut: 'Kata', copy: 'Koporora', paste: 'Omekaho', selectAll: 'Hitamo byose',
    reload: 'Ongera ufungure', fullscreen: 'Hindura uko ecran yerekana', devTools: 'Ibikoresho by’abakora porogaramu',
    minimize: 'Gabanya idirishya', close: 'Funga',
    backendStopped: 'Serivisi y’ibaruramari ya GENESIS yahagaze bitunguranye. Funga GENESIS wongere uyitangire.',
    startupFailed: 'GENESIS ntiyashoboye gutangiza serivisi yayo y’ibaruramari. Funga porogaramu, usuzume kopi y’ububiko bw’amakuru n’amateka y’ikibazo mbere yo kongera kugerageza.',
    logFile: 'Dosiye y’amateka y’ikibazo:'
  }
};
const VALID_LANGUAGES = Object.freeze(Object.keys(messages));
function languageFor(locale) {
  const code = String(locale || '').toLowerCase().split(/[-_]/)[0];
  return VALID_LANGUAGES.includes(code) ? code : 'en';
}
module.exports = { messages, VALID_LANGUAGES, languageFor };
