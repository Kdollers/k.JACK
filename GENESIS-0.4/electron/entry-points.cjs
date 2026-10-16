'use strict';
// Windows shortcuts use these three validated flags. One Electron process owns
// one backend; subsequent launches request a new window in the desired mode.
const MODES = Object.freeze(['seller', 'administrator', 'network']);
function modeFromArgs(argv) {
  const flag = argv.find((arg) => arg.startsWith('--jenesis-mode='));
  if (!flag) return 'administrator';
  const mode = flag.slice('--jenesis-mode='.length);
  if (!MODES.includes(mode)) throw new Error('Unknown JENESIS application mode');
  return mode;
}
function modeUrl(baseUrl, mode) {
  if (!MODES.includes(mode)) throw new Error('Unknown JENESIS application mode');
  return `${baseUrl.replace(/\/+$/, '')}/${mode}`;
}
module.exports = { MODES, modeFromArgs, modeUrl };
