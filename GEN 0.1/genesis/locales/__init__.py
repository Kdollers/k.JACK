"""Translation dictionaries. All three must define exactly the same keys."""

from .en import TRANSLATIONS as _EN
from .fr import TRANSLATIONS as _FR
from .rw import TRANSLATIONS as _RW

TRANSLATIONS = {"en": _EN, "fr": _FR, "rw": _RW}
