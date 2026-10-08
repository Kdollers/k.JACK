// Display formatting. Values arrive as integers (minor units, scaled quantities, basis points);
// nothing is computed with binary floating point for stored values.

const THOUSANDS = { en: ",", fr: "\u202f", rw: "," };
const DECIMAL = { en: ".", fr: ",", rw: "." };

export function money(minor, decimals, lang) {
  const value = Number(minor || 0);
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  const scale = 10 ** (decimals || 0);
  const whole = Math.floor(absolute / scale);
  const fraction = absolute % scale;
  const group = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, THOUSANDS[lang] || ",");
  if (!decimals) return sign + group;
  return `${sign}${group}${DECIMAL[lang] || "."}${String(fraction).padStart(decimals, "0")}`;
}

export function quantity(scaled) {
  const value = Number(scaled || 0);
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  const whole = Math.floor(absolute / 10000);
  const fraction = absolute % 10000;
  const text = fraction ? `${whole}.${String(fraction).padStart(4, "0").replace(/0+$/, "")}` : String(whole);
  return sign + text;
}

export function percent(bps) {
  const value = Number(bps || 0) / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

// Convert a typed decimal text into the same text the server parses (dot decimal, no spaces).
export function cleanDecimal(text) {
  return String(text ?? "").trim().replace(/\s/g, "").replace(",", ".");
}
