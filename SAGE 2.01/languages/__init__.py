from languages.en import TRANSLATIONS as ENGLISH
from languages.es import TRANSLATIONS as SPANISH
from languages.fr import TRANSLATIONS as FRENCH
from languages.pt import TRANSLATIONS as PORTUGUESE
from languages.rw import TRANSLATIONS as KINYARWANDA


LANGUAGES = {
    "1": "en",
    "2": "fr",
    "3": "rw",
    "4": "es",
    "5": "pt",
}

LANGUAGE_NAMES = {
    "en": "English",
    "fr": "Français",
    "rw": "Kinyarwanda",
    "es": "Español",
    "pt": "Português",
}

LANGUAGE_KEYS = {
    "en": "english",
    "fr": "french",
    "rw": "kinyarwanda",
    "es": "spanish",
    "pt": "portuguese",
}

TRANSLATION_TABLES = {
    "en": ENGLISH,
    "fr": FRENCH,
    "rw": KINYARWANDA,
    "es": SPANISH,
    "pt": PORTUGUESE,
}

_current_language = "en"


def set_language(language_code):
    global _current_language
    if language_code not in TRANSLATION_TABLES:
        return False
    _current_language = language_code
    return True


def get_language():
    return _current_language


def get_language_name():
    return LANGUAGE_NAMES.get(_current_language, "English")


def t(key):
    current_translations = TRANSLATION_TABLES.get(
        _current_language, ENGLISH
    )
    return current_translations.get(key, ENGLISH.get(key, key))


def choose_language():
    while True:
        print()
        print("================================")
        print(t("select_language"))
        print("================================")
        for number, code in LANGUAGES.items():
            print(number + ".", t(LANGUAGE_KEYS[code]))
        print()
        choice = input(f"{t('choose_option')} ").strip()
        if choice not in LANGUAGES:
            print(t("invalid_option"))
            continue
        set_language(LANGUAGES[choice])
        print(t("language_selected") + ": " + get_language_name())
        return
