import isoCodes from '../../shared/iso-countries.json';
import currencyDefinitions from '../../shared/currencies.json';
import { LOCALE_BY_LANG } from '../i18n/format.mjs';

export const CURRENCY_CHOICES = Object.freeze(Object.entries(currencyDefinitions)
  .map(([code, details]) => ({ code, ...details })));

// ISO 3166 proper names are localized by the runtime when available. ICU
// presently lacks many Kinyarwanda region names; provide the common local
// countries here and show the ISO code for all others, never a guessed name.
const RW_COUNTRIES = { CM: 'Kameruni', RW: 'U Rwanda', UG: 'U Bugande', FR: 'U Bufaransa', US: 'Leta Zunze Ubumwe za Amerika' };
export function countryChoices(lang = 'en') {
  const locale = LOCALE_BY_LANG[lang] || LOCALE_BY_LANG.en;
  const display = new Intl.DisplayNames([locale, 'en'], { type: 'region' });
  const preferred = ['CM', 'RW', 'UG', 'FR', 'US'];
  const label = (code) => lang === 'rw' && RW_COUNTRIES[code]
    ? RW_COUNTRIES[code] : display.of(code) || code;
  const rest = isoCodes.filter((c) => !preferred.includes(c))
    .sort((a, b) => label(a).localeCompare(label(b), locale));
  return [...preferred, ...rest].map((code) => ({ code, label: `${label(code)} (${code})` }));
}
