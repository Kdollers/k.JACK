"""Every translation key used in the code exists in every language.

Static scan (ast): literal keys passed to translate()/tr() or to any error constructor
must be defined. Dynamic keys are listed explicitly in DYNAMIC_KEY_SOURCES so they are
reviewed rather than silently ignored.
"""

import ast
import pathlib
import unittest

from genesis.locales import TRANSLATIONS

PACKAGE = pathlib.Path(__file__).resolve().parents[1] / "genesis"
KEY_CALLS = {"translate", "tr", "GenesisError", "ValidationError", "AccountingError", "NotFound",
             "PermissionDenied", "AuthenticationError", "Conflict", "MethodNotAllowed"}


def _called_name(node):
    func = node.func
    if isinstance(func, ast.Name):
        return func.id
    if isinstance(func, ast.Attribute):
        return func.attr
    return None


def literal_keys():
    found = {}
    for path in sorted(PACKAGE.rglob("*.py")):
        if "locales" in path.parts:
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call) or not node.args:
                continue
            if _called_name(node) not in KEY_CALLS:
                continue
            first = node.args[0]
            if isinstance(first, ast.Constant) and isinstance(first.value, str):
                found.setdefault(first.value, []).append(f"{path.relative_to(PACKAGE)}:{node.lineno}")
    return found


class TranslationKeyUsageTests(unittest.TestCase):
    def test_every_literal_key_is_defined_in_every_language(self):
        keys = literal_keys()
        self.assertGreater(len(keys), 50, "scan found too few keys; the scanner is probably broken")
        for code in ("en", "fr", "rw"):
            missing = {key: sites for key, sites in keys.items() if key not in TRANSLATIONS[code]}
            self.assertEqual(missing, {}, f"missing in {code}")



if __name__ == "__main__":
    unittest.main()
