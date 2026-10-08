"""Single source of truth for all interface and message text.

Each entry is ``key -> (English, French, Kinyarwanda)``. Keeping the three
languages in one table, and checking it in tests, keeps the dictionaries
in sync by construction.
"""

from .errors_i18n import ENTRIES as _ERRORS
from .reports_i18n import ENTRIES as _REPORTS
from .ui_i18n import ENTRIES as _UI

ENTRIES = {}
for _source in (_ERRORS, _REPORTS, _UI):
    for _key, _values in _source.items():
        if _key in ENTRIES:
            raise RuntimeError(f"duplicate translation key: {_key}")
        ENTRIES[_key] = _values
