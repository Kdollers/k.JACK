// Small DOM helpers. Event handlers are attached with addEventListener (no inline scripts),
// which keeps the page compatible with the server's Content-Security-Policy.

export function h(tag, attrs, ...children) {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (name === "class") element.className = value;
    else if (name.startsWith("on")) element.addEventListener(name.slice(2), value);
    else if (name === "value") element.value = value;
    else if (name === "checked") element.checked = Boolean(value);
    else if (name === "selected") element.selected = Boolean(value);
    else element.setAttribute(name, value === true ? "" : String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child === undefined || child === null || child === false) continue;
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return element;
}

export function clear(element) {
  element.replaceChildren();
}

export function notice(message, kind) {
  return h("div", { class: `notice ${kind === "err" ? "err" : "ok"}`, role: "status" }, message);
}

// Table from column definitions: {label, render(row) -> node|text, num}
export function table(columns, rows, emptyText) {
  const head = h("tr", null, columns.map((c) => h("th", { class: c.num ? "num" : "" }, c.label)));
  const body = rows.length
    ? rows.map((row) => h("tr", { class: row.__class || "" },
        columns.map((c) => h("td", { class: c.num ? "num" : "" }, c.render ? c.render(row) : row[c.key]))))
    : [h("tr", null, h("td", { colspan: columns.length, class: "muted" }, emptyText))];
  return h("table", null, h("thead", null, head), h("tbody", null, body));
}

export function field(label, control) {
  return h("div", { class: "field" }, h("label", null, label), control);
}

export function checkField(label, control) {
  return h("div", { class: "field check" }, control, h("label", null, label));
}

export function select(options, value, attrs) {
  return h("select", attrs || {},
    options.map((o) => h("option", { value: o.value, selected: String(o.value) === String(value ?? "") }, o.label)));
}
