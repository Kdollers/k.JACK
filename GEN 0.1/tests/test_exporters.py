"""Export files carry the right numbers: CSV plain decimals, numeric XLSX cells, PDF pages and text."""

import csv
import io
import re
import unittest
import xml.etree.ElementTree as ET
import zipfile

from genesis import exporters, ledger, reports
from genesis.money import format_money
from tests.helpers import Env

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
START, END = "2026-01-01", "2026-12-31"


def synthetic_report(rows, decimals=2):
    """A report dict with the same shape the builders return, for layout tests."""
    return {
        "key": "trial_balance", "title_key": "report_trial_balance", "params": {"start": START, "end": END},
        "decimals": decimals,
        "columns": [{"key": "name", "label_key": "col_name", "type": "text"},
                    {"key": "amount", "label_key": "col_amount", "type": "money"}],
        "rows": rows, "summary": [], "checks": {},
    }


class RealReportExportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.env = Env(currency="USD")
        env = cls.env
        with env.db.transaction():
            ledger.post_entry(env.ctx, entry_date="2026-03-01", description="Cash sale",
                              lines=[{"account_id": env.account_id("cash"), "debit_minor": 123456, "credit_minor": 0},
                                     {"account_id": env.account_id("sales_revenue"), "debit_minor": 0,
                                      "credit_minor": 123456}])
        cls.report = reports.trial_balance(env.db, start=START, end=END)

    @classmethod
    def tearDownClass(cls):
        cls.env.close()

    def test_csv_writes_plain_decimals_and_keeps_text_intact(self):
        data = exporters.to_csv(self.report, "en")
        self.assertTrue(data.startswith(b"\xef\xbb\xbf"))
        rows = list(csv.reader(io.StringIO(data[3:].decode("utf-8"))))
        header = rows[2]
        debit = header.index("Debit")
        cash = next(row for row in rows[3:] if row and row[1] == "Cash on hand")
        self.assertEqual(cash[debit], "1234.56")
        self.assertEqual(cash[header.index("Credit")], "0.00")

    def test_csv_quotes_commas_and_quotes_in_text(self):
        report = synthetic_report([{"kind": "line", "name": 'Acme, "Ltd"', "amount": 5}])
        rows = list(csv.reader(io.StringIO(exporters.to_csv(report, "en")[3:].decode("utf-8"))))
        self.assertEqual(rows[3], ['Acme, "Ltd"', "0.05"])

    def test_xlsx_stores_money_as_numbers_and_labels_as_text(self):
        data = exporters.to_xlsx(self.report, "en")
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
        cells = {cell.get("r"): cell for cell in sheet.iter("{%s}c" % NS["m"])}
        numeric = [cell.find("m:v", NS).text for cell in cells.values() if cell.find("m:v", NS) is not None]
        self.assertIn("1234.56", numeric)
        labels = ["".join(t.text or "" for t in cell.iter("{%s}t" % NS["m"]))
                  for cell in cells.values() if cell.get("t") == "inlineStr"]
        self.assertIn("Cash on hand", labels)
        self.assertIn("Trial balance", labels)

    def test_pdf_shows_formatted_amounts_and_a_page_footer(self):
        data = exporters.to_pdf(self.report, "en", "Export Co", generated_at="2026-10-08 00:00 UTC")
        self.assertIn(b"(Cash on hand)", data)
        self.assertIn(format_money(123456, 2, "en").encode("ascii"), data)
        self.assertIn(b"/Count 1 ", data)
        self.assertIn(b"Page 1 / 1", data)

    def test_pdf_french_numbers_survive_the_pdf_encoding(self):
        report = synthetic_report([{"kind": "line", "name": "Ventes", "amount": 123456789}])
        data = exporters.to_pdf(report, "fr", "Export", generated_at="2026-10-08 00:00 UTC")
        # The French thousands separator is a narrow no-break space; it must come out as a space, not "?".
        self.assertIn(b"(1 234 567,89)", data)
        self.assertNotIn(b"1?234", data)


class PdfPaginationTests(unittest.TestCase):
    def test_long_reports_span_pages_with_numbered_footers(self):
        rows = [{"kind": "line", "name": f"Line {index:03d}", "amount": index * 100} for index in range(140)]
        data = exporters.to_pdf(synthetic_report(rows), "en", "Export Co", generated_at="2026-10-08 00:00 UTC")
        pages = len(re.findall(rb"/Type /Page /", data))
        self.assertGreaterEqual(pages, 3)
        self.assertIn(f"/Count {pages} ".encode(), data)
        footers = [(int(a), int(b)) for a, b in re.findall(rb"Page (\d+) / (\d+)", data)]
        self.assertEqual(footers, [(number, pages) for number in range(1, pages + 1)])
        for index in (0, 139):
            self.assertIn(f"Line {index:03d}".encode(), data)

    def test_header_repeats_on_each_page(self):
        rows = [{"kind": "line", "name": f"Row {index}", "amount": 1} for index in range(140)]
        data = exporters.to_pdf(synthetic_report(rows), "en", "Export Co", generated_at="2026-10-08 00:00 UTC")
        self.assertEqual(data.count(b"(Name) Tj"), data.count(b"/Type /Page /"))


class ExporterFormatTests(unittest.TestCase):
    def test_unknown_format_is_not_registered(self):
        self.assertEqual(sorted(exporters.EXPORTERS), ["csv", "pdf", "xlsx"])

    def test_percent_and_quantity_columns_use_plain_numbers(self):
        report = synthetic_report([{"kind": "line", "name": "Rate", "amount": 1800}])
        report["columns"] = [{"key": "name", "label_key": "col_name", "type": "text"},
                             {"key": "amount", "label_key": "col_rate", "type": "percent"}]
        rows = list(csv.reader(io.StringIO(exporters.to_csv(report, "en")[3:].decode("utf-8"))))
        self.assertEqual(rows[3], ["Rate", "18.00"])


if __name__ == "__main__":
    unittest.main()
