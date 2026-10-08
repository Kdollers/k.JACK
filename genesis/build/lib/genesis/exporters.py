"""Report export: CSV (UTF-8 with BOM for Excel), XLSX, PDF and printable HTML.

PDF and XLSX are written with the standard library only (no third-party
packages), so the application stays installable offline.
"""

import csv
import html
import io
import zipfile
from datetime import datetime, timezone

from .i18n import translate
from .locales import TRANSLATIONS
from .money import format_money, format_qty, money_to_decimal_string


NUMERIC_KINDS = ("money", "qty", "percent", "int")


def _label(key, lang):
    """Translate a dictionary key. Non-key text is returned unchanged."""
    if key in TRANSLATIONS["en"]:
        return translate(key, lang)
    return "" if key is None else str(key)


def _display(value, kind, decimals, lang):
    """Human text for a cell (locale-formatted money, booleans as yes/no)."""
    if value is None:
        return ""
    if isinstance(value, dict) and "key" in value:
        return _label(value["key"], lang)
    if kind == "money":
        return format_money(int(value), decimals, lang)
    if kind == "qty":
        return format_qty(int(value))
    if kind == "percent":
        return f"{int(value) / 100:.2f}%"
    if kind == "int":
        return str(value)
    if isinstance(value, bool):
        return translate("yes" if value else "no", lang)
    return str(value)


def _plain_number(value, kind, decimals):
    """Dot-decimal numeric text for spreadsheets and CSV; None for text columns."""
    if value is None or kind not in NUMERIC_KINDS or isinstance(value, dict):
        return None
    number = int(value)
    if kind == "money":
        return money_to_decimal_string(number, decimals)
    if kind == "qty":
        return format_qty(number)
    if kind == "percent":
        sign = "-" if number < 0 else ""
        whole, frac = divmod(abs(number), 100)
        return f"{sign}{whole}.{frac:02d}"
    return str(number)


def _table(report, lang):
    """Return (header, body) where body is a list of (kind, cells).

    Each cell is a (display_text, plain_number_or_None) pair.
    """
    columns = report["columns"]
    decimals = report["decimals"]
    header = [_label(column["label_key"], lang) for column in columns]
    body = []
    for row in report["rows"]:
        cells = []
        for column in columns:
            value = row.get(column["key"])
            kind = column["type"]
            cells.append((_display(value, kind, decimals, lang), _plain_number(value, kind, decimals)))
        body.append((row.get("kind", "line"), cells))
    return header, body


def report_title(report, lang):
    return _label(report["title_key"], lang)


def to_csv(report, lang="en"):
    """UTF-8 CSV with a BOM so Excel detects the encoding. Numbers are plain dot-decimal text."""
    header, body = _table(report, lang)
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow([report_title(report, lang)])
    writer.writerow([])
    writer.writerow(header)
    for _kind, cells in body:
        writer.writerow([plain if plain is not None else text for text, plain in cells])
    return ("\ufeff" + buffer.getvalue()).encode("utf-8")


def to_xlsx(report, lang="en"):
    header, body = _table(report, lang)
    rows = [[(report_title(report, lang), None)], [], [(label, None) for label in header]]
    rows += [cells for _kind, cells in body]
    return _workbook_bytes(_sheet_name(report_title(report, lang)), rows)


_INVALID_SHEET_CHARS = "[]:*?/\\"


def _sheet_name(title):
    cleaned = "".join("-" if ch in _INVALID_SHEET_CHARS else ch for ch in title).strip()
    return (cleaned or "Report")[:31]


def _xml_escape(text):
    return (str(text).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def _column_letter(index):
    letters = ""
    index += 1
    while index:
        index, remainder = divmod(index - 1, 26)
        letters = chr(65 + remainder) + letters
    return letters


def _workbook_bytes(sheet_name, rows):
    """Minimal single-sheet .xlsx. Each row is a list of (text, numeric_text_or_None)."""
    sheet_rows = []
    for row_index, row in enumerate(rows, start=1):
        cells = []
        for col_index, (text, number) in enumerate(row):
            ref = f"{_column_letter(col_index)}{row_index}"
            if number is not None:
                cells.append(f'<c r="{ref}"><v>{_xml_escape(number)}</v></c>')
            else:
                cells.append(f'<c r="{ref}" t="inlineStr"><is><t xml:space="preserve">{_xml_escape(text)}</t></is></c>')
        sheet_rows.append(f'<row r="{row_index}">{"".join(cells)}</row>')
    sheet = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
             '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
             f'<sheetData>{"".join(sheet_rows)}</sheetData></worksheet>')
    workbook = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
                'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
                f'<sheets><sheet name="{_xml_escape(sheet_name or "Report")}" sheetId="1" r:id="rId1"/></sheets>'
                '</workbook>')
    content_types = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                     '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                     '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                     '<Default Extension="xml" ContentType="application/xml"/>'
                     '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
                     '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
                     '</Types>')
    rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            '</Relationships>')
    workbook_rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                     '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                     '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
                     '</Relationships>')
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("_rels/.rels", rels)
        archive.writestr("xl/workbook.xml", workbook)
        archive.writestr("xl/_rels/workbook.xml.rels", workbook_rels)
        archive.writestr("xl/worksheets/sheet1.xml", sheet)
    return buffer.getvalue()


# ----------------------------------------------------------------------
# PDF (Helvetica, WinAnsi). Tables with repeated headers and page numbers.
# ----------------------------------------------------------------------

_PAGE_W, _PAGE_H = 842, 595  # A4 landscape in points
_MARGIN = 36


def _pdf_text(text):
    # Narrow and no-break spaces (French digit grouping) are not in WinAnsi; use a plain space.
    text = str(text).replace("\u202f", " ").replace("\u00a0", " ")
    encoded = text.encode("cp1252", errors="replace").decode("cp1252")
    return encoded.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _pdf_width(text, size):
    # Average glyph width approximation for Helvetica (adequate for column sizing).
    return len(str(text)) * size * 0.52


def to_pdf(report, lang="en", company_name="", generated_at=None):
    header, body = _table(report, lang)
    title = report_title(report, lang)
    generated = generated_at or datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    columns = len(header)
    usable = _PAGE_W - 2 * _MARGIN
    size = 8
    natural = []
    for col in range(columns):
        longest = max([len(header[col])] + [len(cells[col][0]) for _k, cells in body] + [4])
        natural.append(min(max(longest * size * 0.55 + 10, 40), 260))
    scale = usable / sum(natural)
    widths = [w * scale for w in natural]

    pages = []
    page = []
    y = _PAGE_H - _MARGIN

    def start_page():
        nonlocal page, y
        page = []
        y = _PAGE_H - _MARGIN
        page.append(_text_op(_MARGIN, y, title, 14, bold=True))
        y -= 16
        if company_name:
            page.append(_text_op(_MARGIN, y, company_name, 9))
            y -= 12
        page.append(_text_op(_MARGIN, y, generated, 7))
        y -= 16
        draw_header()

    def draw_header():
        nonlocal y
        x = _MARGIN
        page.append(f"0.85 g {x} {y - 3} {usable:.2f} 12 re f 0 g")
        for index, label in enumerate(header):
            page.append(_text_op(x + 3, y, _fit(label, widths[index] - 6, size), size, bold=True))
            x += widths[index]
        y -= 14

    def finish_page():
        pages.append(page)

    start_page()
    for kind, cells in body:
        if y < _MARGIN + 24:
            finish_page()
            start_page()
        bold = kind in ("section", "total", "grand")
        if bold:
            page.append(f"0.95 g {_MARGIN} {y - 3} {usable:.2f} 11 re f 0 g")
        x = _MARGIN
        for index, (value, _plain) in enumerate(cells):
            align_right = report["columns"][index]["type"] in NUMERIC_KINDS
            text = _fit(value, widths[index] - 6, size)
            if align_right:
                tx = x + widths[index] - 3 - _pdf_width(text, size)
            else:
                tx = x + 3
            page.append(_text_op(tx, y, text, size, bold=bold))
            x += widths[index]
        y -= 11
    finish_page()

    total = len(pages)
    objects = []
    content_ids = []
    font_regular, font_bold = 3, 4
    kids = []
    next_id = 5
    for number, ops in enumerate(pages, start=1):
        footer = _text_op(_PAGE_W - _MARGIN - 80, _MARGIN - 14,
                          f"{translate('page', lang)} {number} / {total}", 7)
        stream = "\n".join(ops + [footer])
        content_ids.append(next_id)
        objects.append((next_id, f"<< /Length {len(stream.encode('cp1252', 'replace'))} >>\nstream\n{stream}\nendstream"))
        page_id = next_id + 1
        kids.append(page_id)
        objects.append((page_id,
                        f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {_PAGE_W} {_PAGE_H}] "
                        f"/Resources << /Font << /F1 {font_regular} 0 R /F2 {font_bold} 0 R >> >> "
                        f"/Contents {next_id} 0 R >>"))
        next_id += 2
    catalog = "<< /Type /Catalog /Pages 2 0 R >>"
    pages_obj = f"<< /Type /Pages /Kids [{' '.join(f'{k} 0 R' for k in kids)}] /Count {len(kids)} >>"
    fonts = [
        (font_regular, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"),
        (font_bold, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"),
    ]
    all_objects = [(1, catalog), (2, pages_obj)] + fonts + objects
    return _assemble_pdf(all_objects)


def _fit(text, width, size):
    text = str(text)
    if _pdf_width(text, size) <= width:
        return text
    while text and _pdf_width(text + "..", size) > width:
        text = text[:-1]
    return text + ".."


def _text_op(x, y, text, size, bold=False):
    font = "F2" if bold else "F1"
    return f"BT /{font} {size} Tf {x:.2f} {y:.2f} Td ({_pdf_text(text)}) Tj ET"


def _assemble_pdf(objects):
    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = {}
    for object_id, body in sorted(objects, key=lambda item: item[0]):
        offsets[object_id] = len(out)
        out += f"{object_id} 0 obj\n{body}\nendobj\n".encode("cp1252", "replace")
    xref_at = len(out)
    count = max(offsets) + 1
    out += f"xref\n0 {count}\n".encode()
    out += b"0000000000 65535 f \n"
    for object_id in range(1, count):
        out += f"{offsets.get(object_id, 0):010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {count} /Root 1 0 R >>\nstartxref\n{xref_at}\n%%EOF\n".encode()
    return bytes(out)


def to_html(report, lang="en", company_name=""):
    header, body = _table(report, lang)
    title = report_title(report, lang)
    rows_html = []
    for kind, row_cells in body:
        cells = []
        for index, (value, _plain) in enumerate(row_cells):
            align = "right" if report["columns"][index]["type"] in NUMERIC_KINDS else "left"
            cells.append(f'<td style="text-align:{align}">{html.escape(value)}</td>')
        rows_html.append(f'<tr class="{kind}">{"".join(cells)}</tr>')
    head = "".join(f"<th>{html.escape(label)}</th>" for label in header)
    params = ", ".join(f"{k}: {v}" for k, v in report["params"].items() if v not in (None, ""))
    return f"""<!doctype html><html lang="{lang}"><head><meta charset="utf-8">
<title>{html.escape(title)}</title>
<style>
body{{font-family:Arial,Helvetica,sans-serif;color:#111;margin:24px;font-size:12px}}
h1{{font-size:20px;margin:0 0 4px}} .meta{{color:#555;margin-bottom:12px}}
table{{border-collapse:collapse;width:100%}} th,td{{border-bottom:1px solid #ddd;padding:4px 6px}}
th{{background:#eef2f7;text-align:left}} tr.section td{{font-weight:bold;background:#f7f9fc}}
tr.total td{{font-weight:bold;border-top:1px solid #888}} tr.grand td{{font-weight:bold;border-top:2px solid #111}}
@media print {{ body{{margin:8mm}} }}
</style></head><body>
<h1>{html.escape(title)}</h1>
<div class="meta">{html.escape(company_name)} &middot; {html.escape(params)}</div>
<table><thead><tr>{head}</tr></thead><tbody>{''.join(rows_html)}</tbody></table>
</body></html>"""


EXPORTERS = {
    "csv": ("text/csv; charset=utf-8", "csv", to_csv),
    "xlsx": ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx", to_xlsx),
    "pdf": ("application/pdf", "pdf", to_pdf),
}

