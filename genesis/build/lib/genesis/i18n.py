"""Localization runtime. Dictionaries live in ``genesis/locales``."""

from .config import DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES
from .locales import TRANSLATIONS

LANGUAGE_NAMES = {"en": "English", "fr": "Français", "rw": "Ikinyarwanda"}


def normalize_language(code):
    if code in SUPPORTED_LANGUAGES:
        return code
    return DEFAULT_LANGUAGE


def translate(key, lang=DEFAULT_LANGUAGE, **params):
    table = TRANSLATIONS.get(normalize_language(lang), {})
    text = table.get(key)
    if text is None:
        text = TRANSLATIONS[DEFAULT_LANGUAGE].get(key, key)
    for name, value in params.items():
        text = text.replace("{" + name + "}", str(value))
    return text


def dictionary(lang):
    """The complete dictionary for a language. Gaps are not hidden: parity tests guarantee none exist."""
    return dict(TRANSLATIONS[normalize_language(lang)])
