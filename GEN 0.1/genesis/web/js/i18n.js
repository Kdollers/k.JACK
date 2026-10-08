// Translation lookup. The dictionary comes from the server; a missing key is shown as the key
// itself, which is visible during testing. The test suite fails if any used key is missing.

let dictionary = {};

export function setDictionary(values) {
  dictionary = values || {};
}

export function t(key, params) {
  let text = Object.prototype.hasOwnProperty.call(dictionary, key) ? dictionary[key] : key;
  for (const [name, value] of Object.entries(params || {})) {
    text = text.split(`{${name}}`).join(String(value));
  }
  return text;
}

// Report cells may hold a translation key instead of text: {"key": "report_total"}.
export function cellText(value) {
  if (value && typeof value === "object" && "key" in value) return t(value.key);
  return value ?? "";
}
