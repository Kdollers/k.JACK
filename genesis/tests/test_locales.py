"""Translation parity: every language has the same keys and the same placeholders."""

import re
import unittest

from genesis.i18n import dictionary
from genesis.locales import TRANSLATIONS
from genesis.locales.entries import ENTRIES

PLACEHOLDER = re.compile(r"\{(\w+)\}")
LANGUAGES = ("en", "fr", "rw")


class LocaleParityTests(unittest.TestCase):
    def test_all_languages_have_identical_keys(self):
        english = set(TRANSLATIONS["en"])
        for code in LANGUAGES:
            self.assertEqual(set(TRANSLATIONS[code]), english, f"key mismatch in {code}")

    def test_generated_dictionaries_match_entries_table(self):
        for code, index in (("en", 0), ("fr", 1), ("rw", 2)):
            self.assertEqual(set(TRANSLATIONS[code]), set(ENTRIES), code)
            for key, values in ENTRIES.items():
                self.assertEqual(TRANSLATIONS[code][key], values[index], f"{code}:{key}")

    def test_no_empty_translations(self):
        for code in LANGUAGES:
            for key, text in TRANSLATIONS[code].items():
                self.assertIsInstance(text, str, f"{code}:{key}")
                self.assertTrue(text.strip(), f"empty {code}:{key}")

    def test_placeholders_identical_in_every_language(self):
        for key in TRANSLATIONS["en"]:
            expected = sorted(PLACEHOLDER.findall(TRANSLATIONS["en"][key]))
            for code in ("fr", "rw"):
                found = sorted(PLACEHOLDER.findall(TRANSLATIONS[code][key]))
                self.assertEqual(found, expected, f"placeholders differ for {key} in {code}")

    def test_served_dictionary_is_complete_for_each_language(self):
        english = set(dictionary("en"))
        for code in LANGUAGES:
            self.assertEqual(set(dictionary(code)), english)

    # Strings that are deliberately identical in French or Kinyarwanda: brand names,
    # acronyms, and accounting terms that are standard in that language. Any other
    # identical string is untranslated English and fails the test.
    ALLOWED_SAME_AS_ENGLISH = {
        ("fr", "app_name"), ("rw", "app_name"),
        ("fr", "col_code"), ("fr", "col_date"), ("fr", "col_net"), ("fr", "col_total"),
        ("fr", "col_type"), ("fr", "page"), ("fr", "report_total"),
        ("fr", "export_csv"), ("fr", "export_pdf"), ("fr", "export_xlsx"),
        ("rw", "export_csv"), ("rw", "export_pdf"), ("rw", "export_xlsx"),
        ("rw", "col_credit"), ("rw", "col_debit"),
        ("rw", "tax_profile_rw"), ("rw", "tax_rate_vat18"),
        ("rw", "pm_mobile_money"),
        ("fr", "field_code"), ("fr", "field_email"), ("rw", "field_email"),
    }

    def test_no_untranslated_english_in_fr_or_rw(self):
        found = set()
        for key, english in TRANSLATIONS["en"].items():
            for code in ("fr", "rw"):
                if TRANSLATIONS[code][key] == english:
                    found.add((code, key))
        self.assertEqual(found - self.ALLOWED_SAME_AS_ENGLISH, set())
        self.assertEqual(self.ALLOWED_SAME_AS_ENGLISH - found, set(), "stale allowlist entries")

if __name__ == "__main__":
    unittest.main()
