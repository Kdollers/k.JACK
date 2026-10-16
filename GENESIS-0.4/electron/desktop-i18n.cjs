'use strict';
// Native menus and fatal dialogs must work even if the React service cannot
// start. Keep these tiny catalogs independent of the frontend and its bundler.
const messages = {
  en: {
    file: 'File', edit: 'Edit', view: 'View', window: 'Window', quit: 'Quit',
    undo: 'Undo', redo: 'Redo', cut: 'Cut', copy: 'Copy', paste: 'Paste', selectAll: 'Select all',
    reload: 'Reload', fullscreen: 'Toggle full screen', devTools: 'Developer tools',
    minimize: 'Minimize', close: 'Close',
    backendStopped: 'The JENESIS accounting service stopped unexpectedly. Close and restart JENESIS.',
    startupFailed: 'JENESIS could not start its local accounting service. Close the application and check the backup and log before trying again.',
    logFile: 'Diagnostic log:',
    existingTitle: 'Existing GENESIS data found',
    existingMessage: 'Choose which installation to open.',
    existingDetail: 'An earlier GENESIS database exists on this computer. Keep using it to retain access to its registered accounts and records. If you have never set up an administrator for your new business, you may instead start a separate, empty JENESIS installation. The old data will remain untouched and will NOT be imported.',
    useExisting: 'Use existing GENESIS records',
    startSeparate: 'Start separate JENESIS installation',
    cancel: 'Cancel',
    confirmTitle: 'Start a separate installation?',
    confirmMessage: 'Your new JENESIS database will start empty.',
    confirmDetail: 'Existing GENESIS accounts, business records and backups stay in the old directory; they will not appear in the new installation. There is no automatic merge or password reset. For access to old records, use the existing sign-in or authorized offline recovery with a verified backup.',
    confirmNew: 'Create separate empty installation',
    switchTitle: 'Switch installations?',
    switchMessage: 'The other database will be opened after JENESIS restarts.',
    switchDetail: 'Both databases, accounts, business records and backups remain separate and unchanged. Sign in with an account from the installation you are switching to. Nothing will be merged or reset.',
    switchButton: 'Switch installation'
  },
  fr: {
    file: 'Fichier', edit: 'Édition', view: 'Affichage', window: 'Fenêtre', quit: 'Quitter',
    undo: 'Annuler', redo: 'Rétablir', cut: 'Couper', copy: 'Copier', paste: 'Coller', selectAll: 'Tout sélectionner',
    reload: 'Recharger', fullscreen: 'Basculer en plein écran', devTools: 'Outils de développement',
    minimize: 'Réduire', close: 'Fermer',
    backendStopped: 'Le service comptable JENESIS s’est arrêté de façon inattendue. Fermez et redémarrez JENESIS.',
    startupFailed: 'JENESIS n’a pas pu démarrer son service comptable local. Fermez l’application, vérifiez la sauvegarde et le journal avant de réessayer.',
    logFile: 'Journal de diagnostic :',
    existingTitle: 'Données GENESIS existantes détectées',
    existingMessage: 'Choisissez l’installation à ouvrir.',
    existingDetail: 'Une ancienne base GENESIS se trouve sur cet ordinateur. Continuez à l’utiliser pour conserver l’accès à ses comptes et données. Si vous n’avez jamais créé d’administrateur pour votre nouvelle entreprise, vous pouvez démarrer une installation JENESIS distincte et vide. Les anciennes données resteront intactes et ne seront PAS importées.',
    useExisting: 'Utiliser les données GENESIS existantes',
    startSeparate: 'Démarrer une installation JENESIS distincte',
    cancel: 'Annuler',
    confirmTitle: 'Démarrer une installation distincte ?',
    confirmMessage: 'Votre nouvelle base JENESIS sera vide.',
    confirmDetail: 'Les comptes, données et sauvegardes GENESIS restent dans l’ancien dossier et n’apparaîtront pas dans la nouvelle installation. Aucune fusion ni réinitialisation de mot de passe n’est effectuée. Pour accéder aux anciennes données, utilisez la connexion existante ou une récupération hors ligne autorisée avec une sauvegarde vérifiée.',
    confirmNew: 'Créer une installation distincte et vide',
    switchTitle: 'Changer d’installation ?',
    switchMessage: 'L’autre base sera ouverte après le redémarrage de JENESIS.',
    switchDetail: 'Les deux bases, comptes, données et sauvegardes restent séparés et inchangés. Connectez-vous avec un compte de l’installation choisie. Aucune fusion ni réinitialisation ne sera effectuée.',
    switchButton: 'Changer d’installation'
  },
  rw: {
    file: 'Dosiye', edit: 'Guhindura', view: 'Kureba', window: 'Idirishya', quit: 'Sohoka',
    undo: 'Subiza inyuma', redo: 'Subiramo', cut: 'Kata', copy: 'Koporora', paste: 'Omekaho', selectAll: 'Hitamo byose',
    reload: 'Ongera ufungure', fullscreen: 'Hindura uko ecran yerekana', devTools: 'Ibikoresho by’abakora porogaramu',
    minimize: 'Gabanya idirishya', close: 'Funga',
    backendStopped: 'Serivisi y’ibaruramari ya JENESIS yahagaze bitunguranye. Funga JENESIS wongere uyitangire.',
    startupFailed: 'JENESIS ntiyashoboye gutangiza serivisi yayo y’ibaruramari. Funga porogaramu, usuzume kopi y’ububiko bw’amakuru n’amateka y’ikibazo mbere yo kongera kugerageza.',
    logFile: 'Dosiye y’amateka y’ikibazo:',
    existingTitle: 'Habonetse amakuru ya GENESIS yari asanzweho',
    existingMessage: 'Hitamo ububiko bw’amakuru ushaka gufungura.',
    existingDetail: 'Kuri iyi mudasobwa hari ububiko bwa GENESIS bwo hambere. Bukoreshe niba ushaka kugumana konti n’amakuru byabubitswemo. Niba utarashyiraho umuyobozi w’ikigo cyawe gishya, ushobora gutangiza JENESIS nshya mu bubiko butandukanye kandi butarimo amakuru. Amakuru ya kera ntazahindurwa kandi NTAZIMURWA.',
    useExisting: 'Koresha amakuru ya GENESIS asanzweho',
    startSeparate: 'Tangira JENESIS nshya itandukanye',
    cancel: 'Reka',
    confirmTitle: 'Utangize JENESIS nshya itandukanye?',
    confirmMessage: 'Ububiko bushya bwa JENESIS buzaba butarimo amakuru.',
    confirmDetail: 'Konti, amakuru y’ubucuruzi na kopi z’ububiko bya GENESIS biguma mu bubiko bwa kera; ntibizagaragara mu bushya. Nta guhuza ububiko cyangwa gusubiraho ijambo ry’ibanga bikorwa. Niba ukeneye amakuru ya kera, injira uko wari usanzwe winjira cyangwa usabe ubufasha bwemewe bwo kuyagarura ukoresheje kopi yagenzuwe.',
    confirmNew: 'Tangiza ububiko bushya butandukanye',
    switchTitle: 'Uhinduye ububiko ukoresha?',
    switchMessage: 'Ubundi bubiko buzafungurwa JENESIS imaze kongera gutangira.',
    switchDetail: 'Ububiko bwombi, konti, amakuru y’ubucuruzi na kopi zabyo biguma bitandukanye kandi ntibihinduka. Injira ukoresheje konti y’ububiko wahisemo. Nta guhuza cyangwa gusubiraho amakuru bikorwa.',
    switchButton: 'Hindura ububiko'
  }
};
const VALID_LANGUAGES = Object.freeze(Object.keys(messages));
function languageFor(locale) {
  const code = String(locale || '').toLowerCase().split(/[-_]/)[0];
  return VALID_LANGUAGES.includes(code) ? code : 'en';
}
module.exports = { messages, VALID_LANGUAGES, languageFor };
