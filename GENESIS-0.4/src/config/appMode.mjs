export const MODES = Object.freeze(['seller', 'administrator', 'network']);
export function appModeFromPath(path) {
  const first = String(path || '/').split('/')[1];
  return MODES.includes(first) ? first : 'general';
}
export const MODE_COLORS = Object.freeze({
  seller: '#DC2626', administrator: '#2563EB', network: '#16A34A', general: '#2563EB'
});
