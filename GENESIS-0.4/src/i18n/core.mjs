import { LOCALE_BY_LANG } from './format.mjs';

export function lookup(dictionary, path) {
  return path.split('.').reduce((value, segment) => value?.[segment], dictionary);
}

export function interpolate(pattern, variables = {}) {
  return pattern.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (match, name) =>
    Object.hasOwn(variables, name) ? String(variables[name]) : match);
}

export function translateFromDictionaries(key, lang, dictionaries, variables = {}) {
  const value = lookup(dictionaries[lang], key);
  const english = lookup(dictionaries.en, key);
  const pattern = typeof value === 'string' && value.trim() ? value :
    typeof english === 'string' && english.trim() ? english : dictionaries.en.errors.GENERIC;
  return interpolate(pattern, variables);
}

export function pluralCategory(lang, count) {
  // Kinyarwanda has a dedicated one/other form here; do not accidentally use
  // the host's English fallback when it lacks rw-RW plural-rules data.
  if (lang === 'rw') return Number(count) === 1 ? 'one' : 'other';
  return new Intl.PluralRules(LOCALE_BY_LANG[lang] || LOCALE_BY_LANG.en).select(count);
}

export function errorKeyFor(err, catalog) {
  if (err?.code && Object.hasOwn(catalog.errors, err.code)) return `errors.${err.code}`;
  return err instanceof TypeError ? 'errors.NETWORK' : 'errors.GENERIC';
}
