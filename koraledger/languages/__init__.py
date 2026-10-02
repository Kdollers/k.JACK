from languages.en import TRANSLATIONS as ENGLISH
from languages.fr import TRANSLATIONS as FRENCH
from languages.rw import TRANSLATIONS as KINYARWANDA


LANGUAGES = {
    "1": "en",
    "2": "fr",
    "3": "rw",
}

LANGUAGE_NAMES = {
    "en": "English",
    "fr": "Français",
    "rw": "Kinyarwanda",
}

TRANSLATION_TABLES = {
    "en": ENGLISH,
    "fr": FRENCH,
    "rw": KINYARWANDA,
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
        print("1.", t("english"))
        print("2.", t("french"))
        print("3.", t("kinyarwanda"))

        choice = input(f"{t('choose_option')} ").strip()
        language_code = LANGUAGES.get(choice)
        if language_code is None:
            print(t("invalid_option"))
            continue

        set_language(language_code)
        print()
        print(f"{t('language_selected')}: {get_language_name()}")
        return True
